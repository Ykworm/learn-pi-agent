/**
 * 为什么存在：换 DeepSeek / 别的 OpenAI-compatible 端点不应改 loop；两条信封各有一份 endpoint，密钥不要提交。
 * 功能作用：读 config.json，再用可选的 config.local.json 覆盖。`--api` 选中哪一套，就用那一套的 baseURL / model / 密钥。
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 为什么存在：命令行、配置文件、session 头都要写同一对字符串，拼错就该当场失败。
 * 功能作用：只接受 completions 或 responses。
 */
export type ApiKind = "completions" | "responses";

export function parseApiKind(value: string): ApiKind {
	if (value === "completions" || value === "responses") {
		return value;
	}
	throw new Error(`未知 api: ${value}（要用 completions 或 responses）`);
}

export type AppConfig = {
	apiKey: string;
	baseURL: string;
	model: string;
	api: ApiKind;
	systemPrompt: string;
};

type EndpointShape = {
	baseURL?: unknown;
	model?: unknown;
	apiKeyEnv?: unknown;
	apiKey?: unknown;
};

type FileShape = {
	api?: unknown;
	systemPrompt?: unknown;
	completions?: unknown;
	responses?: unknown;
	baseURL?: unknown;
	model?: unknown;
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

function asEndpoint(value: unknown, label: string): EndpointShape {
	if (value === undefined) {
		return {};
	}
	if (typeof value !== "object" || value === null) {
		throw new Error(`${label} 必须是对象`);
	}
	return value as EndpointShape;
}

function pickString(...values: unknown[]): string {
	for (const value of values) {
		if (typeof value === "string" && value.trim() !== "") {
			return value.trim();
		}
	}
	return "";
}

/**
 * 为什么存在：Completions 和 Responses 通常不是同一家端点；一套 baseURL 无法两用。
 * 功能作用：按 api 取出那一套的 baseURL / model / 密钥。apiOverride 有值时压过文件里的 api。
 */
export function loadAppConfig(apiOverride?: ApiKind): AppConfig {
	const sharedPath = join(reconstructRoot, "config.json");
	const localPath = join(reconstructRoot, "config.local.json");
	const shared = readJson(sharedPath);
	const local = existsSync(localPath) ? readJson(localPath) : {};

	const systemPrompt = asString(local.systemPrompt ?? shared.systemPrompt, "systemPrompt");
	const apiRaw = apiOverride ?? local.api ?? shared.api ?? "completions";
	if (typeof apiRaw !== "string") {
		throw new Error("配置 api 必须是字符串 completions 或 responses");
	}
	const api = parseApiKind(apiRaw);

	const sharedEp = asEndpoint(api === "responses" ? shared.responses : shared.completions, api);
	const localEp = asEndpoint(api === "responses" ? local.responses : local.completions, api);

	const baseURL = asString(
		pickString(
			localEp.baseURL,
			sharedEp.baseURL,
			api === "completions" ? local.baseURL : "",
			api === "completions" ? shared.baseURL : "",
		),
		`${api}.baseURL`,
	);
	const model = asString(
		pickString(
			localEp.model,
			sharedEp.model,
			api === "completions" ? local.model : "",
			api === "completions" ? shared.model : "",
		),
		`${api}.model`,
	);
	const apiKeyEnv = asString(
		pickString(
			localEp.apiKeyEnv,
			sharedEp.apiKeyEnv,
			api === "completions" ? local.apiKeyEnv : "",
			api === "completions" ? shared.apiKeyEnv : "",
		),
		`${api}.apiKeyEnv`,
	);

	const legacyKey = api === "completions" ? pickString(local.apiKey) : "";
	const apiKey = pickString(localEp.apiKey, legacyKey, process.env[apiKeyEnv] ?? "");
	if (apiKey === "") {
		throw new Error(
			`缺少 ${api} 的 API 密钥。在 config.local.json 的 ${api}.apiKey 填入，或设置环境变量 ${apiKeyEnv}。`,
		);
	}

	return { apiKey, baseURL, model, api, systemPrompt };
}
