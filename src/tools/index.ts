import fs from "fs";
import { spawnSync } from "child_process";
import type Anthropic from "@anthropic-ai/sdk";
import { todo, type TodoStatus } from "../todo.js";

export const READ_TOOL: Anthropic.Tool = {
  name: "read_file",
  description: "读取文件内容，返回文件文本。",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "文件路径（绝对或相对）" },
    },
    required: ["path"],
  },
};

export const WRITE_TOOL: Anthropic.Tool = {
  name: "write_file",
  description: "将内容写入文件（完整覆写，不做 patch）。",
  input_schema: {
    type: "object",
    properties: {
      path: { type: "string", description: "目标文件路径" },
      content: { type: "string", description: "要写入的完整文本内容" },
    },
    required: ["path", "content"],
  },
};

export const BASH_TOOL: Anthropic.Tool = {
  name: "bash_exec",
  description: "执行 shell 命令，返回 stdout + stderr 的合并输出。",
  input_schema: {
    type: "object",
    properties: {
      command: { type: "string", description: "要执行的 shell 命令" },
    },
    required: ["command"],
  },
};

export const ADD_TODO_TOOL: Anthropic.Tool = {
  name: "add_todo",
  description: "添加一个新任务到 TodoList，返回任务 id。",
  input_schema: {
    type: "object",
    properties: {
      content: { type: "string", description: "任务描述" },
    },
    required: ["content"],
  },
};

export const UPDATE_TODO_TOOL: Anthropic.Tool = {
  name: "update_todo",
  description: "更新 TodoList 中某个任务的状态。",
  input_schema: {
    type: "object",
    properties: {
      id: { type: "string", description: "任务 id" },
      status: {
        type: "string",
        enum: ["pending", "in_progress", "done"],
        description: "新状态",
      },
    },
    required: ["id", "status"],
  },
};

export const TOOLS: Anthropic.Tool[] = [
  READ_TOOL,
  WRITE_TOOL,
  BASH_TOOL,
  ADD_TODO_TOOL,
  UPDATE_TODO_TOOL,
];

type ToolInput = Record<string, string>;

export function executeTool(name: string, input: ToolInput): [string, boolean] {
  try {
    if (name === "read_file") {
      return [fs.readFileSync(input.path, "utf-8"), false];
    } else if (name === "write_file") {
      fs.writeFileSync(input.path, input.content, "utf-8");
      return [`Written to ${input.path}`, false];
    } else if (name === "bash_exec") {
      const r = spawnSync(input.command, {
        shell: true,
        timeout: 30_000,
        encoding: "utf-8",
      });
      if (r.error) return [String(r.error), true];
      return [(r.stdout ?? "") + (r.stderr ?? ""), false];
    } else if (name === "add_todo") {
      const item = todo.add(input.content);
      todo.display();
      return [JSON.stringify(item), false];
    } else if (name === "update_todo") {
      const item = todo.update(input.id, input.status as TodoStatus);
      if (!item) return [`Todo id ${input.id} not found`, true];
      todo.display();
      return [JSON.stringify(item), false];
    } else {
      return [`Unknown tool: ${name}`, true];
    }
  } catch (e) {
    return [String(e), true];
  }
}
