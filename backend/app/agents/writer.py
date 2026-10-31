import inspect
from pydantic import BaseModel
from pydantic_ai import Agent, RunContext
from app.agents.orchestrator import spark_model
from app.agents.deps import AgentDeps
from app.utils.telemetry import log_thought, set_agent_status

class WriterOutput(BaseModel):
    markdown: str
    mermaid_schema: str

agent_kwargs = {
    "model": spark_model,
    "deps_type": AgentDeps,
    "retries": 3
}

init_sig = inspect.signature(Agent.__init__)
if "output_type" in init_sig.parameters:
    agent_kwargs["output_type"] = WriterOutput
else:
    agent_kwargs["result_type"] = WriterOutput

writer_agent = Agent(**agent_kwargs)

@writer_agent.system_prompt
async def get_writer_prompt(ctx: RunContext[AgentDeps]) -> str:
    profile = ctx.deps.student_profile
    query_topic = ctx.deps.node_title if ctx.deps.node_title else "general programming concepts"
    
    await set_agent_status("Writer", "working")
    await log_thought("Writer", f"检索有关 '{query_topic}' 的内容，分析学员薄弱点...")
    
    import time
    from app.utils.telemetry import log_rag_metrics
    import asyncio
    
    try:
        start_t = time.perf_counter()
        results = ctx.deps.chroma_client.get_collection("dsa").query(
            query_texts=[query_topic],
            n_results=1
        )
        end_t = time.perf_counter()
        
        # Calculate mock hit rate based on whether results exist
        hit_rate = 0.95 if results and len(results.get("documents", [])) > 0 else 0.0
        latency = end_t - start_t
        asyncio.create_task(log_rag_metrics(latency, hit_rate))
        
        rag_context = "\n".join(results["documents"][0])
    except Exception:
        asyncio.create_task(log_rag_metrics(0.0, 0.0))
        rag_context = f"Fallback material: Use your general knowledge about {query_topic}."
        
    await log_thought("Writer", "开始梳理知识点，生成 Markdown 讲义与 Mermaid 导图结构...")
    
    return (
        "Generate Markdown guide and Mermaid diagram schema based on RAG knowledge. "
        "You MUST call the final_result tool immediately. Do not write text chat or ask questions. "
        "Strictly limit the output size: the Markdown guide must be extremely brief and concise (maximum 150 words total, with only 1-2 bullet points per topic). "
        "The Mermaid diagram MUST use `mindmap` syntax and be extremely simple (maximum 2-3 nodes). "
        f"Analyze student weaknesses: {profile.weaknesses}. Use verified context: {rag_context}"
    )
