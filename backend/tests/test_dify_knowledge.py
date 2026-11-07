"""Dify API and grounding tests. No cloud requests and no model quota."""
import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.models import Base, Course, Module, Node, Resource
from app.routers import kb
from app.utils import dify_client as dify, knowledge, telemetry


class DifyProtocolTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"DIFY_API_KEY": "offline-knowledge-key"})
        self.env.start()
        self.addCleanup(self.env.stop)

    def response(self, data):
        return SimpleNamespace(ok=True, status_code=200, json=lambda: data)

    def test_file_upload_uses_canonical_route_and_multipart_data(self):
        with patch.object(dify.requests, "request", return_value=self.response({"document": {"id": "doc-a"}, "batch": "batch-a"})) as http:
            result = dify.upload_document("dataset-a", b"pdf", "lecture.pdf")
        self.assertEqual(result["batch"], "batch-a")
        self.assertTrue(http.call_args.args[1].endswith("/datasets/dataset-a/document/create-by-file"))
        self.assertIn("file", http.call_args.kwargs["files"])
        self.assertEqual(json.loads(http.call_args.kwargs["data"]["data"])["process_rule"]["mode"], "automatic")
        self.assertIn("timeout", http.call_args.kwargs)

    def test_indexing_status_uses_batch_identifier(self):
        with patch.object(dify.requests, "request", return_value=self.response({"data": []})) as http:
            dify.get_document_embedding_status("dataset-a", "batch-a")
        self.assertTrue(http.call_args.args[1].endswith("/documents/batch-a/indexing-status"))

    def test_errors_are_explicit_and_do_not_echo_provider_secrets(self):
        response = SimpleNamespace(ok=False, status_code=401, text="private-key-must-not-leak")
        with patch.object(dify.requests, "request", return_value=response):
            with self.assertRaises(dify.DifyError) as error:
                dify.get_dataset_detail("dataset-a")
        self.assertNotIn("private-key", str(error.exception))
        self.assertIn("密钥", str(error.exception))


class GroundingTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine)
        self.addCleanup(self.engine.dispose)
        with self.sessions() as db:
            course = Course(id="course-a", title="经济学", dify_dataset_id="dataset-a")
            module = Module(id="module-a", title="需求", course=course)
            first = Node(id="node-a", title="价格弹性")
            second = Node(id="node-b", title="其他章节")
            first.resources.append(Resource(name="价格弹性.pdf", dify_document_id="doc-a", status="processing"))
            second.resources.append(Resource(name="其他章节.pdf", dify_document_id="doc-b", status="completed"))
            module.nodes.extend([first, second])
            db.add(course)
            db.commit()
        self.files = tempfile.TemporaryDirectory()
        self.addCleanup(self.files.cleanup)
        mocks = [
            patch.object(kb.kb_db, "SessionLocal", self.sessions),
            patch.object(dify, "configured", return_value=True),
            patch.object(telemetry, "publish_event", new_callable=AsyncMock),
            patch.object(kb, "UPLOAD_DIR", self.files.name),
            patch.object(dify, "get_segments", return_value={"data": []}),
        ]
        for mocked in mocks:
            mocked.start()
            self.addCleanup(mocked.stop)
        self.detail = patch.object(dify, "get_document_detail", return_value={"indexing_status": "completed", "enabled": True, "updated_at": 1, "segment_count": 1}).start()
        self.addCleanup(patch.stopall)
        self.retrieval = patch.object(dify, "retrieve_segments", return_value={"records": [
            {"segment": {"id": "foreign", "document": {"id": "doc-b"}, "content": "其他知识点内容"}},
            {"segment": {"id": "allowed", "document": {"id": "doc-a"}, "position": 1, "content": "需求价格弹性衡量需求量对价格变动的反应。"}, "score": 0.9},
        ]}).start()
        app = FastAPI()
        app.include_router(kb.router)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_retrieval_contains_only_documents_assigned_to_the_node(self):
        material = knowledge._retrieve_node("node-a")
        self.assertIn("需求价格弹性", material["context"])
        self.assertNotIn("其他知识点内容", material["context"])
        self.assertEqual([source["document_id"] for source in material["sources"]], ["doc-a"])
        self.assertIn("[资料1]", material["context"])

    def test_nonempty_wrong_chapter_retrieval_is_reranked_against_scoped_text(self):
        self.retrieval.return_value = {"records": [{"segment": {"id": "wrong", "document": {"id": "doc-a"}, "position": 20, "content": "寡头市场存在策略互动与纳什均衡。"}, "score": 0.8}]}
        with patch.object(dify, "get_segments", return_value={"data": [{"id": "right", "position": 1, "content": "需求价格弹性衡量需求量对价格变化的反应。"}]}):
            material = knowledge._retrieve_node("node-a")
        self.assertIn("需求价格弹性", material["context"])
        self.assertNotIn("纳什均衡", material["context"])

    def test_image_only_retrieval_cannot_generate_text_learning_content(self):
        self.retrieval.return_value = {"records": [{"segment": {"id": "scan", "document": {"id": "doc-a"}, "content": "![image](https://cloud.dify.ai/files/example/file-preview)"}}]}
        with self.assertRaises(knowledge.KnowledgeError) as error:
            knowledge._retrieve_node("node-a")
        self.assertIn("OCR", error.exception.detail)

    def test_empty_node_hits_use_only_that_nodes_dify_chunks(self):
        self.retrieval.return_value = {"records": [{"segment": {"document": {"id": "doc-b"}, "content": "错误章节"}}]}
        with patch.object(dify, "get_segments", return_value={"data": [{"id": "chunk-a", "position": 2, "content": "正确章节", "status": "completed"}]}) as chunks:
            material = knowledge._retrieve_node("node-a")
        chunks.assert_called_once_with("dataset-a", "doc-a", page=1, limit=100)
        self.assertIn("正确章节", material["context"])
        self.assertNotIn("错误章节", material["context"])

    def test_processing_documents_block_generation(self):
        self.detail.return_value = {"indexing_status": "parsing"}
        with self.assertRaises(knowledge.KnowledgeError) as error:
            knowledge._retrieve_node("node-a")
        self.assertEqual(error.exception.status_code, 409)
        self.retrieval.assert_not_called()

    def test_unconfigured_dify_does_not_fall_back_to_general_material(self):
        with patch.object(dify, "configured", return_value=False):
            with self.assertRaises(knowledge.KnowledgeError) as error:
                knowledge._retrieve_node("node-a")
        self.assertEqual(error.exception.status_code, 409)
        self.retrieval.assert_not_called()

    def test_binding_existing_knowledge_base_preserves_local_course_name(self):
        with self.sessions() as db:
            db.add(Course(id="local-course", title="西方经济学"))
            db.commit()
        with patch.object(dify, "get_dataset_detail", return_value={"id": "cloud-existing"}):
            response = self.client.post("/api/kb/courses/local-course/bind-dify", json={"dataset_id": "cloud-existing"})
        self.assertEqual(response.status_code, 200, response.text)
        kb.kb_db.sync_from_dify([{"id": "cloud-existing", "name": "织星"}])
        with self.sessions() as db:
            course = db.get(Course, "local-course")
            self.assertEqual(course.title, "西方经济学")
            self.assertEqual(course.dify_dataset_id, "cloud-existing")

    def test_binding_cannot_move_existing_remote_documents_to_a_different_dataset(self):
        with patch.object(dify, "get_dataset_detail", return_value={"id": "other-dataset"}):
            response = self.client.post("/api/kb/courses/course-a/bind-dify", json={"dataset_id": "other-dataset"})
        self.assertEqual(response.status_code, 409)

    def test_deleting_course_keeps_cloud_dataset_used_by_another_course(self):
        with self.sessions() as db:
            db.add(Course(id="shared-course", title="同一知识库的另一课程", dify_dataset_id="dataset-a"))
            db.commit()
        with patch.object(kb, "delete_dataset", side_effect=AssertionError("Shared knowledge base must stay")):
            response = self.client.delete("/api/kb/tree/course/shared-course")
        self.assertEqual(response.status_code, 200, response.text)
        with self.sessions() as db:
            self.assertIsNotNone(db.get(Course, "course-a"))

    def test_course_topics_are_not_restricted_to_computer_science(self):
        from app.schemas.profile import StudentProfile
        from app.agents.orchestrator import StudyPlan
        self.assertEqual(StudentProfile(weaknesses=["需求价格弹性"]).weaknesses, ["需求价格弹性"])
        self.assertEqual(StudyPlan(nodes=["需求价格弹性"], description="先学习定义").nodes, ["需求价格弹性"])

    def test_document_version_and_chunk_edits_change_cache_fingerprint(self):
        first = knowledge._retrieve_node("node-a")["source_version"]
        self.detail.return_value["updated_at"] = 2
        second = knowledge._retrieve_node("node-a")["source_version"]
        self.assertNotEqual(first, second)
        self.retrieval.return_value["records"][1]["segment"]["content"] = "修订后的教材正文"
        third = knowledge._retrieve_node("node-a")["source_version"]
        self.assertNotEqual(second, third)

    def test_resource_list_uses_real_processing_state(self):
        self.detail.return_value = {"indexing_status": "indexing"}
        response = self.client.get("/api/kb/resources/node-a")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["resources"][0]["status"], "processing")
        self.detail.return_value = {"indexing_status": "completed"}
        self.assertEqual(self.client.get("/api/kb/resources/node-a").json()["resources"][0]["status"], "completed")

    def test_upload_is_processing_until_dify_confirms_completion(self):
        with patch.object(kb, "upload_document", return_value={"document": {"id": "new-doc", "indexing_status": "waiting"}, "batch": "new-batch"}), \
                patch.object(kb, "sync_dify_segments", new_callable=AsyncMock) as sync:
            response = self.client.post("/api/kb/upload", data={"course_id": "course-a", "node_id": "node-a"}, files={"file": ("new.pdf", b"pdf")})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["resource"]["status"], "processing")
        sync.assert_called_once_with("dataset-a", "new-doc", "node-a", "new-batch")

    def test_local_archive_can_be_uploaded_to_dify_without_resending_from_browser(self):
        with self.sessions() as db:
            db.add(Resource(node_id="node-a", name="local.pdf", dify_document_id="local-existing", status="local"))
            db.commit()
        (Path(self.files.name) / "local-existing.pdf").write_bytes(b"saved-pdf")
        with patch.object(kb, "upload_document", return_value={"document": {"id": "uploaded-doc", "indexing_status": "completed"}}) as upload:
            response = self.client.post("/api/kb/resources/node-a/local-existing/push-dify")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(upload.call_args.args[1], b"saved-pdf")
        self.assertEqual(self.client.get("/api/kb/download/uploaded-doc").content, b"saved-pdf")

    def test_new_version_updates_the_same_cloud_document(self):
        with patch.object(dify, "update_document_by_file", return_value={"document": {"id": "doc-a", "indexing_status": "completed"}}) as update:
            response = self.client.post("/api/kb/upload", data={"course_id": "course-a", "node_id": "node-a", "replace_id": "doc-a"}, files={"file": ("revised.pdf", b"revised")})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(update.call_args.args[:2], ("dataset-a", "doc-a"))
        with self.sessions() as db:
            self.assertEqual(db.query(Resource).filter_by(node_id="node-a").count(), 1)

    def test_model_output_is_cached_by_actual_dify_source_version(self):
        from app.agents.examiner import examiner_agent, ExaminerOutput
        output = ExaminerOutput(questions=[{"question": "弹性", "options": ["A", "B"], "correct_answer": "A", "explanation": "资料1"}])
        result = SimpleNamespace(output=output, usage=lambda: None)
        path = Path(self.files.name) / "cache.json"
        with patch.object(kb, "content_cache_path", return_value=path), patch.object(examiner_agent, "run", new_callable=AsyncMock, return_value=result) as agent:
            first = asyncio.run(kb.get_kb_quiz("node-a"))
            asyncio.run(kb.get_kb_quiz("node-a"))
            self.assertEqual(agent.await_count, 1)
            self.assertIn("需求价格弹性", agent.call_args.kwargs["deps"].knowledge_context)
            self.detail.return_value["updated_at"] = 3
            second = asyncio.run(kb.get_kb_quiz("node-a"))
        self.assertEqual(agent.await_count, 2)
        self.assertNotEqual(first["source_version"], second["source_version"])
        self.assertEqual(second["sources"][0]["document_name"], "价格弹性.pdf")


if __name__ == "__main__":
    unittest.main()
