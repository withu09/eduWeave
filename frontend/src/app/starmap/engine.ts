// ===========================================================================
// 星图百科 · 后端接口
// ---------------------------------------------------------------------------
// 三种模式通过后端调用统一配置的模型服务，支持百炼或讯飞。
//   - 浏览器直连会暴露密钥并被 CORS 拦截，生产环境务必走
//     Supabase Edge Function 代理，由服务端持有 SPARK_API_KEY / DIFY_API_KEY。
//   - 下方每个 run* 函数即真实接口的替换点：保持签名不变，把 mock 体替换为
//     对 Edge Function 的 fetch + SSE 流式解析即可。
// ===========================================================================

import { profileRadar, recommendedResources, type RecommendedResource } from "../data";
import type { ConversationTurn } from "../conversation";
import { API_BASE } from "../config";

export type StarMode = "default" | "socratic" | "pro";

export const MODE_META: Record<StarMode, { label: string; sub: string; desc: string }> = {
  default: {
    label: "织星",
    sub: "知识速览 · learnanything",
    desc: "全能导师：一句话生成结构化课程（大纲/概念/小测/挑战）",
  },
  socratic: {
    label: "织星 · 苏格拉底",
    sub: "启发式学习 · 三智能体",
    desc: "绝不直接给答案：反问引导 → TDD 闯关 → 通关总结奖励",
  },
  pro: {
    label: "织星 Pro",
    sub: "知识网页 · 建站流水线",
    desc: "一句话生成可运行的学习网站：织网 → 织核 → 织皮 → 打开",
  },
};

// --- 意图提取（learnanything 的 4 变量）-----------------------------------
export interface LearnIntent {
  subject: string;
  audience: string; // 自动从画像系统推导
  duration: string;
  goal: string;
}

// 从画像雷达推导「受众」描述，无需用户输入。
export function deriveAudience(): string {
  const base = profileRadar.find((d) => d.dim === "知识基础")?.value ?? 50;
  const level = base < 50 ? "零基础" : base < 75 ? "有一定基础" : "进阶";
  const weak = [...profileRadar].sort((a, b) => a.value - b.value)[0]?.dim ?? "";
  return `${level}学习者（薄弱项：${weak}）`;
}

// TODO: 真实实现 — 后台静默调用一次星火，把 query 解析为 JSON 4 变量。
export async function extractIntent(query: string): Promise<LearnIntent> {
  await delay(500);
  const subject = query.replace(/(怎么|如何|学习|入门|教程|讲讲|是什么|\?|？)/g, "").trim() || query;
  return {
    subject: subject || "通用主题",
    audience: deriveAudience(),
    duration: "速成",
    goal: `能看懂并上手「${subject || query}」的核心概念`,
  };
}



// --- 默认模式：learnanything 结构化输出 ------------------------------------
export interface FollowUp {
  label: string;
  prompt: string;
}
export interface LearnModule {
  id: string;
  title: string;
  markdown: string;
  followUps: FollowUp[];
}
export interface DefaultResult {
  intent: LearnIntent;
  modules: LearnModule[];
}

export async function runDefaultMode(query: string, history: ConversationTurn[] = []): Promise<DefaultResult> {
  const res = await fetch(`${API_BASE}/api/starmap/default`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, history }),
  });
  if (!res.ok) {
    throw new Error(`Failed to run default mode: ${res.statusText}`);
  }
  return res.json();
}

// --- 苏格拉底模式：三智能体状态机 ------------------------------------------
export type SocraticStage = "inquire" | "tdd" | "synthesize";
export interface SocraticResult {
  stage: SocraticStage;
  agent: string;
  markdown: string;
  nextStage: SocraticStage;
}

export async function runSocraticMode(query: string, stage: SocraticStage, history: ConversationTurn[] = []): Promise<SocraticResult> {
  const res = await fetch(`${API_BASE}/api/starmap/socratic`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, stage, history }),
  });
  if (!res.ok) {
    throw new Error(`Failed to run socratic mode: ${res.statusText}`);
  }
  return res.json();
}

// --- Pro 模式：建站流水线 --------------------------------------------------
export interface ProStep {
  key: string;
  label: string;
  detail: string;
}
export interface ProResult {
  steps: ProStep[];
  siteTitle: string;
  html: string; // 生成的 index.html，前端用 iframe srcDoc 预览
}

export async function runProMode(query: string, history: ConversationTurn[] = []): Promise<ProResult> {
  const res = await fetch(`${API_BASE}/api/starmap/pro`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, history }),
  });
  if (!res.ok) {
    throw new Error(`Failed to run pro mode: ${res.statusText}`);
  }
  return res.json();
}

function buildMockSite(topic: string): string {
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${topic} · 织星学习站</title>
<style>
:root{--bg:#0b0d1a;--card:#161a2e;--accent:#8b7dff;--text:#e8ecff;--mut:#9aa0c8}
*{box-sizing:border-box;margin:0;font-family:system-ui,sans-serif}
body{background:var(--bg);color:var(--text)}
.hero{padding:64px 24px;text-align:center;background:radial-gradient(circle at 50% 0,rgba(139,125,255,.25),transparent 60%)}
.hero h1{font-size:38px;margin-bottom:12px}
.hero p{color:var(--mut)}
.stats{display:flex;gap:16px;justify-content:center;margin:32px 0;flex-wrap:wrap}
.stat{background:var(--card);border:1px solid #2a2f4a;border-radius:14px;padding:16px 24px}
.stat b{display:block;font-size:24px;color:var(--accent)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;padding:0 24px 48px}
.card{background:var(--card);border:1px solid #2a2f4a;border-radius:14px;padding:20px}
.card h3{color:var(--accent);margin-bottom:8px}
footer{text-align:center;padding:24px;color:var(--mut);border-top:1px solid #2a2f4a}
</style></head><body>
<section class="hero">
  <h1>${topic} 速通学习站</h1>
  <p>由织星 Pro 自动生成 · 原生 HTML/CSS/JS · LocalStorage 记录进度</p>
  <div class="stats">
    <div class="stat"><b>12</b>核心闪卡</div>
    <div class="stat"><b>8</b>随堂测验</div>
    <div class="stat"><b>4</b>章节</div>
  </div>
</section>
<section class="grid">
  <div class="card"><h3>第 1 章</h3><p>${topic} 是什么：核心定位与场景。</p></div>
  <div class="card"><h3>第 2 章</h3><p>基础概念与最小知识集。</p></div>
  <div class="card"><h3>第 3 章</h3><p>动手实践：第一个可运行示例。</p></div>
  <div class="card"><h3>第 4 章</h3><p>常见陷阱与进阶路线。</p></div>
</section>
<footer>织星 AI · EduWeave · ${topic} 学习站 © 2026</footer>
</body></html>`;
}

// --- 联网搜索（Dify 智能体 stub）------------------------------------------
// TODO: 真实实现 — 调用 Dify 工作流让 AI "长眼睛" 联网检索，返回结构化结果。
export async function runWebSearch(query: string): Promise<RecommendedResource[]> {
  await delay(700);
  return recommendedResources.map((r) => ({
    ...r,
    reason: `命中「${query}」· ${r.reason}`,
  }));
}

function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}
