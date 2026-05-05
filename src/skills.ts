import fs from "fs";
import path from "path";
import os from "os";

interface SkillManifest {
  name: string;
  description: string;
  path: string;
}

interface SkillDocument {
  manifest: SkillManifest;
  body: string;
}

export class SkillRegistry {
  private documents: Map<string, SkillDocument> = new Map();

  constructor(skillsDir: string) {
    this._loadAll(skillsDir);
  }

  private _loadAll(skillsDir: string): void {
    if (!fs.existsSync(skillsDir)) return;

    for (const filePath of this._findSkillFiles(skillsDir).sort()) {
      try {
        const text = fs.readFileSync(filePath, "utf-8");
        const [meta, body] = this._parseFrontmatter(text);
        const name = meta["name"] ?? path.basename(path.dirname(filePath));
        const description = meta["description"] ?? "No description";
        this.documents.set(name, {
          manifest: { name, description, path: filePath },
          body: body.trim(),
        });
      } catch {
        // skip unreadable files
      }
    }
  }

  private _findSkillFiles(dir: string): string[] {

    
    const results: string[] = [];
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...this._findSkillFiles(fullPath));
        } else if (entry.name === "SKILL.md") {
          results.push(fullPath);
        }
      }
    } catch {
      // skip unreadable directories
    }
    return results;
  }

  // 将 SKILL.md 拆成 frontmatter 键值对 + 正文两部分。
  // frontmatter 格式：文件开头由 --- 包裹的 key: value 行，如：
  //   ---
  //   name: deploy
  //   description: Deploy the app
  //   ---
  private _parseFrontmatter(text: string): [Record<string, string>, string] {
    // 捕获组 1 = frontmatter 内容，捕获组 2 = 剩余正文
    const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)/);
    if (!match) return [{}, text]; // 无 frontmatter，整个文件视为正文

    const meta: Record<string, string> = {};
    for (const line of match[1].trim().split("\n")) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue; // 跳过不含冒号的行（注释、空行等）
      meta[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 1).trim();
    }
    return [meta, match[2]];
  }

  describeAvailable(): string {
    if (this.documents.size === 0) return "(no skills available)";
    return [...this.documents.keys()]
      .sort()
      .map((name) => {
        const { manifest } = this.documents.get(name)!;
        return `- ${manifest.name}: ${manifest.description}`;
      })
      .join("\n");
  }

  loadFullText(name: string): string {
    const document = this.documents.get(name);
    if (!document) {
      const known = [...this.documents.keys()].sort().join(", ") || "(none)";
      return `Error: Unknown skill '${name}'. Available skills: ${known}`;
    }
    return `<skill name="${document.manifest.name}">\n${document.body}\n</skill>`;
  }
}

function createRegistry(): SkillRegistry {
  const local = new SkillRegistry(path.join(process.cwd(), "skills"));
  if (local.describeAvailable() !== "(no skills available)") return local;
  return new SkillRegistry(path.join(os.homedir(), ".claude", "skills"));
}

export const SKILL_REGISTRY = createRegistry();
