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
