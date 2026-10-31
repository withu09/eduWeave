import inspect
from pydantic import BaseModel
from pydantic_ai import Agent, RunContext
from app.agents.orchestrator import spark_model
from app.agents.deps import AgentDeps
from app.utils.telemetry import log_thought, set_agent_status

class CodeTask(BaseModel):
    title: str
    description: str
    language: str
    boilerplate: str
    solution: str

class CoderOutput(BaseModel):
    task: CodeTask

agent_kwargs = {
    "model": spark_model,
    "deps_type": AgentDeps,
    "retries": 3
}

init_sig = inspect.signature(Agent.__init__)
if "output_type" in init_sig.parameters:
    agent_kwargs["output_type"] = CoderOutput
else:
    agent_kwargs["result_type"] = CoderOutput

coder_agent = Agent(**agent_kwargs)

@coder_agent.system_prompt
async def get_coder_prompt(ctx: RunContext[AgentDeps]) -> str:
    profile = ctx.deps.student_profile
    query_topic = ctx.deps.node_title if ctx.deps.node_title else "general programming concepts"
    
    await set_agent_status("Coder", "working")
    await log_thought("Coder", f"正在检索 '{query_topic}' 并准备生成编程题目...")
    
    try:
        results = ctx.deps.chroma_client.get_collection("dsa").query(
            query_texts=[query_topic],
            n_results=1
        )
        rag_context = "\n".join(results["documents"][0])
    except Exception:
        rag_context = f"Fallback material: Use your general knowledge about {query_topic}."
        
    await log_thought("Coder", "开始编写代码沙盒的 boilerplate 和解答代码...")
    
    return (
        "You are an expert programming tutor. Your goal is to generate a short, interactive coding exercise based on the current topic. "
        "You MUST call the final_result tool immediately. Do not write text chat or ask questions. "
        f"The topic is: '{query_topic}'. "
        f"Use verified context: {rag_context}. "
        "Provide a 'title', a clear 'description' (including hints), set 'language' to 'python', provide 'boilerplate' code with a '# TODO: your code here' comment, "
        "and provide the complete 'solution' code. Ensure the code is directly runnable and teaches the core concept. "
        "CRITICAL: Your output must be strictly valid JSON. For multi-line code in 'boilerplate' and 'solution', you MUST use properly escaped newlines (\\\\n) and NEVER use raw literal newline characters!"
    )
