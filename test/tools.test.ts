import { describe, it, expect, afterEach, vi } from "vitest";
import { executeTool } from "../src/tools/index.js";
import fs from "fs";
import os from "os";
import path from "path";

vi.mock("../src/skills.js", () => ({
  SKILL_REGISTRY: {
    loadFullText: (name: string) =>
      name === "deploy"
        ? '<skill name="deploy">\nRun deploy.\n</skill>'
        : `Error: Unknown skill '${name}'. Available skills: deploy`,
    describeAvailable: () => "- deploy: Deploy the app",
  },
}));

const taskCalls: Record<string, unknown[][]> = {
  create: [], get: [], update: [], listAll: [],
};
vi.mock("../src/todo.js", () => ({
  tasks: {
    create: (...args: unknown[]) => { taskCalls.create.push(args); return `created:${JSON.stringify(args)}`; },
    get: (...args: unknown[]) => { taskCalls.get.push(args); return `got:${JSON.stringify(args)}`; },
    update: (...args: unknown[]) => { taskCalls.update.push(args); return `updated:${JSON.stringify(args)}`; },
    listAll: (...args: unknown[]) => { taskCalls.listAll.push(args); return "list-result"; },
  },
}));

const tmpFile = path.join(os.tmpdir(), "minicc-test-tool.txt");
const nonexistentPath = path.join(os.tmpdir(), "minicc_no_such_dir_12345", "file.txt");

afterEach(() => {
  try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  for (const k of Object.keys(taskCalls)) taskCalls[k].length = 0;
});

describe("executeTool — read_file", () => {
  it("returns file content on success", () => {
    fs.writeFileSync(tmpFile, "hello world", "utf-8");
    const [output, isError] = executeTool("read_file", { path: tmpFile });
    expect(output).toBe("hello world");
    expect(isError).toBe(false);
  });

  it("returns error string when file does not exist", () => {
    const [output, isError] = executeTool("read_file", { path: nonexistentPath });
    expect(isError).toBe(true);
    expect(output).toMatch(/ENOENT|no such file/i);
  });
});

describe("executeTool — write_file", () => {
  it("writes file and returns confirmation", () => {
    const [output, isError] = executeTool("write_file", { path: tmpFile, content: "written" });
    expect(isError).toBe(false);
    expect(output).toContain("Written to");
    expect(fs.readFileSync(tmpFile, "utf-8")).toBe("written");
  });

  it("returns error when parent directory does not exist", () => {
    const [output, isError] = executeTool("write_file", { path: nonexistentPath, content: "test" });
    expect(isError).toBe(true);
    expect(output).toMatch(/ENOENT|no such file/i);
  });
});

describe("executeTool — bash_exec", () => {
  it("returns stdout for successful command", () => {
    const [output, isError] = executeTool("bash_exec", { command: "echo minicc_test" });
    expect(isError).toBe(false);
    expect(output).toContain("minicc_test");
  });

  // bash_exec 不将非零退出码视为 isError，这是设计决策：让 Claude 从输出中判断
  it("returns stderr output and isError=false for non-zero exit", () => {
    const [output, isError] = executeTool("bash_exec", {
      command: `node -e "process.stderr.write('cmd_failed'); process.exit(1)"`,
    });
    expect(isError).toBe(false);
    expect(output).toContain("cmd_failed");
  });
});

describe("executeTool — unknown tool", () => {
  it("returns error for unknown tool name", () => {
    const [output, isError] = executeTool("nonexistent_tool", { foo: "bar" });
    expect(isError).toBe(true);
    expect(output).toContain("Unknown tool");
  });
});

describe("executeTool — load_skill", () => {
  it("returns skill body for a known skill", () => {
    const [output, isError] = executeTool("load_skill", { name: "deploy" });
    expect(isError).toBe(false);
    expect(output).toContain('<skill name="deploy">');
    expect(output).toContain("Run deploy.");
  });

  it("returns error message for an unknown skill", () => {
    const [output, isError] = executeTool("load_skill", { name: "no-such-skill" });
    expect(isError).toBe(false);  // registry error is content, not an execution error
    expect(output).toMatch(/Error: Unknown skill 'no-such-skill'/);
  });
});

describe("executeTool — task_create", () => {
  it("forwards subject and description to tasks.create", () => {
    const [output, isError] = executeTool("task_create", {
      subject: "Setup project", description: "init repo",
    });
    expect(isError).toBe(false);
    expect(output).toContain("created");
    expect(taskCalls.create).toEqual([["Setup project", "init repo"]]);
  });

  it("works when description is omitted", () => {
    const [, isError] = executeTool("task_create", { subject: "only subject" });
    expect(isError).toBe(false);
    expect(taskCalls.create).toEqual([["only subject", undefined]]);
  });
});

describe("executeTool — task_update", () => {
  it("forwards id, status, and blockedBy mutations", () => {
    const [output, isError] = executeTool("task_update", {
      task_id: 3,
      status: "in_progress",
      addBlockedBy: [1, 2],
      removeBlockedBy: [5],
    });
    expect(isError).toBe(false);
    expect(output).toContain("updated");
    expect(taskCalls.update).toEqual([[3, "in_progress", [1, 2], [5]]]);
  });

  it("passes undefined for optional fields when absent", () => {
    executeTool("task_update", { task_id: 7 });
    expect(taskCalls.update).toEqual([[7, undefined, undefined, undefined]]);
  });
});

describe("executeTool — task_list", () => {
  it("calls tasks.listAll with no arguments", () => {
    const [output, isError] = executeTool("task_list", {});
    expect(isError).toBe(false);
    expect(output).toBe("list-result");
    expect(taskCalls.listAll).toEqual([[]]);
  });
});

describe("executeTool — task_get", () => {
  it("forwards task_id to tasks.get", () => {
    const [output, isError] = executeTool("task_get", { task_id: 42 });
    expect(isError).toBe(false);
    expect(output).toContain("got");
    expect(taskCalls.get).toEqual([[42]]);
  });
});
