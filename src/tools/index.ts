import fs from "fs";
import { spawnSync } from "child_process";
import type { ToolDef } from "../providers/interface.js";
import { tasks } from "../todo.js";
import type { TaskStatus } from "../todo.js";
import { SKILL_REGISTRY } from "../skills.js";

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

export const TASK_CREATE_TOOL: ToolDef = {
  name: "task_create",
  description: "Create a new persistent task.",
  input_schema: {
    type: "object",
    properties: {
      subject:     { type: "string" },
      description: { type: "string" },
    },
    required: ["subject"],
  },
};

export const TASK_UPDATE_TOOL: ToolDef = {
  name: "task_update",
  description: "Update a task's status or dependency list.",
  input_schema: {
    type: "object",
    properties: {
      task_id:         { type: "integer" },
      status:          { type: "string", enum: ["pending", "in_progress", "completed"] },
      addBlockedBy:    { type: "array", items: { type: "integer" } },
      removeBlockedBy: { type: "array", items: { type: "integer" } },
    },
    required: ["task_id"],
  },
};

export const TASK_LIST_TOOL: ToolDef = {
  name: "task_list",
  description: "List all tasks with status and dependency summary.",
  input_schema: { type: "object", properties: {} },
};

export const TASK_GET_TOOL: ToolDef = {
  name: "task_get",
  description: "Get full details of a task by ID.",
  input_schema: {
    type: "object",
    properties: {
      task_id: { type: "integer" },
    },
    required: ["task_id"],
  },
};

export const LOAD_SKILL_TOOL: ToolDef = {
  name: "load_skill",
  description: "Load the full body of a named skill into the current context.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string" },
    },
    required: ["name"],
  },
};

export const CHILD_TOOLS: ToolDef[] = [
  READ_TOOL, WRITE_TOOL, BASH_TOOL, LOAD_SKILL_TOOL,
  TASK_CREATE_TOOL, TASK_UPDATE_TOOL, TASK_LIST_TOOL, TASK_GET_TOOL,
];

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

export const COMPACT_TOOL: ToolDef = {
  name: "compact",
  description: "Summarize earlier conversation so work can continue in a smaller context.",
  input_schema: {
    type: "object",
    properties: {
      focus: { type: "string", description: "What to prioritize preserving in the summary" },
    },
  },
};

export const PARENT_TOOLS: ToolDef[] = [...CHILD_TOOLS, TASK_TOOL, COMPACT_TOOL];

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
    } else if (name === "task_create") {
      return [tasks.create(input.subject as string, input.description as string | undefined), false];
    } else if (name === "task_update") {
      return [tasks.update(
        input.task_id as number,
        input.status as TaskStatus | undefined,
        input.addBlockedBy as number[] | undefined,
        input.removeBlockedBy as number[] | undefined,
      ), false];
    } else if (name === "task_list") {
      return [tasks.listAll(), false];
    } else if (name === "task_get") {
      return [tasks.get(input.task_id as number), false];
    } else if (name === "load_skill") {
      return [SKILL_REGISTRY.loadFullText(input.name as string), false];
    } else {
      return [`Unknown tool: ${name}`, true];
    }
  } catch (e) {
    return [String(e), true];
  }
}
