import json
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from pydantic_ai import Agent

from app.agents.orchestrator import spark_model
from app.db.database import SessionLocal
from app.db.models import Node, PracticeRecord
from app.routers.adaptive import Learner
from app.utils.telemetry import tracked_run
from app.utils.knowledge import node_materials

router = APIRouter(prefix="/api/practice", tags=["Subject practice"])
Subject = Literal["programming", "economics", "mathematics", "language", "humanities", "general"]
SUBJECTS = {
    "programming": "计算机 · 编程实战", "economics": "经济管理 · 案例与计算",
    "mathematics": "数学理科 · 推导与建模", "language": "语言 · 阅读与表达",
    "humanities": "人文社科 · 材料与论述", "general": "通用 · 应用与分析",
}


class PracticeRequest(BaseModel):
    subject: Subject


class FeedbackRequest(BaseModel):
    answer: str = Field(min_length=1, max_length=8000)


class Exercise(BaseModel):
    title: str
    scenario: str
    task: str
    hints: list[str]
    criteria: list[str]
    reference_answer: str


practice_agent = Agent(spark_model, output_type=Exercise, retries=2, system_prompt=(
    "你是跨学科实践练习教师。使用简体中文，为给定课程和知识点生成一个具体、可完成、有参考解析的实践任务。"
    "经济管理出案例分析或数据计算，数学理科出推导或建模，语言出阅读写作翻译，人文社科出材料分析或论述。"
    "不要为非编程学科强加代码。题目必须属于用户选择的学科，并结合完整课程上下文理解编号类知识点。"
    "只收到课程主题、未收到教材正文时，不得声称题目来自上传教材。数据案例注明为教学设例。"
    "任务简洁清晰，提供2-3条提示、具体评价要点和可核对的参考答案。"
))
feedback_agent = Agent(spark_model, retries=2, system_prompt=(
    "你是实践练习教师。使用简体中文，依据给出的任务、参考答案和评价要点，对学生作答给出简明反馈。"
    "分为做得好的地方、需要改进的地方、下一步建议。不要虚构学情，不给出认证性结论。"
))


def node_context(db, node_id):
    node = db.get(Node, node_id)
    if node is None:
        raise HTTPException(404, "知识点不存在")
    return f"{node.module.course.title} / {node.module.title} / {node.title}"


def suggested_subject(context):
    groups = [
        ("programming", ["计算机", "算法", "编程", "python", "程序设计", "软件", "数据结构"]),
        ("economics", ["经济", "管理", "会计", "金融", "营销"]),
        ("mathematics", ["数学", "物理", "化学", "统计", "生物"]),
        ("language", ["英语", "外语", "日语", "法语", "语言", "写作"]),
        ("humanities", ["历史", "政治", "哲学", "社会", "文学", "法律"]),
    ]
    return next((key for key, words in groups if any(word in context.lower() for word in words)), "general")


def record_payload(record):
    return {"id": record.id, "subject": record.subject, "exercise": json.loads(record.exercise),
            "student_answer": record.student_answer or "", "feedback": record.feedback or ""}


@router.get("/nodes/{node_id}")
async def get_practice(node_id: str, learner_id: Learner, subject: Subject | None = None):
    with SessionLocal() as db:
        context = node_context(db, node_id)
        query = db.query(PracticeRecord).filter_by(learner_id=learner_id, node_id=node_id)
        if subject:
            query = query.filter_by(subject=subject)
        record = query.order_by(PracticeRecord.created_at.desc()).first()
        if record is None:
            seed_q = db.query(PracticeRecord).filter_by(learner_id="seed_template", node_id=node_id)
            if subject:
                seed_q = seed_q.filter_by(subject=subject)
            record = seed_q.order_by(PracticeRecord.created_at.desc()).first()
        selected = subject or (record.subject if record else suggested_subject(context))
        payload = record_payload(record) if record else None
    if payload:
        version = payload["exercise"].get("source_version")
        if not version:
            payload = None
        elif version != "*":
            material = await node_materials(node_id)
            if material["source_version"] != version:
                payload = None
    return {"subject": selected, "subjects": SUBJECTS, "context": context, "record": payload}


@router.post("/nodes/{node_id}")
async def generate_practice(node_id: str, req: PracticeRequest, learner_id: Learner):
    with SessionLocal() as db:
        context = node_context(db, node_id)
    if req.subject == "programming":
        from app.routers.kb import get_kb_code
        result = await get_kb_code(node_id)
        if result.get("error") or not result.get("task"):
            raise HTTPException(409, "代码练习暂不可用，请先为知识点上传资料后重试")
        exercise = {"code": result["task"], "sources": result.get("sources", []), "source_version": result.get("source_version")}
    else:
        material = await node_materials(node_id)
        result = await tracked_run("Practice", f"生成{SUBJECTS[req.subject]}练习：{context}", practice_agent.run(
            f"课程上下文：{context}\n学科及练习形式：{SUBJECTS[req.subject]}\n请严格依据以下 Dify 资料出题，引用对应的资料编号。\n{material['context']}"
        ))
        exercise = result.output.model_dump()
        exercise["sources"] = material["sources"]
        exercise["source_version"] = material["source_version"]
    with SessionLocal() as db:
        record = PracticeRecord(learner_id=learner_id, node_id=node_id, subject=req.subject, exercise=json.dumps(exercise, ensure_ascii=False))
        db.add(record)
        db.commit()
        return record_payload(record)


@router.post("/{record_id}/feedback")
async def give_feedback(record_id: str, req: FeedbackRequest, learner_id: Learner):
    with SessionLocal() as db:
        record = db.query(PracticeRecord).filter_by(id=record_id, learner_id=learner_id).first()
        if record is None:
            raise HTTPException(404, "练习记录不存在")
        context = node_context(db, record.node_id)
        exercise = record.exercise
    result = await tracked_run("Practice", f"点评实践作答：{context}", feedback_agent.run(
        f"练习及评价要点：{exercise}\n学生作答：{req.answer}"
    ))
    with SessionLocal() as db:
        record = db.get(PracticeRecord, record_id)
        if record is None:
            raise HTTPException(404, "练习已移除")
        record.student_answer = req.answer
        record.feedback = str(result.output)
        db.commit()
        return record_payload(record)
