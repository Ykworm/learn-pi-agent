/**
 * 为什么存在：同一套 Agent / 事件要换三种入口：问一句就退、终端里接着问、程序用 stdin/stdout 对话。
 * 功能作用：解析 --continue / --json / --help 和位置参数；按有没有句子、有没有 --json 选皮。loop 只 emit。
 */
import { createInterface } from "node:readline";
import * as readline from "node:readline/promises";
import { join } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { Agent } from "./agent/agent.js";
import { loadAppConfig, parseApiKind, reconstructRoot, type ApiKind } from "./config/load.js";
import type { AgentEventReceiver } from "./events.js";
import { ConsoleRenderer } from "./renderers/console.js";
import { JsonRenderer } from "./renderers/json.js";
import { SessionManager } from "./session/manager.js";

type ParsedCli = {
	help: boolean;
	continueSession: boolean;
	json: boolean;
	api?: ApiKind | undefined;
	messages: string[];
};

function parseArgs(argv: string[]): ParsedCli {
	let help = false;
	let continueSession = false;
	let json = false;
	let api: ApiKind | undefined;
	const messages: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		switch (arg) {
			case "--help":
			case "-h":
				help = true;
				break;
			case "--continue":
			case "-c":
				continueSession = true;
				break;
			case "--json":
				json = true;
				break;
			case "--api": {
				const value = argv[i + 1];
				if (value === undefined) {
					throw new Error("--api 需要 completions 或 responses");
				}
				i += 1;
				api = parseApiKind(value);
				break;
			}
			default:
				if (arg.startsWith("-")) {
					throw new Error(`未知参数: ${arg}`);
				}
				messages.push(arg);
		}
	}
	return { help, continueSession, json, api, messages };
}

function printHelp(): void {
	console.log(`用法: npx tsx src/cli.ts [options] [messages...]

  npx tsx src/cli.ts "列出当前目录"
  npx tsx src/cli.ts "第一句" "第二句"
  npx tsx src/cli.ts
  npx tsx src/cli.ts --continue
  npx tsx src/cli.ts --json "列出当前目录"
  npx tsx src/cli.ts --json
  npx tsx src/cli.ts --api responses "1+1 等于几？不要调工具"

Options:
  --continue, -c    继续最近一份 session
  --json            事件一行一个 JSON 打到 stdout
  --api <type>      completions 或 responses（默认读 config.json）
  --help, -h        显示这段说明

无位置参数 = 交互。每个位置参数是一句独立的 user，按顺序 ask 再退。`);
}

async function reportError(renderer: AgentEventReceiver, err: unknown): Promise<void> {
	const message = err instanceof Error ? err.message : String(err);
	await renderer.on({ type: "error", message });
}

async function withSigint(agent: Agent, run: () => Promise<void>): Promise<void> {
	const onSigint = (): void => {
		agent.interrupt();
	};
	process.on("SIGINT", onSigint);
	try {
		await run();
	} finally {
		process.off("SIGINT", onSigint);
	}
}

async function runSingleShot(agent: Agent, renderer: AgentEventReceiver, messages: string[]): Promise<void> {
	await withSigint(agent, async () => {
		for (const text of messages) {
			try {
				await agent.ask(text);
			} catch (err: unknown) {
				await reportError(renderer, err);
			}
		}
	});
}

async function runConsoleInteractive(agent: Agent, renderer: AgentEventReceiver): Promise<void> {
	//createInterface({ input, output }) 把两根管子绑在一起：键盘进来（input = process.stdin），字打到屏幕上（output = process.stdout）。
	//返回值赋给 rl。下面 await rl.question("> ") 才会印 >，等你打完一行再把字符串给你。
	const rl = readline.createInterface({ input, output });
	let asking = false;
	rl.on("SIGINT", () => {
		if (asking) {
			agent.interrupt();
		} else {
			rl.close();
		}
	});
	console.error("交互：输入一句回车；exit / quit 结束。正在跑时 Ctrl+C 停这一 turn。");
	try {
		while (true) {
			let line: string;
			try {
				// question 是 Node 自带的 readline，
				// 比 Chat Completions、Agent 都早很多，
				// 任何「终端里问一句、等人回车」的程序都能用。
				line = (await rl.question("> ")).trim();
			} catch {
				break;
			}
			if (line === "exit" || line === "quit") {
				break;
			}
			if (!line) {
				continue;
			}
			asking = true;
			try {
				await agent.ask(line);
			} catch (err: unknown) {
				await reportError(renderer, err);
			} finally {
				asking = false;
			}
		}
	} finally {
		rl.close();
	}
}

