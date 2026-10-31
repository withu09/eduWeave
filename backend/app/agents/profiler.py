import inspect
from pydantic_ai import Agent
from app.agents.orchestrator import spark_model
from app.schemas.profile import StudentProfile

agent_kwargs = {
    "model": spark_model,
    "system_prompt": "You are the Profiler Agent. Read the conversation history and output the updated StudentProfile parameters. You MUST identify the student's weaknesses and strengths. Map the weaknesses and strengths ONLY to the following course topics: ['数据结构导论', '线性表与数组', '单链表基础', '双向链表', '循环链表', '栈与队列', '二叉树基础', '图论基础', '哈希表与散列']. You MUST call the final_result tool immediately. Do not ask for clarification or write plain text.",
    "retries": 3
}

init_sig = inspect.signature(Agent.__init__)
if "output_type" in init_sig.parameters:
    agent_kwargs["output_type"] = StudentProfile
else:
    agent_kwargs["result_type"] = StudentProfile

profiler_agent = Agent(**agent_kwargs)
