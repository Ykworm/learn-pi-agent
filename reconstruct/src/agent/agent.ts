/**
 * 为什么存在：要把 system / 历史 messages 和一次 ask() 绑在一起，否则每次提问都丢上下文。
 * 功能作用：构造 OpenAI client 与 messages；ask() 广播 user_message，追加一条 user，再跑完一个 turn。终答走事件，不从 ask 返回。
 */
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import { isInterrupted } from "../abort.js";
import { emitAll, type AgentEvent, type AgentEventReceiver } from "../events.js";
import { eventsToMessages } from "../session/messages.js";
import { runCompletionsTurn } from "./loop.js";

/**
 * 为什么存在：换模型 / 端点 / 说明书不应改 Agent 类的字段。
 * 功能作用：构造 Agent 需要的密钥、baseURL、模型和常驻 system prompt。
 */
export type AgentConfig = {
	apiKey: string;
	baseURL?: string;
	model: string;
	systemPrompt: string;
};

export class Agent {
	private readonly client: OpenAI;
	private readonly model: string;
	private readonly baseURL: string;
	private readonly systemPrompt: string;
	private readonly messages: ChatCompletionMessageParam[] = [];
	/** 全量 fan-out 的听众表。loop 不读这个数组的内容，只把它传给 emitAll。 */
	private readonly receivers: AgentEventReceiver[];
	/** 当前 turn 的 AbortController。没有进行中的 ask 时为 null。 */
	private abortController: AbortController | null = null;

	/**
	 * 为什么存在：听众是构造时挂上的，不是 loop 里 new Console()。
	 * 功能作用：rest 参数就是 receivers[]。CLI 传 ConsoleRenderer 和 SessionManager。
	 */
	constructor(config: AgentConfig, ...receivers: AgentEventReceiver[]) {
		this.model = config.model;
		this.baseURL = config.baseURL ?? "";
		this.systemPrompt = config.systemPrompt;
		this.receivers = receivers;
		this.client = new OpenAI({
			apiKey: config.apiKey,
			baseURL: config.baseURL,
		});
		this.messages.push({ role: "system", content: config.systemPrompt });
	}

	/**
	 * 为什么存在：session_start 不是 loop 里的事，但 Console 和 jsonl 都要看见同一条。
	 * 功能作用：在 ask() 之前广播一次。不进 messages。
	 */
	async emitSessionStart(sessionId: string): Promise<void> {
		await emitAll(this.receivers, {
			type: "session_start",
			sessionId,
			model: this.model,
			api: "completions",
			baseURL: this.baseURL,
			systemPrompt: this.systemPrompt,
		});
	}

	/**
	 * 为什么存在：--continue 读到的是事件，当前进程的 messages 还是空的。
	 * 功能作用：用 eventsToMessages 整份替换 this.messages（含 system），不是 append。
	 */
	restoreFromEvents(events: readonly AgentEvent[]): void {
		this.messages.length = 0;
		this.messages.push(...eventsToMessages(events, this.systemPrompt));
	}

	/**
	 * 为什么存在：人的一句必须同时进两本账：事件给人看，messages 给模型看。
	 * 功能作用：先 user_message，再 push user，再为本 turn new AbortController，跑 loop。取消则吞掉 Interrupted。
	 */
	async ask(userText: string): Promise<void> {
		await emitAll(this.receivers, { type: "user_message", text: userText });
		this.messages.push({ role: "user", content: userText });
		this.abortController = new AbortController();
		try {
			await runCompletionsTurn(
				this.client,
				this.model,
				this.messages,
				this.receivers,
				this.abortController.signal,
			);
		} catch (err: unknown) {
			if (isInterrupted(err) || this.abortController.signal.aborted) {
				return;
			}
			throw err;
		} finally {
			this.abortController = null;
		}
	}

	/**
	 * 为什么存在：Ctrl+C 发生在 CLI，loop 只认识 AbortSignal。
	 * 功能作用：abort 当前 turn 的 controller。没有进行中的 ask 则什么都不做。
	 */
	interrupt(): void {
		this.abortController?.abort();
	}
}
