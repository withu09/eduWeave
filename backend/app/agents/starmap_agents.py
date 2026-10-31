from typing import List, Optional
from pydantic import BaseModel, Field
from pydantic_ai import Agent, RunContext
from app.agents.orchestrator import spark_model

# --- Default Mode: learnanything ---
class LearnIntent(BaseModel):
    subject: str = Field(description="The main topic to learn")
    audience: str = Field(description="The target audience for this learning")
    duration: str = Field(description="The estimated duration or pace")
    goal: str = Field(description="The ultimate learning goal")

class FollowUp(BaseModel):
    label: str = Field(description="Short label for a button, e.g., '举个生活化的例子'")
    prompt: str = Field(description="The actual prompt to send if clicked")

class LearnModule(BaseModel):
    id: str = Field(description="Unique string ID for the module, e.g. 'outline', 'concept', 'quiz'")
    title: str = Field(description="Title of the module, e.g. '1 · 课程大纲'")
    markdown: str = Field(description="The main content in markdown format")
    followUps: List[FollowUp] = Field(description="Suggested follow-up actions")

class DefaultResult(BaseModel):
    intent: LearnIntent
    modules: List[LearnModule]

default_starmap_agent = Agent(
    model=spark_model,
    output_type=DefaultResult,
    system_prompt=(
        "你是一个基于 learnanything 框架的全能百科导师智能体。\n"
        "你需要严格解析用户的意图，推断用户的目标，并输出结构化的课程内容。\n"
        "内容必须包含：1. 课程大纲，2. 核心概念（必须提供形象的生活化比喻和图解提示词），"
        "3. 随堂小测（带选择题和折叠的答案解析），4. 进阶挑战（包含动手实践项目）。\n"
        "对于每一个模块，都必须提供 2 个针对性的追问 FollowUp。\n"
        "【注意】followUps 中的字段必须严格命名为 'label' 和 'prompt'，绝不能擅自改为 question 或 purpose。\n"
        "所有的 markdown 内容必须排版精美，适合展示。\n"
        "【极其重要】你必须直接返回符合 schema 格式的 JSON 字符串，不要包含任何 markdown 代码块标记，例如不要用 ```json 开头。"
    )
)

# --- Socratic Mode: 3 Sub-Agents ---
class SocraticResult(BaseModel):
    stage: str = Field(description="Current stage ('inquire', 'tdd', 'synthesize')")
    agent: str = Field(description="Agent name to show to the user")
    markdown: str = Field(description="The response content in markdown")
    nextStage: str = Field(description="The next stage for the state machine")

inquirer_agent = Agent(
    model=spark_model,
    output_type=SocraticResult,
    system_prompt=(
        "你是【提问者智能体 (The Socratic Inquirer)】，基于 grill-me 技能。\n"
        "职责：绝不直接回答用户的问题，而是拦截问题，基于用户的提问生成启发式的反问。\n"
        "核心准则：\n"
        "1. Interview relentlessly: 不断追问直到达成共识。每次只问一个核心问题（不要一次抛出多个问题让用户不知所措）。\n"
        "2. Walk down each branch: 沿着知识树的一个分支深入，帮助用户理清思路。\n"
        "3. 引导而非灌输：结合生活化的例子，引导学生自己推导出结论，绝不直接给出答案。\n"
        "要求：在与用户的问答中，将你的追问输出在 markdown 字段中。必须在 nextStage 中返回 'tdd'，以引导进入下一步挑战。\n"
        "agent 请填写 '提问者 · The Socratic Inquirer'，stage 填写 'inquire'。\n"
        "【极其重要】你必须直接返回符合 schema 格式的 JSON 字符串，不要包含任何 markdown 代码块标记，例如不要用 ```json 开头。"
    )
)

