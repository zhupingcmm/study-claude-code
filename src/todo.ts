export type TodoStatus = "pending" | "in_progress" | "completed";

export interface PlanItem {
  content: string;
  status: TodoStatus;
  activeForm?: string;
}

const PLAN_REMINDER_INTERVAL = 3;
const MAX_ITEMS = 12;

const MARKER: Record<TodoStatus, string> = {
  pending: "[ ]",
  in_progress: "[>]",
  completed: "[x]",
};

export class TodoManager {
  private items: PlanItem[] = [];
  private roundsSinceUpdate = 0;

  update(rawItems: unknown[]): string {
    if (rawItems.length > MAX_ITEMS) {
      throw new Error(`Keep the session plan short (max ${MAX_ITEMS} items)`);
    }

    const normalized: PlanItem[] = [];
    let inProgressCount = 0;

    for (let i = 0; i < rawItems.length; i++) {
      const raw = rawItems[i] as Record<string, unknown>;
      const content = String(raw.content ?? "").trim();
      const status = String(raw.status ?? "pending").toLowerCase() as TodoStatus;
      const activeForm = String(raw.activeForm ?? "").trim();

      if (!content) throw new Error(`Item ${i}: content required`);
      if (!["pending", "in_progress", "completed"].includes(status)) {
        throw new Error(`Item ${i}: invalid status '${status}'`);
      }
      if (status === "in_progress") inProgressCount++;

      normalized.push({ content, status, ...(activeForm ? { activeForm } : {}) });
    }

    if (inProgressCount > 1) throw new Error("Only one plan item can be in_progress");

    this.items = normalized;
    this.roundsSinceUpdate = 0;
    return this.render();
  }

  noteRoundWithoutUpdate(): void {
    this.roundsSinceUpdate++;
  }

  reminder(): string | null {
    if (!this.items.length) return null;
    if (this.roundsSinceUpdate < PLAN_REMINDER_INTERVAL) return null;
    return "<reminder>Refresh your current plan before continuing.</reminder>";
  }

  render(): string {
    if (!this.items.length) return "No session plan yet.";

    const lines = this.items.map((item) => {
      let line = `${MARKER[item.status]} ${item.content}`;
      if (item.status === "in_progress" && item.activeForm) {
        line += ` (${item.activeForm})`;
      }
      return line;
    });

    const completed = this.items.filter((i) => i.status === "completed").length;
    lines.push(`\n(${completed}/${this.items.length} completed)`);
    return lines.join("\n");
  }
}

export const todo = new TodoManager();
