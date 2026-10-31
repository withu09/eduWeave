import json
import logging
from datetime import datetime
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
