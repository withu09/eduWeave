import os
import requests
from typing import Optional, Dict, Any, List

DIFY_API_URL = os.getenv("DIFY_API_URL", "https://api.dify.ai/v1")
# API Key 必须通过环境变量注入，切勿硬编码或提交到版本库。
DIFY_API_KEY = os.getenv("DIFY_API_KEY", "")

headers = {
    "Authorization": f"Bearer {DIFY_API_KEY}"
}

def _safe_request(method: str, url: str, **kwargs) -> Optional[Dict[Any, Any]]:
    """Helper to safely execute requests and handle HTTP errors gracefully."""
    try:
        if method.upper() == "GET":
            res = requests.get(url, headers=headers, **kwargs)
        elif method.upper() == "POST":
            res = requests.post(url, headers=headers, **kwargs)
        elif method.upper() == "DELETE":
            res = requests.delete(url, headers=headers, **kwargs)
        elif method.upper() == "PATCH":
            res = requests.patch(url, headers=headers, **kwargs)
        else:
            raise ValueError(f"Unsupported method {method}")
            
        if res.status_code in [200, 201]:
            try:
                return res.json()
            except:
                return {"status": "success"}
        elif res.status_code == 204:
            return {"status": "success"}
        else:
            print(f"[Dify SDK Warning] {method} {url} failed with {res.status_code}: {res.text}")
            res.raise_for_status()
    except Exception as e:
        print(f"[Dify SDK Error] {e}")
        return {}


# ==========================================
# 1. Datasets (知识库级操作)
# ==========================================

def get_datasets(page: int = 1, limit: int = 20) -> dict:
    return _safe_request("GET", f"{DIFY_API_URL}/datasets", params={"page": page, "limit": limit})

def create_dataset(name: str, description: str = "") -> str:
    """Create a new dataset (economy mode by default to avoid embedding errors) and return its ID."""
    payload = {"name": name, "description": description}
    res = requests.post(f"{DIFY_API_URL}/datasets", headers=headers, json=payload)
    if res.status_code == 409:
        # Conflict: Try to find existing
        ds = get_datasets(limit=100)
        for d in ds.get("data", []):
            if d.get("name") == name:
                return d.get("id")
        raise Exception(f"Dataset {name} exists but could not find its ID.")
    res.raise_for_status()
    return res.json().get("id")

def get_dataset_detail(dataset_id: str) -> dict:
    return _safe_request("GET", f"{DIFY_API_URL}/datasets/{dataset_id}")

def delete_dataset(dataset_id: str) -> dict:
    return _safe_request("DELETE", f"{DIFY_API_URL}/datasets/{dataset_id}")

def update_dataset(dataset_id: str, name: str, description: str = "", permission: str = "only_me", indexing_technique: str = "") -> dict:
    payload = {"name": name, "description": description, "permission": permission}
    if indexing_technique:
        payload["indexing_technique"] = indexing_technique
    return _safe_request("PATCH", f"{DIFY_API_URL}/datasets/{dataset_id}", json=payload)

def retrieve_segments(dataset_id: str, query: str, retrieval_model: dict = None) -> dict:
    """Test retrieving segments from a dataset."""
    payload = {"query": query}
    if retrieval_model:
        payload["retrieval_model"] = retrieval_model
    return _safe_request("POST", f"{DIFY_API_URL}/datasets/{dataset_id}/retrieve", json=payload)


# ==========================================
# 2. Documents (文档级操作)
# ==========================================

def get_documents(dataset_id: str, keyword: str = "", page: int = 1, limit: int = 20) -> dict:
    params = {"keyword": keyword, "page": page, "limit": limit}
    return _safe_request("GET", f"{DIFY_API_URL}/datasets/{dataset_id}/documents", params=params)

def get_document_detail(dataset_id: str, document_id: str) -> dict:
    return _safe_request("GET", f"{DIFY_API_URL}/datasets/{dataset_id}/documents/{document_id}")

def delete_document(dataset_id: str, document_id: str) -> dict:
    return _safe_request("DELETE", f"{DIFY_API_URL}/datasets/{dataset_id}/documents/{document_id}")

def create_document_by_text(dataset_id: str, name: str, text: str, indexing_technique: str = "economy") -> dict:
    payload = {
        "name": name,
        "text": text,
        "indexing_technique": indexing_technique,
        "process_rule": {"mode": "automatic"}
    }
    return _safe_request("POST", f"{DIFY_API_URL}/datasets/{dataset_id}/document/create_by_text", json=payload)

