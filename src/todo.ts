import fs from "fs";
import path from "path";

export type TaskStatus = "pending" | "in_progress" | "completed";

export interface Task {
  id: number;
  subject: string;
  description: string;
  status: TaskStatus;
  blockedBy: number[];
  owner: string;
}

const MARKER: Record<TaskStatus, string> = {
  pending: "[ ]",
  in_progress: "[>]",
  completed: "[x]",
};

export class TaskManager {
  private dir: string;
  private nextId: number;

  constructor(tasksDir: string) {
    this.dir = tasksDir;
    fs.mkdirSync(tasksDir, { recursive: true });
    this.nextId = this._maxId() + 1;
  }

  private _filePath(id: number): string {
    return path.join(this.dir, `task_${id}.json`);
  }

  private _maxId(): number {
    try {
      const ids = fs.readdirSync(this.dir)
        .filter((f) => /^task_\d+\.json$/.test(f))
        .map((f) => parseInt(f.match(/\d+/)![0], 10));
      return ids.length ? Math.max(...ids) : 0;
    } catch {
      return 0;
    }
  }

  private _load(id: number): Task {
    const p = this._filePath(id);
    if (!fs.existsSync(p)) throw new Error(`Task ${id} not found`);
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  }

  private _save(task: Task): void {
    fs.writeFileSync(this._filePath(task.id), JSON.stringify(task, null, 2), "utf-8");
  }

  // 完成某任务后，从其他任务的 blockedBy 中移除它
  private _clearDependency(completedId: number): void {
    try {
      for (const f of fs.readdirSync(this.dir).filter((f) => /^task_\d+\.json$/.test(f))) {
        const task: Task = JSON.parse(fs.readFileSync(path.join(this.dir, f), "utf-8"));
        if (task.blockedBy.includes(completedId)) {
          task.blockedBy = task.blockedBy.filter((x) => x !== completedId);
          this._save(task);
        }
      }
    } catch { /* ignore */ }
  }

  create(subject: string, description = ""): string {
    const task: Task = {
      id: this.nextId++,
      subject,
      description,
      status: "pending",
      blockedBy: [],
      owner: "",
    };
    this._save(task);
    return JSON.stringify(task, null, 2);
  }

  get(id: number): string {
    return JSON.stringify(this._load(id), null, 2);
  }

  update(id: number, status?: TaskStatus, addBlockedBy?: number[], removeBlockedBy?: number[]): string {
    const task = this._load(id);
    if (status) {
      if (!["pending", "in_progress", "completed"].includes(status)) {
        throw new Error(`Invalid status: ${status}`);
      }
      task.status = status;
      if (status === "completed") this._clearDependency(id);
    }
    if (addBlockedBy?.length) {
      task.blockedBy = [...new Set([...task.blockedBy, ...addBlockedBy])];
    }
    if (removeBlockedBy?.length) {
      task.blockedBy = task.blockedBy.filter((x) => !removeBlockedBy.includes(x));
    }
    this._save(task);
    return JSON.stringify(task, null, 2);
  }

  listAll(): string {
    let files: string[];
    try {
      files = fs.readdirSync(this.dir)
        .filter((f) => /^task_\d+\.json$/.test(f))
        .sort((a, b) => parseInt(a.match(/\d+/)![0], 10) - parseInt(b.match(/\d+/)![0], 10));
    } catch {
      return "No tasks.";
    }
    if (!files.length) return "No tasks.";
    return files.map((f) => {
      const t: Task = JSON.parse(fs.readFileSync(path.join(this.dir, f), "utf-8"));
      const blocked = t.blockedBy.length ? ` (blocked by: ${JSON.stringify(t.blockedBy)})` : "";
      return `${MARKER[t.status]} #${t.id}: ${t.subject}${blocked}`;
    }).join("\n");
  }
}

export const tasks = new TaskManager(path.join(process.cwd(), ".tasks"));
