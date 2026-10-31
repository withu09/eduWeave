from pydantic import BaseModel, Field
from typing import List

class RecommendedResource(BaseModel):
    id: str = Field(..., description="A unique short identifier, like res-1")
    title: str = Field(..., description="Title of the resource")
    source: str = Field(..., description="Source website or platform (e.g. GeeksforGeeks, MDN, Bilibili)")
    reason: str = Field(..., description="Short explanation of why this resource is useful")
    url: str = Field(..., description="A valid real URL to the resource")

class ResourceList(BaseModel):
    resources: List[RecommendedResource] = Field(..., description="List of recommended resources")
