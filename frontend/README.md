# Frontend — EduWeave AI

React 18 + TypeScript + Vite 6 + Tailwind CSS 4。

---

## 启动

```bash
npm install
npm run dev
```

默认地址 <http://localhost:5173>

**构建**

```bash
npm run build      # 产物在 dist/
```

**后端地址**

在 `frontend/.env.local` 中配置：

```ini
VITE_API_URL=http://localhost:8000
```

---

## 目录

| 路径 | 说明 |
| --- | --- |
| `src/main.tsx` | React 入口，挂载 `<App />` |
| `src/app/App.tsx` | 根组件：`view` 状态驱动的视图切换、全局数据拉取 |
| `src/app/store.ts` | Zustand 全局状态（当前视图、知识树、星图数据、SSE 连接） |
| `src/app/data.ts` | 静态 mock 数据（资源推荐、画像雷达数据等） |
| `src/app/starmap/engine.ts` | 星图百科前端引擎：意图抽取、三种模式、类型化输出 |
| `src/app/pages/admin/KnowledgeBase.tsx` | 知识库管理后台 |
| `src/app/components/` | 业务视图组件 |
| `src/app/components/ui/` | Radix UI 原子组件封装（shadcn 风格） |
| `src/app/hooks/useTypewriter.ts` | 打字机效果 |
| `src/hooks/useRobustWebSocket.ts` | 带重连的 WebSocket Hook |
| `src/store/` | 分域状态：`adaptiveStore`（自适应学习）、`consoleStore`（控制台） |
| `src/styles/` | `theme.css`（亮/暗双主题 CSS 变量）、`index.css`、`tailwind.css`、`fonts.css` |
| `default_shadcn_theme.css` | shadcn 默认主题参考 |
| `vite.config.ts` | Vite 配置（React/Tailwind 插件、`@` 别名、`figma:asset/` 解析） |

---

## 视图一览

| view | 组件 | 说明 |
| --- | --- | --- |
| `canvas` | `CanvasFrame` → `PannableCanvas` + `ConstellationMap` | 知识星图画布，支持无限平移缩放，节点悬停预览 |
| `adaptive` | `AdaptiveView` | 自适应学习路径：薄弱点触发的动态学习建议 |
| `notes` | `NotesView` | 笔记 / 知识图谱 / 标签三个 Tab |
| `community` | `CommunityView` | 社区帖子，localStorage 持久化 |
| `starmap` | `StarMapView` | 星图百科，ChatGPT 式对话布局，含三模式切换与内嵌浏览器 |
| `console` | `ConsoleView` | 智能体控制台：Agent 状态矩阵、Token 消耗柱状图、思维链流 |

### 全局组件

| 组件 | 说明 |
| --- | --- |
| `Sidebar.tsx` | 桌面端导航 |
| `SettingsDrawer.tsx` | 设置抽屉（主题 / API 配置） |
| `CopilotDrawer.tsx` | 全局 AI 助手侧栏 |
| `ResourceCards.tsx` | 节点聚合资源卡（文档/地图/测验/视频/代码 五类） |
| `RadarModule.tsx` / `ProfileRadar.tsx` | 六维学情雷达图（Recharts） |
| `Markdown.tsx` | Markdown + LaTeX 渲染（react-markdown + remark-math + rehype-katex） |
| `MermaidRenderer.tsx` | Mermaid 图谱渲染 |
| `CodeRenderer.tsx` | 代码高亮渲染 |
| `QuizRenderer.tsx` | 测验交互 |
| `PresentationRenderer.tsx` | 演示文稿渲染 |
| `InlineBrowser.tsx` | iframe 内嵌浏览器（Pro 模式预览） |
| `Starfield.tsx` | 星空背景 |

---

## 技术要点

**路由方式** — 不使用 react-router，由 `App.tsx` 的 `view` state 手动切换，配合 `Sidebar` 与移动端 `MobileNav`。

**样式** — Tailwind CSS 4 + CSS 变量双主题。颜色统一用 `var(--*)` token，明暗模式通过 `theme.css` 中的 `.dark` 覆盖。

**Markdown / 公式** — `components/Markdown.tsx` 支持 GFM 表格、LaTeX（KaTeX）、代码块；依赖已加入 `optimizeDeps.include` 以保证 HMR 稳定。

**图表** — Recharts 负责雷达图与柱状图；Mermaid 负责流程/时序/甘特等图谱。

**WebSocket** — `hooks/useRobustWebSocket.ts` 提供断线重连；控制台与任务进度各自订阅。

**持久化** — 社区帖子、笔记、星图会话等存 localStorage，key 形如 `eduweave_community_posts`、`eduweave_starmap_chats`。

---

## 已知问题

部分文件的接口地址仍为硬编码 `http://localhost:8000`，未走 `VITE_API_URL`：

- `src/app/App.tsx`
- `src/app/store.ts`
- `src/app/pages/admin/KnowledgeBase.tsx`

部署到非本地环境时需一并修改。
