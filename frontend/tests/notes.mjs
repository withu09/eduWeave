import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const port = Number(process.env.EDUWEAVE_TEST_PORT || 8767);
const base = `http://127.0.0.1:${port}`;
const root = fileURLToPath(new URL("../../", import.meta.url));
const output = new URL("../../.local-build/notes-browser/", import.meta.url);
await mkdir(output, { recursive: true });
const server = spawn(process.env.EDUWEAVE_TEST_PYTHON || "python", ["-u", "backend/tests/community_server.py", "--port", String(port)], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
server.stdout.on("data", chunk => { serverLog += chunk; });
server.stderr.on("data", chunk => { serverLog += chunk; });
server.on("error", error => { serverLog += error.message; });
let browser;

const body = [
  "行内公式 $E = mc^2$，以及 " + String.raw`\(\frac{dQ}{dP}\)` + "。",
  String.raw`\[\int_0^1 x^2\,dx = \frac{1}{3}\]`,
  "$$" + Array.from({ length: 22 }, (_, index) => String.raw`\frac{x_{${index}}^2 + 1}{y_{${index}} + 2}`).join(" + ") + "$$",
  "```latex\n" + String.raw`\(这行作为代码保留\)` + "\n```",
].join("\n\n");
const note = { id: "math-regression", title: "公式显示回归检查", excerpt: body, chapter: "数学基础", date: "2026-11-08", tags: ["公式"] };

try {
  for (let attempt = 0; ; attempt++) {
    if (server.exitCode !== null || attempt >= 100) throw new Error(`Notes test server failed: ${serverLog}`);
    try { if ((await (await fetch(base + "/api/health")).json()).isolated_community_test) break; } catch { /* Wait for startup. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true, ...(process.env.EDUWEAVE_TEST_BROWSER ? { channel: process.env.EDUWEAVE_TEST_BROWSER } : {}) });
  const context = await browser.newContext({ viewport: { width: 1365, height: 1000 } });
  await context.addInitScript(value => { if (!localStorage.getItem("eduweave_notes")) localStorage.setItem("eduweave_notes", JSON.stringify([value])); }, note);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base);
  await page.getByRole("button", { name: /学习笔记管理/ }).click();
  const card = page.locator('[data-note-id="math-regression"]');
  await card.locator(".katex").first().waitFor();
  assert.equal(await card.locator(".katex").count(), 4);
  assert.equal(await card.locator(".katex-error").count(), 0);
  assert.ok((await card.locator("pre code").innerText()).includes(String.raw`\(这行作为代码保留\)`));
  await page.getByRole("button", { name: `阅读全文：${note.title}`, exact: true }).click();
  const reader = page.getByRole("dialog", { name: note.title, exact: true });
  await reader.waitFor();
  assert.equal(await reader.locator(".katex").count(), 4);
  assert.ok(await reader.locator(".katex-display").evaluateAll(elements => elements.some(element => element.scrollWidth > element.clientWidth)));
  await page.screenshot({ path: fileURLToPath(new URL("desktop.png", output)), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok((await reader.boundingBox()).width <= 390);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await reader.locator(".katex-error").count(), 0);
  await page.screenshot({ path: fileURLToPath(new URL("mobile.png", output)), fullPage: true });
  await reader.getByRole("button", { name: "编辑这条笔记", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "编辑笔记", exact: true });
  await editor.waitFor();
  assert.equal(await editor.getByLabel("笔记正文").inputValue(), body);
  await editor.getByRole("button", { name: "预览", exact: true }).click();
  assert.equal(await editor.locator(".katex").count(), 4);
  await editor.getByRole("button", { name: "编辑", exact: true }).click();
  await editor.getByLabel("笔记正文").fill(body + "\n\n补充内容");
  await editor.getByRole("button", { name: "保存修改", exact: true }).click();
  await editor.waitFor({ state: "hidden" });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("eduweave_notes"))[0]);
  assert.equal(stored.excerpt, body + "\n\n补充内容");
  await page.reload();
  // Mobile navigation uses a shorter visible label.
  await page.getByRole("button", { name: "笔记", exact: true }).click();
  await card.locator(".katex").first().waitFor();
  assert.equal(await card.locator(".katex").count(), 4);
  assert.deepEqual(errors, []);
  console.log("Notes browser checks passed: inline and display formulas, code preservation, long-formula scrolling, full reader, mobile, preview and unchanged stored Markdown.");
} catch (error) {
  if (browser) for (const context of browser.contexts()) {
    const page = context.pages()[0];
    if (page) await page.screenshot({ path: fileURLToPath(new URL("failure.png", output)), fullPage: true }).catch(() => {});
  }
  throw error;
} finally {
  await browser?.close();
  server.kill();
}
