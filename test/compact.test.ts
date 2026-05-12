import { describe, it, expect, vi, afterEach } from "vitest";
import {
  microCompact,
  writeTranscript,
  collectRecentFiles,
  compactHistory,
  KEEP_RECENT_TOOL_RESULTS,
} from "../src/compact.js";
import type { NormalizedMessage } from "../src/providers/interface.js";
import fs from "fs";

// --- helpers ---

function toolResultMsg(contents: string[]): NormalizedMessage {
  return {
    role: "user",
    content: contents.map((c, i) => ({
      type: "tool_result" as const,
      tool_call_id: `t${i}`,
      content: c,
    })),
  };
}

function assistantFileMsg(tool: "read_file" | "write_file", ...paths: string[]): NormalizedMessage {
  return {
    role: "assistant",
    content: paths.map((p, i) => ({
      type: "tool_call" as const,
      id: `c${i}`,
      name: tool,
      input: { path: p },
    })),
  };
}

function makeProvider(summary = "summary") {
  return {
    complete: vi.fn().mockResolvedValue({
      stopReason: "end_turn",
      content: [{ type: "text", text: summary }],
    }),
  } as any;
}

const LONG = "x".repeat(121);
const SHORT = "x".repeat(50);

// --- microCompact ---

describe("microCompact", () => {
  it("不超过 KEEP_RECENT 条时不做任何修改", () => {
    const contents = [LONG, LONG, LONG]; // 恰好 3 条
    const msgs = [toolResultMsg(contents)];
    const before = JSON.stringify(msgs);
    microCompact(msgs);
    expect(JSON.stringify(msgs)).toBe(before);
  });

  it("旧条目内容 ≤120 字符时不替换", () => {
    // 4 条但旧的那条是短内容
    const msgs = [toolResultMsg([SHORT, LONG, LONG, LONG])];
    microCompact(msgs);
    const results = msgs[0].content as Array<{ content: string }>;
    expect(results[0].content).toBe(SHORT); // 短内容保持不变
  });

  it("旧条目内容 >120 字符时替换为占位符，最新 3 条不动", () => {
    const msgs = [toolResultMsg([LONG, LONG, LONG, LONG])];
    microCompact(msgs);
    const results = msgs[0].content as Array<{ content: string }>;
    expect(results[0].content).toContain("[Earlier tool result compacted");
    expect(results[1].content).toBe(LONG);
    expect(results[2].content).toBe(LONG);
    expect(results[3].content).toBe(LONG);
  });

  it("tool_result 跨多条消息时按整体顺序保留最新 3 条", () => {
    // 4 条分布在两条消息里
    const msgs: NormalizedMessage[] = [
      toolResultMsg([LONG, LONG]), // 旧的两条
      toolResultMsg([LONG, LONG]), // 新的两条
    ];
    microCompact(msgs);
    const first = msgs[0].content as Array<{ content: string }>;
    const second = msgs[1].content as Array<{ content: string }>;
    // 全局第 1 条被压缩，其余 3 条保留
    expect(first[0].content).toContain("[Earlier tool result compacted");
    expect(first[1].content).toBe(LONG);
    expect(second[0].content).toBe(LONG);
    expect(second[1].content).toBe(LONG);
  });

  it("KEEP_RECENT_TOOL_RESULTS 常量值为 3", () => {
    expect(KEEP_RECENT_TOOL_RESULTS).toBe(3);
  });
});

// --- writeTranscript ---

describe("writeTranscript", () => {
  const written: string[] = [];

  afterEach(() => {
    for (const p of written.splice(0)) {
      try { fs.unlinkSync(p); } catch { /* ignore */ }
    }
  });

  it("将 messages 以 JSON 写入临时文件并返回路径", () => {
    const msgs: NormalizedMessage[] = [{ role: "user", content: "hello" }];
    const p = writeTranscript(msgs);
    written.push(p);
    expect(fs.existsSync(p)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8"));
    expect(parsed).toEqual(msgs);
  });

  it("每次调用生成不同的文件路径", () => {
    const p1 = writeTranscript([]);
    const p2 = writeTranscript([]);
    written.push(p1, p2);
    expect(p1).not.toBe(p2);
  });
});

// --- collectRecentFiles ---

describe("collectRecentFiles", () => {
  it("空消息列表返回空数组", () => {
    expect(collectRecentFiles([])).toEqual([]);
  });

  it("收集 read_file 和 write_file 的 path", () => {
    const msgs: NormalizedMessage[] = [
      assistantFileMsg("read_file", "/a.ts"),
      assistantFileMsg("write_file", "/b.ts"),
    ];
    expect(collectRecentFiles(msgs)).toEqual(["/a.ts", "/b.ts"]);
  });

  it("去重同一路径，只保留首次出现", () => {
    const msgs: NormalizedMessage[] = [
      assistantFileMsg("read_file", "/a.ts"),
      assistantFileMsg("write_file", "/a.ts"),
    ];
    expect(collectRecentFiles(msgs)).toEqual(["/a.ts"]);
  });

  it("忽略 bash_exec 等非文件工具", () => {
    const msgs: NormalizedMessage[] = [
      {
        role: "assistant",
        content: [{ type: "tool_call", id: "c0", name: "bash_exec", input: { command: "ls" } }],
      },
      assistantFileMsg("read_file", "/x.ts"),
    ];
    expect(collectRecentFiles(msgs)).toEqual(["/x.ts"]);
  });

  it("忽略 user 消息", () => {
    const msgs: NormalizedMessage[] = [
      { role: "user", content: "hello" },
      assistantFileMsg("read_file", "/a.ts"),
    ];
    expect(collectRecentFiles(msgs)).toEqual(["/a.ts"]);
  });

  it("超过 10 个时只返回最后 10 个", () => {
    const paths = Array.from({ length: 12 }, (_, i) => `/f${i}.ts`);
    const msgs = paths.map((p) => assistantFileMsg("read_file", p));
    const result = collectRecentFiles(msgs);
    expect(result).toHaveLength(10);
    expect(result[0]).toBe("/f2.ts");
    expect(result[9]).toBe("/f11.ts");
  });
});

// --- compactHistory ---

describe("compactHistory", () => {
  it("返回包含摘要的单条 user 消息", async () => {
    const result = await compactHistory([], makeProvider("work summary"), "test-model");
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
    expect(result[0].content).toContain("work summary");
  });

  it("指定 focus 时追加到摘要末尾", async () => {
    const result = await compactHistory([], makeProvider("summary"), "test-model", "fix the login bug");
    expect(result[0].content).toContain("Focus to preserve next: fix the login bug");
  });

  it("有最近操作文件时追加文件列表", async () => {
    const msgs: NormalizedMessage[] = [assistantFileMsg("write_file", "/src/app.ts")];
    const result = await compactHistory(msgs, makeProvider("summary"), "test-model");
    expect(result[0].content).toContain("/src/app.ts");
  });

  it("无最近文件时不追加文件列表", async () => {
    const result = await compactHistory([], makeProvider("summary"), "test-model");
    expect(result[0].content).not.toContain("Recent files");
  });
});
