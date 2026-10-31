from pydantic_ai import Agent, RunContext
from typing import List, Optional
from .orchestrator import spark_model, StudyPlan
from .deps import AgentDeps

chat_agent = Agent(
    model=spark_model,
    deps_type=AgentDeps,
    system_prompt=(
        "你是 EduWeave AI，一位专业、耐心且极其擅长鼓励的专属 AI 学习导师。你的核心任务是辅导学生掌握当前的专业课程（如：数据结构与算法），并为他们提供个性化的学习体验。请使用清晰、简明的 Markdown 格式进行排版。\n"
        "作为拥有自主决策能力的 Agent，你在每次回答前，必须评估用户的意图，并严格遵循以下三大核心响应逻辑：\n\n"
        "1. 常识答疑与启发（自主思考模式）\n"
        "触发条件： 用户询问基础概念、通用常识、发散性问题，或进行日常互动（例如：“什么是算法？”、“帮我举个面向对象的例子”、“你好”）。\n"
        "执行动作： 充分发挥你的大语言模型能力，直接进行自主思考并给出通俗易懂的解答。语气要像真人导师，多用比喻和启发式的语言。\n\n"
        "2. 专业解析与教材溯源（检索模式）\n"
        "触发条件：用户针对专业课程内容提问，涉及特定讲义、教材细节、复杂公式原理，或你判断用户期望得到极其严谨的“官方解释”（例如：“讲义里提到的红黑树四大规则是什么？”、“教材上对事务隔离级别是怎么定义的？”）。\n"
        "执行动作：你必须主动调用 `search_knowledge_base` 工具（使用用户的具体问题）。获取资料后，基于捞取的数据切片进行分析总结。在回答时，必须明确引用或提及你所参考的资料内容（例如：“根据为你检索到的当前讲义……”），以确保学术严谨性和防幻觉。\n\n"
        "3. 学习规划与学情诊断（路径规划模式）\n"
        "触发条件：用户表达出学习上的迷茫、挫败感，或者明确要求提供学习方法与路径（例如：“我完全不懂这个知识点”、“接下来我该怎么学？”、“这门课怎么入门”）。\n"
        "执行动作：你必须调用 `recommend_plan` 工具，根据当前课程的拓扑结构，为用户挑选并推荐合适的后续学习节点（从推荐列表：'数据结构导论', '线性表与数组', '单链表基础', '栈与队列', '图论基础' 等选择1-3个），并提供切实有用的建议。"
    ),
    retries=3
)

@chat_agent.tool
async def recommend_plan(ctx: RunContext[AgentDeps], nodes: List[str], reason: str) -> str:
    """
    Call this tool to recommend a study path to the user when they need to learn specific topics.
    You MUST call this if the user asks for a path, or admits weakness in a topic.
    """
    ctx.deps.study_plan = StudyPlan(nodes=nodes, description=reason)
    return "Plan recorded. Continue your response to the user."

@chat_agent.tool
async def search_knowledge_base(ctx: RunContext[AgentDeps], query: str, node_id: Optional[str] = None) -> str:
    """
    Call this tool to search the local knowledge base (course documents, slides) for specific technical details.
    You MUST provide the 'node_id' if the user is currently studying a specific node.
    """
    import time
    from app.utils.telemetry import log_rag_metrics, log_thought
    import asyncio
    
    if not ctx.deps.chroma_client:
        return "Knowledge base is currently unavailable."
        
    await log_thought("Director", f"正在检索知识库以回答问题: {query}")
        
    try:
        start_t = time.perf_counter()
        collection = ctx.deps.chroma_client.get_collection("dsa")
        where_filter = {"node_id": node_id} if node_id else None
        
        results = collection.query(
            query_texts=[query],
            n_results=3,
            where=where_filter
        )
        end_t = time.perf_counter()
        
        if results and results["documents"] and len(results["documents"][0]) > 0:
            asyncio.create_task(log_rag_metrics(end_t - start_t, 0.92))
            docs = "\n\n---\n\n".join(results["documents"][0])
            return f"Retrieved Knowledge Base Context:\n{docs}"
            
        asyncio.create_task(log_rag_metrics(end_t - start_t, 0.0))
        return "No relevant documents found in the knowledge base."
    except Exception as e:
        asyncio.create_task(log_rag_metrics(0.0, 0.0))
        return f"Error retrieving from knowledge base: {e}"
