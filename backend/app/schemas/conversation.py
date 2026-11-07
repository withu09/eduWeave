"""Bounded, role-preserving history shared by the learning conversations."""
from typing import Literal

from pydantic import AliasChoices, BaseModel, Field
from pydantic_ai.messages import ModelRequest, ModelResponse, TextPart, UserPromptPart


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8000, validation_alias=AliasChoices("content", "text"))


class ChatRequest(BaseModel):
    user_input: str = Field(min_length=1, max_length=8000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=40)
    course_id: str | None = Field(default=None, max_length=100)
    node_id: str | None = Field(default=None, max_length=100)


def model_history(turns: list[ChatTurn]) -> list[ModelRequest | ModelResponse]:
    """Keep the latest 20 messages, up to 24,000 characters, in chronological order."""
    selected: list[ChatTurn] = []
    remaining = 24000
    for turn in reversed(turns[-20:]):
        content = turn.content.strip()
        if not content:
            continue
        if len(content) > remaining:
            break
        selected.append(ChatTurn(role=turn.role, content=content))
        remaining -= len(content)

    messages: list[ModelRequest | ModelResponse] = []
    for turn in reversed(selected):
        if turn.role == "user":
            messages.append(ModelRequest(parts=[UserPromptPart(content=turn.content)]))
        else:
            messages.append(ModelResponse(parts=[TextPart(content=turn.content)]))
    return messages
