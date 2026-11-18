import assert from "node:assert/strict";
import { build } from "esbuild";

const result = await build({ entryPoints: ["src/app/noteMath.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { normalizeNoteMath: normalize } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
assert.equal(normalize(String.raw`行内 \(\frac{a}{b}\) 公式`), String.raw`行内 $\frac{a}{b}$ 公式`);
assert.equal(normalize(String.raw`\[\int_0^1 x^2\,dx = \frac13\]`), "\n\n$$\n" + String.raw`\int_0^1 x^2\,dx = \frac13` + "\n$$\n\n");
const existing = String.raw`原有 $E = mc^2$`;
assert.equal(normalize(existing), existing);
const matrix = String.raw`\begin{matrix}a \\[4pt] b\end{matrix}`;
assert.equal(normalize("$$" + matrix + "$$"), "\n\n$$\n" + matrix + "\n$$\n\n");
for (const code of [
  '`' + String.raw`\(x\) \[y\]` + '`',
  '`` ' + String.raw`\(x\)` + ' ` ' + String.raw`\[y\]` + ' ``',
  '```tex\n' + String.raw`\(x\) \[y\]` + '\n```',
  '~~~latex\n' + String.raw`\[x\]` + '\n~~~',
  '    ' + String.raw`\(code\)`,
  String.raw`\\(literal\\)`,
]) assert.equal(normalize(code), code);
assert.equal(normalize(String.raw`未闭合 \(x`), String.raw`未闭合 \(x`);
assert.equal(normalize('```tex\n' + String.raw`\(code\)` + '\n```\n' + String.raw`\(x\)`), '```tex\n' + String.raw`\(code\)` + '\n```\n$x$');
assert.equal(normalize(String.raw`\(a\) 与 \(b\)`), '$a$ 与 $b$');
assert.equal(normalize(String.raw`\(a\)\(b\)`), '$a$ $b$');
assert.equal(normalize(String.raw`\(a\)$b$`), '$a$ $b$');
console.log("Note math compatibility passed: TeX delimiters, existing formulas, matrices, code blocks, inline code, escapes and incomplete input.");
