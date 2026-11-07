from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Text, Boolean, UniqueConstraint
from sqlalchemy.orm import declarative_base, relationship
import datetime
import uuid

Base = declarative_base()

def generate_uuid():
    return str(uuid.uuid4())

class Course(Base):
    __tablename__ = 'courses'
    id = Column(String, primary_key=True, default=generate_uuid)
    dify_dataset_id = Column(String, nullable=True)
    title = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    modules = relationship("Module", back_populates="course", cascade="all, delete-orphan")

class Module(Base):
    __tablename__ = 'modules'
    id = Column(String, primary_key=True, default=generate_uuid)
    course_id = Column(String, ForeignKey('courses.id'), nullable=False)
    title = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    course = relationship("Course", back_populates="modules")
    nodes = relationship("Node", back_populates="module", cascade="all, delete-orphan")

class Node(Base):
    __tablename__ = 'nodes'
    id = Column(String, primary_key=True, default=generate_uuid)
    module_id = Column(String, ForeignKey('modules.id'), nullable=False)
    title = Column(String, nullable=False)
    x = Column(Integer, nullable=True)
    y = Column(Integer, nullable=True)
    deps = Column(String, nullable=True) # JSON string of dependency node IDs
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    module = relationship("Module", back_populates="nodes")
    resources = relationship("Resource", back_populates="node", cascade="all, delete-orphan")

class Resource(Base):
    __tablename__ = 'resources'
    id = Column(String, primary_key=True, default=generate_uuid)
    node_id = Column(String, ForeignKey('nodes.id'), nullable=False)
    dify_document_id = Column(String, nullable=True)
    name = Column(String, nullable=False)
    status = Column(String, default="active")
    size = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    node = relationship("Node", back_populates="resources")


class LearningQuiz(Base):
    __tablename__ = "learning_quizzes"
    id = Column(String, primary_key=True, default=generate_uuid)
    learner_id = Column(String(80), nullable=False, index=True)
    node_id = Column(String, ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False, index=True)
    questions = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)


class LearningAnswer(Base):
    __tablename__ = "learning_answers"
    __table_args__ = (UniqueConstraint("quiz_id", "question_index", name="uq_learning_answer_question"),)
    id = Column(String, primary_key=True, default=generate_uuid)
    learner_id = Column(String(80), nullable=False, index=True)
    node_id = Column(String, ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False, index=True)
    quiz_id = Column(String, ForeignKey("learning_quizzes.id", ondelete="CASCADE"), nullable=False)
    question_index = Column(Integer, nullable=False)
    selected_answer = Column(Text, nullable=False)
    correct = Column(Boolean, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)


class PracticeRecord(Base):
    __tablename__ = "practice_records"
    id = Column(String, primary_key=True, default=generate_uuid)
    learner_id = Column(String(80), nullable=False, index=True)
    node_id = Column(String, ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False, index=True)
    subject = Column(String, nullable=False)
    exercise = Column(Text, nullable=False)
    student_answer = Column(Text, nullable=True)
    feedback = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)


class CourseBuild(Base):
    __tablename__ = "course_builds"
    course_id = Column(String, ForeignKey("courses.id", ondelete="CASCADE"), primary_key=True)
    enabled = Column(Boolean, default=True, nullable=False)
    status = Column(String, default="queued", nullable=False)
    source_version = Column(String, nullable=True)
    attempt_version = Column(String, nullable=True)
    documents = Column(Text, default="[]", nullable=False)
    summary = Column(Text, default="{}", nullable=False)
    error = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)


class GeneratedResource(Base):
    """Track attachments the builder owns, leaving manually attached files alone."""
    __tablename__ = "generated_resources"
    resource_id = Column(String, ForeignKey("resources.id", ondelete="CASCADE"), primary_key=True)
    course_id = Column(String, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
