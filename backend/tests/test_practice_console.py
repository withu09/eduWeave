import unittest
import asyncio
import json
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.models import Base, Course, Module, Node
from app.routers import practice, kb
from app.utils import telemetry


class PracticeTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine)
        self.addCleanup(self.engine.dispose)
        with self.sessions() as db:
            course = Course(title="西方经济学")
            course.modules.append(Module(title="市场", nodes=[Node(id="econ-topic", title="1")]))
            db.add(course)
            db.commit()
        material = {"title": "西方经济学 / 市场 / 1", "context": "[资料1] 教材：收入改变会引起需求变化。", "sources": [{"document_name": "讲义.pdf"}], "source_version": "test-source-v1"}
        for mocked in [patch.object(practice, "SessionLocal", self.sessions), patch.object(telemetry, "publish_event", new_callable=AsyncMock), patch.object(practice, "node_materials", new_callable=AsyncMock, return_value=material), patch.object(kb, "node_materials", new_callable=AsyncMock, return_value=material)]:
            mocked.start()
            self.addCleanup(mocked.stop)
        app = FastAPI()
        app.include_router(practice.router)
        self.client = TestClient(app, headers={"X-Learner-ID": "learner-alpha"})
        self.addCleanup(self.client.close)

    def generate(self):
        output = practice.Exercise(title="需求分析", scenario="教学设例", task="分析需求变化", hints=["区分曲线移动"], criteria=["区分价格与其他因素"], reference_answer="价格改变需求量")
        result = SimpleNamespace(output=output, usage=lambda: SimpleNamespace(request_tokens=10, response_tokens=20, total_tokens=30))
        with patch.object(practice.practice_agent, "run", new_callable=AsyncMock, return_value=result) as run:
            response = self.client.post("/api/practice/nodes/econ-topic", json={"subject": "economics"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("西方经济学", run.call_args.args[0])
        return response.json()

    def test_subject_is_inferred_from_course_and_full_context(self):
        response = self.client.get("/api/practice/nodes/econ-topic")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["subject"], "economics")
        self.assertIn("西方经济学", response.json()["context"])
        self.assertIsNone(response.json()["record"])

    def test_non_programming_exercise_is_saved_and_resumes(self):
        record = self.generate()
        self.assertNotIn("code", record["exercise"])
        saved = self.client.get("/api/practice/nodes/econ-topic").json()["record"]
        self.assertEqual(saved["id"], record["id"])
        self.assertEqual(saved["exercise"]["title"], "需求分析")

    def test_feedback_and_answer_are_persisted_and_owned_by_learner(self):
        record = self.generate()
        result = SimpleNamespace(output="区分需求与需求量后再分析。", usage=lambda: None)
        with patch.object(practice.feedback_agent, "run", new_callable=AsyncMock, return_value=result):
            response = self.client.post(f'/api/practice/{record["id"]}/feedback', json={"answer": "价格提高，需求量下降。"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["student_answer"], "价格提高，需求量下降。")
        saved = self.client.get("/api/practice/nodes/econ-topic").json()["record"]
        self.assertEqual(saved["feedback"], "区分需求与需求量后再分析。")
        denied = self.client.post(f'/api/practice/{record["id"]}/feedback', headers={"X-Learner-ID": "learner-beta"}, json={"answer": "不能读取他人的练习"})
        self.assertEqual(denied.status_code, 404)

    def test_invalid_subject_is_rejected(self):
        self.assertEqual(self.client.post("/api/practice/nodes/econ-topic", json={"subject": "unknown"}).status_code, 422)

    def test_programming_selection_keeps_the_existing_code_exercise(self):
        task = {"title": "Python", "description": "练习", "language": "python", "boilerplate": "print(1)", "solution": "print(1)"}
        with patch.object(kb, "get_kb_code", new_callable=AsyncMock, return_value={"task": task}):
            response = self.client.post("/api/practice/nodes/econ-topic", json={"subject": "programming"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["exercise"]["code"], task)

    def test_numbered_node_discards_unscoped_quiz_cache_and_uses_course_topic(self):
        from app.agents.examiner import examiner_agent, ExaminerOutput
        output = ExaminerOutput(questions=[{"question": "需求变化", "options": ["价格", "收入"], "correct_answer": "收入", "explanation": "教学解析"}])
        result = SimpleNamespace(output=output, usage=lambda: None)
        with tempfile.TemporaryDirectory() as folder:
            resources = Path(folder) / "resources"
            resources.mkdir()
            cache = resources / "generated_dify.json"
            cache.write_text(json.dumps({"econ-topic": {"questions": [{"question": "旧的数字题"}], "last_updated": "2099-01-01"}}))
            with patch.object(kb, "__file__", str(Path(folder) / "routers" / "kb.py")), \
                    patch.object(kb.kb_db, "SessionLocal", self.sessions), \
                    patch.object(kb.kb_db, "get_resources", return_value=[{"id": "local-lesson"}]), \
                    patch("chromadb.HttpClient", return_value=None), \
                    patch.object(examiner_agent, "run", new_callable=AsyncMock, return_value=result) as run:
                response = asyncio.run(kb.get_kb_quiz("econ-topic"))
            self.assertEqual(response["questions"][0]["question"], "需求变化")
            self.assertIn("西方经济学", run.call_args.kwargs["deps"].node_title)
            self.assertEqual(json.loads(cache.read_text())["econ-topic"]["source_version"], "test-source-v1")
            self.assertIn("教材", run.call_args.kwargs["deps"].knowledge_context)


class CallTrackingTests(unittest.IsolatedAsyncioTestCase):
    async def test_success_records_actual_duration_and_usage(self):
        events = []
        async def emit(kind, record):
            events.append((kind, dict(record)))
        async def invoke():
            return SimpleNamespace(usage=lambda: SimpleNamespace(request_tokens=7, response_tokens=9, total_tokens=16))
        with patch.object(telemetry, "publish_event", side_effect=emit):
            await telemetry.tracked_run("Practice", "真实案例练习", invoke())
        self.assertEqual([event[1]["status"] for event in events], ["running", "completed"])
        self.assertEqual(events[-1][1]["total_tokens"], 16)
        self.assertEqual(events[-1][1]["input_tokens"], 7)
        self.assertEqual(events[-1][1]["output_tokens"], 9)
        self.assertIsNotNone(events[-1][1]["duration_ms"])

    async def test_failure_is_recorded_without_exposing_exception_credentials(self):
        events = []
        async def emit(kind, record):
            events.append(dict(record))
        async def fail():
            raise RuntimeError("private-credential-must-not-appear")
        with patch.object(telemetry, "publish_event", side_effect=emit):
            with self.assertRaises(RuntimeError):
                await telemetry.tracked_run("Examiner", "生成测验", fail())
        self.assertEqual(events[-1]["status"], "error")
        self.assertEqual(events[-1]["error_type"], "RuntimeError")
        self.assertNotIn("private-credential", str(events))
        self.assertIsNone(events[-1]["total_tokens"])

    async def test_history_uses_latest_record_for_each_real_call(self):
        client = SimpleNamespace(lrange=AsyncMock(return_value=[
            '{"id":"one","status":"completed"}', '{"id":"two","status":"error"}', '{"id":"one","status":"running"}',
        ]))
        with patch.object(telemetry, "redis_client", client):
            records = await telemetry.recent_calls()
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]["status"], "completed")


if __name__ == "__main__":
    unittest.main()
