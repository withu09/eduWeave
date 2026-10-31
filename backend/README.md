# Backend — EduWeave AI

FastAPI + PydanticAI 多智能体后端。

---

## 启动

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

接口文档：<http://localhost:8000/docs>

---

## 目录

| 路径 | 职责 |
| --- | --- |
| `main.py` | 应用入口：路由注册、SSE 对话流、WebSocket、lifespan 初始化（Chroma 种子 + Dify 轮询） |
| `Dockerfile` | API 服务镜像（python:3.10-slim） |
| `Dockerfile.worker` | Celery Worker 镜像（额外装 ffmpeg / cairo / pango） |
| `requirements.txt` | Python 依赖 |

### app/core

| 文件 | 说明 |
| --- | --- |
| `config.py` | `Settings`：讯飞凭据、Redis、Chroma 配置，全部从环境变量读取 |

### app/agents

| 文件 | Agent | 输出模型 |
| --- | --- | --- |
| `orchestrator.py` | 模型构造 + `SparkCompatTransport` 兼容层 | `StudyPlan` |
| `chat.py` | 学习导师对话主循环 | 流式文本 |
| `profiler.py` | 学情画像抽取 | `StudentProfile` |
| `writer.py` | 讲义 + Mermaid 图谱 | `WriterOutput` |
| `examiner.py` | 测验题生成 | `ExaminerOutput` |
| `coder.py` | 代码任务生成 | `CodeTask` |
| `presenter.py` | 演示文稿生成 | `Slide[]` |
| `media.py` | Manim 动画脚本 | `MediaOutput` |
| `resource_agent.py` | 学习资源推荐 | `ResourceList` |
| `starmap_agents.py` | 星图百科三种模式 | `DefaultResult` / `SocraticResult` / `ProResult` |
| `deps.py` | `AgentDeps` 依赖注入载体 | — |
| `tasks.py` | Celery 应用与重任务定义 | — |
| `micro_agent.py` | 轻量 Agent 辅助 | — |

### app/routers

| 文件 | 前缀 | 接口数 |
| --- | --- | --- |
| `kb.py` | `/api/kb` | 19（知识树、增删改、上传下载、内容生成、星图） |
| `starmap.py` | `/api/starmap` | 3（default / socratic / pro） |
| `tts.py` | `/api/tts` | 1（synthesize） |

### app 其他

| 路径 | 说明 |
| --- | --- |
| `schemas/profile.py` | `StudentProfile`、`CourseTopic` |
| `schemas/resource.py` | `ResourceList` |
| `db/models.py` | SQLAlchemy 模型（课程 / 模块 / 节点 / 资源） |
| `db/database.py` | 引擎与 Session 工厂 |
| `services/tts.py` | 讯飞 TTS 鉴权签名与 WebSocket 流式封装 |
| `utils/dify_client.py` | Dify 数据集 API 客户端（密钥读环境变量） |
| `utils/kb_db.py` | 知识库本地持久化与 Dify 同步 |
| `utils/telemetry.py` | Redis Pub/Sub 遥测（状态 / Token / 思维链） |
| `utils/task_manager.py` | 任务管理辅助 |
| `resources/` | 种子讲义（`*_guide.md`）与生成产物（`generated_*.json`） |

---

## 环境变量

见上级目录 [`.env.example`](../.env.example)。后端必需项：

```ini
XUNFEI_SPARK_APP_ID=
XUNFEI_SPARK_API_KEY=
XUNFEI_SPARK_API_SECRET=
REDIS_URL=redis://localhost:6390/0
CHROMA_HOST=localhost
CHROMA_PORT=8001
DATABASE_URL=postgresql+psycopg2://postgres:password@localhost:5432/eduweave
```

---

## 手工联调脚本

`test_*.py` 不是自动化测试，需在后端运行且凭据有效时直接执行：

```bash
python test_chat_agent.py
python test_spark_stream.py
```

---

## 关键实现说明

**Spark 兼容层** — `orchestrator.py` 的 `SparkCompatTransport` 拦截讯飞响应，补齐 OpenAI 协议字段后再交给 PydanticAI，使星火可以像标准 OpenAI 模型一样使用。

**降级** — 所有 Agent 调用均有 `try/except`；Chroma 初始化失败时 `chroma_client=None`，检索走 mock。

**启动钩子** — `lifespan` 中做三件事：Chroma collection 种子填充、首次 Dify 同步、启动 30s 轮询协程。
