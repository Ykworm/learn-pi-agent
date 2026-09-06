/**
 * 为什么存在：第 1 片需要一个能从终端触发 ask() 的入口；完整 CLI / --json 是第 6 片。
 * 功能作用：读配置和命令行上的那一句 user，把 ConsoleRenderer 挂上 Agent，跑一个 turn。打印由听众做。
 */
import { Agent } from "./agent/agent.js";
import { loadAppConfig } from "./config/load.js";
import { ConsoleRenderer } from "./renderers/console.js";

function main(): Promise<void> {
	const userText = process.argv.slice(2).join(" ").trim();
	if (!userText) {
		console.error('用法: npx tsx src/cli.ts "请用 echo 工具重复：hello"');
		process.exit(1);
	}

	const config = loadAppConfig();
	const agent = new Agent(
		{
			apiKey: config.apiKey,
			baseURL: config.baseURL,
			model: config.model,
			systemPrompt: config.systemPrompt,
		},
		new ConsoleRenderer(),
	);

	return agent.ask(userText);
}

main().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
