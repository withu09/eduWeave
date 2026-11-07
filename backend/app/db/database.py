import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from .models import Base, Course, Module, Node

# Using synchronous psycopg2 driver for simple integration with existing code
# Fallback to sqlite if DATABASE_URL is not set
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://postgres:password@localhost:5432/eduweave")

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in SQLALCHEMY_DATABASE_URL else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    """Create missing tables; optionally add a course to a new, empty database."""
    Base.metadata.create_all(bind=engine)
    if os.getenv("SEED_DEMO_DATA", "false").lower() != "true":
        return
    with SessionLocal() as db:
        if db.query(Course).first() is not None:
            return
        course = Course(id="demo-dsa", title="数据结构与算法（示例课程）")
        basics = Module(id="demo-basics", title="基础与线性结构", course=course)
        advanced = Module(id="demo-advanced", title="树、图与查找", course=course)
        groups = [
            (basics, ["数据结构导论", "线性表与数组", "单链表基础", "双向链表", "循环链表", "栈与队列"]),
            (advanced, ["二叉树基础", "图论基础", "哈希表与散列"]),
        ]
        previous = None
        import json
        for module, titles in groups:
            for index, title in enumerate(titles):
                node_id = f"{module.id}-{index}"
                module.nodes.append(Node(id=node_id, title=title, deps=json.dumps([previous] if previous else [])))
                previous = node_id
        db.add(course)
        db.commit()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
