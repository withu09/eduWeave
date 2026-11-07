import asyncio
import json
import mimetypes
import os
import re
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.agents.deps import AgentDeps
from app.schemas.profile import StudentProfile
from app.utils import dify_client as dify, kb_db
from app.utils.knowledge import ensure_dataset, is_remote, node_materials, refresh_resources, resource_state
from app.utils.task_manager import task_manager
from app.utils.telemetry import tracked_run

# Keep these names available for integrations and isolated tests.
create_dataset = dify.create_dataset
upload_document = dify.upload_document
delete_document = dify.delete_document
delete_dataset = dify.delete_dataset
router = APIRouter()
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
cache_lock = asyncio.Lock()


class CreateCourseReq(BaseModel):
    title: str = Field(min_length=1, max_length=300)


class CreateModuleReq(CreateCourseReq):
    course_id: str


class CreateNodeReq(CreateCourseReq):
    module_id: str


class UpdateNodeReq(CreateCourseReq):
    pass


class BindDatasetReq(BaseModel):
    dataset_id: str = Field(min_length=1, max_length=100)


def remote_error(error):
    return HTTPException(502, str(error))


@router.get("/api/kb/status")
async def knowledge_status():
    return {"provider": "dify", "configured": dify.configured(), "indexing_technique": os.getenv("DIFY_INDEXING_TECHNIQUE", "economy")}


@router.post("/api/kb/test-connection")
async def test_knowledge_connection():
    if not dify.configured():
        raise HTTPException(409, "请先在 .env.bailian 填写 DIFY_API_KEY，并重新加载项目配置")
    try:
        await asyncio.to_thread(dify.get_datasets, limit=1)
        return {"connected": True, "provider": "dify"}
    except dify.DifyError as error:
        raise remote_error(error)


@router.get("/api/kb/datasets")
async def list_dify_datasets():
    if not dify.configured():
        return {"datasets": []}
    try:
        items = []
        page = 1
        while True:
            result = await asyncio.to_thread(dify.get_datasets, page=page, limit=100)
            items.extend({"id": item["id"], "name": item.get("name", "未命名")} for item in result.get("data", []))
            if not result.get("has_more"):
                break
            page += 1
        return {"datasets": items}
    except dify.DifyError as error:
        raise remote_error(error)


@router.post("/api/kb/courses/{course_id}/bind-dify")
async def bind_dify_dataset(course_id: str, req: BindDatasetReq):
    try:
        await asyncio.to_thread(dify.get_dataset_detail, req.dataset_id)
    except dify.DifyError as error:
        raise remote_error(error)
    with kb_db.SessionLocal() as db:
        course = db.get(kb_db.Course, course_id)
        if course is None:
            raise HTTPException(404, "课程不存在")
        remote = db.query(kb_db.Resource).join(kb_db.Node).join(kb_db.Module).filter(kb_db.Module.course_id == course_id).all()
        if course.dify_dataset_id != req.dataset_id and any(is_remote(item.dify_document_id) for item in remote):
            raise HTTPException(409, "课程已有 Dify 资料，不能直接切换知识库；请为另一知识库创建课程")
        course.dify_dataset_id = req.dataset_id
        db.commit()
    return {"status": "success", "dataset_id": req.dataset_id}


@router.get("/api/kb/tree")
async def get_kb_tree():
    return {"tree": kb_db.get_tree()}


@router.patch("/api/kb/tree/{node_type}/{node_id}")
async def update_tree_node(node_type: str, node_id: str, req: UpdateNodeReq):
    dataset_id = kb_db.update_tree_node(node_id, req.title)
    if node_type == "course" and dataset_id and dify.configured():
        try:
            await asyncio.to_thread(dify.update_dataset, dataset_id, req.title)
        except dify.DifyError as error:
            raise remote_error(error)
    return {"status": "success"}


@router.post("/api/kb/sync")
async def sync_kb_from_dify():
    if not dify.configured():
        return {"status": "not_configured", "tree": kb_db.get_tree()}
    try:
        datasets = []
        page = 1
        while True:
            result = await asyncio.to_thread(dify.get_datasets, page=page, limit=100)
            datasets.extend(result.get("data", []))
            if not result.get("has_more"):
                break
            page += 1
        kb_db.sync_from_dify(datasets)
        return {"status": "success", "tree": kb_db.get_tree()}
    except dify.DifyError as error:
        raise remote_error(error)


