"""Dify Classic Knowledge API. Credentials stay on the server."""
import json
import os
from urllib.parse import quote

import requests

DIFY_API_URL = os.getenv("DIFY_API_URL", "https://api.dify.ai/v1").rstrip("/")
DIFY_API_KEY = os.getenv("DIFY_API_KEY", "")


class DifyError(RuntimeError):
    pass


def configured():
    return bool(os.getenv("DIFY_API_KEY", DIFY_API_KEY).strip())


def _id(value):
    return quote(str(value), safe="")


def request(method, path, **kwargs):
    if not configured():
        raise DifyError("尚未配置 Dify 知识库 API 密钥，请填写 .env.bailian 中的 DIFY_API_KEY")
    kwargs.setdefault("timeout", (8, 60))
    try:
        response = requests.request(method, DIFY_API_URL + path, headers={"Authorization": f"Bearer {os.getenv('DIFY_API_KEY', DIFY_API_KEY)}"}, **kwargs)
    except requests.RequestException:
        raise DifyError("无法连接 Dify，请检查网络和 DIFY_API_URL") from None
    if response.status_code == 204:
        return {"status": "success"}
    if not response.ok:
        hints = {
            401: "Dify 密钥无效或已失效，请使用知识库服务 API 密钥",
            403: "Dify 拒绝访问，请检查知识库密钥的权限范围、API 开关及额度",
            404: "Dify 知识库或文档不存在，请检查关联信息",
            413: "资料超过 Dify 当前账号的文件大小限制",
            429: "Dify 请求过于频繁，请稍后重试",
        }
        # Provider response text can contain credentials or document content.
        raise DifyError(hints.get(response.status_code, f"Dify 请求失败（HTTP {response.status_code}），请检查知识库索引及模型配置"))
    try:
        return response.json()
    except ValueError:
        raise DifyError("Dify 返回了无法识别的响应，请检查 API 地址") from None


def _safe_request(method, url, **kwargs):
    if not configured():
        return {}
    path = url[len(DIFY_API_URL):] if url.startswith(DIFY_API_URL) else url
    return request(method, path, **kwargs)


def get_datasets(page=1, limit=100):
    if not configured():
        return {}
    return request("GET", "/datasets", params={"page": page, "limit": limit})


def create_dataset(name, description=""):
    result = request(
        "POST",
        "/datasets",
        json={
            "name": name,
            "description": description,
            "permission": "only_me",
            "indexing_technique": "economy",
            "retrieval_model": {
                "search_method": "keyword_search",
                "reranking_enable": False,
                "top_k": 4,
                "score_threshold_enabled": False,
            },
        },
    )
    if not result.get("id"):
        raise DifyError("Dify 未返回知识库编号，课程尚未关联")
    return result["id"]


def ensure_economy_if_needed(dataset_id):
    """Switch dataset to economy indexing if high_quality embedding quota is exhausted."""
    try:
        detail = get_dataset_detail(dataset_id)
        if detail.get("indexing_technique") == "high_quality" and detail.get("embedding_available") is False:
            request(
                "PATCH",
                f"/datasets/{_id(dataset_id)}",
                json={
                    "name": detail.get("name") or "Course",
                    "indexing_technique": "economy",
                    "retrieval_model": {
                        "search_method": "keyword_search",
                        "reranking_enable": False,
                        "top_k": 4,
                        "score_threshold_enabled": False,
                    },
                },
            )
    except Exception:
        pass


def get_dataset_detail(dataset_id):
    return request("GET", f"/datasets/{_id(dataset_id)}")


def delete_dataset(dataset_id):
    return request("DELETE", f"/datasets/{_id(dataset_id)}")


def update_dataset(dataset_id, name, description="", **kwargs):
    return request("PATCH", f"/datasets/{_id(dataset_id)}", json={"name": name, "description": description})


def retrieve_segments(dataset_id, query, retrieval_model=None):
    payload = {"query": query[:250]}
    if retrieval_model:
        payload["retrieval_model"] = retrieval_model
    return request("POST", f"/datasets/{_id(dataset_id)}/retrieve", json=payload)


def get_documents(dataset_id, keyword="", page=1, limit=100):
    return request("GET", f"/datasets/{_id(dataset_id)}/documents", params={"keyword": keyword, "page": page, "limit": limit})


def get_document_detail(dataset_id, document_id):
    return request("GET", f"/datasets/{_id(dataset_id)}/documents/{_id(document_id)}")


def delete_document(dataset_id, document_id):
    return request("DELETE", f"/datasets/{_id(dataset_id)}/documents/{_id(document_id)}")


def upload_document(dataset_id, file_bytes, filename, node_tag=""):
    ensure_economy_if_needed(dataset_id)
    technique = os.getenv("DIFY_INDEXING_TECHNIQUE", "economy")
    data = {"indexing_technique": technique, "doc_form": "text_model", "doc_language": "Chinese Simplified", "process_rule": {"mode": "automatic"}}
    return request("POST", f"/datasets/{_id(dataset_id)}/document/create-by-file", files={"file": (filename, file_bytes)}, data={"data": json.dumps(data)})


def update_document_by_file(dataset_id, document_id, file_bytes, filename):
    ensure_economy_if_needed(dataset_id)
    try:
        return request("POST", f"/datasets/{_id(dataset_id)}/documents/{_id(document_id)}/update-by-file", files={"file": (filename, file_bytes)}, data={"data": json.dumps({"process_rule": {"mode": "automatic"}})})
    except DifyError:
        return upload_document(dataset_id, file_bytes, filename)


def get_document_embedding_status(dataset_id, batch):
    return request("GET", f"/datasets/{_id(dataset_id)}/documents/{_id(batch)}/indexing-status")


def get_segments(dataset_id, document_id, keyword="", page=1, limit=100):
    return request("GET", f"/datasets/{_id(dataset_id)}/documents/{_id(document_id)}/segments", params={"page": page, "limit": limit, "keyword": keyword})


def create_document_by_text(dataset_id, name, text, indexing_technique="economy"):
    return request("POST", f"/datasets/{_id(dataset_id)}/document/create-by-text", json={"name": name, "text": text, "indexing_technique": indexing_technique, "process_rule": {"mode": "automatic"}})


def update_document_by_text(dataset_id, document_id, name, text):
    return request("POST", f"/datasets/{_id(dataset_id)}/documents/{_id(document_id)}/update-by-text", json={"name": name, "text": text, "process_rule": {"mode": "automatic"}})
