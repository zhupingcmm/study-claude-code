import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, LLMResponse, NormalizedMessage, ToolDef } from "./interface.js";

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor(apiKey: string, baseUrl?: string) {
    this.client = new Anthropic({ apiKey, ...(baseUrl ? { baseURL: baseUrl } : {}) });
  }

  async complete(params: {
    model: string;
    maxTokens: number;
    system: string;
    tools: ToolDef[];
    messages: NormalizedMessage[];
  }): Promise<LLMResponse> {
    const anthropicMessages = params.messages.map(toAnthropicMessage);
    const anthropicTools = params.tools as Anthropic.Tool[];

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await this.client.messages.create({
          model: params.model,
          max_tokens: params.maxTokens,
          system: params.system,
          tools: anthropicTools,
          messages: anthropicMessages,
        }) as Anthropic.Message;

        return fromAnthropicResponse(response);
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

function toAnthropicMessage(msg: NormalizedMessage): Anthropic.MessageParam {
  if (msg.role === "user") {
    if (typeof msg.content === "string") {
      return { role: "user", content: msg.content };
    }
    const blocks = (msg.content as Array<unknown>).map((item) => {
      const b = item as Record<string, unknown>;
      if (b.type === "tool_result") {
        return {
          type: "tool_result" as const,
          tool_use_id: b.tool_call_id as string,
          content: b.content as string,
          ...(b.is_error != null ? { is_error: b.is_error as boolean } : {}),
        };
      }
      return { type: "text" as const, text: (b as { text: string }).text };
    });
    return { role: "user", content: blocks };
  }

  // assistant
  const blocks = (msg.content as Array<unknown>).map((item) => {
    const b = item as Record<string, unknown>;
    if (b.type === "tool_call") {
      return {
        type: "tool_use" as const,
        id: b.id as string,
        name: b.name as string,
        input: b.input as Record<string, unknown>,
      };
    }
    return { type: "text" as const, text: (b as { text: string }).text };
  });
  return { role: "assistant", content: blocks };
}

function fromAnthropicResponse(response: Anthropic.Message): LLMResponse {
  const content = response.content.map((block) => {
    if (block.type === "tool_use") {
      return { type: "tool_call" as const, id: block.id, name: block.name, input: block.input as Record<string, unknown> };
    }
    return { type: "text" as const, text: (block as Anthropic.TextBlock).text };
  });

  return {
    stopReason: response.stop_reason === "end_turn" ? "end_turn"
              : response.stop_reason === "tool_use" ? "tool_use"
              : response.stop_reason ?? "unknown",
    content,
  };
}
