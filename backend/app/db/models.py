from sqlalchemy import Column, String, Integer, ForeignKey, DateTime
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
