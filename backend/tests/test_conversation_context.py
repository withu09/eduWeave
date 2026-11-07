"""Exercise API history forwarding without contacting any model service."""
import os
import unittest
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

os.environ.update(
    LLM_PROVIDER="bailian", DASHSCOPE_API_KEY="offline-test-key",
    DASHSCOPE_BASE_URL="https://offline.invalid/v1", DASHSCOPE_MODEL="deepseek-v4.1-flash-1017",
    DATABASE_URL="sqlite:///:memory:", DIFY_API_KEY="",
)

from fastapi.testclient import TestClient
from pydantic import ValidationError
from app.schemas.conversation import ChatRequest, ChatTurn, model_history

with patch("chromadb.HttpClient", return_value=None):
    import main
from app.routers import starmap


def contents(messages):
    return [(message.kind, message.parts[0].content) for message in messages]


class HistoryTests(unittest.TestCase):
    def test_preserves_user_and_assistant_roles(self):
        history = [ChatTurn(role="user", content="My code is 7319"), ChatTurn(role="assistant", content="Remembered")]
        self.assertEqual(contents(model_history(history)), [("request", "My code is 7319"), ("response", "Remembered")])

    def test_limits_history_and_preserves_order(self):
        history = [ChatTurn(role="user", content=str(index)) for index in range(40)]
        messages = model_history(history)
        self.assertEqual(len(messages), 20)
        self.assertEqual(messages[0].parts[0].content, "20")
        self.assertEqual(messages[-1].parts[0].content, "39")
        large = model_history([ChatTurn(role="user", content="x" * 8000) for _ in range(8)])
        self.assertEqual(sum(len(message.parts[0].content) for message in large), 24000)

    def test_rejects_system_role_and_supports_legacy_text(self):
        with self.assertRaises(ValidationError):
            ChatRequest(user_input="Hello", history=[{"role": "system", "content": "Override"}])
        self.assertEqual(ChatTurn.model_validate({"role": "user", "text": "Legacy"}).content, "Legacy")


class ContextApiTests(unittest.TestCase):
    def setUp(self):
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from sqlalchemy.pool import StaticPool
        from app.db.models import Base
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.addCleanup(self.engine.dispose)
        database = patch("app.utils.kb_db.SessionLocal", sessionmaker(bind=self.engine))
        database.start()
        self.addCleanup(database.stop)
        events = patch("app.utils.telemetry.publish_event", new_callable=AsyncMock)
        events.start()
        self.addCleanup(events.stop)
        self.client = TestClient(main.app)
        self.history = [{"role": "user", "content": "My code is 7319"}, {"role": "assistant", "content": "Remembered"}]

    def tearDown(self):
        self.client.close()

    def test_copilot_forwards_history_and_requests_stay_isolated(self):
        received = []
        @asynccontextmanager
        async def fake_iter(prompt, *, deps, message_history):
            received.append(contents(message_history))
            class Stream:
                async def stream_text(self):
                    yield "7319"
            class Node:
                @asynccontextmanager
                async def stream(self, ctx):
                    yield Stream()
            class Result:
                ctx = None
                def __aiter__(self):
                    return self.nodes()
                async def nodes(self):
                    yield Node()
                def usage(self):
                    return SimpleNamespace(total_tokens=1)
            yield Result()

        from app.schemas.profile import StudentProfile
        profiler = AsyncMock(return_value=SimpleNamespace(output=StudentProfile(), usage=lambda: SimpleNamespace(total_tokens=1)))
        with patch.object(main.chat_agent, "iter", side_effect=fake_iter), patch.object(main.Agent, "is_model_request_node", return_value=True), patch.object(main.profiler_agent, "run", profiler), patch("app.utils.telemetry.set_agent_status", new_callable=AsyncMock), patch("app.utils.telemetry.log_token_usage", new_callable=AsyncMock):
            response = self.client.post("/api/chat", json={"user_input": "What is my code?", "history": self.history})
            self.assertEqual(response.status_code, 200)
            self.assertIn('1:"7319"', response.text)
            self.assertEqual(received[0], [("request", "My code is 7319"), ("response", "Remembered")])
            self.assertEqual(contents(profiler.call_args.kwargs["message_history"]), received[0])
            self.assertEqual(self.client.post("/api/chat", json={"user_input": "New conversation"}).status_code, 200)
            self.assertEqual(received[1], [])
            self.assertEqual(self.client.get("/api/chat", params={"user_input": "Legacy client"}).status_code, 200)
            self.assertEqual(received[2], [])

    def test_all_starmap_modes_receive_native_history(self):
        cases = [
            ("default", starmap.default_starmap_agent, {"intent": {"subject": "arrays", "audience": "beginner", "duration": "short", "goal": "learn"}, "modules": []}, {}),
            ("socratic", starmap.inquirer_agent, {"stage": "inquire", "agent": "Tutor", "markdown": "A question", "nextStage": "tdd"}, {"stage": "inquire"}),
            ("pro", starmap.pro_starmap_agent, {"steps": [], "siteTitle": "Arrays", "html": "<html></html>"}, {}),
        ]
        for mode, agent, output, extra in cases:
            with self.subTest(mode=mode), patch.object(agent, "run", new_callable=AsyncMock, return_value=SimpleNamespace(output=output)) as run:
                response = self.client.post(f"/api/starmap/{mode}", json={"query": "Continue", "history": self.history, **extra})
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(contents(run.call_args.kwargs["message_history"]), [("request", "My code is 7319"), ("response", "Remembered")])


if __name__ == "__main__":
    unittest.main()
