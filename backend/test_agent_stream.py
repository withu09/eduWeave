import asyncio
import os
from dotenv import load_dotenv
from pydantic_ai import Agent
from app.agents.orchestrator import SparkCompatTransport
from pydantic_ai.models.openai import OpenAIModel

load_dotenv()

from pydantic_ai.providers.openai import OpenAIProvider

async def test_agent():
    spark_provider = OpenAIProvider(
        base_url="https://spark-api-open.xf-yun.com/v1",
        api_key=f"{os.environ.get('XUNFEI_SPARK_API_KEY')}:{os.environ.get('XUNFEI_SPARK_API_SECRET')}",
        http_client=httpx.AsyncClient(transport=SparkCompatTransport())
    )
    model = OpenAIModel(
        model_name="4.0Ultra",
        provider=spark_provider
    )
    
    agent = Agent(
        model=model,
        system_prompt="You are a helpful assistant. Use tools if needed.",
    )
    
    @agent.tool_plain
    def search_kb(query: str) -> str:
        print(f"TOOL CALLED: {query}")
        return "Found something about " + query
        
    print("Running stream...")
    try:
        async with agent.run_stream("Please search kb for 单链表") as result:
            async for chunk in result.stream():
                print(f"CHUNK: {chunk!r}")
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    import httpx
    asyncio.run(test_agent())
