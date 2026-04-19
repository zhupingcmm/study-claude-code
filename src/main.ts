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

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function startSpinner(label: string): () => void {
  let i = 0;
  const id = setInterval(() => {
    process.stdout.write(`\r${SPINNER_FRAMES[i++ % SPINNER_FRAMES.length]} ${label}`);
  }, 80);
  return () => {
    clearInterval(id);
    process.stdout.write("\r\x1b[2K");
  };
}

async function createWithRetry(params: Parameters<typeof client.messages.create>[0]): Promise<Anthropic.Message> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await client.messages.create(params) as Anthropic.Message;
    } catch (e) {
      if (attempt === 2) throw e;
      const delay = 1000 * 2 ** attempt;
      console.error(`\nAPI error (attempt ${attempt + 1}/3), retrying in ${delay / 1000}s...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}

async function runTurn(): Promise<void> {
  while(true) {
    const stop = startSpinner("thinking...");
    const response = await createWithRetry({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      tools: TOOLS,
      messages,
    });
    stop();

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
