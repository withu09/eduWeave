import asyncio
import httpx

async def test_api():
    async with httpx.AsyncClient() as client:
        print("Testing Default Mode...")
        try:
            res = await client.post("http://127.0.0.1:8000/api/starmap/default", json={"query": "什么是二叉树"}, timeout=60.0)
            print(res.status_code)
            if res.status_code == 200:
                print(res.json().keys())
            else:
                print(res.text)
        except Exception as e:
            print("Failed default:", e)

if __name__ == "__main__":
    asyncio.run(test_api())
