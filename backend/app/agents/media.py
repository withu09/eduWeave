import inspect
from pydantic import BaseModel
from pydantic_ai import Agent
from app.agents.orchestrator import spark_model

class MediaOutput(BaseModel):
    manim_script: str
    narration: str

agent_kwargs = {
    "model": spark_model,
    "system_prompt": "Generate a Python community-edition Manim Community script to render pointer or tree animations. You MUST call the final_result tool immediately. Do not write text chat or ask questions.",
    "retries": 3
}

init_sig = inspect.signature(Agent.__init__)
if "output_type" in init_sig.parameters:
    agent_kwargs["output_type"] = MediaOutput
else:
    agent_kwargs["result_type"] = MediaOutput

media_agent = Agent(**agent_kwargs)
