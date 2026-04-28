import readline from "readline";
import { PARENT_TOOLS, executeTool } from "./tools/index.js";
import { MAX_TOKENS, MAX_TURNS, SYSTEM, loadConfig } from "./config.js";
import { todo } from "./todo.js";
import { createProvider } from "./providers/index.js";
import type { NormalizedMessage, ToolResultItem, TextBlock } from "./providers/interface.js";
import { startSpinner } from "./ui.js";
import { runSubagent } from "./subagent.js";

const { apiKey, baseUrl, model, provider: providerType } = loadConfig();
const provider = createProvider({ apiKey, baseUrl, provider: providerType });
// messages 贯穿整个会话，是 agent 的"记忆"
const messages: NormalizedMessage[] = [];

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}


// 内层循环：持续调用 LLM，直到它停止调用工具（end_turn）
async function runTurn(): Promise<void> {
  while(true) {
    const stop = startSpinner("thinking...");
    const response = await provider.complete({
      model,
      maxTokens: MAX_TOKENS,
      system: SYSTEM,
      tools: PARENT_TOOLS,
      messages,
    });
    stop();

    // LLM 完成当前任务，把最终回复推入历史并返回外层 REPL
    if (response.stopReason === "end_turn") {
      const text = response.content.find((b) => b.type === "text");
      console.log(`\nassistant> ${text?.text ?? "(no text)"}\n`);
      messages.push({ role: "assistant", content: response.content });
      return;
    }

    if (response.stopReason !== "tool_use") {
      console.error(`Unexpected stop_reason: ${response.stopReason}`);
      return;
    }

    const toolResults: Array<ToolResultItem | TextBlock> = [];
    let usedTodo = false;

    for (const block of response.content) {
      if (block.type !== "tool_call") continue;

      let output: string;
      let isError = false;

      if (block.name === "task") {
        const taskInput = block.input as { prompt: string; description?: string };
        const desc = taskInput.description ?? "subagent";
        console.log(`  → [task] spawning: ${desc}`);
        output = await runSubagent(taskInput.prompt, provider, model);
        console.log(`  → [task] done: ${output.slice(0, 200)}`);
      } else {
        [output, isError] = executeTool(block.name, block.input);
        console.log(`  → ${block.name} ${isError ? "ERROR" : "OK"}: ${output.slice(0, 200)}`);
      }

      toolResults.push({ type: "tool_result", tool_call_id: block.id, content: output, is_error: isError });
      if (block.name === "todo") usedTodo = true;
    }

    // 超过 PLAN_REMINDER_INTERVAL 轮没有更新 todo，在结果前注入提醒
    if (!usedTodo) {
      todo.noteRoundWithoutUpdate();
      const reminder = todo.reminder();
      if (reminder) toolResults.unshift({ type: "text", text: reminder });
    }

    // 必须同时推入 assistant（含 tool_call 块）和 user（含 tool_result），
    // 否则 API 会因消息序列不完整而报错
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  }
}

// 外层 REPL：每次输入独立触发一轮 agent loop，messages 跨轮保留
while (true) {
  const input = await ask("you> ");
  const trimmed = input.trim();

  if (trimmed === "exit" || trimmed === "quit") {
    rl.close();
    break;
  }

  if (!trimmed) continue;

  messages.push({ role: "user", content: trimmed });
  await runTurn();
}
