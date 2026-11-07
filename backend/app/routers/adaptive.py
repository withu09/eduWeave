"""Persisted practice results and an explainable, course-independent study path."""
import json
from collections import defaultdict
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError

from app.db.database import SessionLocal
from app.db.models import Course, Module, Node, Resource, LearningQuiz, LearningAnswer

router = APIRouter(prefix="/api/adaptive", tags=["Adaptive learning"])
Learner = Annotated[str, Header(alias="X-Learner-ID", min_length=8, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")]


class AnswerRequest(BaseModel):
    question_index: int = Field(ge=0)
    selected_answer: str = Field(min_length=1, max_length=4000)


class QuizRequest(BaseModel):
    fresh: bool = False


def build_plan(db, learner_id: str, course_id: str = "all") -> dict:
    rows = (
        db.query(Node, Module, Course).join(Module, Node.module_id == Module.id)
        .join(Course, Module.course_id == Course.id)
        .order_by(Course.created_at, Module.created_at, Node.created_at, Node.id)
    )
    if course_id != "all":
        if db.get(Course, course_id) is None:
            raise HTTPException(404, "课程不存在，请重新选择")
        rows = rows.filter(Course.id == course_id)
    rows = rows.all()
    ids = {node.id for node, _, _ in rows}
    attempts = (
        db.query(LearningAnswer).filter(LearningAnswer.learner_id == learner_id, LearningAnswer.node_id.in_(ids))
        .order_by(LearningAnswer.created_at, LearningAnswer.id).all()
    ) if ids else []
    grouped = defaultdict(list)
    for answer in attempts:
        grouped[answer.node_id].append(answer)
    resource_nodes = {
        row[0] for row in db.query(Resource.node_id).filter(Resource.node_id.in_(ids)).distinct().all()
    } if ids else set()
    steps = []
    for node, module, course in rows:
        history = grouped[node.id]
        recent = history[-5:]
        correct = sum(answer.correct for answer in recent)
        accuracy = round(100 * correct / len(recent)) if recent else None
        # A single answer, or simply opening a lesson, never establishes mastery.
        mastered = len(recent) >= 3 and correct / len(recent) >= 0.8
        weak = bool(recent) and (not recent[-1].correct or correct / len(recent) < 0.6)
        status = "mastered" if mastered else "weakness" if weak else "learning" if recent else "unstarted"
        try:
            deps = json.loads(node.deps or "[]")
        except (ValueError, TypeError):
            deps = []
        deps = list(dict.fromkeys(dep for dep in deps if isinstance(dep, str) and dep in ids and dep != node.id)) if isinstance(deps, list) else []
        steps.append({
            "id": node.id, "title": node.title, "module": module.title,
            "course_id": course.id, "course": course.title, "status": status,
            "attempts": len(history), "recent_count": len(recent), "accuracy": accuracy,
            "mastery": accuracy or 0, "has_resources": node.id in resource_nodes,
            "prerequisites": deps, "blocked_by": [], "recommended": False,
        })
    # Put prerequisites before dependants, including when chapter order differs.
    remaining = list(steps)
    steps = []
    emitted = set()
    while remaining:
        ready = next((step for step in remaining if set(step["prerequisites"]) <= emitted), remaining[0])
        steps.append(ready)
        emitted.add(ready["id"])
        remaining.remove(ready)
    by_id = {step["id"]: step for step in steps}
    for step in steps:
        step["blocked_by"] = [by_id[dep]["title"] for dep in step["prerequisites"] if by_id[dep]["status"] != "mastered"]
    candidates = [step for step in steps if step["status"] != "mastered" and not step["blocked_by"]]
    recommended = next((step for step in candidates if step["status"] == "weakness"), None)
    recommended = recommended or next((step for step in candidates if step["status"] == "learning"), None)
    recommended = recommended or next(iter(candidates), None)
    for step in steps:
        if step["blocked_by"]:
            step["reason"] = "建议先完成：" + "、".join(step["blocked_by"])
        elif step["status"] == "mastered":
            step["reason"] = f"最近 {step['recent_count']} 题正确率 {step['accuracy']}%，可以继续进阶或复习。"
        elif step["attempts"]:
            step["reason"] = f"最近 {step['recent_count']} 题正确率 {step['accuracy']}%，" + ("建议回顾讲义后再练习。" if step["status"] == "weakness" else "继续练习以确认掌握情况。")
        else:
            step["reason"] = "尚无答题记录，从讲义学习或测验开始。"
        if recommended and step["id"] == recommended["id"]:
            step["recommended"] = True
    latest = attempts[-20:]
    mastered_count = sum(step["status"] == "mastered" for step in steps)
    practiced_count = sum(bool(step["attempts"]) for step in steps)
    return {
        "course_id": course_id, "steps": steps,
        "next_node_id": recommended["id"] if recommended else None,
        "summary": {
            "total_nodes": len(steps), "mastered_nodes": mastered_count,
            "practiced_nodes": practiced_count, "weak_nodes": sum(step["status"] == "weakness" for step in steps),
            "answered_count": len(attempts),
            "recent_accuracy": round(100 * sum(answer.correct for answer in latest) / len(latest)) if latest else None,
            "progress": round(100 * mastered_count / len(steps)) if steps else 0,
        },
        "rule": "按每个知识点最近最多 5 题判断；至少回答 3 题且正确率达到 80% 记为已掌握。建议优先补习薄弱点，并参考已设置的先修关系。",
    }


@router.get("/plan")
def get_plan(learner_id: Learner, course_id: str = "all"):
    with SessionLocal() as db:
        return build_plan(db, learner_id, course_id)


@router.post("/nodes/{node_id}/quiz")
async def start_quiz(node_id: str, learner_id: Learner, req: QuizRequest | None = None):
    fresh = bool(req and req.fresh)
    from app.routers.kb import get_kb_quiz, get_kb_quiz_more
    with SessionLocal() as db:
        node = db.get(Node, node_id)
        if node is None:
            raise HTTPException(404, "请选择一个具体的知识点进行测验")
        module = db.get(Module, node.module_id)
        course = db.get(Course, module.course_id)
        context = f"{course.title} / {module.title} / {node.title}"
    result = await get_kb_quiz(node_id)
    source_version = result.get("source_version", "")
    with SessionLocal() as db:
        # Resume an unfinished quiz after refreshing or reopening the lesson.
        sessions = db.query(LearningQuiz).filter_by(learner_id=learner_id, node_id=node_id).order_by(LearningQuiz.created_at.desc()).limit(10).all()
        for session in ([] if fresh else sessions):
            questions = json.loads(session.questions)
            answers = db.query(LearningAnswer).filter_by(quiz_id=session.id).all()
            if questions and questions[0].get("_context") == context and questions[0].get("_source_version", "") == source_version and len(answers) < len(questions):
                return quiz_payload(session.id, questions, answers)
    questions = result.get("questions", [])
    if result.get("error") == "no_resources":
        raise HTTPException(409, "该知识点还没有学习资料，请先到知识库管理上传资料")
    if result.get("error") or not questions:
        raise HTTPException(502, "题目生成未完成，请稍后重试")
    if fresh:
        previous_count = len(questions)
        result = await get_kb_quiz_more(node_id)
        source_version = result.get("source_version", source_version)
        if result.get("error"):
            raise HTTPException(502, "新题生成未完成，请稍后重试")
        questions = result.get("questions", [])[previous_count:]
        if not questions:
            raise HTTPException(502, "暂未生成新题，请稍后重试")
    questions = [dict(question) if isinstance(question, dict) else question for question in questions]
    for question in questions:
        # Some model responses return an option letter instead of its full text.
        if isinstance(question, dict) and isinstance(question.get("options"), list):
            answer = str(question.get("correct_answer", "")).strip()
            if answer not in question["options"] and len(answer) == 1 and "A" <= answer.upper() <= "Z":
                index = ord(answer.upper()) - ord("A")
                if index < len(question["options"]):
                    question["correct_answer"] = question["options"][index]
        if not isinstance(question, dict) or not isinstance(question.get("options"), list) or not question.get("question") or question.get("correct_answer") not in question["options"]:
            raise HTTPException(502, "生成的题目格式不完整，请重新生成")
        question["_context"] = context
        question["_source_version"] = source_version
    questions[0]["_sources"] = result.get("sources", [])
    with SessionLocal() as db:
        quiz = LearningQuiz(learner_id=learner_id, node_id=node_id, questions=json.dumps(questions, ensure_ascii=False))
        db.add(quiz)
        db.commit()
        return quiz_payload(quiz.id, questions, [])


def quiz_payload(quiz_id: str, questions: list, answers: list) -> dict:
    return {
        "quiz_id": quiz_id,
        "sources": questions[0].get("_sources", []) if questions else [],
        "questions": [{"question": question["question"], "options": question["options"]} for question in questions],
        "answers": {str(answer.question_index): answer_payload(answer, questions[answer.question_index]) for answer in answers},
    }


def answer_payload(answer, question: dict) -> dict:
    return {"selected_answer": answer.selected_answer, "correct": answer.correct,
            "correct_answer": question["correct_answer"], "explanation": question.get("explanation", "")}


@router.post("/quizzes/{quiz_id}/answers")
def submit_answer(quiz_id: str, req: AnswerRequest, learner_id: Learner):
    with SessionLocal() as db:
        quiz = db.query(LearningQuiz).filter_by(id=quiz_id, learner_id=learner_id).first()
        if quiz is None:
            raise HTTPException(404, "测验不存在或不属于当前学习记录")
        questions = json.loads(quiz.questions)
        if req.question_index >= len(questions):
            raise HTTPException(422, "题目编号无效")
        question = questions[req.question_index]
        if req.selected_answer not in question["options"]:
            raise HTTPException(422, "请选择题目提供的选项")
        answer = db.query(LearningAnswer).filter_by(quiz_id=quiz_id, question_index=req.question_index).first()
        if answer is None:
            answer = LearningAnswer(
                learner_id=learner_id, node_id=quiz.node_id, quiz_id=quiz.id,
                question_index=req.question_index, selected_answer=req.selected_answer,
                correct=req.selected_answer == question["correct_answer"],
            )
            db.add(answer)
            try:
                db.commit()
            except IntegrityError:
                # A repeated click or retry must never count as another attempt.
                db.rollback()
                answer = db.query(LearningAnswer).filter_by(quiz_id=quiz_id, question_index=req.question_index).one()
        node = db.get(Node, quiz.node_id)
        module = db.get(Module, node.module_id)
        return {"answer": answer_payload(answer, question), "plan": build_plan(db, learner_id, module.course_id)}
