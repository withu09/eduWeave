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


SEED_CALLS = [
    {
        "id": "call-seed-01",
        "agent": "CourseBuilder",
        "task": "从 Dify 资料构建知识星球：微观经济学（8章·46星球）",
        "status": "completed",
        "started_at": "2026-11-08T01:20:10+00:00",
        "finished_at": "2026-11-08T01:20:14+00:00",
        "duration_ms": 4120,
        "input_tokens": 3420,
        "output_tokens": 1280,
        "total_tokens": 4700,
        "model": "deepseek-v4.1-flash-1017",
    },
    {
        "id": "call-seed-02",
        "agent": "CourseBuilder",
        "task": "从 Dify 资料构建知识星球：马克思主义基本原理（5章·25星球）",
        "status": "completed",
        "started_at": "2026-11-08T01:21:02+00:00",
        "finished_at": "2026-11-08T01:21:05+00:00",
        "duration_ms": 3480,
        "input_tokens": 2890,
        "output_tokens": 960,
        "total_tokens": 3850,
        "model": "deepseek-v4.1-flash-1017",
    },
    {
        "id": "call-seed-03",
        "agent": "Profiler",
        "task": "分析学习对话并抽取薄弱节点：需求价格弹性与总收益（薄利多销判据）",
        "status": "completed",
        "started_at": "2026-11-08T01:25:12+00:00",
        "finished_at": "2026-11-08T01:25:13+00:00",
        "duration_ms": 860,
        "input_tokens": 620,
        "output_tokens": 195,
        "total_tokens": 815,
        "model": "deepseek-v4.1-flash-1017",
    },
    {
        "id": "call-seed-04",
        "agent": "Director",
        "task": "伴学路径规划与 Dify 教材溯源检索：市场均衡价格的形成与供求定理",
        "status": "completed",
        "started_at": "2026-11-08T01:25:14+00:00",
        "finished_at": "2026-11-08T01:25:16+00:00",
        "duration_ms": 1940,
        "input_tokens": 1540,
        "output_tokens": 580,
        "total_tokens": 2120,
        "model": "deepseek-v4.1-flash-1017",
    },
    {
        "id": "call-seed-05",
        "agent": "Writer",
        "task": "Dify 资料生成知识导图：需求价格弹性与总收益（薄利多销判据）",
        "status": "completed",
        "started_at": "2026-11-08T01:26:05+00:00",
        "finished_at": "2026-11-08T01:26:07+00:00",
        "duration_ms": 1680,
        "input_tokens": 1280,
        "output_tokens": 410,
        "total_tokens": 1690,
        "model": "deepseek-v4.1-flash-1017",
    },
    {
        "id": "call-seed-06",
        "agent": "Examiner",
        "task": "Dify 资料生成分层测验题：需求价格弹性与总收益（薄利多销判据）",
        "status": "completed",
        "started_at": "2026-11-08T01:26:18+00:00",
        "finished_at": "2026-11-08T01:26:20+00:00",
        "duration_ms": 2310,
        "input_tokens": 1490,
        "output_tokens": 670,
        "total_tokens": 2160,
        "model": "deepseek-v4.1-flash-1017",
    },
    {
        "id": "call-seed-07",
        "agent": "Practice",
        "task": "生成经济管理·案例与计算练习：微观经济学 / 第二章 / 需求价格弹性与总收益",
        "status": "completed",
        "started_at": "2026-11-08T01:27:01+00:00",
        "finished_at": "2026-11-08T01:27:03+00:00",
        "duration_ms": 2490,
        "input_tokens": 1620,
        "output_tokens": 740,
        "total_tokens": 2360,
        "model": "deepseek-v4.1-flash-1017",
    },
    {
        "id": "call-seed-08",
        "agent": "Presenter",
        "task": "Dify 资料生成微课讲解课件：矛盾的普遍性与特殊性（共性与个性）",
        "status": "completed",
        "started_at": "2026-11-08T01:28:11+00:00",
        "finished_at": "2026-11-08T01:28:14+00:00",
        "duration_ms": 2840,
        "input_tokens": 1750,
        "output_tokens": 890,
        "total_tokens": 2640,
        "model": "deepseek-v4.1-flash-1017",
    },
    {
        "id": "call-seed-09",
        "agent": "Inquirer",
        "task": "苏格拉底启发式追问：什么是需求价格弹性？为什么薄利多销不是对所有商品都有效？",
        "status": "completed",
        "started_at": "2026-11-08T01:29:04+00:00",
        "finished_at": "2026-11-08T01:29:05+00:00",
        "duration_ms": 1320,
        "input_tokens": 780,
        "output_tokens": 340,
        "total_tokens": 1120,
        "model": "deepseek-v4.1-flash-1017",
    },
]


async def recent_calls():
    if redis_client is None:
        return SEED_CALLS
    records = await redis_client.lrange("eduweave:console:calls", 0, 199)
    if not records:
        for item in reversed(SEED_CALLS):
            await redis_client.lpush("eduweave:console:calls", json.dumps(item, ensure_ascii=False))
        records = await redis_client.lrange("eduweave:console:calls", 0, 199)
    calls = {}
    for raw in records:
        record = json.loads(raw)
        calls.setdefault(record["id"], record)
    return list(calls.values())[:100]
