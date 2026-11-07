import json
import logging
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import redis.asyncio as redis
from app.core.config import settings

logger = logging.getLogger(__name__)

# Initialize a global Redis connection for Pub/Sub
try:
    redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
except Exception as e:
    logger.error(f"Failed to initialize Redis client for telemetry: {e}")
    redis_client = None

async def publish_event(event_type: str, data: dict):
    """
    Publish an agent telemetry event to Redis.
    
    event_type can be:
    - 'agent_status': { "name": "Orchestrator", "status": "working" | "idle", "role": "..." }
    - 'thought': { "agent": "Orchestrator", "text": "...", "t": "HH:MM:SS" }
    - 'token_usage': { "agent": "Orchestrator", "tokens": 1200 }
    """
    if not redis_client:
        return
        
    try:
        if "t" not in data and event_type == "thought":
            data["t"] = datetime.now().strftime("%H:%M:%S")
            
        payload = {
            "type": event_type,
            "data": data,
            "timestamp": datetime.now().isoformat()
        }
        if event_type == "call":
            await redis_client.lpush("eduweave:console:calls", json.dumps(data))
            await redis_client.ltrim("eduweave:console:calls", 0, 199)
        await redis_client.publish("agent_telemetry", json.dumps(payload))
    except Exception as e:
        logger.error(f"Error publishing telemetry event: {e}")

# Helper functions for common agent events
async def log_thought(agent_name: str, text: str):
    await publish_event("thought", {"agent": agent_name, "text": text})

async def set_agent_status(agent_name: str, status: str):
    await publish_event("agent_status", {"name": agent_name, "status": status})

async def log_token_usage(agent_name: str, tokens: int):
    await publish_event("token_usage", {"agent": agent_name, "tokens": tokens})

async def log_rag_metrics(latency: float, hit_rate: float):
    await publish_event("rag_metrics", {"latency": latency, "hitRate": hit_rate})


class AgentCall:
    def __init__(self, agent: str, task: str):
        self.started = time.perf_counter()
        self.record = {
            "id": str(uuid.uuid4()), "agent": agent, "task": task[:240], "status": "running",
            "started_at": datetime.now(timezone.utc).isoformat(), "duration_ms": None,
            "input_tokens": None, "output_tokens": None, "total_tokens": None,
            "model": settings.DASHSCOPE_MODEL if settings.LLM_PROVIDER.lower() in {"bailian", "dashscope", "aliyun"} else settings.XUNFEI_SPARK_MODEL,
        }

    def usage(self, usage):
        if usage is None:
            return
        self.record.update(
            input_tokens=getattr(usage, "request_tokens", getattr(usage, "input_tokens", None)),
            output_tokens=getattr(usage, "response_tokens", getattr(usage, "output_tokens", None)),
            total_tokens=getattr(usage, "total_tokens", None),
        )


@asynccontextmanager
async def agent_call(agent: str, task: str):
    call = AgentCall(agent, task)
    await publish_event("call", call.record)
    try:
        yield call
    except BaseException as error:
        call.record.update(status="cancelled" if type(error).__name__ == "CancelledError" else "error", error_type=type(error).__name__)
        raise
    else:
        call.record["status"] = "completed"
    finally:
        call.record.update(duration_ms=round((time.perf_counter() - call.started) * 1000), finished_at=datetime.now(timezone.utc).isoformat())
        await publish_event("call", call.record)


async def tracked_run(agent: str, task: str, awaitable):
    async with agent_call(agent, task) as call:
        result = await awaitable
        call.usage(result.usage() if hasattr(result, "usage") else None)
        return result


async def recent_calls():
    if redis_client is None:
        return []
    records = await redis_client.lrange("eduweave:console:calls", 0, 199)
    calls = {}
    for raw in records:
        record = json.loads(raw)
        calls.setdefault(record["id"], record)
    return list(calls.values())[:100]
