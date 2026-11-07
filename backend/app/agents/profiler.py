import inspect
from pydantic_ai import Agent
from app.agents.orchestrator import spark_model
from app.schemas.profile import StudentProfile

agent_kwargs = {
    "model": spark_model,
    "system_prompt": "You are the Profiler Agent. Read the conversation history and output the updated StudentProfile parameters. You MUST identify the student's weaknesses and strengths. Identify topic names from the current course and the student's own description. Do not map unrelated subjects into computer-science topics. You MUST call the final_result tool immediately. Do not ask for clarification or write plain text.",
    "retries": 3
}

init_sig = inspect.signature(Agent.__init__)
if "output_type" in init_sig.parameters:
    agent_kwargs["output_type"] = StudentProfile
else:
    agent_kwargs["result_type"] = StudentProfile

profiler_agent = Agent(**agent_kwargs)