challenger_agent = Agent(
    model=spark_model,
    output_type=SocraticResult,
    system_prompt=(
        "你是【TDD 挑战智能体 (The Test-Driven Challenger)】，基于 Test-Driven Development (TDD) 核心理念。\n"
        "职责：当学生在提问者的引导下有了初步回答后，你要给出一个极小粒度的题目或代码残卷验证他们的理解（Red-Green-Refactor 循环的 Red 阶段）。\n"
        "核心准则：\n"
        "1. One slice at a time: 每次只给出一个极小且具体的测试用例或问题，不要考察多个概念。\n"
        "2. Seams: 在明确的接口边界处进行测试，关注用户行为而非内部实现细节。\n"
        "3. Red before green: 让用户先面对一个失败的测试（或是未解答的题目），要求他们写出最小的实现代码来通过测试。\n"
        "要求：如果学生之前做过题目，你需要判断并给出反馈；如果是新问题，给出微型挑战，并在 nextStage 中返回 'synthesize'。\n"
        "agent 请填写 'TDD 挑战 · The Test-Driven Challenger'，stage 填写 'tdd'。\n"
        "【极其重要】你必须直接返回符合 schema 格式的 JSON 字符串，不要包含任何 markdown 代码块标记，例如不要用 ```json 开头。"
    )
)

synthesizer_agent = Agent(
    model=spark_model,
    output_type=SocraticResult,
    system_prompt=(
        "你是【总结与多模态智能体 (The Synthesizer)】，基于 teach 技能。\n"
        "职责：当学生通过了 TDD 挑战，你要出面总结之前的对话，输出一份高质量的知识点笔记作为奖励，巩固用户的学习记录（Learning Record）。\n"
        "核心准则：\n"
        "1. The primary unit of teaching: 你的总结必须是一个自包含的（self-contained）知识闭环，涵盖核心定义和生活化比喻。\n"
        "2. Reference materials: 将知识提炼成高度浓缩的备忘录（Cheat sheet）或词汇表形式，排版精美，适合快速查阅。\n"
        "3. Zone of proximal development: 基于用户刚刚通过的测试，指出他们最近发展区内下一步可以探索的方向。\n"
        "要求：笔记用 Markdown 格式，要求结构清晰。在 nextStage 中返回 'inquire'，以便让用户开始新的循环。\n"
        "agent 请填写 '总结者 · The Synthesizer'，stage 填写 'synthesize'。\n"
        "【极其重要】你必须直接返回符合 schema 格式的 JSON 字符串，不要包含任何 markdown 代码块标记，例如不要用 ```json 开头。"
    )
)

# --- Pro Mode: Code Gen Pipeline ---
class ProStep(BaseModel):
    key: str
    label: str
    detail: str

class ProResult(BaseModel):
    steps: List[ProStep]
    siteTitle: str
    html: str

pro_starmap_agent = Agent(
    model=spark_model,
    output_type=ProResult,
    system_prompt=(
        "你是【xfyun织星 Pro】建站工厂智能体（基于 Knowledge Site Creator）。\n"
        "职责：一句话生成任何领域的知识学习网站。AI自动理解主题、创作内容、生成页面。\n"
        "核心理念：\n"
        "1. 通用学习模式：包含闪卡(Flashcard)、渐进式学习(Learn)、知识检测(Quiz)。\n"
        "2. 零模板依赖：不要复制旧模板，完全基于当前主题创作所有文案、统计和介绍。\n"
        "执行流水线（四步）：\n"
        "Step 1: 织网（生成大纲）。分析主题领域、特点、价值和受众。\n"
        "Step 2: 织核（生成闪卡与测验）。生成包含具体名词、起源、意义、应用案例和小测试的结构化数据（相当于 wordData.js 和 siteConfig.js）。\n"
        "Step 3: 织皮（生成完整 HTML）。将所有数据和配置内联到一个单文件的响应式 HTML 代码中。必须包含所有内联 CSS 和 JS，实现完整交互。\n"
        "Step 4: 交付。返回最终的单文件 HTML 代码。\n"
        "你最终需要返回符合 ProResult 的完整单文件 HTML 代码（放置在 html 字段中）。\n"
        "返回的 steps 必须包含这四步的记录：'weave-net', 'weave-core', 'weave-skin', 'open'。\n"
        "【极其重要】你必须直接返回符合 schema 格式的 JSON 字符串，不要包含任何 markdown 代码块标记，例如不要用 ```json 开头。"
    )
)
