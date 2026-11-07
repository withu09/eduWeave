from app.utils.knowledge import context_for_deps
import inspect
from typing import List
from pydantic import BaseModel, Field
from pydantic_ai import Agent, RunContext
from app.agents.orchestrator import spark_model
from app.agents.deps import AgentDeps
from app.utils.telemetry import log_thought, set_agent_status

class Slide(BaseModel):
    title: str = Field(description="幻灯片标题")
    points: list[str] = Field(description="核心知识点列表（2-4句短语，适合放在PPT画面上）")
    speaker_script: str = Field(description="演讲者的详细逐字讲稿，必须口语化，适合直接用TTS朗读，不少于50字")

class Presentation(BaseModel):
    slides: list[Slide] = Field(description="幻灯片列表（建议3-6页）")

agent_kwargs = {
    "model": spark_model,
    "deps_type": AgentDeps,
    "retries": 3
}

init_sig = inspect.signature(Agent.__init__)
if "output_type" in init_sig.parameters:
    agent_kwargs["output_type"] = Presentation
else:
    agent_kwargs["result_type"] = Presentation

presenter_agent = Agent(**agent_kwargs)

@presenter_agent.system_prompt
async def get_presenter_prompt(ctx: RunContext[AgentDeps]) -> str:
    query_topic = ctx.deps.node_title if ctx.deps.node_title else "未知知识点"
    
    await set_agent_status("Presenter", "working")
    await log_thought("Presenter", f"正在检索 '{query_topic}' 的课程资料以准备生成微课...")
    
    rag_context = await context_for_deps(ctx.deps, query_topic)
        
    await log_thought("Presenter", f"知识点提取完毕，开始撰写【{query_topic}】微课逐字稿及幻灯片大纲...")
    
    return (
        f"你是一位经验丰富、声音富有感染力的金牌讲师。你的任务是将枯燥的知识点转化为一堂生动精彩的微课（PPT形式）。\n"
        "你必须立刻调用 final_result 工具返回结果。不要进行文本对话或询问。\n"
        f"本次微课的主题是：'{query_topic}'。\n"
        f"请基于以下知识库内容进行讲解：\n{rag_context}\n\n"
        "要求：\n"
        "1. 生成 3 到 6 页的幻灯片 (Slide)。\n"
        "2. 每页包含一个吸引人的 title。\n"
        "3. points 是放在屏幕上的重点短句（2-4条）。\n"
        "4. speaker_script 是你真实讲课时的口语化逐字稿，语气要自然、亲切，带有引导性。这个脚本将直接输入给 TTS 语音合成引擎朗读。每页的讲稿不少于50字。\n"
        "CRITICAL: 你的输出必须是严格合法的 JSON！对于长文本字段（如 speaker_script），必须使用正确的转义换行符 (\\\\n)，绝对不要在 JSON 字符串中输出真实的换行符（Raw literal newline characters），否则会导致解析崩溃！"
    )
