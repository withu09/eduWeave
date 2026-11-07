"""Adaptive learning integration checks, isolated from live data and model APIs."""
import json
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.models import Base, Course, Module, Node, Resource, LearningAnswer
from app.routers import adaptive, kb


QUESTIONS = [{"question": f"经济学概念练习 {index}", "options": ["正确选项", "错误选项"],
              "correct_answer": "正确选项", "explanation": "这是测试讲解"} for index in range(3)]


class AdaptiveTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine)
        self.addCleanup(self.engine.dispose)
        with self.sessions() as db:
            course = Course(id="economics", title="西方经济学")
            module = Module(id="econ-module", title="市场", course=course)
            module.nodes.extend([
                Node(id="demand", title="需求", deps="[]"),
                Node(id="elasticity", title="需求弹性", deps=json.dumps(["demand"])),
                Node(id="supply", title="供给", deps="[]"),
            ])
            other = Course(id="history", title="历史")
            other.modules.append(Module(id="hist-module", title="古代史", nodes=[Node(id="history-node", title="史料分析")]))
            db.add_all([course, other])
            db.flush()
            db.add(Resource(node_id="demand", name="讲义.pdf", dify_document_id="local-lesson"))
            db.commit()
        database = patch.object(adaptive, "SessionLocal", self.sessions)
        database.start()
        self.addCleanup(database.stop)
        generator = patch.object(kb, "get_kb_quiz", new_callable=AsyncMock, return_value={"questions": QUESTIONS})
        self.generator = generator.start()
        self.addCleanup(generator.stop)
        app = FastAPI()
        app.include_router(adaptive.router)
        self.client = TestClient(app, headers={"X-Learner-ID": "learner-alpha"})
        self.addCleanup(self.client.close)

    def plan(self, course="economics"):
        response = self.client.get("/api/adaptive/plan", params={"course_id": course})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def start(self, node="demand"):
        response = self.client.post(f"/api/adaptive/nodes/{node}/quiz")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def answer(self, quiz, index, correct=True):
        response = self.client.post(f'/api/adaptive/quizzes/{quiz["quiz_id"]}/answers', json={
            "question_index": index, "selected_answer": "正确选项" if correct else "错误选项",
        })
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_real_non_computing_course_starts_without_fabricated_progress(self):
        plan = self.plan()
        self.assertEqual({step["title"] for step in plan["steps"]}, {"需求", "需求弹性", "供给"})
        self.assertEqual(plan["summary"]["answered_count"], 0)
        self.assertIsNone(plan["summary"]["recent_accuracy"])
        self.assertEqual(plan["summary"]["mastered_nodes"], 0)
        elasticity = next(step for step in plan["steps"] if step["id"] == "elasticity")
        self.assertEqual(elasticity["blocked_by"], ["需求"])
        self.assertNotEqual(plan["next_node_id"], "elasticity")

    def test_wrong_answer_changes_recommendation_and_is_persisted(self):
        quiz = self.start("supply")
        result = self.answer(quiz, 0, correct=False)
        step = next(step for step in result["plan"]["steps"] if step["id"] == "supply")
        self.assertEqual(step["status"], "weakness")
        self.assertEqual(result["plan"]["next_node_id"], "supply")
        self.assertFalse(result["answer"]["correct"])
        self.assertEqual(self.plan()["summary"]["answered_count"], 1)
        with self.sessions() as db:
            self.assertEqual(db.query(LearningAnswer).count(), 1)

    def test_server_grades_and_retry_does_not_count_twice(self):
        quiz = self.start()
        self.assertNotIn("correct_answer", quiz["questions"][0])
        self.answer(quiz, 0, correct=False)
        retried = self.answer(quiz, 0, correct=True)
        self.assertFalse(retried["answer"]["correct"])
        self.assertEqual(retried["answer"]["selected_answer"], "错误选项")
        self.assertEqual(self.plan()["summary"]["answered_count"], 1)

    def test_three_correct_answers_establish_mastery_and_unlock_prerequisite(self):
        quiz = self.start()
        self.answer(quiz, 0)
        self.assertEqual(self.plan()["summary"]["mastered_nodes"], 0)
        self.answer(quiz, 1)
        result = self.answer(quiz, 2)
        steps = {step["id"]: step for step in result["plan"]["steps"]}
        self.assertEqual(steps["demand"]["status"], "mastered")
        self.assertEqual(steps["elasticity"]["blocked_by"], [])
        self.assertEqual(result["plan"]["summary"]["mastered_nodes"], 1)

    def test_recent_errors_can_revise_an_earlier_mastery_estimate(self):
        quiz = self.start()
        for index in range(3):
            self.answer(quiz, index)
        another = self.start()
        self.assertNotEqual(another["quiz_id"], quiz["quiz_id"])
        self.answer(another, 0, correct=False)
        step = next(step for step in self.plan()["steps"] if step["id"] == "demand")
        self.assertEqual(step["accuracy"], 75)
        self.assertEqual(step["status"], "weakness")

    def test_refresh_resumes_unfinished_quiz_without_regenerating(self):
        quiz = self.start()
        self.answer(quiz, 0)
        resumed = self.start()
        self.assertEqual(resumed["quiz_id"], quiz["quiz_id"])
        self.assertTrue(resumed["answers"]["0"]["correct"])
        self.assertEqual(self.generator.await_count, 2)  # Recheck source version; the content endpoint caches model output.

    def test_learners_and_courses_do_not_share_progress(self):
        quiz = self.start()
        self.answer(quiz, 0)
        other = self.client.get("/api/adaptive/plan", params={"course_id": "economics"}, headers={"X-Learner-ID": "learner-beta"}).json()
        self.assertEqual(other["summary"]["answered_count"], 0)
        denied = self.client.post(f'/api/adaptive/quizzes/{quiz["quiz_id"]}/answers', headers={"X-Learner-ID": "learner-beta"}, json={"question_index": 1, "selected_answer": "正确选项"})
        self.assertEqual(denied.status_code, 404)
        self.assertEqual(self.plan("history")["summary"]["answered_count"], 0)

    def test_invalid_answer_and_missing_node_do_not_create_records(self):
        quiz = self.start()
        for index, value in [(99, "正确选项"), (0, "伪造选项")]:
            response = self.client.post(f'/api/adaptive/quizzes/{quiz["quiz_id"]}/answers', json={"question_index": index, "selected_answer": value})
            self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.post("/api/adaptive/nodes/missing/quiz").status_code, 404)
        self.assertEqual(self.plan()["summary"]["answered_count"], 0)

    def test_fresh_quiz_preserves_generate_more_and_has_only_new_questions(self):
        new = [{**QUESTIONS[0], "question": "新生成的问题"}]
        with patch.object(kb, "get_kb_quiz_more", new_callable=AsyncMock, return_value={"questions": QUESTIONS + new}):
            response = self.client.post("/api/adaptive/nodes/demand/quiz", json={"fresh": True})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([q["question"] for q in response.json()["questions"]], ["新生成的问题"])

    def test_option_letter_is_normalized_for_server_grading(self):
        self.generator.return_value = {"questions": [{**QUESTIONS[0], "correct_answer": "A"}]}
        quiz = self.start()
        self.assertTrue(self.answer(quiz, 0)["answer"]["correct"])


if __name__ == "__main__":
    unittest.main()