@router.post("/api/kb/courses")
async def create_course(req: CreateCourseReq):
    try:
        dataset_id = await asyncio.to_thread(create_dataset, req.title) if dify.configured() else None
        return kb_db.add_course(req.title, dataset_id)
    except dify.DifyError as error:
        raise remote_error(error)


@router.post("/api/kb/modules")
async def create_module(req: CreateModuleReq):
    return kb_db.add_module(req.course_id, req.title)


@router.post("/api/kb/nodes")
async def create_node(req: CreateNodeReq):
    return kb_db.add_node(req.module_id, req.title)


@router.delete("/api/kb/tree/{node_type}/{node_id}")
async def delete_tree_node(node_id: str, node_type: str):
    # Remove the remote dataset only after a successful request, keeping the
    # local tree available for retry if the service is unreachable.
    dataset_id = kb_db.get_dataset_id_for_course(node_id) if node_type == "course" else None
    with kb_db.SessionLocal() as db:
        shared = bool(dataset_id and db.query(kb_db.Course).filter(kb_db.Course.dify_dataset_id == dataset_id, kb_db.Course.id != node_id).first())
    if dataset_id and not shared and dify.configured():
        try:
            await asyncio.to_thread(delete_dataset, dataset_id)
        except dify.DifyError as error:
            raise remote_error(error)
    kb_db.delete_tree_node(node_id, node_type)
    return {"status": "success"}


@router.get("/api/kb/resources/{node_id}")
async def get_kb_resources(node_id: str):
    warning = None
    try:
        await asyncio.to_thread(refresh_resources, node_id)
    except dify.DifyError as error:
        warning = str(error)
    resources = kb_db.get_resources(node_id)
    for resource in resources:
        resource["provider"] = "dify" if is_remote(resource["id"]) else "local"
        if resource["provider"] == "local":
            resource["status"] = "local"
    return {"resources": resources, "warning": warning}


async def sync_dify_segments(dataset_id, document_id, node_id, batch=None):
    # Dify owns parsing and retrieval. No copy to a separate Chroma collection.
    for _ in range(90):
        try:
            if batch:
                result = await asyncio.to_thread(dify.get_document_embedding_status, dataset_id, batch)
                detail = next((item for item in result.get("data", []) if item.get("id") == document_id), {})
            else:
                detail = await asyncio.to_thread(dify.get_document_detail, dataset_id, document_id)
            status = resource_state(detail)
            with kb_db.SessionLocal() as db:
                resource = db.query(kb_db.Resource).filter_by(node_id=node_id, dify_document_id=document_id).first()
                if resource is None:
                    return
                resource.status = status
                db.commit()
            if status in {"completed", "error", "paused"}:
                return
        except dify.DifyError:
            return
        await asyncio.sleep(2)


def validate_target(course_id, node_id):
    with kb_db.SessionLocal() as db:
        course = db.get(kb_db.Course, course_id)
        if course is None:
            raise HTTPException(404, "课程不存在，请刷新后重新选择")
        node = db.query(kb_db.Node).join(kb_db.Module).filter(kb_db.Node.id == node_id, kb_db.Module.course_id == course_id).first()
        if node is None:
            raise HTTPException(404, "所选知识点不存在或不属于该课程")


def stored_file(resource_id):
    candidates = [Path(UPLOAD_DIR) / filename for filename in os.listdir(UPLOAD_DIR) if filename.startswith(resource_id + ".")]
    return max(candidates, key=lambda path: path.stat().st_mtime_ns) if candidates else None


