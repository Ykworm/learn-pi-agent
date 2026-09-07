/**
 * 为什么存在：第 1 片需要一个能从终端触发 ask() 的入口；完整 CLI / --json 是第 6 片。
 * 功能作用：读配置和命令行上的那一句 user，把 Console 和 SessionManager 挂上 Agent，跑一个 turn。Ctrl+C 调 interrupt()。
 */
import { join } from "node:path";
import { Agent } from "./agent/agent.js";
import { loadAppConfig, reconstructRoot } from "./config/load.js";
import { ConsoleRenderer } from "./renderers/console.js";
import { SessionManager } from "./session/manager.js";

function parseArgs(argv: string[]): { continueSession: boolean; userText: string } {
	let continueSession = false;
	const parts: string[] = [];
	for (const arg of argv) {
		if (arg === "--continue" || arg === "-c") {
			continueSession = true;
		} else {
			parts.push(arg);
		}
	}
	return { continueSession, userText: parts.join(" ").trim() };
}

async function main(): Promise<void> {
	const { continueSession, userText } = parseArgs(process.argv.slice(2));
	if (!userText) {
		console.error('用法: npx tsx src/cli.ts [--continue] "列出当前目录"');
		process.exit(1);
	}

	let config = loadAppConfig();
	const session = SessionManager.open({
		dir: join(reconstructRoot, ".sessions"),
		continue: continueSession,
	});
	const record = session.read();
	if (record) {
		config = {
			...config,
			baseURL: record.header.config.baseURL,
			model: record.header.config.model,
			systemPrompt: record.header.config.systemPrompt,
		};
		console.log(`[continue] ${record.events.length} events from ${session.filePath}`);
	} else {
		session.writeHeader({
			baseURL: config.baseURL,
			model: config.model,
			systemPrompt: config.systemPrompt,
		});
	}

	const agent = new Agent(
		{
			apiKey: config.apiKey,
			baseURL: config.baseURL,
			model: config.model,
			systemPrompt: config.systemPrompt,
		},
		new ConsoleRenderer(),
		session,
	);
	if (record) {
		agent.restoreFromEvents(record.events);
	}
	await agent.emitSessionStart(session.id);

	const onSigint = (): void => {
		agent.interrupt();
	};
	process.on("SIGINT", onSigint);
	try {
		await agent.ask(userText);
	} finally {
		process.off("SIGINT", onSigint);
	}
}

main().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
