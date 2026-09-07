/**
 * 为什么存在：换 DeepSeek / 别的 OpenAI-compatible 端点不应改 loop；endpoint、模型、密钥来源放在 reconstruct 根目录的 JSON 里。
 * 功能作用：读 config.json，再用可选的 config.local.json 覆盖（可写 apiKey）。密钥不要提交。
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type AppConfig = {
	apiKey: string;
	baseURL: string;
	model: string;
	systemPrompt: string;
};

type FileShape = {
	baseURL?: unknown;
	model?: unknown;
	systemPrompt?: unknown;
	apiKeyEnv?: unknown;
	apiKey?: unknown;
};

/** 为什么存在：session 文件要固定落在 reconstruct/.sessions，不跟调用时的 cwd 乱跑。 */
export const reconstructRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function readJson(path: string): FileShape {
	const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
	if (typeof raw !== "object" || raw === null) {
		throw new Error(`${path} 根节点必须是对象`);
	}
	return raw as FileShape;
}

function asString(value: unknown, label: string): string {
	if (typeof value !== "string" || value.trim() === "") {
		throw new Error(`配置缺少有效字符串: ${label}`);
	}
	return value;
}

export function loadAppConfig(): AppConfig {
	const sharedPath = join(reconstructRoot, "config.json");
	const localPath = join(reconstructRoot, "config.local.json");
	const shared = readJson(sharedPath);
	const local = existsSync(localPath) ? readJson(localPath) : {};

	const baseURL = asString(local.baseURL ?? shared.baseURL, "baseURL");
	const model = asString(local.model ?? shared.model, "model");
	const systemPrompt = asString(local.systemPrompt ?? shared.systemPrompt, "systemPrompt");
	const apiKeyEnv = asString(local.apiKeyEnv ?? shared.apiKeyEnv, "apiKeyEnv");

	const apiKeyFromFile = typeof local.apiKey === "string" ? local.apiKey.trim() : "";
	const apiKey = apiKeyFromFile !== "" ? apiKeyFromFile : (process.env[apiKeyEnv] ?? "").trim();
	if (apiKey === "") {
		throw new Error(
			`缺少 API 密钥。复制 config.local.example.json 为 config.local.json 并填入 apiKey，或设置环境变量 ${apiKeyEnv}。`,
		);
	}

	return { apiKey, baseURL, model, systemPrompt };
}
