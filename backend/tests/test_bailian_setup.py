"""Offline integration checks. Never contact a model service or spend quota."""
import json
import os
import unittest

os.environ.update(
    LLM_PROVIDER="bailian",
    DASHSCOPE_API_KEY="offline-test-key",
    DASHSCOPE_BASE_URL="https://offline.invalid/v1",
    DASHSCOPE_MODEL="deepseek-v4.1-flash-1017",
    DATABASE_URL="sqlite:///:memory:",
    SEED_DEMO_DATA="true",
    DIFY_API_KEY="",
)

import httpx
from openai import AsyncOpenAI
from app.agents.orchestrator import spark_model, orchestrator_agent, require_bailian_key
from app.agents.chat import chat_agent
from app.agents.deps import AgentDeps
from app.schemas.profile import StudentProfile
from app.db.database import init_db, SessionLocal
from app.db.models import Course, Node
from app.utils.dify_client import get_datasets


class BailianProtocolTests(unittest.IsolatedAsyncioTestCase):
    async def asyncTearDown(self):
        await spark_model.client.close()

    async def test_missing_key_never_sends_a_model_request(self):
        from unittest.mock import patch
        from app.core import settings
        def forbidden(request):
            self.fail("An unconfigured preview must not contact a model service")
        async with AsyncOpenAI(
            api_key="not-configured", base_url="https://offline.invalid/v1", max_retries=0,
            http_client=httpx.AsyncClient(
                transport=httpx.MockTransport(forbidden),
                event_hooks={"request": [require_bailian_key]},
            ),
        ) as client:
            with patch.object(settings, "DASHSCOPE_API_KEY", ""):
                with self.assertRaises(ValueError):
                    await client.chat.completions.create(model="deepseek-v4.1-flash-1017", messages=[{"role": "user", "content": "Hello"}])

    def use_transport(self, handler):
        spark_model.client = AsyncOpenAI(
            api_key="offline-test-key",
            base_url="https://offline.invalid/v1",
            http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )

    def check_request(self, request):
        self.assertEqual(request.url.path, "/v1/chat/completions")
        self.assertEqual(request.headers["authorization"], "Bearer offline-test-key")
        body = json.loads(request.content)
        self.assertEqual(body["model"], "deepseek-v4.1-flash-1017")
        self.assertIs(body["enable_thinking"], False)
        return body

    async def test_plain_chat_uses_bailian_protocol(self):
        def handler(request):
            self.check_request(request)
            return httpx.Response(200, json={
                "id": "offline-chat", "object": "chat.completion", "created": 1,
                "model": "deepseek-v4.1-flash-1017",
                "choices": [{"index": 0, "finish_reason": "stop", "message": {
                    "role": "assistant", "content": "Offline reply",
                }}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            })
        self.use_transport(handler)
        result = await chat_agent.run("Hello", deps=AgentDeps(chroma_client=None, student_profile=StudentProfile()))
        self.assertEqual(result.output, "Offline reply")

    async def test_structured_learning_plan_uses_tools(self):
        def handler(request):
            body = self.check_request(request)
            tool = next(t for t in body["tools"] if t["function"]["name"] == "final_result")
            self.assertIn("nodes", tool["function"]["parameters"]["properties"])
            return httpx.Response(200, json={
                "id": "offline-plan", "object": "chat.completion", "created": 1,
                "model": "deepseek-v4.1-flash-1017",
                "choices": [{"index": 0, "finish_reason": "tool_calls", "message": {
                    "role": "assistant", "content": None,
                    "tool_calls": [{"id": "call-plan", "type": "function", "function": {
                        "name": "final_result",
                        "arguments": json.dumps({"nodes": ["线性表与数组"], "description": "Start here"}),
                    }}],
                }}],
            })
        self.use_transport(handler)
        result = await orchestrator_agent.run("Plan a path")
        self.assertEqual(result.output.nodes, ["线性表与数组"])

    async def test_streamed_text(self):
        def handler(request):
            body = self.check_request(request)
            self.assertTrue(body["stream"])
            chunks = []
            for delta, finish in [({"role": "assistant", "content": "Hello "}, None), ({"content": "world"}, None), ({}, "stop")]:
                chunks.append("data: " + json.dumps({
                    "id": "offline-stream", "object": "chat.completion.chunk", "created": 1,
                    "model": "deepseek-v4.1-flash-1017",
                    "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
                }) + "\n\n")
            return httpx.Response(200, headers={"content-type": "text/event-stream"}, text="".join(chunks) + "data: [DONE]\n\n")
        self.use_transport(handler)
        async with chat_agent.run_stream("Hello", deps=AgentDeps(chroma_client=None, student_profile=StudentProfile())) as result:
            text = "".join([part async for part in result.stream_text(delta=True)])
        self.assertEqual(text, "Hello world")


class StartupTests(unittest.TestCase):
    def setUp(self):
        from unittest.mock import patch
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from app.db import database
        self.isolated_engine = create_engine("sqlite:///:memory:")
        self.sessions = sessionmaker(bind=self.isolated_engine)
        self.addCleanup(self.isolated_engine.dispose)
        for mocked in [patch.object(database, "engine", self.isolated_engine), patch.object(database, "SessionLocal", self.sessions), patch.dict(os.environ, {"SEED_DEMO_DATA": "true", "DIFY_API_KEY": ""})]:
            mocked.start()
            self.addCleanup(mocked.stop)

    def test_schema_and_demo_seed_are_idempotent(self):
        init_db()
        init_db()
        with self.sessions() as db:
            self.assertEqual(db.query(Course).count(), 1)
            self.assertEqual(db.query(Node).count(), 9)
            course = db.query(Course).first()
            course.title = "User edited course"
            db.commit()
        init_db()
        with self.sessions() as db:
            self.assertEqual(db.query(Course).first().title, "User edited course")

    def test_unconfigured_dify_does_not_request_network(self):
        from unittest.mock import patch
        with patch("app.utils.dify_client.requests.get", side_effect=AssertionError("Network forbidden")):
            self.assertEqual(get_datasets(), {})


if __name__ == "__main__":
    unittest.main()
