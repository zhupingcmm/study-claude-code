import { describe, it, expect, afterEach } from "vitest";
import { executeTool } from "./index.js";
import fs from "fs";
import os from "os";
import path from "path";

const tmpFile = path.join(os.tmpdir(), "minicc-test-tool.txt");
const nonexistentPath = path.join(os.tmpdir(), "minicc_no_such_dir_12345", "file.txt");

afterEach(() => {
  try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
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
