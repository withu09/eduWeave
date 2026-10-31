import asyncio
import httpx
from app.agents.orchestrator import SparkCompatTransport
import os
from dotenv import load_dotenv

load_dotenv()

async def test_stream():
    headers = {
        "Authorization": f"Bearer {os.environ.get('XUNFEI_SPARK_API_KEY')}",
        "Content-Type": "application/json"
    }
    client = httpx.AsyncClient(transport=SparkCompatTransport(), headers=headers)
    req = {
        "messages": [{"role": "user", "content": "单链表如何反转"}],
        "model": "4.0Ultra",
        "stream": True,
        "tools": [{"type": "function", "function": {"name": "search_knowledge_base", "description": "Search kb", "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}}]
    }
    
    async with client.stream("POST", "https://spark-api-open.xf-yun.com/v1/chat/completions", json=req) as response:
        async for chunk in response.aiter_bytes():
            print(chunk.decode("utf-8"), end="")

if __name__ == "__main__":
    asyncio.run(test_stream())
