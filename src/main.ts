import Anthropic from "@anthropic-ai/sdk";
import readline from "readline";
import { TOOLS, executeTool } from "./tools/index.js";
import { MODEL, MAX_TOKENS, MAX_TURNS, SYSTEM, loadConfig } from "./config.js";

const { apiKey, baseUrl } = loadConfig();
const client = new Anthropic({ apiKey, ...(baseUrl ? { baseURL: baseUrl } : {}) });
const messages: Anthropic.MessageParam[] = [];

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function runTurn(): Promise<void> {
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      tools: TOOLS,
      messages,
    });
    console.log("response", response);

    if (response.stop_reason === "end_turn") {
      const text = response.content.find((b) => b.type === "text");
      console.log(`\nassistant> ${text?.text ?? "(no text)"}\n`);
      messages.push({ role: "assistant", content: response.content });
      return;
    }

    if (response.stop_reason !== "tool_use") {
      console.error(`Unexpected stop_reason: ${response.stop_reason}`);
      return;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const input = block.input as Record<string, string>;
      console.log(`[tool] ${block.name}(${JSON.stringify(input)})`);
      const [output, isError] = executeTool(block.name, input);
      console.log(`  → ${isError ? "ERROR" : "OK"}: ${output.slice(0, 200)}`);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: output,
        is_error: isError,
      });
    }

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  }

  console.error("Max turns reached");
}

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
