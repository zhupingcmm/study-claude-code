import { AnthropicProvider } from "./anthropic.js";
import { OpenAICompatProvider } from "./openai-compat.js";
import type { LLMProvider } from "./interface.js";

export { AnthropicProvider } from "./anthropic.js";
export { OpenAICompatProvider } from "./openai-compat.js";
export type { LLMProvider, LLMResponse, NormalizedMessage, ToolDef, ContentBlock, TextBlock, ToolCallBlock, ToolResultItem } from "./interface.js";

export function createProvider(cfg: {
  apiKey: string;
  baseUrl?: string;
  provider?: string;
}): LLMProvider {
  if (cfg.provider === "openai-compat") {
    return new OpenAICompatProvider(cfg.apiKey, cfg.baseUrl);
  }
  return new AnthropicProvider(cfg.apiKey, cfg.baseUrl);
}
