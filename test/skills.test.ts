import { describe, it, expect, afterEach } from "vitest";
import { SkillRegistry } from "../src/skills.js";
import fs from "fs";
import os from "os";
import path from "path";

// --- helpers ---

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = path.join(os.tmpdir(), `minicc-skills-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  tmpDirs.push(dir);
  return dir;
}

function writeSkill(
  baseDir: string,
  folderName: string,
  meta: Record<string, string>,
  body: string,
): void {
  const skillDir = path.join(baseDir, folderName);
  fs.mkdirSync(skillDir, { recursive: true });
  const frontmatter = Object.entries(meta)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), `---\n${frontmatter}\n---\n${body}`);
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// --- describeAvailable ---

describe("SkillRegistry.describeAvailable", () => {
  it("returns placeholder when directory does not exist", () => {
    const reg = new SkillRegistry(path.join(os.tmpdir(), "no_such_skills_dir_xyz"));
    expect(reg.describeAvailable()).toBe("(no skills available)");
  });

  it("returns placeholder for empty directory", () => {
    const reg = new SkillRegistry(makeTmpDir());
    expect(reg.describeAvailable()).toBe("(no skills available)");
  });

  it("lists one skill with name and description", () => {
    const dir = makeTmpDir();
    writeSkill(dir, "greet", { name: "greet", description: "Say hello" }, "## Instructions\nSay hello.");
    const reg = new SkillRegistry(dir);
    expect(reg.describeAvailable()).toBe("- greet: Say hello");
  });

  it("lists multiple skills sorted alphabetically", () => {
    const dir = makeTmpDir();
    writeSkill(dir, "zzz", { name: "zzz", description: "Last" }, "body");
    writeSkill(dir, "aaa", { name: "aaa", description: "First" }, "body");
    writeSkill(dir, "mmm", { name: "mmm", description: "Middle" }, "body");
    const reg = new SkillRegistry(dir);
    expect(reg.describeAvailable()).toBe("- aaa: First\n- mmm: Middle\n- zzz: Last");
  });

  it("falls back to folder name when frontmatter has no name", () => {
    const dir = makeTmpDir();
    // SKILL.md with no frontmatter at all
    const skillDir = path.join(dir, "my-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "Just plain body text.");
    const reg = new SkillRegistry(dir);
    expect(reg.describeAvailable()).toContain("my-skill");
  });
});

// --- loadFullText ---

describe("SkillRegistry.loadFullText", () => {
  it("wraps skill body in <skill> tags", () => {
    const dir = makeTmpDir();
    writeSkill(dir, "deploy", { name: "deploy", description: "Deploy the app" }, "Run npm run deploy.");
    const reg = new SkillRegistry(dir);
    const result = reg.loadFullText("deploy");
    expect(result).toBe('<skill name="deploy">\nRun npm run deploy.\n</skill>');
  });

  it("returns error message for unknown skill", () => {
    const dir = makeTmpDir();
    writeSkill(dir, "alpha", { name: "alpha", description: "Alpha skill" }, "body");
    const reg = new SkillRegistry(dir);
    const result = reg.loadFullText("nonexistent");
    expect(result).toMatch(/Error: Unknown skill 'nonexistent'/);
    expect(result).toContain("alpha");
  });

  it("returns error listing (none) when registry is empty", () => {
    const reg = new SkillRegistry(makeTmpDir());
    const result = reg.loadFullText("anything");
    expect(result).toMatch(/Error: Unknown skill 'anything'/);
    expect(result).toContain("(none)");
  });

  it("trims leading/trailing whitespace from body", () => {
    const dir = makeTmpDir();
    writeSkill(dir, "trim", { name: "trim", description: "d" }, "\n\n  body content  \n\n");
    const reg = new SkillRegistry(dir);
    const result = reg.loadFullText("trim");
    expect(result).toBe('<skill name="trim">\nbody content\n</skill>');
  });
});
