/**
 * 为什么存在：事件若只活在内存里，下一进程就无法 --continue；落盘必须是听众，不能写进 loop。
 * 功能作用：追加 jsonl；新 session 写一行头（不含 apiKey）；continue 时打开最近改过的那份。
 */
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AgentEvent, AgentEventReceiver } from "../events.js";

/**
 * 为什么存在：文件头不是 AgentEvent，continue 时要拿回 model / systemPrompt，但不能拿回密钥。
 * 功能作用：jsonl 第一行 type=session 里保存的、可公开的配置。
 */
export type SessionFileConfig = {
	baseURL: string;
	model: string;
	systemPrompt: string;
};

type SessionHeaderLine = {
	type: "session";
	id: string;
	timestamp: string;
	cwd: string;
	config: SessionFileConfig;
};

type SessionEventLine = {
	type: "event";
	timestamp: string;
	event: AgentEvent;
};

/**
 * 为什么存在：continue 需要一次性拿到头和全部事件，再分别交给配置合并与 eventsToMessages。
 * 功能作用：读盘结果。没有合法 session 头则为 null。
 */
export type SessionRecord = {
	header: SessionHeaderLine;
	events: AgentEvent[];
};

function newFileName(id: string): string {
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	return `${stamp}_${id}.jsonl`;
}

function findLatestJsonl(dir: string): string | null {
	if (!existsSync(dir)) {
		return null;
	}
	const files = readdirSync(dir)
		.filter((name) => name.endsWith(".jsonl"))
		.map((name) => {
			const path = join(dir, name);
			return { path, mtime: statSync(path).mtimeMs };
		})
		.sort((a, b) => b.mtime - a.mtime);
	return files[0]?.path ?? null;
}

function parseRecord(filePath: string): SessionRecord | null {
	if (!existsSync(filePath)) {
		return null;
	}
	const raw = readFileSync(filePath, "utf8");
	if (raw.trim() === "") {
		return null;
	}
	let header: SessionHeaderLine | null = null;
	const events: AgentEvent[] = [];
	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "") {
			continue;
		}
		try {
			const parsed: unknown = JSON.parse(trimmed);
			if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) {
				continue;
			}
			const row = parsed as { type: unknown };
			if (row.type === "session") {
				const candidate = parsed as SessionHeaderLine;
				if (
					typeof candidate.id === "string" &&
					candidate.config &&
					typeof candidate.config.baseURL === "string" &&
					typeof candidate.config.model === "string" &&
					typeof candidate.config.systemPrompt === "string"
				) {
					header = candidate;
				}
			} else if (row.type === "event") {
				const candidate = parsed as SessionEventLine;
				if (candidate.event && typeof candidate.event.type === "string") {
					events.push(candidate.event);
				}
			}
		} catch {
			// 坏行跳过，和原文一样。
		}
	}
	return header ? { header, events } : null;
}

export class SessionManager implements AgentEventReceiver {
	readonly id: string;
	readonly filePath: string;

	private constructor(id: string, filePath: string) {
		this.id = id;
		this.filePath = filePath;
	}

	/**
	 * 为什么存在：新开一次还是接着最近一份，是入口的旗标，不是 loop 的事。
	 * 功能作用：保证目录存在；continue 且找得到文件就打开它，否则新建路径（还不写盘）。
	 */
	static open(opts: { dir: string; continue: boolean }): SessionManager {
		mkdirSync(opts.dir, { recursive: true });
		if (opts.continue) {
			const latest = findLatestJsonl(opts.dir);
			if (latest) {
				const record = parseRecord(latest);
				if (record) {
					return new SessionManager(record.header.id, latest);
				}
			}
		}
		const id = randomUUID();
		return new SessionManager(id, join(opts.dir, newFileName(id)));
	}

	/**
	 * 为什么存在：文件头不是事件，不能靠 on() 写；新文件必须先有头，continue 才找得到 config。
	 * 功能作用：追加一行 type=session。不含 apiKey。
	 */
	writeHeader(config: SessionFileConfig): void {
		const line: SessionHeaderLine = {
			type: "session",
			id: this.id,
			timestamp: new Date().toISOString(),
			cwd: process.cwd(),
			config,
		};
		appendFileSync(this.filePath, `${JSON.stringify(line)}\n`);
	}

	read(): SessionRecord | null {
		return parseRecord(this.filePath);
	}

	/**
	 * 为什么存在：它是听众，必须全收；落盘不按 type 挑拣，token_usage 也要留下。
	 * 功能作用：追加一行 type=event。
	 */
	async on(event: AgentEvent): Promise<void> {
		const line: SessionEventLine = {
			type: "event",
			timestamp: new Date().toISOString(),
			event,
		};
		appendFileSync(this.filePath, `${JSON.stringify(line)}\n`);
	}
}