type JsonCommand = {
	type?: string;
	content?: string;
};

async function runJsonInteractive(agent: Agent, renderer: AgentEventReceiver): Promise<void> {
	const rl = createInterface({ input, output, terminal: false });
	let asking = false;
	let pending: string | null = null;

	const processMessage = async (content: string): Promise<void> => {
		asking = true;
		try {
			await agent.ask(content);
		} catch (err: unknown) {
			await reportError(renderer, err);
		} finally {
			asking = false;
			if (pending !== null) {
				const next = pending;
				pending = null;
				await processMessage(next);
			}
		}
	};

	const onSigint = (): void => {
		if (asking) {
			agent.interrupt();
		} else {
			rl.close();
		}
	};
	process.on("SIGINT", onSigint);

	rl.on("line", (line) => {
		const trimmed = line.trim();
		if (!trimmed) {
			return;
		}
		let command: JsonCommand;
		try {
			command = JSON.parse(trimmed) as JsonCommand;
		} catch (err: unknown) {
			void reportError(renderer, `Invalid JSON: ${err}`);
			return;
		}
		switch (command.type) {
			case "interrupt":
				agent.interrupt();
				break;
			case "message":
				if (!command.content) {
					void reportError(renderer, "Message content is required");
					return;
				}
				if (asking) {
					pending = command.content;
				} else {
					void processMessage(command.content);
				}
				break;
			default:
				void reportError(renderer, `Unknown command type: ${command.type ?? ""}`);
		}
	});

	await new Promise<void>((resolve) => {
		rl.on("close", () => {
			resolve();
		});
	});
	process.off("SIGINT", onSigint);
}

async function main(): Promise<void> {
	let parsed: ParsedCli;
	try {
		parsed = parseArgs(process.argv.slice(2));
	} catch (err: unknown) {
		console.error(err instanceof Error ? err.message : err);
		process.exit(1);
		return;
	}
	if (parsed.help) {
		printHelp();
		return;
	}

	let config = loadAppConfig(parsed.api);
	const session = SessionManager.open({
		dir: join(reconstructRoot, ".sessions"),
		continue: parsed.continueSession,
	});
	const record = session.read();
	if (record) {
		config = loadAppConfig(parseApiKind(record.header.config.api));
		config = {
			...config,
			baseURL: record.header.config.baseURL,
			model: record.header.config.model,
			systemPrompt: record.header.config.systemPrompt,
			api: parseApiKind(record.header.config.api),
		};
		if (!parsed.json) {
			console.log(`[continue] ${record.events.length} events from ${session.filePath}`);
		}
	} else {
		session.writeHeader({
			baseURL: config.baseURL,
			model: config.model,
			systemPrompt: config.systemPrompt,
			api: config.api,
		});
	}

	const renderer: AgentEventReceiver = parsed.json ? new JsonRenderer() : new ConsoleRenderer();
	const agent = new Agent(
		{
			apiKey: config.apiKey,
			baseURL: config.baseURL,
			model: config.model,
			api: config.api,
			systemPrompt: config.systemPrompt,
		},
		renderer,
		session,
	);
	if (record) {
		agent.restoreFromEvents(record.events);
	}
	await agent.emitSessionStart(session.id);

	if (parsed.messages.length === 0) {
		if (parsed.json) {
			await runJsonInteractive(agent, renderer);
		} else {
			await runConsoleInteractive(agent, renderer);
		}
		return;
	}
	await runSingleShot(agent, renderer, parsed.messages);
}

main().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
