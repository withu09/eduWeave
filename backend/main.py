import os
import json
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from app.agents.orchestrator import StudentProfile, StudyPlan, fallback_json_parser
from app.agents.profiler import profiler_agent
from app.agents.chat import chat_agent
from app.agents.writer import writer_agent
from app.agents.resource_agent import resource_agent
from app.agents.deps import AgentDeps
from app.agents.tasks import generate_heavy_media, celery_app
from contextlib import asynccontextmanager
import chromadb
from app.utils.telemetry import redis_client

# Import routers
from app.routers.kb import router as kb_router
from app.routers.tts import router as tts_router
from app.routers.starmap import router as starmap_router

# Initialize Chroma client
try:
    chroma_client = chromadb.HttpClient(host=os.getenv("CHROMA_HOST", "localhost"), port=int(os.getenv("CHROMA_PORT", "8001")))
except Exception as e:
    print(f"Warning: Chroma client failed to initialize: {e}. Running with mock fallback.")
    chroma_client = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Checking Chroma DB connectivity...")
    if chroma_client is not None:
        try:
            collection = chroma_client.get_or_create_collection("dsa")
            if collection.count() == 0:
                print("Chroma DB empty. Seeding initial lesson slices...")
                resources_dir = "app/resources"
                files = ["pointers_guide.md", "linked_list_guide.md"]
                for f in files:
                    fp = os.path.join(resources_dir, f)
                    if os.path.exists(fp):
                        with open(fp, "r", encoding="utf-8") as file:
                            content = file.read()
                            collection.add(
                                documents=[content],
                                metadatas=[{"course_id": "dsa", "file_name": f}],
                                ids=[f]
                            )
                print("Seeding completed successfully.")
        except Exception as e:
            print(f"Chroma seeding failed: {e}. Fallback to mock.")
    else:
        print("Chroma client is None. Seeding skipped.")
        
    print("Performing initial Dify Knowledge Base Sync...")
    try:
        from app.utils.dify_client import get_datasets
        import app.utils.kb_db as kb_db
        res = get_datasets(limit=100)
        datasets = res.get("data", [])
        kb_db.sync_from_dify(datasets)
        print(f"Initial Dify KB Sync completed successfully. Found {len(datasets)} datasets.")
    except Exception as e:
        print(f"Initial Dify KB Sync failed: {e}")
        
    # Start background polling loop
    async def poll_dify():
        while True:
            await asyncio.sleep(30)
            try:
                from app.utils.dify_client import get_datasets
                import app.utils.kb_db as kb_db
                res = get_datasets(limit=100)
                datasets = res.get("data", [])
                kb_db.sync_from_dify(datasets)
            except Exception as e:
                pass

    bg_task = asyncio.create_task(poll_dify())
    yield
    bg_task.cancel()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(kb_router)
app.include_router(tts_router)
app.include_router(starmap_router)

@app.get("/api/resources")
async def get_resources(course: str, exclude: str = ""):
    prompt = f"Recommend resources for the course '{course}'."
    if exclude:
        prompt += f" EXCLUDE the following resources: {exclude}"
    
    try:
        ctx = await resource_agent.run(prompt)
        return ctx.output.model_dump()
    except Exception as e:
        print(f"Resource Agent failed: {e}")
        # fallback
        return {
            "resources": [
                {
                    "id": "fallback-1",
                    "title": "Fallback Resource",
                    "source": "EduWeave System",
                    "reason": "AI service is currently unavailable.",
                    "url": "https://example.com"
                }
            ]
        }

