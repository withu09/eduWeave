import asyncio
from dotenv import load_dotenv
load_dotenv()
from app.agents.chat import chat_agent
from app.agents.deps import AgentDeps

async def test_agent():
    print("Running stream...")
    try:
        deps = AgentDeps(chroma_client=None, student_profile=None)
        async with chat_agent.run_stream("Please search kb for 单链表", deps=deps) as result:
            async for chunk in result.stream():
                print(f"CHUNK: {chunk!r}")
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    import httpx
    asyncio.run(test_agent())
