import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// Always start our own disposable server. Never point this test at production.
const port = Number(process.env.EDUWEAVE_TEST_PORT || 8766);
const base = `http://127.0.0.1:${port}`;
const root = fileURLToPath(new URL("../../", import.meta.url));
const output = new URL("../../.local-build/community-browser/", import.meta.url);
await mkdir(output, { recursive: true });
const server = spawn(process.env.EDUWEAVE_TEST_PYTHON || "python", ["-u", "backend/tests/community_server.py", "--port", String(port)], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
server.stdout.on("data", chunk => { serverLog += chunk; });
server.stderr.on("data", chunk => { serverLog += chunk; });
server.on("error", error => { serverLog += error.message; });
let browser;

async function ready() {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Preview server exited: ${serverLog}`);
    try {
      const response = await fetch(`${base}/api/health`);
      if ((await response.json()).isolated_community_test) return;
    } catch { /* Wait for our isolated server. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Preview server did not start: ${serverLog}`);
}

async function nickname(page, value) {
  await page.getByRole("button", { name: "修改社区昵称" }).click();
  await page.getByLabel("社区昵称", { exact: true }).fill(value);
  await page.getByRole("button", { name: "保存昵称", exact: true }).click();
  await page.getByText("社区昵称已更新", { exact: true }).waitFor();
}

