import os
import json
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic_ai import Agent
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
from app.schemas.conversation import ChatRequest, ChatTurn, model_history

# Import routers
from app.routers.kb import router as kb_router
from app.routers.tts import router as tts_router
from app.routers.starmap import router as starmap_router
from app.routers.adaptive import router as adaptive_router
from app.routers.practice import router as practice_router
from app.routers.console import router as console_router
from app.routers.course_build import router as course_build_router
from app.utils.telemetry import tracked_run, agent_call

# Initialize Chroma client
try:
    chroma_client = chromadb.HttpClient(host=os.getenv("CHROMA_HOST", "localhost"), port=int(os.getenv("CHROMA_PORT", "8001")))
except Exception as e:
    print(f"Warning: Chroma client failed to initialize: {e}. Running with mock fallback.")
    chroma_client = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.db.database import init_db
    await asyncio.to_thread(init_db)
    print("Checking Chroma DB connectivity...")
    if chroma_client is not None and os.getenv("SEED_VECTOR_KB", "true").lower() == "true":
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
        print("Vector seeding skipped (disabled or Chroma unavailable).")
        
    print("Performing initial Dify Knowledge Base Sync...")
    try:
        from app.utils.dify_client import get_datasets
        import app.utils.kb_db as kb_db
        res = await asyncio.to_thread(get_datasets, limit=100)
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
                res = await asyncio.to_thread(get_datasets, limit=100)
                datasets = res.get("data", [])
                kb_db.sync_from_dify(datasets)
            except Exception as e:
                pass

    from app.utils.course_builder import poll_course_builds
    from app.routers.course_build import _tasks as build_tasks
    bg_task = asyncio.create_task(poll_dify())
    build_task = asyncio.create_task(poll_course_builds())
    try:
        yield
    finally:
        pending = [bg_task, build_task, *build_tasks]
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)

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
app.include_router(adaptive_router)
app.include_router(practice_router)
app.include_router(console_router)
app.include_router(course_build_router)

@app.get("/api/health")
async def health():
    from app.core import settings
    is_bailian = settings.LLM_PROVIDER.lower() in {"bailian", "dashscope", "aliyun"}
    return {
        "status": "ok",
        "provider": settings.LLM_PROVIDER,
        "model": settings.DASHSCOPE_MODEL if is_bailian else settings.XUNFEI_SPARK_MODEL,
        "model_configured": bool(settings.DASHSCOPE_API_KEY if is_bailian else settings.XUNFEI_SPARK_API_KEY and settings.XUNFEI_SPARK_API_SECRET),
    }

@app.get("/api/resources")
async def get_resources(course: str, exclude: str = ""):
    prompt = f"Recommend resources for the course '{course}'."
    if exclude:
        prompt += f" EXCLUDE the following resources: {exclude}"
    
    try:
        ctx = await tracked_run('Resource', '推荐学习资源', resource_agent.run(prompt))
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
    """Backward-compatible single-turn endpoint."""
    return chat_response(user_input, [])


@app.post("/api/chat")
async def chat_with_history(req: ChatRequest):
    return chat_response(req.user_input, req.history, req.course_id, req.node_id)


def chat_response(user_input: str, history: list[ChatTurn], course_id: str | None = None, node_id: str | None = None):
    previous_messages = model_history(history)
    async def event_generator():
        from app.core import settings
        if settings.LLM_PROVIDER.lower() in {"bailian", "dashscope", "aliyun"} and not settings.DASHSCOPE_API_KEY:
            yield f"1:{json.dumps('请先在项目的 .env.bailian 中填写 DASHSCOPE_API_KEY，然后重新启动服务。', ensure_ascii=False)}\n"
            return
        from app.utils.telemetry import set_agent_status, log_token_usage, log_thought
        yield "0:\"Analyzing your request...\"\n"
        await asyncio.sleep(0.2)
        from app.utils import kb_db
        with kb_db.SessionLocal() as db:
            resolved_course_id = course_id
            if not resolved_course_id or resolved_course_id == "all":
                first_course = (
                    db.query(kb_db.Course)
                    .filter(kb_db.Course.dify_dataset_id.isnot(None))
                    .first()
                    or db.query(kb_db.Course).first()
                )
                if first_course:
                    resolved_course_id = first_course.id
            topics = db.query(kb_db.Node).join(kb_db.Module)
            if resolved_course_id and resolved_course_id != "all":
                topics = topics.filter(kb_db.Module.course_id == resolved_course_id)
            topic_rows = topics.all()
            available_topics = [node.title for node in topic_rows]
            topic_id_map = {node.title: node.id for node in topic_rows}
            selected_node_title = None
            if node_id:
                matched_node = db.get(kb_db.Node, node_id)
                if matched_node:
                    selected_node_title = matched_node.title
        course_context = f"当前课程已有知识点：{json.dumps(available_topics, ensure_ascii=False)}。"
        if selected_node_title:
            course_context += f"用户当前正在查看的知识点节点：{selected_node_title}（node_id={node_id}）。"
        # 1. Run Profiler Agent to extract StudentProfile
        await set_agent_status("Profiler", "working")
        try:
            profile_ctx = await tracked_run('Profiler', '分析伴学对话中的学习情况', profiler_agent.run(
                f"{course_context}\nExtract profile from user query: {user_input} (User ID: stud-01)",
                message_history=previous_messages,
            ))
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
        deps = AgentDeps(chroma_client=chroma_client, student_profile=profile, course_id=resolved_course_id, node_id=node_id, available_topics=available_topics)
        
        await set_agent_status("Director", "working")
        try:
            # Use iter() instead of run_stream(): run_stream() stops at the first text
            # part, so tool calls emitted after a short preamble (e.g. recommend_plan)
            # would never execute. iter() runs every tool call and we still stream
            # each model response's text. Type '1' carries the accumulated reply.
            async with agent_call("Director", "AI 伴学对话与学习路径规划") as invocation, chat_agent.iter(
                f"{course_context}\nUser query: {user_input}", deps=deps, message_history=previous_messages,
            ) as result:
                reply = ""
                async for node in result:
                    if not Agent.is_model_request_node(node):
                        continue
                    prefix = reply + ("\n\n" if reply else "")
                    segment = ""
                    async with node.stream(result.ctx) as stream:
                        async for text in stream.stream_text():
                            segment = text
                            yield f"1:{json.dumps(prefix + segment, ensure_ascii=False)}\n"
                    if segment.strip():
                        reply = prefix + segment
                invocation.usage(result.usage())
            asyncio.create_task(log_token_usage("Director", result.usage().total_tokens if result.usage() else 1500))
                    
            # Check if the recommend_plan tool was called by looking at deps.study_plan
            if deps.study_plan:
                yield f"0:\"Path planned. Rendering nodes...\"\n"
                node_items = [{"id": topic_id_map.get(n), "title": n} for n in deps.study_plan.nodes]
                yield f"9:{json.dumps({'nodes': deps.study_plan.nodes, 'node_items': node_items, 'description': deps.study_plan.description}, ensure_ascii=False)}\n"
                
                # Run Writer Agent to generate detailed docs since a plan was recommended
                try:
                    await set_agent_status("Writer", "working")
                    writer_ctx = await tracked_run('Writer', '生成学习路径讲义', writer_agent.run(f"Generate details for nodes {deps.study_plan.nodes}", deps=deps))
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
