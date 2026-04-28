import { CHILD_TOOLS, executeTool } from "./tools/index.js";
import { MAX_TOKENS, SYSTEM } from "./config.js";
import { startSpinner } from "./ui.js";
import type { LLMProvider, NormalizedMessage, LLMResponse, ToolResultItem, TextBlock } from "./providers/interface.js";

export async function runSubagent(
  prompt: string,
  provider: LLMProvider,
  model: string,
): Promise<string> {
  const subMessages: NormalizedMessage[] = [{ role: "user", content: prompt }];
  let lastResponse: LLMResponse | null = null;

  for (let i = 0; i < 30; i++) {
    const stop = startSpinner("  [subagent] thinking...");
    const response = await provider.complete({
      model,
      maxTokens: MAX_TOKENS,
      system: SYSTEM,
      tools: CHILD_TOOLS,
      messages: subMessages,
    });
    stop();

    lastResponse = response;
    subMessages.push({ role: "assistant", content: response.content });

    if (response.stopReason !== "tool_use") break;

    const toolResults: ToolResultItem[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_call") continue;
      const [output, isError] = executeTool(block.name, block.input);
      console.log(`    [sub] → ${block.name} ${isError ? "ERROR" : "OK"}: ${output.slice(0, 200)}`);
      toolResults.push({ type: "tool_result", tool_call_id: block.id, content: output, is_error: isError });
    }
    subMessages.push({ role: "user", content: toolResults });
  }

  const text = lastResponse?.content.find((b) => b.type === "text");
  return (text as TextBlock | undefined)?.text ?? "(no summary)";
}
