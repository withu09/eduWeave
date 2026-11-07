# API 接口

> Base URL：`http://localhost:8000` · 交互式文档：<http://localhost:8000/docs>

---

## 目录

- [学习对话](#一学习对话)
- [知识库管理](#二知识库管理)
- [星图百科](#三星图百科)
- [语音合成](#四语音合成)
- [智能体控制台](#五智能体控制台)
- [异步任务](#六异步任务)

---

## 一、学习对话

### POST /api/chat（多轮对话）

请求体使用 JSON，当前问题与之前的对话分开传递：

```json
{
  "user_input": "我刚才的学习目标是什么？",
  "history": [
    {"role": "user", "content": "我想学习单链表"},
    {"role": "assistant", "content": "我们可以从节点和指针开始。"}
  ]
}
```

历史只允许 `user` 和 `assistant` 两种角色。每条内容最多 8,000 字符，请求最多接受 40 条历史；后端取最近 20 条、总计不超过 24,000 字符，按原角色传给画像和对话智能体。当前问题不要重复放进 `history`。后端不把一位用户的请求历史保存到全局状态。

返回沿用下方的流式事件格式。星图百科的 `/default`、`/socratic`、`/pro` 同样支持该 `history` 字段；旧苏格拉底请求中的 `text` 字段仍兼容。

### GET /api/chat

兼容旧客户端的单轮学习对话，不携带历史。多轮客户端请使用上方 POST 接口。SSE 响应，前缀决定事件语义。

**Query 参数**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `user_input` | string | 是 | 用户的学习诉求 |

**响应类型** `text/event-stream`

| 前缀 | 载荷 | 说明 |
| --- | --- | --- |
| `0` | `"状态文本"` | 处理阶段提示 |
| `1` | `{chunk}` | 对话内容增量 |
| `9` | `{nodes, description}` | 学习路径节点，触发星图渲染 |

**示例**

```bash
curl -N "http://localhost:8000/api/chat?user_input=我想学习C语言指针"
```

```
0:"Analyzing your request..."
0:"Profile updated. Weaknesses: ['指针基础']"
1:{"content":"好的，我们从指针的内存模型开始..."}
9:{"nodes":[{"title":"指针概念","level":1}],"description":"从内存寻址入门"}
0:"Docs generated."
```

---

### GET /api/resources

推荐学习资源。

**Query 参数**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `course` | string | 是 | 课程主题 |
| `exclude` | string | 否 | 需要排除的资源 ID（逗号分隔） |

**响应**

```json
{
  "resources": [
    { "id": "r1", "title": "...", "source": "...", "reason": "...", "url": "..." }
  ]
}
```

---

## 二、知识库管理

### 知识树

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/kb/tree` | 获取课程 → 模块 → 节点三级树 |
| PATCH | `/api/kb/tree/{node_type}/{node_id}` | 重命名节点（`node_type`：`course`/`module`/`node`） |
| DELETE | `/api/kb/tree/{node_type}/{node_id}` | 删除节点及其子树 |
| POST | `/api/kb/sync` | 手动触发 Dify 同步 |

### 增删改

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/kb/courses` | 创建课程 |
| POST | `/api/kb/modules` | 创建模块 |
| POST | `/api/kb/nodes` | 创建知识点 |
| POST | `/api/kb/upload` | 上传资源文件（multipart） |
| GET | `/api/kb/download/{resource_id}` | 下载资源文件 |
| DELETE | `/api/kb/resources/{course_id}/{node_id}/{document_id}` | 删除资源文件 |
| GET | `/api/kb/resources/{node_id}` | 查询节点关联的资源 |

### 内容生成

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/kb/mermaid/{node_id}` | 节点的 Mermaid 知识图谱 |
| GET | `/api/kb/quiz/{node_id}` | 节点的测验题 |
| POST | `/api/kb/quiz/{node_id}/more` | 追加测验题 |
| GET | `/api/kb/code/{node_id}` | 节点的代码任务 |
| GET | `/api/kb/presentation/{node_id}` | 节点的演示文稿 |

### 星图数据

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/kb/starmap/all` | 全部课程的星图数据 |
| GET | `/api/kb/starmap/{course_id}` | 指定课程的星图数据 |

---

## 三、星图百科

Router 前缀 `/api/starmap`，实现见 `app/routers/starmap.py`。

| 方法 | 路径 | 模式 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/starmap/default` | 默认速览 | 快速生成主题大纲卡片 + 追问提示 |
| POST | `/api/starmap/socratic` | 苏格拉底 | 多轮追问引导，模拟对话式教学 |
| POST | `/api/starmap/pro` | Pro 流水线 | 四步深度流水线 + 生成页面预览 |

**请求体**

```json
{
  "input": "线性代数",
  "history": [ { "role": "user", "content": "..." } ],
  "profile": { "weaknesses": [], "goals": [] }
}
```

**响应体**

```json
{ "content": "...", "followups": ["继续", "换个例子"], "meta": {} }
```

> 三种模式的实现位于 `app/agents/starmap_agents.py`，前端 mock 引擎在 `frontend/src/app/starmap/engine.ts`。

---

## 四、语音合成

### POST /api/tts/synthesize

调用讯飞超拟人语音合成。

**请求体**

```json
{
  "text": "要朗读的文本",
  "voice": "x6_huanlemianbao_pro"
}
```

**响应**

```
audio/mpeg  (二进制流)
```

签名逻辑见 `app/services/tts.py`，使用 HMAC-SHA256 对 `host date request-line` 计算 `authorization_origin`。

---

## 五、智能体控制台

| 方法/路径 | 说明 |
| --- | --- |
| GET `/api/console/ws` | WebSocket，订阅 Redis Pub/Sub 的 `agent_telemetry` 频道并实时转发 |
| POST `/api/console/kill` | 终止当前正在运行的 Agent 任务 |

**WebSocket 消息格式**

```json
{
  "agent": "Profiler",
  "status": "working",
  "tokens": 500,
  "thought": "正在识别薄弱知识点..."
}
```

心跳：客户端发送 `"ping"`，服务端回 `"pong"`。

---

## 六、异步任务

### WS /ws/tasks/{task_id}

Celery 任务进度推送。

**消息格式**

| state | 载荷 | 说明 |
| --- | --- | --- |
| `PROGRESS` | `{info}` | 进度信息 |
| `SUCCESS` | `{result}` | 最终结果 |
| `FAILED` | `{info}` | 错误信息（含 `REVOKED`） |

轮询间隔 0.5 秒，任务终态后连接自动关闭。

---

## 错误约定

| 状态码 | 含义 |
| --- | --- |
| 200 | 成功 |
| 400 | 请求参数错误 |
| 404 | 资源不存在（课程 / 模块 / 节点 / 资源） |
| 422 | 请求体校验失败（FastAPI 自动） |
| 500 | 服务端异常；Agent 失败通常仍返回 200 并在流中携带错误文本 |

> 后端目前 CORS 开放为 `*`，上线前应收敛为域名白名单。