async def save_upload(file_bytes, filename, course_id, node_id, existing_id=None):
    validate_target(course_id, node_id)
    old_id = None
    if existing_id:
        with kb_db.SessionLocal() as db:
            existing = db.query(kb_db.Resource).filter_by(node_id=node_id, dify_document_id=existing_id).first()
            if existing is None:
                raise HTTPException(404, "待更新的资料不存在")
            old_id = existing.dify_document_id
    document_id = f"local-{uuid.uuid4()}"
    state = "local"
    batch = None
    dataset_id = None
    if dify.configured():
        try:
            dataset_id = await asyncio.to_thread(ensure_dataset, course_id)
            if old_id and is_remote(old_id):
                result = await asyncio.to_thread(dify.update_document_by_file, dataset_id, old_id, file_bytes, filename)
            else:
                result = await asyncio.to_thread(upload_document, dataset_id, file_bytes, filename, node_id)
            document_id = result.get("document", {}).get("id")
            if not document_id or not re.fullmatch(r"[A-Za-z0-9_-]+", document_id):
                raise dify.DifyError("Dify 未确认文档上传成功，请重试")
            state = resource_state(result.get("document", {}))
            batch = result.get("batch")
        except dify.DifyError as error:
            raise remote_error(error)
    extension = Path(filename).suffix or ".bin"
    (Path(UPLOAD_DIR) / f"{document_id}{extension}").write_bytes(file_bytes)
    resource = {"id": document_id, "name": filename, "size": len(file_bytes), "status": state, "date": datetime.now().strftime("%Y-%m-%d")}
    if existing_id:
        with kb_db.SessionLocal() as db:
            existing = db.query(kb_db.Resource).filter_by(node_id=node_id, dify_document_id=existing_id).one()
            existing.dify_document_id = document_id
            existing.name = filename
            existing.size = len(file_bytes)
            existing.status = state
            existing.created_at = datetime.utcnow()
            db.commit()
    else:
        kb_db.add_resource(node_id, resource)
    if dataset_id and state == "processing":
        asyncio.create_task(sync_dify_segments(dataset_id, document_id, node_id, batch))
    return {"status": "success", "provider": "dify" if dataset_id else "local", "resource": {**resource, "size": f"{len(file_bytes) / 1024:.1f} KB"}}


@router.post("/api/kb/upload")
async def upload_kb_document(file: UploadFile = File(...), course_id: str = Form(...), node_id: str = Form(...), replace_id: str | None = Form(None)):
    return await save_upload(await file.read(), file.filename or "document.bin", course_id, node_id, replace_id)


@router.post("/api/kb/resources/{node_id}/{document_id}/push-dify")
async def push_to_dify(node_id: str, document_id: str):
    if not dify.configured():
        raise HTTPException(409, "请先配置 Dify 知识库 API 密钥")
    with kb_db.SessionLocal() as db:
        resource = db.query(kb_db.Resource).filter_by(node_id=node_id, dify_document_id=document_id).first()
        if resource is None:
            raise HTTPException(404, "资料不存在")
        course_id = resource.node.module.course_id
        filename = resource.name
    path = stored_file(document_id)
    if path is None:
        raise HTTPException(404, "本地源文件缺失，请重新选择文件上传")
    return await save_upload(path.read_bytes(), filename, course_id, node_id, document_id)


@router.get("/api/kb/download/{resource_id}")
async def download_kb_document(resource_id: str):
    with kb_db.SessionLocal() as db:
        resource = db.query(kb_db.Resource).filter_by(dify_document_id=resource_id).first()
        if resource is None:
            raise HTTPException(404, "资料不存在")
        filename = resource.name
    path = stored_file(resource_id)
    if path is None:
        raise HTTPException(404, "本地源文件缺失")
    return FileResponse(path, filename=filename, media_type=mimetypes.guess_type(filename)[0] or "application/octet-stream", content_disposition_type="inline")


@router.delete("/api/kb/resources/{course_id}/{node_id}/{document_id}")
async def delete_resource_doc(course_id: str, node_id: str, document_id: str):
    validate_target(course_id, node_id)
    dataset_id = kb_db.get_dataset_id_for_course(course_id)
    from app.db.models import CourseBuild, GeneratedResource
    with kb_db.SessionLocal() as db:
        resource = db.query(kb_db.Resource).filter_by(node_id=node_id, dify_document_id=document_id).first()
        if resource is None:
            raise HTTPException(404, "资料不存在")
        shared = db.query(kb_db.Resource).filter(kb_db.Resource.dify_document_id == document_id, kb_db.Resource.id != resource.id).first() is not None
        built_course = db.get(CourseBuild, course_id) is not None
    if dataset_id and dify.configured() and is_remote(document_id) and not shared and not built_course:
        try:
            await asyncio.to_thread(delete_document, dataset_id, document_id)
        except dify.DifyError as error:
            raise remote_error(error)
    with kb_db.SessionLocal() as db:
        for link in db.query(GeneratedResource).filter_by(resource_id=resource.id).all():
            db.delete(link)
        current = db.get(kb_db.Resource, resource.id)
        if current:
            db.delete(current)
        db.commit()
    return {"status": "success"}