try {
  await ready();
  browser = await chromium.launch({ headless: true, ...(process.env.EDUWEAVE_TEST_BROWSER ? { channel: process.env.EDUWEAVE_TEST_BROWSER } : {}) });
  const alpha = await browser.newContext({ viewport: { width: 1365, height: 1000 } });
  const beta = await browser.newContext({ viewport: { width: 1365, height: 1000 } });
  const a = await alpha.newPage();
  const b = await beta.newPage();
  const pageErrors = [];
  for (const page of [a, b]) page.on("pageerror", error => pageErrors.push(error.message));
  await a.goto(`${base}/#community`);
  await a.getByText("从第一条分享开始", { exact: true }).waitFor();
  await nickname(a, "浏览器甲");

  const content = "#测试话题\n\n浏览器联调：学习公式 $E = mc^2$，支持 **加粗**。";
  await a.getByLabel("动态内容", { exact: true }).fill(content);
  await a.getByRole("button", { name: "预览", exact: true }).click();
  await a.locator(".katex").first().waitFor();
  await a.reload();
  await a.getByText("从第一条分享开始", { exact: true }).waitFor();
  assert.equal(await a.getByLabel("动态内容", { exact: true }).inputValue(), content);

  // A real tiny PNG exercises upload, normalization, DB persistence and preview.
  await a.getByLabel("上传社区图片", { exact: true }).setInputFiles({ name: "test.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64") });
  await a.getByAltText("待发布图片 1", { exact: true }).waitFor();
  await a.getByRole("button", { name: "发布动态", exact: true }).click();
  await a.getByText("发布成功，大家都可以看到这条动态了", { exact: true }).waitFor();
  await a.locator("article").waitFor();
  assert.equal(await a.locator("article .katex").count(), 1);
  await a.getByRole("button", { name: "查看配图 1", exact: true }).click();
  await a.getByRole("dialog", { name: "图片预览" }).waitFor();
  await a.keyboard.press("Escape");

  await b.goto(`${base}/#community`);
  await b.locator("article").waitFor();
  await nickname(b, "浏览器乙");
  await b.locator("article").waitFor();
  assert.equal(await b.getByRole("button", { name: "编辑动态", exact: true }).count(), 0);
  await b.getByRole("button", { name: "点赞", exact: true }).click();
  await b.getByRole("button", { name: "取消点赞", exact: true }).waitFor();
  await b.getByRole("button", { name: "收藏", exact: true }).click();
  await b.getByRole("button", { name: "取消收藏", exact: true }).waitFor();
  await b.getByRole("button", { name: "查看评论", exact: true }).click();
  await b.getByText("还没有评论，来分享你的想法吧。", { exact: true }).waitFor();
  await b.getByLabel("评论内容", { exact: true }).fill("这个公式很有帮助，能再举一个例子吗？");
  await b.getByRole("button", { name: "发表评论", exact: true }).click();
  await b.getByText("这个公式很有帮助，能再举一个例子吗？", { exact: true }).waitFor();

  await a.getByRole("button", { name: "刷新社区", exact: true }).click();
  await a.getByRole("button", { name: "查看评论", exact: true }).click();
  await a.getByText("这个公式很有帮助，能再举一个例子吗？", { exact: true }).waitFor();
  await a.getByRole("button", { name: "回复", exact: true }).click();
  await a.getByLabel("回复 浏览器乙", { exact: true }).fill("可以从能量与质量的关系开始理解。");
  await a.getByRole("button", { name: "发表评论", exact: true }).click();
  await a.getByText("可以从能量与质量的关系开始理解。", { exact: true }).waitFor();
  await a.screenshot({ path: fileURLToPath(new URL("desktop.png", output)), fullPage: true });

  await b.getByRole("button", { name: "我的收藏", exact: true }).click();
  await b.locator("article").waitFor();
  await b.reload();
  await b.getByRole("button", { name: "取消收藏", exact: true }).waitFor();
  await b.getByRole("button", { name: "取消点赞", exact: true }).waitFor();
  await b.getByRole("button", { name: "我的发布", exact: true }).click();
  await b.getByText("你还没有发布动态", { exact: true }).waitFor();

  await a.getByRole("button", { name: "编辑动态", exact: true }).click();
  await a.getByLabel("编辑动态内容", { exact: true }).fill("#测试话题\n\n更新后的公式笔记 $E = mc^2$。");
  await a.getByRole("button", { name: "保存修改", exact: true }).click();
  await a.getByText("动态已更新", { exact: true }).waitFor();
  await a.getByLabel("搜索社区", { exact: true }).fill("找不到的内容");
  await a.getByText("没有找到匹配的动态", { exact: true }).waitFor();
  await a.getByRole("button", { name: "清除筛选", exact: true }).click();
  await a.locator("article").waitFor();

  const postId = (await a.locator("article").getAttribute("id")).replace("post-", "");
  await alpha.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
  await a.getByRole("button", { name: "分享", exact: true }).click();
  await a.getByText("帖子链接已复制", { exact: true }).waitFor();
  const sharedLink = await a.evaluate(() => navigator.clipboard.readText());
  assert.ok(sharedLink.includes(`community_post=${postId}`));
  await b.goto(sharedLink);
  await b.getByRole("button", { name: "返回社区动态", exact: true }).waitFor();
  await b.getByText("可以从能量与质量的关系开始理解。", { exact: true }).waitFor();
  // A normal HTTP deployment may not expose clipboard APIs.
  await b.evaluate(() => Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true }));
  await b.getByRole("button", { name: "分享", exact: true }).click();
  assert.equal(await b.getByLabel("复制此链接分享动态", { exact: true }).inputValue(), sharedLink);

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await alpha.storageState() });
  const mobile = await mobileContext.newPage();
  mobile.on("pageerror", error => pageErrors.push(error.message));
  await mobile.goto(`${base}/#community`);
  await mobile.locator("article").waitFor();
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await mobile.screenshot({ path: fileURLToPath(new URL("mobile.png", output)), fullPage: true });

  // Network failure must preserve the draft and restore the publish control.
  await mobile.getByLabel("动态内容", { exact: true }).fill("网络中断时保留这条草稿");
  await mobile.route("**/api/community/posts", route => route.request().method() === "POST" ? route.abort() : route.continue());
  await mobile.getByRole("button", { name: "发布动态", exact: true }).click();
  await mobile.getByText("暂时无法连接社区，请检查网络后重试", { exact: true }).waitFor();
  assert.equal(await mobile.getByLabel("动态内容", { exact: true }).inputValue(), "网络中断时保留这条草稿");

  await a.getByRole("button", { name: "删除动态", exact: true }).click();
  await a.getByRole("button", { name: "确认删除", exact: true }).click();
  await a.getByText("动态已删除", { exact: true }).waitFor();
  await b.reload();
  await b.getByText("动态不存在或已删除", { exact: false }).waitFor();
  assert.deepEqual(pageErrors, []);
  console.log("Community browser checks passed: two identities, images, math, replies, ownership, bookmarks, persistence, search, shared links, mobile, offline drafts, deletion.");
} catch (error) {
  if (browser) for (const [index, context] of browser.contexts().entries()) {
    const page = context.pages()[0];
    if (page) await page.screenshot({ path: fileURLToPath(new URL(`failure-${index}.png`, output)), fullPage: true }).catch(() => {});
  }
  throw error;
} finally {
  await browser?.close();
  server.kill();
}
