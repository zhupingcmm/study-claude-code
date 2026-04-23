import OpenAI from "openai";
import type { LLMProvider, LLMResponse, NormalizedMessage, ToolDef, ToolResultItem, TextBlock } from "./interface.js";

export class OpenAICompatProvider implements LLMProvider {
  private client: OpenAI;

  constructor(apiKey: string, baseUrl?: string) {
    this.client = new OpenAI({ apiKey, ...(baseUrl ? { baseURL: baseUrl } : {}) });
  }

  async complete(params: {
    model: string;
    maxTokens: number;
    system: string;
    tools: ToolDef[];
    messages: NormalizedMessage[];
  }): Promise<LLMResponse> {
    const openaiMessages = toOpenAIMessages(params.messages, params.system);
    const tools: OpenAI.ChatCompletionTool[] = params.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema as Record<string, unknown>,
      },
    }));

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model: params.model,
          max_tokens: params.maxTokens,
          tools,
          messages: openaiMessages,
        });

        return fromOpenAIResponse(response);
      } catch (e) {
        if (attempt === 2) throw e;
        const delay = 1000 * 2 ** attempt;
        console.error(`\nAPI error (attempt ${attempt + 1}/3), retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw new Error("unreachable");
  }
}

function toOpenAIMessages(
  messages: NormalizedMessage[],
  system: string,
): OpenAI.ChatCompletionMessageParam[] {
  const result: OpenAI.ChatCompletionMessageParam[] = [{ role: "system", content: system }];

  for (const msg of messages) {
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        result.push({ role: "user", content: msg.content });
        continue;
      }

      // Mixed array: split text blocks and tool results into separate messages.
      // OpenAI requires tool results as role:"tool" messages, not mixed into user.
      const items = msg.content as Array<ToolResultItem | TextBlock>;
      const texts = items.filter((i) => i.type === "text") as TextBlock[];
      const results = items.filter((i) => i.type === "tool_result") as ToolResultItem[];

      if (texts.length > 0) {
        result.push({ role: "user", content: texts.map((t) => t.text).join("\n") });
      }
      for (const r of results) {
        result.push({
          role: "tool",
          tool_call_id: r.tool_call_id,
          content: r.content,
        });
      }
    } else {
      // assistant
      const blocks = msg.content as Array<unknown>;
      const textContent = blocks
        .filter((b) => (b as { type: string }).type === "text")
        .map((b) => (b as { text: string }).text)
        .join("\n") || null;
      const toolCalls = blocks
        .filter((b) => (b as { type: string }).type === "tool_call")
        .map((b) => {
          const tc = b as { id: string; name: string; input: Record<string, unknown> };
          return {
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.input) },
          };
        });

      const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = { role: "assistant" };
      if (textContent) assistantMsg.content = textContent;
      if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
      result.push(assistantMsg);
    }
  }

  return result;
}

function fromOpenAIResponse(response: OpenAI.ChatCompletion): LLMResponse {
  const choice = response.choices[0];
  const msg = choice.message;

  const content: LLMResponse["content"] = [];
  if (msg.content) {
    content.push({ type: "text", text: msg.content });
  }
  for (const tc of msg.tool_calls ?? []) {
    if (tc.type !== "function") continue;
    content.push({
      type: "tool_call",
      id: tc.id,
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    });
  }

  const stopReason =
    choice.finish_reason === "stop"       ? "end_turn"  :
    choice.finish_reason === "tool_calls" ? "tool_use"  :
    choice.finish_reason ?? "unknown";

  return { stopReason, content };
}
