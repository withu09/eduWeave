from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
from app.utils.dify_client import create_dataset, upload_document, delete_dataset, delete_document
import app.utils.kb_db as kb_db
from datetime import datetime
from app.utils.task_manager import task_manager
import asyncio

router = APIRouter()

class CreateCourseReq(BaseModel):
    title: str

class CreateModuleReq(BaseModel):
    course_id: str
    title: str

class CreateNodeReq(BaseModel):
    module_id: str
    title: str

class UpdateNodeReq(BaseModel):
    title: str

@router.get("/api/kb/tree")
async def get_kb_tree():
    """Return the Knowledge Base Tree from local DB."""
    return {"tree": kb_db.get_tree()}

@router.patch("/api/kb/tree/{node_type}/{node_id}")
async def update_tree_node(node_type: str, node_id: str, req: UpdateNodeReq):
    try:
        dify_dataset_id = kb_db.update_tree_node(node_id, req.title)
        if node_type == "course" and dify_dataset_id:
            from app.utils.dify_client import update_dataset
            try:
                update_dataset(dify_dataset_id, name=req.title)
            except Exception as e:
                print(f"Warning: Failed to update Dify dataset name: {e}")
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/kb/sync")
async def sync_kb_from_dify():
    """Fetches all datasets from Dify and syncs them into the local tree."""
    try:
        from app.utils.dify_client import get_datasets
        # Fetch up to 100 datasets from Dify
        res = get_datasets(limit=100)
        datasets = res.get("data", [])
        kb_db.sync_from_dify(datasets)
        return {"status": "success", "tree": kb_db.get_tree()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/kb/courses")
async def create_course(req: CreateCourseReq):
    try:
        # Create dataset in Dify
        dataset_id = create_dataset(req.title)
        # Save to local DB
        course = kb_db.add_course(req.title, dataset_id)
        return course
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/kb/modules")
async def create_module(req: CreateModuleReq):
    try:
        mod = kb_db.add_module(req.course_id, req.title)
        return mod
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/api/kb/nodes")
async def create_node(req: CreateNodeReq):
    try:
        node = kb_db.add_node(req.module_id, req.title)
        return node
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/api/kb/tree/{node_type}/{node_id}")
async def delete_tree_node(node_type: str, node_id: str):
    try:
        dify_dataset_id = kb_db.delete_tree_node(node_id, node_type)
        if node_type == "course" and dify_dataset_id:
            # Cleanup in Dify
            try:
                delete_dataset(dify_dataset_id)
            except Exception as e:
                print(f"Warning: Failed to delete dify dataset: {e}")
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/kb/resources/{node_id}")
async def get_kb_resources(node_id: str):
    """Return resources for a specific node."""
    kb_db.complete_processing() # simulate fast processing
    resources = kb_db.get_resources(node_id)
    return {"resources": resources}

import asyncio
import os
import chromadb
from fastapi.responses import FileResponse
from app.utils.dify_client import get_document_embedding_status, get_segments

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

async def sync_dify_segments(dataset_id: str, document_id: str, node_id: str):
    """Polls Dify for processing completion, then fetches segments and syncs to local ChromaDB."""
    import time
    max_retries = 30
    for _ in range(max_retries):
        status_res = get_document_embedding_status(dataset_id, document_id)
        if status_res and isinstance(status_res, list) and len(status_res) > 0:
            status = status_res[0].get("indexing_status", "")
            if status == "completed":
                break
            elif status == "error":
                print(f"[Sync] Dify processing error for {document_id}")
                return
        await asyncio.sleep(2)
        
    # Fetch segments
    segments_res = get_segments(dataset_id, document_id)
    segments = segments_res.get("data", [])
    if not segments:
        print(f"[Sync] No segments found for {document_id}")
        return
        
    # Sync to ChromaDB
    try:
        chroma_client = chromadb.HttpClient(host=os.getenv("CHROMA_HOST", "localhost"), port=int(os.getenv("CHROMA_PORT", "8001")))
        collection = chroma_client.get_or_create_collection("dsa")
        docs = []
        metadatas = []
        ids = []
        for i, seg in enumerate(segments):
            content = seg.get("content", "")
            if content.strip():
                docs.append(content)
                metadatas.append({"node_id": node_id, "document_id": document_id})
                ids.append(f"{document_id}_{i}")
        if docs:
            collection.add(documents=docs, metadatas=metadatas, ids=ids)
            print(f"[Sync] Successfully synced {len(docs)} segments to local ChromaDB for node {node_id}")
    except Exception as e:
        print(f"[Sync] Failed to sync to ChromaDB: {e}")

@router.post("/api/kb/upload")
async def upload_kb_document(
    file: UploadFile = File(...), 
    course_id: str = Form(...), 
    node_id: str = Form(...)
):
    dataset_id = kb_db.get_dataset_id_for_course(course_id)
    if not dataset_id:
        raise HTTPException(status_code=404, detail="Course or dataset not found")
        
    try:
        file_bytes = await file.read()
        dify_doc_id = f"mock-dify-{file.filename}"
        try:
            res = upload_document(dataset_id, file_bytes, file.filename, node_id)
            dify_doc_id = res.get("document", {}).get("id", dify_doc_id)
            # Trigger background sync
            asyncio.create_task(sync_dify_segments(dataset_id, dify_doc_id, node_id))
        except Exception as e:
            print(f"Warning: Dify upload failed: {e}. Falling back to mock ID.")
            
        # Save file locally for native viewer
        file_ext = os.path.splitext(file.filename)[1]
        local_path = os.path.join(UPLOAD_DIR, f"{dify_doc_id}{file_ext}")
        with open(local_path, "wb") as f:
            f.write(file_bytes)
            
        new_resource = {
            "id": dify_doc_id,
            "name": file.filename,
            "size": len(file_bytes),
            "date": datetime.now().strftime("%Y-%m-%d"),
            "status": "completed"
        }
        
        kb_db.add_resource(node_id, new_resource)
        
        frontend_resource = {**new_resource}
        frontend_resource["size"] = f"{len(file_bytes) / 1024:.1f} KB"
        
        return {"status": "success", "resource": frontend_resource}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/kb/download/{resource_id}")
async def download_kb_document(resource_id: str):
    db = kb_db.SessionLocal()
    try:
        resource = db.query(kb_db.Resource).filter(kb_db.Resource.dify_document_id == resource_id).first()
        if not resource:
            raise HTTPException(status_code=404, detail="File not found")
        
        filename = resource.name
        for f in os.listdir(UPLOAD_DIR):
            if f.startswith(resource_id):
                # Try to guess mime type, default to pdf if unknown
                import mimetypes
                media_type, _ = mimetypes.guess_type(f)
                if not media_type:
                    media_type = "application/pdf"
                return FileResponse(os.path.join(UPLOAD_DIR, f), filename=filename, content_disposition_type="inline", media_type=media_type)
        raise HTTPException(status_code=404, detail="File missing on disk")
    finally:
        db.close()

@router.delete("/api/kb/resources/{course_id}/{node_id}/{document_id}")
async def delete_resource_doc(course_id: str, node_id: str, document_id: str):
    try:
        dataset_id = kb_db.get_dataset_id_for_course(course_id)
        if dataset_id and not document_id.startswith("mock"):
            delete_document(dataset_id, document_id)
        
        kb_db.delete_resource(node_id, document_id)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/kb/starmap/all")
async def get_all_starmap():
    try:
        nodes = kb_db.get_all_starmap_nodes()
        return {"data": nodes}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/kb/starmap/{course_id}")
async def get_starmap(course_id: str):
    try:
        nodes = kb_db.get_starmap_nodes(course_id)
        return {"data": nodes}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/kb/mermaid/{node_id}")
async def get_kb_mermaid(node_id: str):
    """Return a Mermaid schema for a specific node."""
    import json
    import os
    
    # a. Lookup node title from DB
    db = kb_db.SessionLocal()
    node_title = "核心知识"
    try:
        node = db.query(kb_db.Node).filter(kb_db.Node.id == node_id).first()
        if node:
            node_title = node.title
        else:
            mod = db.query(kb_db.Module).filter(kb_db.Module.id == node_id).first()
            if mod:
                node_title = mod.title
            else:
                course = db.query(kb_db.Course).filter(kb_db.Course.id == node_id).first()
                if course:
                    node_title = course.title
    finally:
        db.close()
            
    # b. Check resources
    resources = kb_db.get_resources(node_id)
    if not resources:
        return {"mermaid_schema": "", "error": "no_resources"}

    # c. Check generated_docs.json with Smart Caching
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    json_path = os.path.join(base_dir, "resources", "generated_docs.json")
    docs = {}
    
    # Fetch max created_at for resources
    db = kb_db.SessionLocal()
    max_created_at = None
    try:
        from app.db.models import Resource
        res = db.query(Resource.created_at).filter(Resource.node_id == node_id).order_by(Resource.created_at.desc()).first()
        if res and res[0]:
            max_created_at = res[0].isoformat()
    finally:
        db.close()
    
    if os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                docs = json.load(f)
                if node_id in docs and "mermaid_schema" in docs[node_id] and docs[node_id]["mermaid_schema"]:
                    last_updated = docs[node_id].get("last_updated")
                    # If cache exists and is newer than the latest resource upload, return cache
                    if last_updated and max_created_at and last_updated >= max_created_at:
                        return {"mermaid_schema": docs[node_id]["mermaid_schema"]}
                    elif not max_created_at:
                        return {"mermaid_schema": docs[node_id]["mermaid_schema"]}
        except Exception as e:
            print(f"Warning: Failed to read generated_docs.json: {e}")

    # d, e, f. Generate mindmap
    try:
        import chromadb
        from app.agents.writer import writer_agent
        from app.agents.deps import AgentDeps
        from app.schemas.profile import StudentProfile
        
        try:
            chroma_client = chromadb.HttpClient(
                host=os.getenv("CHROMA_HOST", "localhost"), 
                port=int(os.getenv("CHROMA_PORT", "8001"))
            )
        except Exception as e:
            print(f"Warning: Chroma client failed in kb endpoint: {e}")
            chroma_client = None
        deps = AgentDeps(chroma_client=chroma_client, student_profile=StudentProfile(), node_title=node_title)
        
        result = await writer_agent.run("Extract a detailed mindmap from the materials.", deps=deps)
        new_schema = getattr(result, "data", getattr(result, "output", None)).mermaid_schema
        
        # g. Update generated_docs.json
        from datetime import datetime
        docs[node_id] = docs.get(node_id, {})
        docs[node_id]["mermaid_schema"] = new_schema
        docs[node_id]["last_updated"] = datetime.now().isoformat()
        
        os.makedirs(os.path.dirname(json_path), exist_ok=True)
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(docs, f, ensure_ascii=False, indent=2)
            
        # h. Return the generated schema
        return {"mermaid_schema": new_schema}
        
    except Exception as e:
        print(f"Error generating mindmap: {e}")
        return {"mermaid_schema": "", "error": str(e)}
    finally:
        from app.utils.telemetry import set_agent_status, log_token_usage
        import asyncio
        # We assume writer runs in event loop context here
        asyncio.create_task(set_agent_status("Writer", "idle"))
        if 'result' in locals() and hasattr(result, 'usage'):
            asyncio.create_task(log_token_usage("Writer", result.usage().total_tokens if result.usage() else 500))


@router.get("/api/kb/quiz/{node_id}")
async def get_kb_quiz(node_id: str):
    """Generate a quiz for a specific node."""
    import json
    import os
    from datetime import datetime
    
    # a. Lookup node title from DB
    db = kb_db.SessionLocal()
    node_title = "核心知识"
    max_created_at = None
    try:
        from app.db.models import Node, Module, Course, Resource
        node = db.query(Node).filter(Node.id == node_id).first()
        if node:
            node_title = node.title
        else:
            mod = db.query(Module).filter(Module.id == node_id).first()
            if mod:
                node_title = mod.title
            else:
                course = db.query(Course).filter(Course.id == node_id).first()
                if course:
                    node_title = course.title
                    
        # Fetch max created_at for resources
        res = db.query(Resource.created_at).filter(Resource.node_id == node_id).order_by(Resource.created_at.desc()).first()
        if res and res[0]:
            max_created_at = res[0].isoformat()
    finally:
        db.close()
            
    # b. Check resources
    resources = kb_db.get_resources(node_id)
    if not resources:
        return {"questions": [], "error": "no_resources"}

    # c. Check generated_quizzes.json with Smart Caching
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    json_path = os.path.join(base_dir, "resources", "generated_quizzes.json")
    docs = {}
    
    if os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                docs = json.load(f)
                if node_id in docs and "questions" in docs[node_id] and docs[node_id]["questions"]:
                    last_updated = docs[node_id].get("last_updated")
                    if last_updated and max_created_at and last_updated >= max_created_at:
                        return {"questions": docs[node_id]["questions"]}
                    elif not max_created_at:
                        return {"questions": docs[node_id]["questions"]}
        except Exception as e:
            print(f"Warning: Failed to read generated_quizzes.json: {e}")

    # d. Generate quiz
    try:
        import chromadb
        from app.agents.examiner import examiner_agent
        from app.agents.deps import AgentDeps
        from app.schemas.profile import StudentProfile
        
        try:
            chroma_client = chromadb.HttpClient(
                host=os.getenv("CHROMA_HOST", "localhost"), 
                port=int(os.getenv("CHROMA_PORT", "8001"))
            )
        except Exception as e:
            print(f"Warning: Chroma client failed in kb quiz endpoint: {e}")
            chroma_client = None
            
        deps = AgentDeps(chroma_client=chroma_client, student_profile=StudentProfile(), node_title=node_title)
        
        result = await examiner_agent.run("Generate a quiz based on the material.", deps=deps)
        questions_obj = getattr(result, "data", getattr(result, "output", None)).questions
        # Convert Pydantic models to dict if needed
        questions = [q.dict() if hasattr(q, "dict") else q for q in questions_obj]
        
        # Update cache
        docs[node_id] = docs.get(node_id, {})
        docs[node_id]["questions"] = questions
        docs[node_id]["last_updated"] = datetime.now().isoformat()
        
        os.makedirs(os.path.dirname(json_path), exist_ok=True)
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(docs, f, ensure_ascii=False, indent=2)
            
        return {"questions": questions}
        
    except Exception as e:
        print(f"Error generating quiz: {e}")
        return {"questions": [], "error": str(e)}
    finally:
        from app.utils.telemetry import set_agent_status, log_token_usage
        import asyncio
        asyncio.create_task(set_agent_status("Examiner", "idle"))
        if 'result' in locals() and hasattr(result, 'usage'):
            asyncio.create_task(log_token_usage("Examiner", result.usage().total_tokens if result.usage() else 800))


@router.post("/api/kb/quiz/{node_id}/more")
async def get_kb_quiz_more(node_id: str):
    """Generate more questions for a specific node and append to cache."""
    import json
    import os
    from datetime import datetime
    
    db = kb_db.SessionLocal()
    node_title = "核心知识"
    try:
        from app.db.models import Node, Module, Course
        node = db.query(Node).filter(Node.id == node_id).first()
        if node:
            node_title = node.title
        else:
            mod = db.query(Module).filter(Module.id == node_id).first()
            if mod:
                node_title = mod.title
            else:
                course = db.query(Course).filter(Course.id == node_id).first()
                if course:
                    node_title = course.title
    finally:
        db.close()
            
    # Load existing cache
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    json_path = os.path.join(base_dir, "resources", "generated_quizzes.json")
    docs = {}
    existing_questions = []
    
    if os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                docs = json.load(f)
                if node_id in docs and "questions" in docs[node_id]:
                    existing_questions = docs[node_id]["questions"]
        except Exception as e:
            print(f"Warning: Failed to read generated_quizzes.json: {e}")

    # Generate more questions
    try:
        import chromadb
        from app.agents.examiner import examiner_agent
        from app.agents.deps import AgentDeps
        from app.schemas.profile import StudentProfile
        
        try:
            chroma_client = chromadb.HttpClient(
                host=os.getenv("CHROMA_HOST", "localhost"), 
                port=int(os.getenv("CHROMA_PORT", "8001"))
            )
        except Exception as e:
            chroma_client = None
            
        deps = AgentDeps(chroma_client=chroma_client, student_profile=StudentProfile(), node_title=node_title)
        
        # We can pass an instruction to not repeat existing questions if we want, but for now just call the agent.
        result = await examiner_agent.run("Generate MORE completely new and different questions based on the material. Ensure they are different from previous questions.", deps=deps)
        questions_obj = getattr(result, "data", getattr(result, "output", None)).questions
        new_questions = [q.dict() if hasattr(q, "dict") else q for q in questions_obj]
        
        # Append to existing
        merged_questions = existing_questions + new_questions
        
        # Update cache
        docs[node_id] = docs.get(node_id, {})
        docs[node_id]["questions"] = merged_questions
        docs[node_id]["last_updated"] = datetime.now().isoformat()
        
        os.makedirs(os.path.dirname(json_path), exist_ok=True)
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(docs, f, ensure_ascii=False, indent=2)
            
        return {"questions": merged_questions}
        
    except Exception as e:
        print(f"Error generating more quiz: {e}")
        return {"questions": existing_questions, "error": str(e)}

@router.get("/api/kb/code/{node_id}")
async def get_kb_code(node_id: str):
    """Generate a coding task for a specific node."""
    import json
    import os
    from datetime import datetime
    
    # a. Check if node has resources
    resources = kb_db.get_resources(node_id)
    if not resources:
        return {"task": None, "error": "no_resources"}
        
    # b. Get node title
    db = kb_db.SessionLocal()
    node_title = "核心知识"
    try:
        from app.db.models import Node, Module, Course
        node = db.query(Node).filter(Node.id == node_id).first()
        if node:
            node_title = node.title
        else:
            mod = db.query(Module).filter(Module.id == node_id).first()
            if mod:
                node_title = mod.title
            else:
                course = db.query(Course).filter(Course.id == node_id).first()
                if course:
                    node_title = course.title
    finally:
        db.close()
            
    # c. Fetch max created_at for resources (Smart Caching)
    max_created_at = None
    for r in resources:
        try:
            r_dt = datetime.fromisoformat(r["created_at"])
            if max_created_at is None or r_dt > max_created_at:
                max_created_at = r_dt
        except Exception:
            pass
    if max_created_at:
        max_created_at = max_created_at.isoformat()
            
    # d. Check generated_code.json with Smart Caching
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    json_path = os.path.join(base_dir, "resources", "generated_code.json")
    docs = {}
    
    if os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                docs = json.load(f)
                if node_id in docs and "task" in docs[node_id] and docs[node_id]["task"]:
                    last_updated = docs[node_id].get("last_updated")
                    if last_updated and max_created_at and last_updated >= max_created_at:
                        return {"task": docs[node_id]["task"]}
                    elif not max_created_at:
                        return {"task": docs[node_id]["task"]}
        except Exception as e:
            print(f"Warning: Failed to read generated_code.json: {e}")

    # e. Generate code task
    try:
        import chromadb
        from app.agents.coder import coder_agent
        from app.agents.deps import AgentDeps
        from app.schemas.profile import StudentProfile
        
        try:
            chroma_client = chromadb.HttpClient(
                host=os.getenv("CHROMA_HOST", "localhost"), 
                port=int(os.getenv("CHROMA_PORT", "8001"))
            )
        except Exception as e:
            print(f"Warning: Chroma client failed in kb code endpoint: {e}")
            chroma_client = None
            
        deps = AgentDeps(chroma_client=chroma_client, student_profile=StudentProfile(), node_title=node_title)
        
        result = await coder_agent.run("Generate a code task based on the material.", deps=deps)
        task_obj = getattr(result, "data", getattr(result, "output", None)).task
        task = task_obj.dict() if hasattr(task_obj, "dict") else task_obj
        
        # Update cache
        docs[node_id] = docs.get(node_id, {})
        docs[node_id]["task"] = task
        docs[node_id]["last_updated"] = datetime.now().isoformat()
        
        os.makedirs(os.path.dirname(json_path), exist_ok=True)
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(docs, f, ensure_ascii=False, indent=2)
            
        return {"task": task}
        
    except Exception as e:
        print(f"Error generating code task: {e}")
        return {"task": None, "error": str(e)}
    finally:
        from app.utils.telemetry import set_agent_status, log_token_usage
        import asyncio
        asyncio.create_task(set_agent_status("Coder", "idle"))
        if 'result' in locals() and hasattr(result, 'usage'):
            asyncio.create_task(log_token_usage("Coder", result.usage().total_tokens if result.usage() else 1200))



@router.get("/api/kb/presentation/{node_id}")
async def get_kb_presentation(node_id: str):
    node_title = "核心知识"
    # Find node title if possible
    # We will just fetch resources directly
    resources = kb_db.get_resources(node_id)
    if not resources:
        return {"error": "no_resources", "presentation": None}
    
    # Check if we already have presentation data cached
    # The cache uses generated_docs.json in app/resources/
    import json
    docs_path = "app/resources/generated_docs.json"
    cache = {}
    if os.path.exists(docs_path):
        try:
            with open(docs_path, "r", encoding="utf-8") as f:
                cache = json.load(f)
        except Exception:
            pass
            
    # Key for caching the presentation
    cache_key = f"{node_id}_presentation"
    
    # A simple freshness check could be done using last updated of resources, 
    # but for prototype we just check if it exists in cache
    if cache_key in cache:
        return {"presentation": cache[cache_key]}
        
    # Not in cache, so we generate using presenter_agent
    from app.agents.presenter import presenter_agent, Presentation, Slide
    from app.agents.deps import AgentDeps
    from app.db.chroma_client import get_chroma_client
    import asyncio
    
    chroma_client = get_chroma_client()
    
    # We call presenter agent
    try:
        coro = presenter_agent.run(
            "Generate a presentation from the materials for this node.",
            deps=AgentDeps(chroma_client=chroma_client, node_title=node_title)
        )
        task_id = task_manager.start_task(coro)
        try:
            result = await task_manager._tasks[task_id]
        except asyncio.CancelledError:
            return {'error': 'task_cancelled', 'presentation': None}
        
        # result.data is PresentationData (Pydantic model)
        # We need to convert it to dict for caching and returning
        pres_dict = result.data.model_dump()
        
        # Save to cache
        cache[cache_key] = pres_dict
        with open(docs_path, 'w', encoding='utf-8') as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
            
        return {'presentation': pres_dict}
        
    except Exception as e:
        print('Presenter Agent Error:', str(e))
        return {'error': str(e), 'presentation': None}
    finally:
        from app.utils.telemetry import set_agent_status, log_token_usage
        import asyncio
        asyncio.create_task(set_agent_status('Presenter', 'idle'))
        if 'result' in locals() and hasattr(result, 'usage'):
            asyncio.create_task(log_token_usage('Presenter', result.usage().total_tokens if hasattr(result, 'usage') and result.usage() else 2000))

@router.post("/api/console/kill")
async def kill_all_tasks():
    """Cancels all running AI agent tasks"""
    count = 0
    for task_id, task in list(task_manager._tasks.items()):
        if not task.done():
            task.cancel()
            count += 1
    return {"status": "success", "killed": count}
