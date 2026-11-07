import asyncio
import mimetypes
import re
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.db.models import Course, Resource
from app.utils import kb_db, dify_client as dify
from app.utils.knowledge import ensure_dataset, resource_state
from app.utils.course_builder import build_status, configure_build, dataset_documents, public_documents, run_course_build, _state

router = APIRouter(prefix="/api/kb/courses", tags=["Course construction"])
_tasks: set[asyncio.Task] = set()


def start_build(course_id):
    task = asyncio.create_task(run_course_build(course_id))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


def course_dataset(course_id):
    with kb_db.SessionLocal() as db:
        course = db.get(Course, course_id)
        if course is None:
            raise HTTPException(404, "课程不存在")
        return course.dify_dataset_id


@router.get("/{course_id}/build")
async def get_build_status(course_id: str):
    state = build_status(course_id)
    if state["status"] == "idle" and dify.configured():
        dataset_id = course_dataset(course_id)
        if dataset_id:
            try:
                state["documents"] = public_documents(await asyncio.to_thread(dataset_documents, dataset_id))
            except (dify.DifyError, ValueError) as error:
                state["error"] = str(error)
    return state


class BuildRequest(BaseModel):
    enabled: bool = True
    retry: bool = False


@router.post("/{course_id}/build")
async def request_build(course_id: str, req: BuildRequest):
    if not dify.configured():
        raise HTTPException(409, "请先配置 Dify 知识库 API 密钥")
    state = configure_build(course_id, req.enabled, req.retry)
    if req.enabled:
        start_build(course_id)
    return state


@router.post("/{course_id}/materials")
async def upload_course_material(course_id: str, file: UploadFile = File(...), replace_id: str | None = Form(None)):
    if not dify.configured():
        raise HTTPException(409, "请先配置 Dify 知识库 API 密钥")
    course_dataset(course_id)  # Validate before uploading to the cloud.
    filename = Path((file.filename or "document.txt").replace("\\", "/")).name
    extension = Path(filename).suffix.lower()
    if extension not in {".pdf", ".txt", ".md", ".doc", ".docx", ".ppt", ".pptx"}:
        raise HTTPException(422, "请选择 PDF、Word、PPT、Markdown 或文本资料")
    data = await file.read(15 * 1024 * 1024 + 1)
    if not data or len(data) > 15 * 1024 * 1024:
        raise HTTPException(422, "资料不能为空，单个文件请控制在15 MB以内")
    try:
        dataset_id = await asyncio.to_thread(ensure_dataset, course_id)
        if replace_id:
            await asyncio.to_thread(dify.get_document_detail, dataset_id, replace_id)
            result = await asyncio.to_thread(dify.update_document_by_file, dataset_id, replace_id, data, filename)
        else:
            result = await asyncio.to_thread(dify.upload_document, dataset_id, data, filename)
    except dify.DifyError as error:
        raise HTTPException(502, str(error))
    document = result.get("document", {})
    document_id = document.get("id", "")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", document_id):
        raise HTTPException(502, "Dify 未确认资料上传成功，请检查后重试")
    from app.routers.kb import UPLOAD_DIR
    Path(UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    (Path(UPLOAD_DIR) / f"{document_id}{extension}").write_bytes(data)
    with kb_db.SessionLocal() as db:
        for item in db.query(Resource).filter_by(dify_document_id=document_id).all():
            item.name, item.size, item.status = filename, len(data), resource_state(document)
        db.commit()
    configure_build(course_id, enabled=True, retry=True)
    documents = build_status(course_id)["documents"]
    documents = [item for item in documents if item["id"] != document_id]
    documents.append({"id": document_id, "name": filename, "status": resource_state(document)})
    _state(course_id, status="indexing", documents=documents, error=None)
    start_build(course_id)
    return {"status": "indexing", "document_id": document_id, "message": "资料已提交 Dify，解析完成后自动构建星球"}


@router.get("/{course_id}/materials/{document_id}/download")
async def preview_course_material(course_id: str, document_id: str):
    dataset_id = course_dataset(course_id)
    if not dataset_id:
        raise HTTPException(404, "课程尚未关联资料")
    try:
        detail = await asyncio.to_thread(dify.get_document_detail, dataset_id, document_id)
    except dify.DifyError as error:
        raise HTTPException(502, str(error))
    from app.routers.kb import stored_file
    path = stored_file(document_id)
    if path is None:
        raise HTTPException(404, "该资料没有本地源文件，请到 Dify 查看解析文本")
    filename = detail.get("name", path.name)
    return FileResponse(path, filename=filename, media_type=mimetypes.guess_type(filename)[0] or "application/octet-stream", content_disposition_type="inline")
