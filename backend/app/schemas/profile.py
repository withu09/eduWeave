from pydantic import BaseModel, Field
from typing import List, Literal

CourseTopic = str  # Knowledge topics come from each course, not a fixed subject list.

class StudentProfile(BaseModel):
    user_id: str = "stud-01"
    weaknesses: List[CourseTopic] = Field(default_factory=list)          # 1. 知识短板
    strengths: List[CourseTopic] = Field(default_factory=list)           # 2. 已掌握知识点
    cognitive_style: str = "visual"                              # 3. 认知风格 (visual/textual/practical)
    difficulty_preference: str = "medium"                        # 4. 难度偏好 (easy/medium/hard)
    progress_percentage: float = 0.0                             # 5. 学习进度百分比
    study_intensity_score: float = 1.0                           # 6. 学习活跃度/强度
