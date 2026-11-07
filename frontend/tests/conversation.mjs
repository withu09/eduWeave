import assert from "node:assert/strict";
import { build } from "esbuild";

async function load(entryPoint, define = {}) {
  const result = await build({ entryPoints: [entryPoint], bundle: true, write: false, platform: "node", format: "esm", define });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
}

const { conversationHistory } = await load("src/app/conversation.ts");
const messages = [
  { id: "welcome", role: "assistant", text: "Greeting" },
  { role: "user", text: "Teach arrays" },
  { role: "assistant", kind: "default", result: { modules: [{ title: "Arrays", markdown: "Contiguous storage" }] } },
  { role: "user", text: "Explain further" },
  { role: "assistant", kind: "socratic", result: { markdown: "What is an index?" } },
  { role: "assistant", kind: "pro", result: { siteTitle: "Array site", html: "<html>Arrays</html>" } },
  { role: "agent", text: "Loading", status: "pending" },
  { role: "assistant", text: "An error", error: true },
];
const history = conversationHistory(messages);
assert.equal(history.length, 5);
assert.deepEqual(history[0], { role: "user", content: "Teach arrays" });
assert.equal(history[1].content, "Arrays\nContiguous storage");
assert.equal(history[3].content, "What is an index?");
assert.ok(history[4].content.includes("<html>Arrays</html>"));
assert.deepEqual(conversationHistory([{ role: "agent", text: "Answer", status: "complete" }]), [{ role: "assistant", content: "Answer" }]);
assert.equal(conversationHistory(Array.from({ length: 40 }, (_, index) => ({ role: "user", text: String(index) }))).length, 20);
assert.equal(conversationHistory(Array.from({ length: 8 }, () => ({ role: "user", text: "x".repeat(8000) }))).length, 3);
assert.deepEqual(conversationHistory([{ role: "user", text: "  " }]), []);

const engine = await load("src/app/starmap/engine.ts", { "import.meta.env.VITE_API_URL": JSON.stringify("http://api.test") });
const requests = [];
globalThis.fetch = async (url, options) => {
  requests.push({ url, body: JSON.parse(options.body) });
  return { ok: true, json: async () => ({}) };
};
await engine.runDefaultMode("Continue", history);
await engine.runSocraticMode("Continue", "inquire", history);
await engine.runProMode("Continue", history);
assert.equal(requests.length, 3);
for (const request of requests) {
  assert.deepEqual(request.body.history, history);
  assert.equal(request.body.query, "Continue");
}
console.log("Conversation history and all three StarMap request paths passed.");
