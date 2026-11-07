"""Exercise local uploads with an isolated database and no external services."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.models import Base, Course, Module, Node
from app.routers import kb


class LocalUploadTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine)
        with self.sessions() as db:
            course = Course(id="course-a", title="Local course")
            module = Module(id="module-a", title="Chapter", course=course)
            module.nodes.append(Node(id="node-a", title="Topic"))
            other = Course(id="course-b", title="Other course")
            db.add_all([course, other])
            db.commit()
        self.files = tempfile.TemporaryDirectory()
        self.addCleanup(self.files.cleanup)
        self.addCleanup(self.engine.dispose)
        self.db_patch = patch.object(kb.kb_db, "SessionLocal", self.sessions)
        self.path_patch = patch.object(kb, "UPLOAD_DIR", self.files.name)
        self.env_patch = patch.dict(os.environ, {"DIFY_API_KEY": ""})
        for mocked in (self.db_patch, self.path_patch, self.env_patch):
            mocked.start()
            self.addCleanup(mocked.stop)
        app = FastAPI()
        app.include_router(kb.router)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def upload(self, *, course="course-a", node="node-a", content=b"%PDF-1.4\nlocal test"):
        return self.client.post(
            "/api/kb/upload", data={"course_id": course, "node_id": node},
            files={"file": ("lesson.pdf", content, "application/pdf")},
        )

    def test_local_course_upload_lists_and_downloads_original_file(self):
        with patch.object(kb, "upload_document", side_effect=AssertionError("No remote upload")):
            response = self.upload()
        self.assertEqual(response.status_code, 200, response.text)
        resource = response.json()["resource"]
        self.assertTrue(resource["id"].startswith("local-"))
        listed = self.client.get("/api/kb/resources/node-a").json()["resources"]
        self.assertEqual([item["id"] for item in listed], [resource["id"]])
        downloaded = self.client.get(f'/api/kb/download/{resource["id"]}')
        self.assertEqual(downloaded.status_code, 200)
        self.assertEqual(downloaded.content, b"%PDF-1.4\nlocal test")
        self.assertIn("application/pdf", downloaded.headers["content-type"])

    def test_same_filename_uploads_do_not_overwrite_each_other(self):
        first = self.upload(content=b"first").json()["resource"]["id"]
        second = self.upload(content=b"second").json()["resource"]["id"]
        self.assertNotEqual(first, second)
        self.assertEqual(self.client.get(f"/api/kb/download/{first}").content, b"first")
        self.assertEqual(self.client.get(f"/api/kb/download/{second}").content, b"second")

    def test_rejects_missing_or_mismatched_targets_before_saving_files(self):
        for course, node in [("missing", "node-a"), ("course-a", "missing"), ("course-b", "node-a")]:
            with self.subTest(course=course, node=node):
                response = self.upload(course=course, node=node)
                self.assertEqual(response.status_code, 404, response.text)
        self.assertEqual(list(Path(self.files.name).iterdir()), [])

    def test_empty_remote_result_reports_failure_without_fake_completion(self):
        with self.sessions() as db:
            db.get(Course, "course-a").dify_dataset_id = "remote-dataset"
            db.commit()
        with patch.dict(os.environ, {"DIFY_API_KEY": "offline-test-key"}), \
                patch.object(kb, "upload_document", return_value={}), \
                patch.object(kb, "sync_dify_segments") as sync:
            response = self.upload()
        self.assertEqual(response.status_code, 502, response.text)
        sync.assert_not_called()

    def test_configured_remote_upload_keeps_remote_id_and_starts_sync(self):
        with self.sessions() as db:
            db.get(Course, "course-a").dify_dataset_id = "remote-dataset"
            db.commit()
        with patch.dict(os.environ, {"DIFY_API_KEY": "offline-test-key"}), \
                patch.object(kb, "upload_document", return_value={"document": {"id": "remote-document"}}), \
                patch.object(kb, "sync_dify_segments", new_callable=AsyncMock) as sync:
            response = self.upload()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["resource"]["id"], "remote-document")
        sync.assert_called_once_with("remote-dataset", "remote-document", "node-a", None)
        self.assertEqual(self.client.get("/api/kb/download/remote-document").content, b"%PDF-1.4\nlocal test")

    def test_deleting_local_resource_never_calls_remote_delete(self):
        resource_id = self.upload().json()["resource"]["id"]
        with self.sessions() as db:
            db.get(Course, "course-a").dify_dataset_id = "remote-dataset"
            db.commit()
        with patch.dict(os.environ, {"DIFY_API_KEY": "offline-test-key"}), \
                patch.object(kb, "delete_document", side_effect=AssertionError("No remote delete")):
            response = self.client.delete(f"/api/kb/resources/course-a/node-a/{resource_id}")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.client.get("/api/kb/resources/node-a").json()["resources"], [])


if __name__ == "__main__":
    unittest.main()
