export interface ToolDef {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

export interface TextBlock    { type: "text";      text: string }
export interface ToolCallBlock { type: "tool_call"; id: string; name: string; input: Record<string, unknown> }
export type ContentBlock = TextBlock | ToolCallBlock;

export interface ToolResultItem {
  type: "tool_result";
  tool_call_id: string;
  content: string;
  is_error?: boolean;
}

export type UserContent      = string | Array<ToolResultItem | TextBlock>;
export type AssistantContent = ContentBlock[];

export interface NormalizedMessage {
  role: "user" | "assistant";
  content: UserContent | AssistantContent;
}

export interface LLMResponse {
  stopReason: "end_turn" | "tool_use" | string;
  content: ContentBlock[];
}

export interface LLMProvider {
  complete(params: {
    model: string;
    maxTokens: number;
    system: string;
    tools: ToolDef[];
    messages: NormalizedMessage[];
  }): Promise<LLMResponse>;
}
