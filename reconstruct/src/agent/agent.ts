/**
 * 为什么存在：要把 system / 历史和一次 ask() 绑在一起，否则每次提问都丢上下文。
 * 功能作用：构造 OpenAI client；按 api 选 Completions 或 Responses 的 loop。终答走事件，不从 ask 返回。
 */
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import type { ResponseInputItem } from "openai/resources/responses/responses.js";
import { isInterrupted } from "../abort.js";
import { emitAll, type AgentEvent, type AgentEventReceiver } from "../events.js";
import { eventsToMessages, eventsToResponsesInput } from "../session/messages.js";
import { runCompletionsTurn } from "./loop.js";
import { runResponsesTurn } from "./responses.js";
import type { ApiKind } from "../config/load.js";

/**
 * 为什么存在：两条 HTTP 信封共用同一个 Agent；配置里写明走哪一条，不要靠猜。
 * 功能作用：与 config 的 ApiKind 相同。completions = POST /v1/chat/completions；responses = POST /v1/responses。
 */
export type { ApiKind };

/**
 * 为什么存在：换模型 / 端点 / 说明书 / API 信封不应改 Agent 类的字段。
 * 功能作用：构造 Agent 需要的密钥、baseURL、模型、API 种类和常驻 system prompt。
 */
export type AgentConfig = {
	apiKey: string;
	baseURL?: string;
	model: string;
	api: ApiKind;
	systemPrompt: string;
};

export class Agent {
	private readonly client: OpenAI;
	private readonly model: string;
	private readonly api: ApiKind;
	private readonly baseURL: string;
	private readonly systemPrompt: string;
	private readonly completionsMessages: ChatCompletionMessageParam[] = [];
	private readonly responsesInput: ResponseInputItem[] = [];
	/** 全量 fan-out 的听众表。loop 不读这个数组的内容，只把它传给 emitAll。 */
	private readonly receivers: AgentEventReceiver[];
	/** 当前 turn 的 AbortController。没有进行中的 ask 时为 null。 */
	private abortController: AbortController | null = null;

	/**
	 * 为什么存在：听众是构造时挂上的，不是 loop 里 new Console()。
	 * 功能作用：rest 参数就是 receivers[]。CLI 传 renderer 和 SessionManager。
	 */
	constructor(config: AgentConfig, ...receivers: AgentEventReceiver[]) {
		this.model = config.model;
		this.api = config.api;
		this.baseURL = config.baseURL ?? "";
		this.systemPrompt = config.systemPrompt;
		this.receivers = receivers;
		this.client = new OpenAI({
			apiKey: config.apiKey,
			baseURL: config.baseURL,
		});
		if (this.api === "completions") {
			this.completionsMessages.push({ role: "system", content: config.systemPrompt });
		}
	}

	/**
	 * 为什么存在：session_start 不是 loop 里的事，但 Console 和 jsonl 都要看见同一条。
	 * 功能作用：在 ask() 之前广播一次。不进 messages / input。
	 */
	async emitSessionStart(sessionId: string): Promise<void> {
		await emitAll(this.receivers, {
			type: "session_start",
			sessionId,
			model: this.model,
			api: this.api,
			baseURL: this.baseURL,
			systemPrompt: this.systemPrompt,
		});
	}

	/**
	 * 为什么存在：--continue 读到的是事件，当前进程的 messages / input 还是空的。
	 * 功能作用：按 api 整份替换对应那本账（Completions 含 system），不是 append。
	 */
	restoreFromEvents(events: readonly AgentEvent[]): void {
		if (this.api === "responses") {
			this.responsesInput.length = 0;
			this.responsesInput.push(...eventsToResponsesInput(events));
			return;
		}
		this.completionsMessages.length = 0;
		this.completionsMessages.push(...eventsToMessages(events, this.systemPrompt));
	}

	/**
	 * 为什么存在：人的一句必须同时进两本账：事件给人看，messages / input 给模型看。
	 * 功能作用：先 user_message，再推进对应那本账，再为本 turn new AbortController，跑选中的 loop。取消则吞掉 Interrupted。
	 */
	async ask(userText: string): Promise<void> {
		await emitAll(this.receivers, { type: "user_message", text: userText });
		if (this.api === "responses") {
			this.responsesInput.push({ role: "user", content: userText });
		} else {
			this.completionsMessages.push({ role: "user", content: userText });
		}
		this.abortController = new AbortController();
		try {
			if (this.api === "responses") {
				await runResponsesTurn(
					this.client,
					this.model,
					this.systemPrompt,
					this.responsesInput,
					this.receivers,
					this.abortController.signal,
				);
			} else {
				await runCompletionsTurn(
					this.client,
					this.model,
					this.completionsMessages,
					this.receivers,
					this.abortController.signal,
				);
			}
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
