import fs from "fs";
import { spawnSync } from "child_process";
import type { ToolDef } from "../providers/interface.js";
import { todo } from "../todo.js";

export const READ_TOOL: ToolDef = {
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

export const WRITE_TOOL: ToolDef = {
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

export const BASH_TOOL: ToolDef = {
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

export const TODO_TOOL: ToolDef = {
  name: "todo",
  description: "Rewrite the current session plan for multi-step work.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            content: { type: "string" },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed"],
            },
            activeForm: {
              type: "string",
              description: "Optional present-continuous label.",
            },
          },
          required: ["content", "status"],
        },
      },
    },
    required: ["items"],
  },
};

export const CHILD_TOOLS: ToolDef[] = [READ_TOOL, WRITE_TOOL, BASH_TOOL, TODO_TOOL];

export const TASK_TOOL: ToolDef = {
  name: "task",
  description:
    "Spawn a subagent with fresh context. It shares the filesystem but not conversation history.",
  input_schema: {
    type: "object",
    properties: {
      prompt:      { type: "string" },
      description: { type: "string", description: "Short description of the task" },
    },
    required: ["prompt"],
  },
};

export const PARENT_TOOLS: ToolDef[] = [...CHILD_TOOLS, TASK_TOOL];

type ToolInput = Record<string, unknown>;

export function executeTool(name: string, input: ToolInput): [string, boolean] {
  try {
    if (name === "read_file") {
      return [fs.readFileSync(input.path as string, "utf-8"), false];
    } else if (name === "write_file") {
      fs.writeFileSync(input.path as string, input.content as string, "utf-8");
      return [`Written to ${input.path}`, false];
    } else if (name === "bash_exec") {
      const r = spawnSync(input.command as string, {
        shell: true,
        timeout: 30_000,
        encoding: "utf-8",
      });
      if (r.error) return [String(r.error), true];
      return [(r.stdout ?? "") + (r.stderr ?? ""), false];
    } else if (name === "todo") {
      const result = todo.update(input.items as unknown[]);
      console.log("\n" + result);
      return [result, false];
    } else {
      return [`Unknown tool: ${name}`, true];
    }
  } catch (e) {
    return [String(e), true];
  }
}
