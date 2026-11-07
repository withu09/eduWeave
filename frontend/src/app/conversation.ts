export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

interface HistorySource {
  id?: string;
  role: "user" | "agent" | "assistant";
  text?: string;
  kind?: string;
  status?: "pending" | "complete" | "error";
  error?: boolean;
  result?: {
    markdown?: string;
    modules?: { title: string; markdown: string }[];
    siteTitle?: string;
    html?: string;
  };
}

export function conversationHistory(messages: readonly HistorySource[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  for (const message of messages) {
    if (message.id === "welcome" || message.error || message.status === "pending" || message.status === "error") continue;
    let content = message.text ?? "";
    if (message.kind === "default") {
      content = message.result?.modules?.map((module) => `${module.title}\n${module.markdown}`).join("\n\n") ?? "";
    } else if (message.kind === "socratic") {
      content = message.result?.markdown ?? "";
    } else if (message.kind === "pro") {
      content = `${message.result?.siteTitle ?? ""}\n${message.result?.html ?? ""}`;
    } else if (message.kind === "websearch") {
      continue;
    }
    content = content.trim().slice(0, 8000);
    if (content) turns.push({ role: message.role === "user" ? "user" : "assistant", content });
  }

  const selected: ConversationTurn[] = [];
  let remaining = 24000;
  for (const turn of turns.slice(-20).reverse()) {
    if (turn.content.length > remaining) break;
    selected.push(turn);
    remaining -= turn.content.length;
  }
  return selected.reverse();
}
