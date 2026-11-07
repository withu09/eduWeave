"""Course construction integration tests against an isolated database and fake Dify."""
import asyncio
import copy
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.agents.course_builder import CourseOutline, course_builder_agent
from app.db.models import Base, Course, Module, Node, Resource, CourseBuild, GeneratedResource, LearningQuiz, LearningAnswer
from app.routers import kb, course_build
from app.utils import kb_db, dify_client as dify, telemetry
from app.utils import course_builder as builder


class CourseBuilderTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)
        self.sessions = sessionmaker(bind=engine)
        self.addCleanup(engine.dispose)
        with self.sessions() as db:
            course = Course(id="course-a", title="经济学", dify_dataset_id="dataset-a")
            chapter = Module(id="chapter-a", title="需求理论", course=course)
            node = Node(id="original-node", title="需求价格弹性", module=chapter)
            node.resources.append(Resource(id="manual-link", name="手工资料.md", dify_document_id="manual-doc", status="completed"))
            db.add_all([course, LearningQuiz(id="quiz-a", node_id=node.id, learner_id="learner-a", questions="[]"), LearningAnswer(learner_id="learner-a", node_id=node.id, quiz_id="quiz-a", question_index=0, selected_answer="A", correct=True)])
            db.commit()
        self.files = tempfile.TemporaryDirectory()
        self.addCleanup(self.files.cleanup)
        self.documents = [{"id": "doc-a", "name": "经济学教材.md", "indexing_status": "completed", "updated_at": 1}]
        self.segments = [{"id": "segment-a", "position": 1, "content": "需求价格弹性衡量需求量对价格变化的反应。供给弹性是另一概念。", "enabled": True, "status": "completed"}]
        self.output = {"modules": [{"title": "需求理论", "topics": [
            {"key": "demand", "title": "需求价格弹性", "document_ids": ["doc-a"], "prerequisites": []},
            {"key": "supply", "title": "供给弹性", "document_ids": ["doc-a"], "prerequisites": ["demand"]},
        ]}]}
        mocks = [patch.object(kb_db, "SessionLocal", self.sessions),
                 patch.object(dify, "configured", return_value=True),
                 patch.object(dify, "get_documents", side_effect=lambda *a, **k: {"data": copy.deepcopy(self.documents), "has_more": False}),
                 patch.object(dify, "get_segments", side_effect=lambda *a, **k: {"data": copy.deepcopy(self.segments), "has_more": False}),
                 patch.object(telemetry, "publish_event", new_callable=AsyncMock),
                 patch.object(kb, "UPLOAD_DIR", self.files.name)]
        for mocked in mocks:
            mocked.start()
            self.addCleanup(mocked.stop)
        self.model = patch.object(course_builder_agent, "run", new_callable=AsyncMock).start()
        self.addCleanup(patch.stopall)
        self.model.side_effect = lambda *a, **k: SimpleNamespace(output=CourseOutline.model_validate(self.output))
        builder.configure_build("course-a")

    def run_build(self):
        asyncio.run(builder.run_course_build("course-a"))

    def test_build_creates_planets_links_sources_and_preserves_learning_records(self):
        self.run_build()
        state = builder.build_status("course-a")
        self.assertEqual(state["status"], "completed")
        self.assertEqual(state["summary"]["new_nodes"], 1)
        with self.sessions() as db:
            self.assertEqual(db.query(Node).count(), 2)
            self.assertEqual(db.query(LearningAnswer).one().node_id, "original-node")
            self.assertEqual(db.query(GeneratedResource).count(), 2)
            self.assertIsNotNone(db.get(Resource, "manual-link"))
            supply = db.query(Node).filter_by(title="供给弹性").one()
            self.assertEqual(supply.deps, '["original-node"]')
            self.assertEqual(db.query(Resource).filter_by(node_id=supply.id).one().dify_document_id, "doc-a")
        self.assertIn("需求价格弹性", self.model.call_args.args[0])
        nodes = kb_db.get_starmap_nodes("course-a")
        self.assertEqual(next(node for node in nodes if node["title"] == "供给弹性")["deps"], ["chapter-a", "original-node"])

    def test_unchanged_sources_do_not_call_the_model_again_or_duplicate_nodes(self):
        self.run_build()
        with self.sessions() as db:
            before = sorted(node.id for node in db.query(Node).all())
        self.run_build()
        self.assertEqual(self.model.call_count, 1)
        builder.configure_build("course-a", retry=True)
        self.run_build()
        with self.sessions() as db:
            self.assertEqual(before, sorted(node.id for node in db.query(Node).all()))
            self.assertEqual(db.query(Resource).count(), 3)

    def test_editing_chunk_content_without_timestamp_change_triggers_rebuild(self):
        self.run_build()
        version = builder.build_status("course-a")["source_version"]
        self.segments[0]["content"] += "均衡价格由供求共同决定。"
        self.output["modules"][0]["topics"].append({"key": "equilibrium", "title": "均衡价格", "document_ids": ["doc-a"], "prerequisites": ["supply"]})
        self.run_build()
        self.assertEqual(self.model.call_count, 2)
        self.assertNotEqual(version, builder.build_status("course-a")["source_version"])
        with self.sessions() as db:
            self.assertEqual(db.query(Node).count(), 3)
            self.assertEqual(db.query(LearningAnswer).count(), 1)

    def test_processing_file_waits_without_model_call(self):
        self.documents[0]["indexing_status"] = "parsing"
        self.run_build()
        self.assertEqual(builder.build_status("course-a")["status"], "indexing")
        self.model.assert_not_called()

    def test_image_only_scanned_pdf_is_blocked_before_model_call(self):
        self.segments[0]["content"] = "![image](https://cloud.dify.ai/files/example/file-preview)"
        self.run_build()
        self.assertEqual(builder.build_status("course-a")["status"], "error")
        self.assertIn("OCR", builder.build_status("course-a")["error"])
        self.model.assert_not_called()
        with self.sessions() as db:
            self.assertEqual(db.query(Node).count(), 1)

    def test_parse_failure_is_reported_without_creating_fake_nodes(self):
        self.documents[0]["indexing_status"] = "error"
        self.run_build()
        self.assertEqual(builder.build_status("course-a")["status"], "error")
        self.model.assert_not_called()
        with self.sessions() as db:
            self.assertEqual(db.query(Node).count(), 1)

    def test_model_failure_requires_retry_and_does_not_loop_charge(self):
        self.model.side_effect = RuntimeError("private-provider-response")
        self.run_build()
        self.run_build()
        self.assertEqual(self.model.call_count, 1)
        self.assertNotIn("private-provider-response", builder.build_status("course-a")["error"])
        builder.configure_build("course-a", retry=True)
        self.model.side_effect = lambda *a, **k: SimpleNamespace(output=CourseOutline.model_validate(self.output))
        self.run_build()
        self.assertEqual(builder.build_status("course-a")["status"], "completed")

    def test_restart_recovers_persisted_interrupted_build(self):
        material = builder.read_material("dataset-a", self.documents)
        builder._state("course-a", status="building", attempt_version=material["source_version"])
        self.run_build()
        self.assertEqual(builder.build_status("course-a")["status"], "completed")
        self.model.assert_called_once()

    def test_source_replacement_during_generation_discards_stale_result(self):
        async def replace_source(*args, **kwargs):
            self.segments[0]["content"] = "不同版本的教材"
            return SimpleNamespace(output=CourseOutline.model_validate(self.output))
        self.model.side_effect = replace_source
        self.run_build()
        self.assertEqual(builder.build_status("course-a")["status"], "queued")
        with self.sessions() as db:
            self.assertEqual(db.query(Node).count(), 1)

    def test_pausing_while_generating_prevents_application(self):
        async def pause(*args, **kwargs):
            builder.configure_build("course-a", enabled=False)
            return SimpleNamespace(output=CourseOutline.model_validate(self.output))
        self.model.side_effect = pause
        self.run_build()
        self.assertFalse(builder.build_status("course-a")["enabled"])
        self.assertEqual(builder.build_status("course-a")["status"], "idle")
        with self.sessions() as db:
            self.assertEqual(db.query(Node).count(), 1)

    def test_deleted_cloud_documents_remove_only_generated_links(self):
        self.run_build()
        self.documents = []
        self.run_build()
        with self.sessions() as db:
            self.assertEqual(db.query(GeneratedResource).count(), 0)
            self.assertEqual(db.query(Resource).count(), 1)
            self.assertEqual(db.query(Node).count(), 2)
            self.assertEqual(db.query(LearningAnswer).count(), 1)
        self.assertEqual(builder.build_status("course-a")["status"], "waiting")

    def test_invalid_sources_and_circular_dependencies_are_atomic(self):
        for change in ("foreign", "cycle", "number"):
            output = copy.deepcopy(self.output)
            if change == "foreign":
                output["modules"][0]["topics"][0]["document_ids"] = ["unrelated-document"]
            elif change == "cycle":
                output["modules"][0]["topics"][0]["prerequisites"] = ["supply"]
            else:
                output["modules"][0]["topics"][0]["title"] = "1"
            material = builder.read_material("dataset-a", self.documents)
            with self.assertRaises(ValueError):
                builder.apply_outline("course-a", "dataset-a", CourseOutline.model_validate(output), self.documents, material)
            with self.sessions() as db:
                self.assertEqual(db.query(Node).count(), 1)

    def test_reading_all_segment_pages_and_fingerprint_is_order_independent(self):
        pages = {1: {"data": [self.segments[0]], "has_more": True}, 2: {"data": [{"id": "segment-b", "position": 2, "content": "第二页教材"}], "has_more": False}}
        with patch.object(dify, "get_segments", side_effect=lambda *a, **k: pages[k["page"]]) as requests:
            material = builder.read_material("dataset-a", self.documents)
        self.assertEqual(material["segment_count"], 2)
        self.assertIn("第二页教材", material["context"])
        self.assertEqual(requests.call_count, 2)

    def test_concurrent_requests_make_only_one_model_call(self):
        async def scenario():
            entered = asyncio.Event()
            release = asyncio.Event()
            async def model(*args, **kwargs):
                entered.set()
                await release.wait()
                return SimpleNamespace(output=CourseOutline.model_validate(self.output))
            self.model.side_effect = model
            first = asyncio.create_task(builder.run_course_build("course-a"))
            await entered.wait()
            await builder.run_course_build("course-a")
            release.set()
            await first
        asyncio.run(scenario())
        self.model.assert_called_once()

    def test_course_level_upload_needs_no_existing_modules_or_nodes(self):
        app = FastAPI()
        app.include_router(course_build.router)
        with self.sessions() as db:
            db.add(Course(id="empty-course", title="新课程", dify_dataset_id="dataset-b"))
            db.commit()
        with TestClient(app) as client, patch.object(course_build, "start_build") as started, patch.object(dify, "upload_document", return_value={"document": {"id": "new-doc", "indexing_status": "parsing"}}):
            response = client.post("/api/kb/courses/empty-course/materials", files={"file": ("教材.md", "新的教材资料".encode(), "text/markdown")})
        self.assertEqual(response.status_code, 200, response.text)
        started.assert_called_once_with("empty-course")
        self.assertEqual(builder.build_status("empty-course")["documents"][0]["name"], "教材.md")
        self.assertTrue(builder.build_status("empty-course")["enabled"])

    def test_shared_document_unlink_does_not_delete_cloud_source(self):
        self.run_build()
        app = FastAPI()
        app.include_router(kb.router)
        with TestClient(app) as client, patch.object(dify, "delete_document") as delete:
            response = client.delete("/api/kb/resources/course-a/original-node/doc-a")
        self.assertEqual(response.status_code, 200, response.text)
        delete.assert_not_called()
        with self.sessions() as db:
            self.assertEqual(db.query(Resource).filter_by(dify_document_id="doc-a").count(), 1)


if __name__ == "__main__":
    unittest.main()
