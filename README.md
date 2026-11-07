# EduWeave AI（织星 AI）

> 面向学习者的 AI 学习导航系统 —— 用对话驱动学情画像、知识图谱与个性化学习路径。

本地运行已支持 **阿里云百炼通用模型 API**（北京地域、`deepseek-v4.1-flash-1017`）。首次使用请先阅读 [本地运行说明.md](本地运行说明.md)，配置 `bailian.env.example` → `.env.bailian`，然后运行 `docker compose --env-file .env.bailian up -d --build`。原讯飞接入保留，可通过 `LLM_PROVIDER` 选择。

百炼通用资源包是否抵扣取决于模型、地域与有效期；Coding Plan 编程套餐不适用于应用后端。语音服务仍单独使用讯飞，视频任务仍为模拟实现。

EduWeave AI 把「问一句」变成「一条学习路径」：用户以自然语言描述学习目标后，后端多智能体流水线会实时抽取学情画像、检索知识库、生成学习路径与配套的讲义 / 题目 / 代码 / 演示文稿，前端以「星图」可视化呈现整棵知识网络。

---

## 目录

- [核心能力](#核心能力)
- [技术栈](#技术栈)
- [系统架构](#系统架构)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [环境变量](#环境变量)
- [API 一览](#api-一览)
- [多智能体流水线](#多智能体流水线)
- [文档索引](#文档索引)
- [交接须知](#交接须知)

---

## 核心能力

| 能力 | 说明 | 主要入口 |
| --- | --- | --- |
| AI 学习对话 | 携带同一会话历史，SSE 流式回复 | `POST /api/chat` |
| 学情画像 | 从对话中实时抽取知识点掌握度与薄弱项 | Profiler Agent |
| 学习路径规划 | 将目标拆解为有序知识节点 | Chat Agent → `recommend_plan` |
| 知识库管理 | 课程 / 模块 / 节点三级树，Dify 双向同步 | `/api/kb/*` |
| 星图知识网络 | 节点、连线、悬停预览的知识图谱 | `GET /api/kb/starmap/*` |
| 多形态内容生成 | 讲义(Markdown+Mermaid)、测验、代码、演示文稿 | Writer / Examiner / Coder / Presenter |
| 语音朗读 | 讯飞超拟人流式 TTS | `POST /api/tts/synthesize` |
| 星图百科 | 三种模式：默认速览 / 苏格拉底追问 / Pro 深度流水线 | `/api/starmap/*` |
| 智能体控制台 | 实时查看各 Agent 状态、Token 消耗与思维链 | `/api/console/ws` |
| 异步任务 | Celery 任务队列 + WebSocket 进度推送 | `/ws/tasks/{task_id}` |

---

## 技术栈

**后端** — Python 3.10 · FastAPI · [PydanticAI](https://ai.pydantic.dev/) 0.8 · Uvicorn · ChromaDB · Redis · Celery · SQLAlchemy · OpenTelemetry

**前端** — React 18.3 · TypeScript · Vite 6 · Tailwind CSS 4 · Radix UI · Zustand · Mermaid · Recharts · KaTeX · Motion

**外部服务** — 阿里云百炼 / 讯飞星火（可选模型后端）· 讯飞超拟人 TTS（独立可选服务）· Dify（知识库数据集，可选）

---

## 系统架构

```
┌──────────────────────────────────────────────────────────────┐
│  前端 React + Vite  (frontend/src)                            │
│  ┌────────────┬────────────┬────────────┬────────────────┐  │
│  │  星图 Canvas│  学习对话   │  知识库后台 │  智能体控制台   │  │
│  └────────────┴────────────┴────────────┴────────────────┘  │
└───────────────┬──────────────────────────┬───────────────────┘
                │ HTTP / SSE / WebSocket   │ WebSocket
┌───────────────▼──────────────────────────▼───────────────────┐
│  后端 FastAPI  (backend/main.py + backend/app)                │
│                                                               │
│  routers/        kb.py  starmap.py  tts.py                    │
│  ─────────────────────────────────────────────                │
│  agents/         orchestrator → chat → profiler              │
│                  writer / coder / examiner / presenter        │
│                  resource_agent / media / micro_agent         │
│  ─────────────────────────────────────────────                │
│  utils/          dify_client  kb_db  telemetry  task_manager │
└──────┬────────────────┬───────────────────┬──────────────────┘
       │                │                   │
  ┌────▼─────┐   ┌──────▼──────┐    ┌───────▼────────┐
  │  ChromaDB │   │    Redis     │    │  讯飞星火 / TTS  │
  │  向量检索  │   │ 遥测 + 队列  │    │  Dify 知识库    │
  └──────────┘   └─────────────┘    └────────────────┘
```

### 关键设计

**1. Spark 兼容层** — `app/agents/orchestrator.py` 中的 `SparkCompatTransport` 继承 `httpx.AsyncHTTPTransport`，拦截并改写讯飞星火的响应体（补齐 `id`/`object`/`model` 字段、转换 SSE 事件格式），使其能直接被 PydanticAI 的 OpenAI provider 消费。

**2. Agent 依赖注入** — `AgentDeps` 数据类承载 `chroma_client` / `student_profile` / `study_plan`，在多个 Agent 间共享同一轮对话的上下文，避免重复抽取画像。

**3. 流式协议** — `GET /api/chat` 返回 SSE，事件前缀决定语义：
- `0:` 状态文本（"正在分析你的请求…"）
- `1:` 对话内容增量
- `9:` 学习路径节点（触发前端渲染星图）

**4. 遥测闭环** — `app/utils/telemetry.py` 将 Agent 状态与 Token 消耗写入 Redis Pub/Sub，控制台 WebSocket 订阅后实时推给前端。

---

## 项目结构

```
eduweave/
├── .env.example              # 环境变量模板（复制为 .env 后填入密钥）
├── .gitignore
├── docker-compose.yml        # Redis / Chroma / Postgres / API / Worker / Frontend
├── README.md
├── 部署说明.md                # 部署指南与交接清单
├── docs/
│   ├── 架构设计.md
│   ├── API接口.md
│   └── 开发指南.md
├── backend/
│   ├── main.py               # FastAPI 入口：路由注册 + SSE + WebSocket
│   ├── requirements.txt
│   ├── Dockerfile             # API 服务
│   ├── Dockerfile.worker      # Celery Worker
│   └── app/
│       ├── core/config.py     # 环境变量配置
│       ├── agents/            # 多智能体定义（见下表）
│       ├── routers/           # kb / starmap / tts
│       ├── schemas/           # Pydantic 数据模型
│       ├── db/                # SQLAlchemy 模型与连接
│       ├── services/tts.py    # 讯飞 TTS 签名与流式封装
│       ├── utils/             # dify_client / kb_db / telemetry / task_manager
│       └── resources/         # 种子讲义与生成产物
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── Dockerfile
    └── src/
        ├── main.tsx
        ├── app/
        │   ├── App.tsx        # 根组件与视图路由
        │   ├── store.ts       # Zustand 全局状态
        │   ├── data.ts        # 静态 mock 数据
        │   ├── starmap/engine.ts
        │   ├── pages/admin/KnowledgeBase.tsx
        │   └── components/    # 各视图与 UI 原子组件
        ├── hooks/
        ├── store/
        └── styles/
```

### Agent 清单

| Agent | 文件 | 职责 | 输出 |
| --- | --- | --- | --- |
| Orchestrator | `agents/orchestrator.py` | 构造 `spark_model`、Spark 兼容传输层、`StudyPlan` 模型 | — |
| Chat | `agents/chat.py` | 学习导师对话主循环，调用 `recommend_plan` 工具 | 流式文本 + 学习计划 |
| Profiler | `agents/profiler.py` | 从对话抽取学情画像 | `StudentProfile` |
| Writer | `agents/writer.py` | 生成讲义正文与 Mermaid 知识图谱 | `{markdown, mermaid_schema}` |
| Examiner | `agents/examiner.py` | 生成选择题测验 | `QuizQuestion[]` |
| Coder | `agents/coder.py` | 生成代码练习任务 | `CodeTask` |
| Presenter | `agents/presenter.py` | 生成演示文稿幻灯片 | `Slide[]` |
| Resource | `agents/resource_agent.py` | 推荐优质学习资源 | `ResourceList` |
| Media | `agents/media.py` | 生成 Manim 动画脚本 | `{manim_script, narration}` |
| StarMap | `agents/starmap_agents.py` | 星图百科三种模式 | `DefaultResult` / `SocraticResult` / `ProResult` |

---

## 快速开始

### 方式一：Docker Compose（推荐）

百炼用户请使用上方的“本地运行说明”；下列 `.env` 命令用于原讯飞配置。百炼运行时始终带 `--env-file .env.bailian`，以隔离交接包中的旧凭据。数据库缺失表会在启动时创建；百炼本机配置还会向空数据库添加示例课程。

```bash
# 1. 准备配置
cp .env.example .env
# 编辑 .env，填入讯飞 / Dify 密钥

# 2. 启动全部服务
docker compose up -d --build

# 3. 访问
#    前端   http://localhost:5173
#    后端   http://localhost:8000
#    文档   http://localhost:8000/docs
```

### 方式二：本地开发

**后端**（需要 Python 3.10+）：

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate     Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt

uvicorn main:app --reload --port 8000
```

**前端**（需要 Node.js 22+）：

```bash
cd frontend
npm install
npm run dev
# 前端启动在 http://localhost:5173
```

> **说明**：单独启动前端时需要后端的 Redis / ChromaDB 可访问，否则部分功能会降级；
> 知识库同步、向量检索、遥测控制台依赖这些中间件。完整依赖用 `docker compose up redis chroma postgres` 单独拉起即可。

---

## 环境变量

完整清单见 [`.env.example`](.env.example)。关键项：

| 变量 | 说明 | 是否必需 |
| --- | --- | --- |
| `LLM_PROVIDER` | `bailian` / `xunfei`，选择所有智能体使用的模型服务 | ✅ 必需 |
| `DASHSCOPE_API_KEY` | 百炼通用模型 API Key | 使用百炼时必需 |
| `DASHSCOPE_BASE_URL / DASHSCOPE_MODEL` | 对应地域接口地址 / 模型名（本机为北京、`deepseek-v4.1-flash-1017`） | 使用百炼时配置 |
| `XUNFEI_SPARK_APP_ID / API_KEY / API_SECRET` | 讯飞星火大模型凭据 | 使用讯飞时必需 |
| `XUNFEI_TTS_APP_ID / API_KEY / API_SECRET` | 讯飞语音合成凭据 | ⚠️ TTS 功能必需 |
| `XUNFEI_TTS_ENDPOINT` | TTS 专属 WebSocket 端点 | ⚠️ TTS 功能必需 |
| `DIFY_API_KEY` | Dify 数据集 API Key，用于知识库同步 | ⚠️ 同步功能必需 |
| `REDIS_URL` | Redis 连接串（遥测 + Celery broker） | ✅ 必需 |
| `CHROMA_HOST / CHROMA_PORT` | ChromaDB 向量库地址 | ✅ 必需 |
| `DATABASE_URL` | PostgreSQL 连接串 | ✅ 必需 |
| `VITE_API_URL` | 前端访问的后端地址 | ✅ 必需 |
| `PROFILE_EXTRACTION_MODE` | `llm`（真实模型）/ `rule`（规则兜底） | 可选 |

> 🔐 **所有密钥只从环境变量读取。** 代码中不得出现明文凭据；提交前请确认 `.env` 已被 `.gitignore` 忽略。

---

## API 一览

完整说明见 [docs/API接口.md](docs/API接口.md)。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/chat` | 携带 `user_input` 与 `history` 的多轮流式对话 |
| GET | `/api/chat?user_input=` | 兼容旧客户端的单轮流式对话 |
| GET | `/api/resources?course=` | 推荐学习资源 |
| GET | `/api/kb/tree` | 知识库三级树 |
| PATCH | `/api/kb/tree/{node_type}/{node_id}` | 重命名节点 |
| DELETE | `/api/kb/tree/{node_type}/{node_id}` | 删除节点 |
| POST | `/api/kb/sync` | 手动触发 Dify 同步 |
| POST | `/api/kb/courses` · `/modules` · `/nodes` | 创建课程 / 模块 / 节点 |
| POST | `/api/kb/upload` | 上传知识库资料 |
| GET | `/api/kb/download/{resource_id}` | 下载资料 |
| DELETE | `/api/kb/resources/{course_id}/{node_id}/{document_id}` | 删除资料 |
| GET | `/api/kb/resources/{node_id}` | 节点关联资源 |
| GET | `/api/kb/starmap/all` · `/{course_id}` | 星图数据 |
| GET | `/api/kb/mermaid/{node_id}` | Mermaid 图谱 |
| GET | `/api/kb/quiz/{node_id}` | 节点测验 |
| POST | `/api/kb/quiz/{node_id}/more` | 追加题目 |
| GET | `/api/kb/code/{node_id}` | 代码任务 |
| GET | `/api/kb/presentation/{node_id}` | 演示文稿 |
| POST | `/api/starmap/default` · `/socratic` · `/pro` | 星图百科三种模式 |
| POST | `/api/tts/synthesize` | 语音合成 |
| POST | `/api/console/kill` | 终止当前 Agent 任务 |
| WS | `/api/console/ws` | 智能体状态实时推送 |
| WS | `/ws/tasks/{task_id}` | Celery 任务进度 |

---

## 多智能体流水线

一次 `/api/chat` 请求的完整链路：

```
用户输入
   │
   ├─▶ Profiler Agent ──▶ StudentProfile（掌握度 / 薄弱项 / 学习目标）
   │
   └─▶ Chat Agent（流式）──┬─▶ 对话文本 ─────────────────▶ SSE 事件 `1:`
                          │
                          └─▶ recommend_plan 工具
                                 │
                                 ├─▶ StudyPlan.nodes ──▶ SSE 事件 `9:` ──▶ 前端渲染星图
                                 │
                                 └─▶ Writer Agent ──▶ 讲义 + Mermaid ──▶ app/resources/generated_docs.json
```

**独立调用链**（由知识库节点按需触发）：Examiner（测验）· Coder（代码）· Presenter（演示文稿）· Media（动画）· Resource（资源推荐）。

**降级策略**：任一 Agent 抛错时不会中断整条链路 —— Profiler 回落到空画像，Chat 返回错误提示文本，Writer 静默跳过。每个 Agent 的调用都包裹了 `try/except` 并有 mock 兜底数据。

---

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [README.md](README.md) | 项目总览（当前文件） |
| [部署说明.md](部署说明.md) | 部署指南、端口规划、交接清单 |
| [docs/架构设计.md](docs/架构设计.md) | 分层架构、Agent 协作、数据流 |
| [docs/API接口.md](docs/API接口.md) | 全部接口的请求/响应说明 |
| [docs/开发指南.md](docs/开发指南.md) | 本地开发、调试、扩展 Agent 的方法 |
| [backend/README.md](backend/README.md) | 后端模块索引 |
| [frontend/README.md](frontend/README.md) | 前端组件与视图说明 |

---

## 交接须知

移交后请先完成这三步：

1. **轮换密钥** —— 原仓库历史中曾包含明文凭据，务必在讯飞控制台与 Dify 后台重新生成 Key，并填入本地 `.env`。
2. **重建索引** —— 克隆后按 [快速开始](#快速开始) 安装依赖；`node_modules` 与 `.venv` 已不再随仓库分发。
3. **核对中间件** —— Redis / ChromaDB / PostgreSQL 三者缺一，会导致遥测、知识库或任务队列不可用。

详细清单见 [部署说明.md](部署说明.md) 的「交接检查清单」。

---

## 许可

源码仅供团队内部与赛事评审使用。

参赛部署、测试与作品提交流程见 [参赛完整指南.md](参赛完整指南.md)。
