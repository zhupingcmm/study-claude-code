import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { TaskManager, type Task } from "../src/todo.js";

let tmpDir: string;
let mgr: TaskManager;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "minicc-todo-"));
  mgr = new TaskManager(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function parse(json: string): Task {
  return JSON.parse(json);
}

describe("TaskManager — create", () => {
  it("writes a task file with id=1 and default fields", () => {
    const task = parse(mgr.create("first task", "details"));
    expect(task.id).toBe(1);
    expect(task.subject).toBe("first task");
    expect(task.description).toBe("details");
    expect(task.status).toBe("pending");
    expect(task.blockedBy).toEqual([]);
    expect(fs.existsSync(path.join(tmpDir, "task_1.json"))).toBe(true);
  });

  it("auto-increments id on subsequent creates", () => {
    parse(mgr.create("a"));
    const second = parse(mgr.create("b"));
    expect(second.id).toBe(2);
  });

  it("resumes next id based on max existing task on the disk", () => {
    fs.writeFileSync(
      path.join(tmpDir, "task_7.json"),
      JSON.stringify({ id: 7, subject: "x", description: "", status: "pending", blockedBy: [], owner: "" }),
    );
    const fresh = new TaskManager(tmpDir);
    const next = parse(fresh.create("new"));
    expect(next.id).toBe(8);
  });
});

describe("TaskManager — get", () => {
  it("returns stored task JSON", () => {
    const created = parse(mgr.create("read me"));
    const got = parse(mgr.get(created.id));
    expect(got).toEqual(created);
  });

  it("throws when the task does not exist", () => {
    expect(() => mgr.get(999)).toThrow(/Task 999 not found/);
  });
});

describe("TaskManager — update", () => {
  it("changes status", () => {
    const t = parse(mgr.create("x"));
    const updated = parse(mgr.update(t.id, "in_progress"));
    expect(updated.status).toBe("in_progress");
    expect(parse(mgr.get(t.id)).status).toBe("in_progress");
  });

  it("rejects invalid status", () => {
    const t = parse(mgr.create("x"));
    expect(() => mgr.update(t.id, "bogus" as never)).toThrow(/Invalid status/);
  });

  it("adds blockedBy entries without duplication", () => {
    const t = parse(mgr.create("x"));
    mgr.update(t.id, undefined, [1, 2]);
    const again = parse(mgr.update(t.id, undefined, [2, 3]));
    expect(again.blockedBy.sort()).toEqual([1, 2, 3]);
  });

  it("removes blockedBy entries", () => {
    const t = parse(mgr.create("x"));
    mgr.update(t.id, undefined, [1, 2, 3]);
    const removed = parse(mgr.update(t.id, undefined, undefined, [2]));
    expect(removed.blockedBy.sort()).toEqual([1, 3]);
  });

  it("cascades: completing a blocker clears it from dependents", () => {
    const blocker = parse(mgr.create("blocker"));
    const dep = parse(mgr.create("dependent"));
    mgr.update(dep.id, undefined, [blocker.id]);
    expect(parse(mgr.get(dep.id)).blockedBy).toEqual([blocker.id]);

    mgr.update(blocker.id, "completed");
    expect(parse(mgr.get(dep.id)).blockedBy).toEqual([]);
  });
});

describe("TaskManager — listAll", () => {
  it("returns 'No tasks.' when empty", () => {
    expect(mgr.listAll()).toBe("No tasks.");
  });

  it("formats tasks with status markers and blockedBy", () => {
    const a = parse(mgr.create("Setup project"));
    const b = parse(mgr.create("Write docs"));
    mgr.update(a.id, "in_progress");
    mgr.update(b.id, undefined, [a.id]);

    const out = mgr.listAll();
    expect(out).toContain(`[>] #${a.id}: Setup project`);
    expect(out).toContain(`[ ] #${b.id}: Write docs (blocked by: [${a.id}])`);
  });

  it("lists tasks sorted by numeric id", () => {
    // Seed disk with out-of-order IDs to verify sorting.
    fs.writeFileSync(
      path.join(tmpDir, "task_10.json"),
      JSON.stringify({ id: 10, subject: "ten", description: "", status: "pending", blockedBy: [], owner: "" }),
    );
    fs.writeFileSync(
      path.join(tmpDir, "task_2.json"),
      JSON.stringify({ id: 2, subject: "two", description: "", status: "pending", blockedBy: [], owner: "" }),
    );
    const fresh = new TaskManager(tmpDir);
    const lines = fresh.listAll().split("\n");
    expect(lines[0]).toContain("#2");
    expect(lines[1]).toContain("#10");
  });
});
