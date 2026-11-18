"""Community integration checks use an isolated database, never deployed data."""
import hashlib
import io
import tempfile
import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.db.database import get_db
from app.db.models import Base, CommunityMember, CommunityPost, CommunityComment, CommunityReaction, CommunityImage
from app.routers.community import router, MAX_IMAGE_BYTES


class CommunityTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.url = "sqlite:///" + directory.name.replace("\\", "/") + "/community.db"
        self.engine = create_engine(self.url, connect_args={"check_same_thread": False})
        event.listen(self.engine, "connect", lambda connection, record: connection.execute("PRAGMA foreign_keys=ON"))
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine, autoflush=False)
        app = FastAPI()
        app.include_router(router)

        def database():
            with self.sessions() as db:
                yield db

        app.dependency_overrides[get_db] = database
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.alpha = self.identity("学习者甲")
        self.beta = self.identity("学习者乙")

    def identity(self, name):
        response = self.client.post("/api/community/session")
        self.assertEqual(response.status_code, 200, response.text)
        headers = {"X-Community-Token": response.json()["token"]}
        response = self.client.patch("/api/community/me", headers=headers, json={"nickname": name})
        self.assertEqual(response.status_code, 200, response.text)
        return headers

    def post(self, text="#学习心得\n\n公式 $E = mc^2$", headers=None, images=None):
        response = self.client.post("/api/community/posts", headers=headers or self.alpha, json={"markdown": text, "images": images or []})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def detail(self, post, headers=None):
        response = self.client.get("/api/community/posts/" + post["id"], headers=headers or self.alpha)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def comment(self, post, text="我也有这个疑问", parent=None, headers=None):
        response = self.client.post(f'/api/community/posts/{post["id"]}/comments', headers=headers or self.beta, json={"markdown": text, "parent_id": parent})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def image(self, headers=None):
        content = io.BytesIO()
        Image.new("RGB", (32, 24), "blue").save(content, "PNG")
        response = self.client.post("/api/community/images", headers=headers or self.alpha, files={"file": ("photo.png", content.getvalue(), "image/png")})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["url"]

    def test_shared_feed_persists_and_has_no_fabricated_seed(self):
        self.assertEqual(self.client.get("/api/community/posts").json()["total"], 0)
        post = self.post()
        viewed = self.detail(post, self.beta)
        self.assertEqual(viewed["markdown"], post["markdown"])
        self.assertFalse(viewed["is_owner"])
        self.assertEqual(viewed["likes"], 0)
        self.assertEqual(viewed["comments"], 0)
        # A fresh engine can read the committed content after a process restart.
        other = create_engine(self.url)
        try:
            with sessionmaker(bind=other)() as db:
                self.assertEqual(db.get(CommunityPost, post["id"]).markdown, post["markdown"])
        finally:
            other.dispose()

    def test_identity_is_random_and_only_hashed_on_server(self):
        token = self.alpha["X-Community-Token"]
        with self.sessions() as db:
            self.assertIsNotNone(db.query(CommunityMember).filter_by(token_hash=hashlib.sha256(token.encode()).hexdigest()).first())
            self.assertIsNone(db.query(CommunityMember).filter_by(token_hash=token).first())
        resumed = self.client.post("/api/community/session", headers=self.alpha)
        self.assertEqual(resumed.json()["member"]["nickname"], "学习者甲")
        self.assertNotIn("token", resumed.json())
        self.assertEqual(resumed.headers["cache-control"], "no-store")
        self.assertEqual(self.client.post("/api/community/posts", json={"markdown": "unauthorized"}).status_code, 401)
        self.assertEqual(self.client.post("/api/community/session", headers={"X-Community-Token": "forged"}).status_code, 401)

    def test_other_user_cannot_edit_or_delete_posts_or_comments(self):
        post = self.post()
        path = "/api/community/posts/" + post["id"]
        self.assertEqual(self.client.patch(path, headers=self.beta, json={"markdown": "篡改"}).status_code, 403)
        self.assertEqual(self.client.delete(path, headers=self.beta).status_code, 403)
        comment = self.comment(post)
        self.assertEqual(self.client.delete("/api/community/comments/" + comment["id"], headers=self.alpha).status_code, 403)
        self.assertEqual(self.detail(post)["markdown"], post["markdown"])

    def test_likes_and_bookmarks_are_idempotent_and_personalized(self):
        post = self.post()
        for kind in ("like", "bookmark"):
            path = f'/api/community/posts/{post["id"]}/{kind}'
            for _ in range(2):
                self.assertEqual(self.client.put(path, headers=self.beta, json={"active": True}).status_code, 200)
        mine = self.detail(post, self.beta)
        self.assertEqual((mine["likes"], mine["bookmarks"]), (1, 1))
        self.assertTrue(mine["liked"] and mine["bookmarked"])
        self.assertFalse(self.detail(post)["liked"])
        bookmarked = self.client.get("/api/community/posts?scope=bookmarks", headers=self.beta).json()
        self.assertEqual(bookmarked["total"], 1)
        self.assertEqual(self.client.get("/api/community/posts?scope=bookmarks", headers=self.alpha).json()["total"], 0)
        for _ in range(2):
            self.client.put(f'/api/community/posts/{post["id"]}/like', headers=self.beta, json={"active": False})
        self.assertEqual(self.detail(post)["likes"], 0)

    def test_reply_stays_visible_when_parent_is_deleted(self):
        post = self.post()
        parent = self.comment(post)
        child = self.comment(post, "这是解答", parent["id"], self.alpha)
        self.assertEqual(self.detail(post)["comments"], 2)
        self.assertEqual(self.client.delete("/api/community/comments/" + parent["id"], headers=self.beta).status_code, 204)
        comments = self.client.get(f'/api/community/posts/{post["id"]}/comments').json()["items"]
        self.assertTrue(comments[0]["deleted"])
        self.assertEqual(comments[0]["markdown"], "")
        self.assertEqual(comments[1]["parent_id"], parent["id"])
        self.assertEqual(comments[1]["id"], child["id"])
        self.assertEqual(self.detail(post)["comments"], 1)

    def test_reply_cannot_target_other_post_or_deleted_comment(self):
        first, second = self.post("第一条"), self.post("第二条")
        parent = self.comment(first)
        payload = {"markdown": "跨帖回复", "parent_id": parent["id"]}
        self.assertEqual(self.client.post(f'/api/community/posts/{second["id"]}/comments', headers=self.beta, json=payload).status_code, 422)
        self.client.delete("/api/community/comments/" + parent["id"], headers=self.beta)
        self.assertEqual(self.client.post(f'/api/community/posts/{first["id"]}/comments', headers=self.beta, json=payload).status_code, 422)

    def test_edit_updates_search_tags_and_author_name(self):
        post = self.post()
        path = "/api/community/posts/" + post["id"]
        self.assertEqual(self.client.patch(path, headers=self.alpha, json={"markdown": "#经济学\n\n需求弹性分析"}).status_code, 200)
        self.client.patch("/api/community/me", headers=self.alpha, json={"nickname": "经济学同学"})
        self.assertEqual(self.client.get("/api/community/posts?q=需求弹性").json()["total"], 1)
        self.assertEqual(self.client.get("/api/community/posts?q=经济学同学").json()["total"], 1)
        self.assertEqual(self.client.get("/api/community/posts?tag=学习心得").json()["total"], 0)
        self.assertEqual(self.client.get("/api/community/posts?tag=经济学").json()["total"], 1)
        self.assertEqual(self.client.get("/api/community/tags").json()["items"], [{"tag": "经济学", "count": 1}])

    def test_search_literals_exact_tags_and_pagination(self):
        self.post("#树\n\n完成 100% 的学习")
        self.post("#二叉树\n\n二叉树的遍历")
        self.post("#树\n\n普通学习心得", headers=self.beta)
        self.assertEqual(self.client.get("/api/community/posts", params={"q": "%"}).json()["total"], 1)
        self.assertEqual(self.client.get("/api/community/posts", params={"tag": "树"}).json()["total"], 2)
        self.assertEqual(self.client.get("/api/community/posts?scope=mine", headers=self.alpha).json()["total"], 2)
        first = self.client.get("/api/community/posts?limit=2").json()
        second = self.client.get("/api/community/posts?limit=2&offset=2").json()
        self.assertTrue(first["has_more"])
        self.assertFalse(second["has_more"])
        self.assertEqual(len({row["id"] for row in first["items"] + second["items"]}), 3)

    def test_hot_sort_uses_real_like_totals(self):
        popular = self.post("更早发布")
        self.post("刚发布")
        self.client.put(f'/api/community/posts/{popular["id"]}/like', headers=self.beta, json={"active": True})
        rows = self.client.get("/api/community/posts?sort=hot").json()["items"]
        self.assertEqual(rows[0]["id"], popular["id"])

    def test_upload_is_normalized_and_bound_to_its_owner_and_post(self):
        image = self.image()
        response = self.client.get(image)
        self.assertEqual(response.headers["content-type"], "image/webp")
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")
        with Image.open(io.BytesIO(response.content)) as result:
            self.assertEqual(result.size, (32, 24))
        self.assertEqual(self.client.post("/api/community/posts", headers=self.beta, json={"images": [image]}).status_code, 422)
        post = self.post("", images=[image])
        self.assertEqual(self.client.post("/api/community/posts", headers=self.alpha, json={"images": [image]}).status_code, 422)
        self.assertEqual(self.client.patch("/api/community/posts/" + post["id"], headers=self.alpha, json={"markdown": "保留配图", "images": [image]}).status_code, 200)
        self.assertEqual(self.client.patch("/api/community/posts/" + post["id"], headers=self.alpha, json={"markdown": "移除配图"}).status_code, 200)
        self.assertEqual(self.client.get(image).status_code, 404)

    def test_invalid_and_oversized_images_are_rejected(self):
        bad = self.client.post("/api/community/images", headers=self.alpha, files={"file": ("fake.png", b"<script>alert(1)</script>", "image/png")})
        self.assertEqual(bad.status_code, 422)
        large = self.client.post("/api/community/images", headers=self.alpha, files={"file": ("large.png", b"x" * (MAX_IMAGE_BYTES + 1), "image/png")})
        self.assertEqual(large.status_code, 413)

    def test_deleting_post_removes_comments_replies_reactions_and_images(self):
        image = self.image()
        post = self.post(images=[image])
        parent = self.comment(post)
        self.comment(post, parent=parent["id"], headers=self.alpha)
        self.client.put(f'/api/community/posts/{post["id"]}/like', headers=self.beta, json={"active": True})
        self.assertEqual(self.client.delete("/api/community/posts/" + post["id"], headers=self.alpha).status_code, 204)
        with self.sessions() as db:
            for model in (CommunityPost, CommunityComment, CommunityReaction, CommunityImage):
                self.assertEqual(db.query(model).count(), 0)
        self.assertEqual(self.client.get(image).status_code, 404)

    def test_validation_and_missing_resources(self):
        for payload in ({"markdown": "   "}, {"markdown": "x" * 10001}, {"images": ["https://example.com/a.png"]}):
            self.assertEqual(self.client.post("/api/community/posts", headers=self.alpha, json=payload).status_code, 422)
        self.assertEqual(self.client.patch("/api/community/me", headers=self.alpha, json={"nickname": "  "}).status_code, 422)
        self.assertEqual(self.client.get("/api/community/posts?limit=1000").status_code, 422)
        self.assertEqual(self.client.get("/api/community/posts?scope=mine").status_code, 401)
        self.assertEqual(self.client.get("/api/community/posts/missing").status_code, 404)
        post = self.post()
        self.assertEqual(self.client.post(f'/api/community/posts/{post["id"]}/comments', headers=self.beta, json={"markdown": "  "}).status_code, 422)


if __name__ == "__main__":
    unittest.main()
