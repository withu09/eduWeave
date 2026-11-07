from dataclasses import dataclass
from typing import Any, Optional
from app.schemas.profile import StudentProfile
from app.agents.orchestrator import StudyPlan

@dataclass
class AgentDeps:
    chroma_client: Any  # chromadb.api.ClientAPI type
    student_profile: StudentProfile
    study_plan: Optional[StudyPlan] = None
    node_title: Optional[str] = None
    node_id: Optional[str] = None
    course_id: Optional[str] = None
    knowledge_context: Optional[str] = None
    knowledge_sources: Optional[list[dict]] = None
    available_topics: Optional[list[str]] = None
