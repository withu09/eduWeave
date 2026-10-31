from pydantic_ai import Agent
import inspect
from app.schemas.resource import ResourceList
from .orchestrator import spark_model

agent_kwargs = {
    "model": spark_model,
    "system_prompt": (
        "You are an expert Computer Science professor. "
        "Your task is to recommend high-quality, real online learning resources (articles, interactive sites, open courses, tools) "
        "for a specific subject. "
        "Provide exactly 3 resources. Ensure the URLs are valid and the resources are highly relevant. "
        "If you are given a list of excluded titles, do NOT recommend those."
    ),
    "retries": 3
}

init_sig = inspect.signature(Agent.__init__)
if "output_type" in init_sig.parameters:
    agent_kwargs["output_type"] = ResourceList
else:
    agent_kwargs["result_type"] = ResourceList

resource_agent = Agent(**agent_kwargs)