def upload_document(dataset_id: str, file_bytes: bytes, filename: str, node_tag: str) -> dict:
    """Create document by file with smart fallback for embedding missing."""
    url = f"{DIFY_API_URL}/datasets/{dataset_id}/document/create_by_file"
    files = {"file": (filename, file_bytes)}
    process_rule = {
        "mode": "hierarchical",
        "rules": {
            "pre_processing_rules": [{"id": "remove_extra_spaces", "enabled": True}],
            "segmentation": {"separator": "\n", "max_tokens": 1000}
        }
    }
    data = {"data": '{"indexing_technique": "high_quality", "process_rule": {"mode": "automatic"}}'}
    
    res = requests.post(url, headers=headers, files=files, data=data)
    if res.status_code == 400 and "embedding" in res.text.lower():
        print("[Dify SDK] Default embedding model not found. Falling back to economy indexing.")
        files["file"] = (filename, file_bytes)
        data["data"] = '{"indexing_technique": "economy", "process_rule": {"mode": "automatic"}}'
        res = requests.post(url, headers=headers, files=files, data=data)
        
    if res.status_code in [200, 201]:
        return res.json()
    print(f"[Dify SDK Warning] File upload failed: {res.text}")
    return {}

def update_document_by_text(dataset_id: str, document_id: str, name: str, text: str) -> dict:
    payload = {"name": name, "text": text}
    return _safe_request("POST", f"{DIFY_API_URL}/datasets/{dataset_id}/documents/{document_id}/update_by_text", json=payload)

def update_document_by_file(dataset_id: str, document_id: str, file_bytes: bytes, filename: str) -> dict:
    url = f"{DIFY_API_URL}/datasets/{dataset_id}/documents/{document_id}/update_by_file"
    files = {"file": (filename, file_bytes)}
    res = requests.post(url, headers=headers, files=files)
    if res.status_code in [200, 201]:
        return res.json()
    return {}

def get_document_embedding_status(dataset_id: str, document_id: str) -> dict:
    return _safe_request("GET", f"{DIFY_API_URL}/datasets/{dataset_id}/documents/{document_id}/processing_status")


# ==========================================
# 3. Segments (分段控制)
# ==========================================

def get_segments(dataset_id: str, document_id: str, keyword: str = "") -> dict:
    params = {"keyword": keyword} if keyword else {}
    return _safe_request("GET", f"{DIFY_API_URL}/datasets/{dataset_id}/documents/{document_id}/segments", params=params)

def add_segments(dataset_id: str, document_id: str, segments: List[dict]) -> dict:
    """segments format: [{'content': 'text', 'answer': 'optional answer', 'keywords': ['kw1']}]"""
    payload = {"segments": segments}
    return _safe_request("POST", f"{DIFY_API_URL}/datasets/{dataset_id}/documents/{document_id}/segments", json=payload)

def get_segment_detail(dataset_id: str, document_id: str, segment_id: str) -> dict:
    return _safe_request("GET", f"{DIFY_API_URL}/datasets/{dataset_id}/documents/{document_id}/segments/{segment_id}")

def update_segment(dataset_id: str, document_id: str, segment_id: str, content: str, answer: str = "", keywords: List[str] = None) -> dict:
    payload = {"segment": {"content": content, "answer": answer}}
    if keywords:
        payload["segment"]["keywords"] = keywords
    return _safe_request("POST", f"{DIFY_API_URL}/datasets/{dataset_id}/documents/{document_id}/segments/{segment_id}", json=payload)

def delete_segment(dataset_id: str, document_id: str, segment_id: str) -> dict:
    return _safe_request("DELETE", f"{DIFY_API_URL}/datasets/{dataset_id}/documents/{document_id}/segments/{segment_id}")


# ==========================================
# 4. Tags (标签管理)
# ==========================================
# Assuming standard tag routes under /dataset/tags or /tags as per Dify API
# Note: Specific routes depend on exact Dify version, implementing standard wrappers.

def get_dataset_tags(dataset_id: str) -> dict:
    return _safe_request("GET", f"{DIFY_API_URL}/datasets/{dataset_id}/tags")

def bind_tag_to_document(dataset_id: str, document_id: str, tag_ids: List[str]) -> dict:
    payload = {"tag_ids": tag_ids}
    return _safe_request("POST", f"{DIFY_API_URL}/datasets/{dataset_id}/documents/{document_id}/tags", json=payload)

def create_tag(name: str, type: str = "custom") -> dict:
    return _safe_request("POST", f"{DIFY_API_URL}/tags", json={"name": name, "type": type})


# ==========================================
# 5. Pipeline & Models (流水线与模型)
# ==========================================

def get_available_models() -> dict:
    return _safe_request("GET", f"{DIFY_API_URL}/models")

def run_pipeline(pipeline_id: str, inputs: dict) -> dict:
    payload = {"inputs": inputs}
    return _safe_request("POST", f"{DIFY_API_URL}/pipelines/{pipeline_id}/run", json=payload)

