import { describe, it, expect, vi, beforeEach } from "vitest";
import { runSubagent } from "../src/subagent.js";
import type { LLMProvider, LLMResponse, NormalizedMessage, ToolResultItem } from "../src/providers/interface.js";

// startSpinner 只是 UI，测试里变成 no-op
vi.mock("../src/ui.js", () => ({
  startSpinner: () => () => {},
}));

// executeTool 默认返回成功，避免测试碰真实文件系统
vi.mock("../src/tools/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/tools/index.js")>();
  return { ...actual, executeTool: vi.fn() };
});

// 构造 provider mock，每次 complete 按顺序返回预设响应
function makeProvider(responses: LLMResponse[]): LLMProvider {
  const complete = vi.fn();
  responses.forEach((r) => complete.mockResolvedValueOnce(r));
  return { complete } as unknown as LLMProvider;
}

// 取第 n 次（0-indexed）complete 调用收到的 messages 参数
function messagesOf(provider: LLMProvider, callIndex: number): NormalizedMessage[] {
  return (provider.complete as ReturnType<typeof vi.fn>).mock.calls[callIndex][0].messages;
}

describe("runSubagent", () => {
  let executeTool: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // 每个测试默认：工具调用成功
    const tools = await import("../src/tools/index.js");
    executeTool = vi.mocked(tools.executeTool);
    executeTool.mockReturnValue(["mock output", false]);
  });

  it("直接回答，无工具调用", async () => {
    const provider = makeProvider([
      { stopReason: "end_turn", content: [{ type: "text", text: "42" }] },
    ]);

    const result = await runSubagent("what is 6*7?", provider, "test-model");

    expect(result).toBe("42");
    expect(provider.complete).toHaveBeenCalledTimes(1);
  });

  it("调用一次工具后回答", async () => {
    const provider = makeProvider([
      {
        stopReason: "tool_use",
        content: [{ type: "tool_call", id: "t1", name: "read_file", input: { path: "/tmp/x.txt" } }],
      },
      { stopReason: "end_turn", content: [{ type: "text", text: "file read done" }] },
    ]);

    const result = await runSubagent("read /tmp/x.txt", provider, "test-model");

    expect(result).toBe("file read done");
    expect(provider.complete).toHaveBeenCalledTimes(2);
    expect(executeTool).toHaveBeenCalledWith("read_file", { path: "/tmp/x.txt" });
  });

  it("工具出错时，is_error: true 传入下一轮 messages", async () => {
    executeTool.mockReturnValueOnce(["permission denied", true]);

    const provider = makeProvider([
      {
        stopReason: "tool_use",
        content: [{ type: "tool_call", id: "t1", name: "read_file", input: { path: "/root/secret" } }],
      },
      { stopReason: "end_turn", content: [{ type: "text", text: "ok" }] },
    ]);

    await runSubagent("read secret", provider, "test-model");

    // subMessages 是引用，函数返回后继续被 push，所以用 find 找 tool_result 那条
    const messages = messagesOf(provider, 1);
    const toolResultMsg = messages.find(
      (m) => m.role === "user" && Array.isArray(m.content) &&
             (m.content as ToolResultItem[])[0]?.type === "tool_result",
    );
    const toolResult = (toolResultMsg!.content as ToolResultItem[])[0];
    expect(toolResult.is_error).toBe(true);
    expect(toolResult.content).toBe("permission denied");
  });

  it("LLM 无 text block 时返回 (no summary)", async () => {
    const provider = makeProvider([
      { stopReason: "end_turn", content: [] },
    ]);

    const result = await runSubagent("anything", provider, "test-model");

    expect(result).toBe("(no summary)");
  });

  it("超过 30 轮上限后强制退出", async () => {
    const loopResponse: LLMResponse = {
      stopReason: "tool_use",
      content: [{ type: "tool_call", id: "t1", name: "bash_exec", input: { command: "echo hi" } }],
    };
    const provider = makeProvider(Array(31).fill(loopResponse));

    const result = await runSubagent("loop forever", provider, "test-model");

    // 最多调用 30 次，不会到第 31 次
    expect(provider.complete).toHaveBeenCalledTimes(30);
    // 最后一轮是 tool_use，没有 text block
    expect(result).toBe("(no summary)");
  });
});
