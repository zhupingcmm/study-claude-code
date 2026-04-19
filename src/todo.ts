export type TodoStatus = "pending" | "in_progress" | "done";

export interface TodoItem {
  id: string;
  content: string;
  status: TodoStatus;
}

const STATUS_ICON: Record<TodoStatus, string> = {
  pending: "○",
  in_progress: "◐",
  done: "●",
};

class TodoList {
  private items: TodoItem[] = [];
  private nextId = 1;

  add(content: string): TodoItem {
    const item: TodoItem = { id: String(this.nextId++), content, status: "pending" };
    this.items.push(item);
    return item;
  }

  update(id: string, status: TodoStatus): TodoItem | null {
    const item = this.items.find((i) => i.id === id);
    if (!item) return null;
    item.status = status;
    return item;
  }

  getAll(): TodoItem[] {
    return [...this.items];
  }

  display(): void {
    if (this.items.length === 0) return;
    console.log("\n─── Tasks ──────────────────────────────");
    for (const item of this.items) {
      console.log(`  ${STATUS_ICON[item.status]} [${item.id}] ${item.content}`);
    }
    console.log("─────────────────────────────────────────\n");
  }
}

export const todo = new TodoList();
