/** Accept common TeX delimiters without rewriting examples inside Markdown code. */
export function normalizeNoteMath(source: string): string {
  let result = "";
  let index = 0;
  let fence: { marker: string; length: number } | null = null;

  const runLength = (position: number, marker: string) => {
    let end = position;
    while (source[end] === marker) end++;
    return end - position;
  };
  const closing = (start: number, delimiter: string) => {
    for (let position = start; position < source.length; position++) {
      if (source[position] === "\\" && source[position + 1] === "\\") { position++; continue; }
      if (source.startsWith(delimiter, position)) return position;
      if (source[position] === "\\") position++;
    }
    return -1;
  };

  while (index < source.length) {
    if (index === 0 || source[index - 1] === "\n") {
      const end = source.indexOf("\n", index);
      const lineEnd = end < 0 ? source.length : end + 1;
      const line = source.slice(index, lineEnd);
      const match = line.match(/^[ \t]*(?:>\s*)*(?:[-+*]\s+|\d+[.)]\s+)?(`{3,}|~{3,})([^\n]*)/);
      if (fence) {
        if (match && match[1][0] === fence.marker && match[1].length >= fence.length && !match[2].trim()) fence = null;
        result += line; index = lineEnd; continue;
      }
      if (match) {
        fence = { marker: match[1][0], length: match[1].length };
        result += line; index = lineEnd; continue;
      }
      if (/^(?: {4}|\t)/.test(line)) {
        result += line; index = lineEnd; continue;
      }
    }
    if (source[index] === "`") {
      const length = runLength(index, "`");
      let end = source.indexOf("`", index + length);
      while (end >= 0 && runLength(end, "`") !== length) end = source.indexOf("`", end + runLength(end, "`"));
      if (end >= 0) {
        result += source.slice(index, end + length); index = end + length; continue;
      }
      result += source.slice(index, index + length); index += length; continue;
    }
    if (source[index] === "\\" && source[index + 1] === "\\") {
      result += "\\\\"; index += 2; continue;
    }
    if (source[index] === "$" && source[index - 1] !== "\\") {
      const delimiter = source[index + 1] === "$" ? "$$" : "$";
      const end = closing(index + delimiter.length, delimiter);
      if (end >= 0) {
        const body = source.slice(index + delimiter.length, end).trim();
        if (delimiter === "$" && result.endsWith("$")) result += " ";
        result += delimiter === "$$" && body ? `\n\n$$\n${body}\n$$\n\n` : source.slice(index, end + delimiter.length);
        index = end + delimiter.length; continue;
      }
    }
    if (source[index] === "\\" && (source[index + 1] === "(" || source[index + 1] === "[")) {
      const display = source[index + 1] === "[";
      const end = closing(index + 2, display ? "\\]" : "\\)");
      if (end >= 0) {
        const body = source.slice(index + 2, end).trim();
        // An unmatched opener must not consume a following fenced code example.
        if (body && !/(?:^|\n)[ \t]*(?:`{3,}|~{3,})/.test(body)) {
          if (!display && result.endsWith("$")) result += " ";
          result += display ? `\n\n$$\n${body}\n$$\n\n` : `$${body}$`;
          index = end + 2; continue;
        }
      }
    }
    result += source[index++];
  }
  return result;
}