@app.get("/api/chat")
async def chat_stream(user_input: str):
    async def event_generator():
        from app.utils.telemetry import set_agent_status, log_token_usage, log_thought
        yield "0:\"Analyzing your request...\"\n"
        await asyncio.sleep(0.2)
        # 1. Run Profiler Agent to extract StudentProfile
        await set_agent_status("Profiler", "working")
        try:
            profile_ctx = await profiler_agent.run(f"Extract profile from user query: {user_input} (User ID: stud-01)")
            profile = profile_ctx.output
            asyncio.create_task(log_token_usage("Profiler", profile_ctx.usage().total_tokens if profile_ctx.usage() else 500))
            if profile.weaknesses:
                yield f"0:\"Profile updated. Weaknesses: {profile.weaknesses}\"\n"
        except Exception as e:
            print(f"Profiler Agent failed: {e}. Fallback to mock profile.")
            profile = StudentProfile(user_id="stud-01", weaknesses=[])
        finally:
            await set_agent_status("Profiler", "idle")
        
        # 2. Run Chat Agent to stream conversational response and potentially call recommend_plan
        deps = AgentDeps(chroma_client=chroma_client, student_profile=profile)
        
        await set_agent_status("Director", "working")
        try:
            async with chat_agent.run_stream(f"User query: {user_input}", deps=deps) as result:
                async for chunk in result.stream():
                    # Stream the standard conversational text back to frontend as type '1'
                    yield f"1:{json.dumps(chunk, ensure_ascii=False)}\n"
            asyncio.create_task(log_token_usage("Director", result.usage().total_tokens if result.usage() else 1500))
                    
            # Check if the recommend_plan tool was called by looking at deps.study_plan
            if deps.study_plan:
                yield f"0:\"Path planned. Rendering nodes...\"\n"
                yield f"9:{json.dumps({'nodes': deps.study_plan.nodes, 'description': deps.study_plan.description})}\n"
                
                # Run Writer Agent to generate detailed docs since a plan was recommended
                try:
                    await set_agent_status("Writer", "working")
                    writer_ctx = await writer_agent.run(f"Generate details for nodes {deps.study_plan.nodes}", deps=deps)
                    asyncio.create_task(log_token_usage("Writer", writer_ctx.usage().total_tokens if writer_ctx.usage() else 2000))
                    yield f"0:\"Docs generated.\"\n"
                    
                    os.makedirs("app/resources", exist_ok=True)
                    with open("app/resources/generated_docs.json", "w", encoding="utf-8") as f:
                        json.dump({
                            "nodes": deps.study_plan.nodes,
                            "markdown": writer_ctx.output.markdown,
                            "mermaid_schema": writer_ctx.output.mermaid_schema
                        }, f, ensure_ascii=False, indent=2)
                except Exception as e:
                    print(f"Writer Agent failed to generate docs: {e}")
                finally:
                    await set_agent_status("Writer", "idle")
                    
        except Exception as e:
            print(f"Chat Agent failed: {e}")
            yield f"1:\"Sorry, I encountered an error while processing your request: {e}\"\n"
        finally:
            await set_agent_status("Director", "idle")
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.websocket("/ws/tasks/{task_id}")
async def task_progress_websocket(websocket: WebSocket, task_id: str):
    await websocket.accept()
    try:
        while True:
            res = celery_app.AsyncResult(task_id)
            if res.state == "PROGRESS":
                await websocket.send_text(json.dumps({
                    "state": "PROGRESS",
                    "info": res.info
                }))
            elif res.state == "SUCCESS":
                await websocket.send_text(json.dumps({
                    "state": "SUCCESS",
                    "result": res.result
                }))
                break
            elif res.state in ["FAILURE", "REVOKED"]:
                await websocket.send_text(json.dumps({
                    "state": "FAILED",
                    "info": str(res.info)
                }))
                break
            await asyncio.sleep(0.5)
    except WebSocketDisconnect:
        print(f"Task socket disconnected: {task_id}")


@app.websocket("/api/console/ws")
async def console_ws(websocket: WebSocket):
    await websocket.accept()
    if not redis_client:
        print("Redis client not initialized, closing console ws.")
        await websocket.close(code=1011)
        return
        
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("agent_telemetry")
    print("Console WebSocket connected and subscribed to telemetry.")
    
    try:
        while True:
            # We use get_message with timeout to allow checking for disconnects
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message:
                await websocket.send_text(message["data"])
            
            # Simple ping/pong to check connection
            try:
                # receive with timeout to catch disconnects
                # wait_for since receive_text is blocking
                data = await asyncio.wait_for(websocket.receive_text(), timeout=0.1)
                if data == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                pass
    except WebSocketDisconnect:
        print("Console WebSocket disconnected.")
    except Exception as e:
        print(f"Console WebSocket error: {e}")
    finally:
        await pubsub.unsubscribe("agent_telemetry")
        await pubsub.close()
