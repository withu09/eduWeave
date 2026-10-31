import inspect
from pydantic import BaseModel
from pydantic_ai import Agent, RunContext
from app.agents.orchestrator import spark_model
from app.agents.deps import AgentDeps

class QuizQuestion(BaseModel):
    question: str
    options: list[str]
    correct_answer: str
    explanation: str

class ExaminerOutput(BaseModel):
    questions: list[QuizQuestion]

agent_kwargs = {
    "model": spark_model,
    "deps_type": AgentDeps,
    "retries": 3
}

init_sig = inspect.signature(Agent.__init__)
if "output_type" in init_sig.parameters:
    agent_kwargs["output_type"] = ExaminerOutput
else:
    agent_kwargs["result_type"] = ExaminerOutput

examiner_agent = Agent(**agent_kwargs)

@examiner_agent.system_prompt
def get_examiner_prompt(ctx: RunContext[AgentDeps]) -> str:
    profile = ctx.deps.student_profile
    query_topic = ctx.deps.node_title if ctx.deps.node_title else "general programming concepts"
    try:
        results = ctx.deps.chroma_client.get_collection("dsa").query(
            query_texts=[query_topic],
            n_results=1
        )
        rag_context = "\n".join(results["documents"][0])
    except Exception:
        rag_context = f"Fallback material: Use your general knowledge about {query_topic}."
        
    return (
        "Generate quiz targeting the current topic and student weaknesses. You MUST call the final_result tool immediately. Do not write text chat or ask questions. "
        f"Generate exactly 3-5 multiple-choice questions specifically about the topic: '{query_topic}'. "
        f"Use verified context: {rag_context}. "
        f"Also make sure to adapt the questions to matching weaknesses: {profile.weaknesses} and difficulty: {profile.difficulty_preference}."
    )