@router.get("/api/kb/starmap/all")
async def get_all_starmap():
    return {"data": kb_db.get_all_starmap_nodes()}


@router.get("/api/kb/starmap/{course_id}")
async def get_starmap(course_id: str):
    return {"data": kb_db.get_starmap_nodes(course_id)}


def content_cache_path():
    return Path(__file__).resolve().parents[1] / "resources" / "generated_dify.json"


async def generate_content(node_id, kind, more=False):
    material = await node_materials(node_id)
    path = content_cache_path()
    try:
        cache = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    except (ValueError, OSError):
        cache = {}
    entry = cache.get(node_id, {})
    if entry.get("source_version") != material["source_version"]:
        entry = {}
    if entry.get(kind) and not more:
        return {kind: entry[kind], "sources": material["sources"], "source_version": material["source_version"]}
    from app.agents.writer import writer_agent
    from app.agents.examiner import examiner_agent
    from app.agents.coder import coder_agent
    from app.agents.presenter import presenter_agent
    agents = {
        "mermaid_schema": ("Writer", writer_agent, "基于提供的 Dify 资料生成知识导图。"),
        "questions": ("Examiner", examiner_agent, "基于提供的 Dify 资料生成测验题。"),
        "task": ("Coder", coder_agent, "基于提供的 Dify 资料生成编程练习。"),
        "presentation": ("Presenter", presenter_agent, "基于提供的 Dify 资料生成讲解课件。"),
    }
    name, agent, prompt = agents[kind]
    deps = AgentDeps(chroma_client=None, student_profile=StudentProfile(), node_id=node_id, node_title=material["title"], knowledge_context=material["context"], knowledge_sources=material["sources"])
    result = await tracked_run(name, f"Dify 资料生成：{material['title']}", agent.run(prompt + ("请生成一组新的、不同的题目。" if more else ""), deps=deps))
    output = result.output
    value = output.model_dump() if kind == "presentation" else getattr(output, kind)
    if isinstance(value, list):
        value = [item.model_dump() if hasattr(item, "model_dump") else item for item in value]
    elif hasattr(value, "model_dump"):
        value = value.model_dump()
    if more:
        value = entry.get(kind, []) + value
    async with cache_lock:
        try:
            current = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        except (ValueError, OSError):
            current = {}
        target = current.get(node_id, {})
        if target.get("source_version") != material["source_version"]:
            target = {"source_version": material["source_version"]}
        target[kind] = value
        current[node_id] = target
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(current, ensure_ascii=False, indent=2), encoding="utf-8")
    return {kind: value, "sources": material["sources"], "source_version": material["source_version"]}


@router.get("/api/kb/mermaid/{node_id}")
async def get_kb_mermaid(node_id: str):
    return await generate_content(node_id, "mermaid_schema")


@router.get("/api/kb/quiz/{node_id}")
async def get_kb_quiz(node_id: str):
    return await generate_content(node_id, "questions")


@router.post("/api/kb/quiz/{node_id}/more")
async def get_kb_quiz_more(node_id: str):
    return await generate_content(node_id, "questions", more=True)


@router.get("/api/kb/code/{node_id}")
async def get_kb_code(node_id: str):
    return await generate_content(node_id, "task")


@router.get("/api/kb/presentation/{node_id}")
async def get_kb_presentation(node_id: str):
    return await generate_content(node_id, "presentation")


@router.post("/api/console/kill")
async def kill_all_tasks():
    count = 0
    for task in list(task_manager._tasks.values()):
        if not task.done():
            task.cancel()
            count += 1
    return {"status": "success", "killed": count}
