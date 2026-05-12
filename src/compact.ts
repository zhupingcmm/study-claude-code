import fs from "fs";
import os from "os";
import path from "path";
import type { NormalizedMessage, ToolResultItem, LLMProvider, ContentBlock } from "./providers/interface.js";

export const KEEP_RECENT_TOOL_RESULTS = 3;
export const CONTEXT_LIMIT = 50_000;

const COMPACT_PLACEHOLDER = "[Earlier tool result compacted. Re-run the tool if you need full detail.]";

// 收集所有 user 消息里的 tool_result block，返回引用（可直接修改内容）
function collectToolResultBlocks(messages: NormalizedMessage[]): ToolResultItem[] {
  const blocks: ToolResultItem[] = [];
  for (const msg of messages) {
    if (msg.role !== "user" || !Array.isArray(msg.content)) continue;
    for (const block of msg.content as ToolResultItem[]) {
      if (block.type === "tool_result") blocks.push(block);
    }
  }
  return blocks;
}

// 原地截断旧 tool_result：超过 KEEP_RECENT_TOOL_RESULTS 的部分，内容 > 120 字符则替换为占位符
export function microCompact(messages: NormalizedMessage[]): void {
  const blocks = collectToolResultBlocks(messages);
  if (blocks.length <= KEEP_RECENT_TOOL_RESULTS) return;

  const toCompact = blocks.slice(0, blocks.length - KEEP_RECENT_TOOL_RESULTS);
  for (const block of toCompact) {
    if (typeof block.content === "string" && block.content.length > 120) {
      block.content = COMPACT_PLACEHOLDER;
    }
  }
}

// 将 messages 序列化写入临时文件，返回路径
export function writeTranscript(messages: NormalizedMessage[]): string {
  const transcriptPath = path.join(os.tmpdir(), `minicc-transcript-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
  fs.writeFileSync(transcriptPath, JSON.stringify(messages, null, 2), "utf-8");
  return transcriptPath;
}

// 从 assistant 消息的 tool_call 里收集 read_file / write_file 的 path
export function collectRecentFiles(messages: NormalizedMessage[]): string[] {
  const seen = new Set<string>();
  const files: string[] = [];
  for (const msg of messages) {
    if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
    for (const block of msg.content as ContentBlock[]) {
      if (block.type !== "tool_call") continue;
      if (block.name !== "read_file" && block.name !== "write_file") continue;
      const p = (block.input as { path?: string }).path;
      if (p && !seen.has(p)) {
        seen.add(p);
        files.push(p);
      }
    }
  }
  return files.slice(-10);
}

// 把 messages 格式化为可读文本，用于摘要调用
function formatMessages(messages: NormalizedMessage[]): string {
  return messages.map((msg) => {
    if (typeof msg.content === "string") {
      return `[user]: ${msg.content}`;
    }
    if (!Array.isArray(msg.content)) return "";

    const parts = (msg.content as Array<{ type: string; text?: string; name?: string; content?: string }>)
      .map((b) => {
        if (b.type === "text") return b.text ?? "";
        if (b.type === "tool_call") return `<tool_call name="${b.name}"/>`;
        if (b.type === "tool_result") return `<tool_result>${(b.content ?? "").slice(0, 200)}</tool_result>`;
        return "";
      })
      .filter(Boolean);

    return `[${msg.role}]: ${parts.join(" ")}`;
  }).join("\n");
}

// 调用 LLM 生成摘要
export async function summarizeHistory(
  messages: NormalizedMessage[],
  provider: LLMProvider,
  model: string,
): Promise<string> {
  const historyText = formatMessages(messages);
  const response = await provider.complete({
    model,
    maxTokens: 4096,
    system: "You are a summarization assistant. Produce a concise but complete summary of the provided conversation. Include: key decisions made, files created or modified, current task status, and any pending work.",
    tools: [],
    messages: [
      {
        role: "user",
        content: `${historyText}\n\n---\nPlease summarize the conversation above.`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text");
  return (text as { type: "text"; text: string } | undefined)?.text ?? "(no summary)";
}

// 完整压缩：保存 transcript → 生成摘要 → 返回替换后的新 messages 数组
export async function compactHistory(
  messages: NormalizedMessage[],
  provider: LLMProvider,
  model: string,
  focus?: string,
): Promise<NormalizedMessage[]> {
  const transcriptPath = writeTranscript(messages);
  console.log(`[transcript saved: ${transcriptPath}]`);

  let summary = await summarizeHistory(messages, provider, model);

  if (focus) summary += `\n\nFocus to preserve next: ${focus}`;

  const recentFiles = collectRecentFiles(messages);
  if (recentFiles.length > 0) {
    summary += `\n\nRecent files to reopen if needed:\n${recentFiles.map((p) => `- ${p}`).join("\n")}`;
  }

  return [
    {
      role: "user",
      content: `This conversation was compacted so the agent can continue working.\n\n${summary}`,
    },
  ];
}
