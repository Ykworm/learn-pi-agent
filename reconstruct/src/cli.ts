/**
 * 为什么存在：第 1 片需要一个能从终端触发 ask() 的入口；完整 CLI / --json 是第 6 片。
 * 功能作用：读环境变量和命令行上的那一句 user，跑一个 turn，把终答打到 stdout。
 *
 * 环境变量：OPENAI_API_KEY（必填）、OPENAI_BASE_URL、OPENAI_MODEL。
 */
import { Agent } from "./agent/agent.js";

const DEFAULT_SYSTEM = `你是一个会使用工具的助手。
需要复述或确认用户给出的文字时，必须调用 echo 工具，不要自己编一句替代。
工具返回之后，再用简短中文说明你做了什么。`;

function main(): Promise<void> {
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) {
		console.error("缺少 OPENAI_API_KEY");
		process.exit(1);
	}

	const userText = process.argv.slice(2).join(" ").trim();
	if (!userText) {
		console.error('用法: npx tsx src/cli.ts "请用 echo 工具重复：hello"');
		process.exit(1);
	}

	const baseURL = process.env.OPENAI_BASE_URL;
	const agent = new Agent({
		apiKey,
		...(baseURL !== undefined && baseURL !== "" ? { baseURL } : {}),
		model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
		systemPrompt: DEFAULT_SYSTEM,
	});

	return agent.ask(userText).then((text) => {
		process.stdout.write(`${text}\n`);
	});
}

main().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
