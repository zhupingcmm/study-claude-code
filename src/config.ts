import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SKILL_REGISTRY } from "./skills.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const MAX_TOKENS = 4096;
export const MAX_TURNS = 20;
export const SYSTEM =
  `You are a coding agent at ${process.cwd()}.\n` +
  `Use load_skill when a task needs specialized instructions before you act.\n\n` +
  `Skills available:\n${SKILL_REGISTRY.describeAvailable()}`;

const CONFIG_FILE = path.join(__dirname, "..", ".minicc.json");

interface Config {
  apiKey: string;
  baseUrl?: string;
  model: string;
  provider?: "anthropic" | "openai-compat";
}

export function loadConfig(): Config {
  let fileConfig: { apiKey?: string; baseUrl?: string; model?: string; provider?: string } = {};
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    fileConfig = JSON.parse(raw);
  } catch {
    // 配置文件不存在或格式错误，继续尝试环境变量
  }

  const apiKey = fileConfig.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("错误：未找到 ANTHROPIC_API_KEY");
    console.error(`  方式 1：写入配置文件  echo '{"apiKey":"sk-ant-..."}' > minicc/.minicc.json`);
    console.error("  方式 2：设置环境变量  export ANTHROPIC_API_KEY=\"sk-ant-...\"");
    process.exit(1);
  }

  return {
    apiKey,
    baseUrl: fileConfig.baseUrl ?? process.env.ANTHROPIC_BASE_URL,
    model: fileConfig.model ?? "claude-opus-4-6",
    provider: (fileConfig.provider as Config["provider"]) ?? "anthropic",
  };
}
