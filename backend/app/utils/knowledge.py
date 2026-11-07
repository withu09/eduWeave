"""Retrieve grounded material from the Dify documents assigned to a node."""
import asyncio
import hashlib
import json
import re

from fastapi import HTTPException

from app.db.models import Course, Module, Node, Resource
from app.utils import kb_db, dify_client as dify
from app.utils.material_text import readable_text, has_material_text, NO_TEXT_MESSAGE


class KnowledgeError(HTTPException):
    pass


def is_remote(document_id):
    return bool(document_id) and not document_id.startswith(("local-", "mock"))


def resource_state(detail):
    status = detail.get("indexing_status", "waiting")
    if detail.get("enabled") is False or detail.get("archived"):
        return "paused"
    if status == "completed":
        return "completed"
    if status in {"error", "paused", "stopped"}:
        return "error" if status == "error" else "paused"
    return "processing"


def ensure_dataset(course_id):
    with kb_db.SessionLocal() as db:
        course = db.query(Course).filter(Course.id == course_id).with_for_update().first()
        if course is None:
            raise KnowledgeError(404, "课程不存在")
        if not course.dify_dataset_id:
            course.dify_dataset_id = dify.create_dataset(course.title)
            db.commit()
        return course.dify_dataset_id


def refresh_resources(node_id):
    if not dify.configured():
        return
    with kb_db.SessionLocal() as db:
        records = db.query(Resource).join(Node).join(Module).filter(
            (Resource.node_id == node_id) | (Node.module_id == node_id) | (Module.course_id == node_id)
        ).all()
        for record in records:
            dataset_id = record.node.module.course.dify_dataset_id
            if dataset_id and is_remote(record.dify_document_id):
                detail = dify.get_document_detail(dataset_id, record.dify_document_id)
                record.status = resource_state(detail)
        db.commit()


def _retrieve_node(node_id, query=None):
    if not dify.configured():
        raise KnowledgeError(409, "尚未配置 Dify 知识库密钥，请先完成 Dify 配置")
    with kb_db.SessionLocal() as db:
        node = db.get(Node, node_id)
        if node:
            course = node.module.course
            title = f"{course.title} / {node.module.title} / {node.title}"
            search_query = query or node.title
            records = list(node.resources)
        else:
            course = db.get(Course, node_id)
            module = db.get(Module, node_id)
            if module:
                course = module.course
                records = [resource for item in module.nodes for resource in item.resources]
                title = f"{course.title} / {module.title}"
                search_query = query or module.title
            elif course:
                records = [resource for group in course.modules for item in group.nodes for resource in item.resources]
                title = course.title
                search_query = query or course.title
            else:
                raise KnowledgeError(404, "知识点不存在")
        dataset_id = course.dify_dataset_id
        allowed = {record.dify_document_id: record.name for record in records if is_remote(record.dify_document_id)}
        local_count = len(records) - len(allowed)
    if not dataset_id or not allowed:
        raise KnowledgeError(409, "资料还没有上传到 Dify，请在知识库管理中点击“上传到 Dify”" if local_count else "请先为知识点上传学习资料")
    versions = []
    ready = {}
    for document_id, name in allowed.items():
        detail = dify.get_document_detail(dataset_id, document_id)
        if resource_state(detail) == "completed":
            ready[document_id] = name
            versions.append([document_id, detail.get("updated_at"), detail.get("completed_at"), detail.get("segment_count")])
    if not ready:
        raise KnowledgeError(409, "Dify 资料尚未解析完成或解析失败，请在知识库管理中检查状态")
    result = dify.retrieve_segments(dataset_id, search_query)
    chunks = []
    for record in result.get("records", []):
        segment = record.get("segment", {})
        document = segment.get("document", {})
        document_id = document.get("id") or segment.get("document_id")
        if document_id in ready and segment.get("content") and segment.get("enabled", True):
            chunks.append({"document_id": document_id, "document_name": ready[document_id], "segment_id": segment.get("id"), "position": segment.get("position"), "content": segment["content"], "score": record.get("score")})
    # A nonempty textbook search can still concern a different chapter.
    # Rerank against scoped document text, including later segment pages.
    candidates = {(item["document_id"], item["segment_id"]): item for item in chunks}
    scanned = 0
    for document_id, name in ready.items():
        page = 1
        while scanned < 2000:
            segments = dify.get_segments(dataset_id, document_id, page=page, limit=100)
            for segment in segments.get("data", []):
                if segment.get("content") and segment.get("enabled", True) and segment.get("status", "completed") == "completed":
                    key = (document_id, segment.get("id"))
                    candidates[key] = {"document_id": document_id, "document_name": name, "segment_id": segment.get("id"), "position": segment.get("position"), "content": segment["content"], "score": candidates.get(key, {}).get("score")}
            scanned += len(segments.get("data", []))
            if not segments.get("has_more"):
                break
            page += 1
    chunks = list(candidates.values())
    if not chunks:
        raise KnowledgeError(409, "Dify 没有返回可用的资料正文，请检查文档是否包含可解析的文字")
    for chunk in chunks:
        chunk["content"] = readable_text(chunk["content"])
    chunks = [chunk for chunk in chunks if chunk["content"]]
    if not has_material_text("\n".join(chunk["content"] for chunk in chunks)):
        raise KnowledgeError(409, NO_TEXT_MESSAGE)
    phrases = re.findall(r"[\u4e00-\u9fff]{2,}|[A-Za-z][A-Za-z0-9_+-]+", search_query.lower())
    pairs = {phrase[index:index + 2] for phrase in phrases for index in range(len(phrase) - 1)}
    def relevance(chunk):
        content = chunk["content"].lower()
        return sum(min(content.count(phrase), 3) * max(len(phrase), 2) for phrase in phrases) + sum(1 for pair in pairs if pair in content)
    chunks.sort(key=lambda item: (-relevance(item), -(item.get("score") or 0), item["document_id"], item.get("position") or 0))
    best = relevance(chunks[0])
    if best:
        chunks = [chunk for chunk in chunks if relevance(chunk) >= max(1, best * 0.2)]
    sources = []
    parts = []
    remaining = 18000
    for chunk in chunks[:8]:
        if remaining <= 0:
            break
        content = chunk["content"][:remaining]
        remaining -= len(content)
        source = {key: value for key, value in chunk.items() if key != "content"}
        sources.append(source)
        parts.append(f"[资料{len(sources)}] {chunk['document_name']}，片段位置 {chunk['position'] or '未提供'}\n{content}")
    content_versions = sorted((chunk["document_id"], chunk.get("segment_id") or "", hashlib.sha256(chunk["content"].encode()).hexdigest()) for chunk in chunks[:8])
    version = hashlib.sha256(json.dumps([dataset_id, sorted(versions), content_versions, "dify-grounded-v1"], ensure_ascii=False).encode()).hexdigest()
    return {"context": "\n\n".join(parts), "sources": sources, "source_version": version, "title": title}


async def node_materials(node_id, query=None):
    try:
        return await asyncio.to_thread(_retrieve_node, node_id, query)
    except dify.DifyError as error:
        raise KnowledgeError(502, str(error)) from None


async def context_for_deps(deps, query):
    if deps.knowledge_context is not None:
        return deps.knowledge_context
    if deps.node_id:
        material = await node_materials(deps.node_id, query)
        deps.knowledge_context = material["context"]
        deps.knowledge_sources = material["sources"]
        return material["context"]
    return "当前调用未绑定具体课程资料。请明确说明缺少资料依据，不得声称已读取上传教材。"
