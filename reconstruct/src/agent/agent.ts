/**
 * 为什么存在：要把 system / 历史 messages 和一次 ask() 绑在一起，否则每次提问都丢上下文。
 * 功能作用：构造 OpenAI client 与 messages；ask() 广播 user_message，追加一条 user，再跑完一个 turn。终答走事件，不从 ask 返回。
 */
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import { emitAll, type AgentEventReceiver } from "../events.js";
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
	private readonly messages: ChatCompletionMessageParam[] = [];
	/** 全量 fan-out 的听众表。loop 不读这个数组的内容，只把它传给 emitAll。 */
	private readonly receivers: AgentEventReceiver[];

	/**
	 * 为什么存在：听众是构造时挂上的，不是 loop 里 new Console()。
	 * 功能作用：rest 参数就是 receivers[]。本片 CLI 传一个 ConsoleRenderer；以后可以再传 SessionManager。
	 */
	constructor(config: AgentConfig, ...receivers: AgentEventReceiver[]) {
		this.model = config.model;
		this.receivers = receivers;
		this.client = new OpenAI({
			apiKey: config.apiKey,
			baseURL: config.baseURL,
		});
		this.messages.push({ role: "system", content: config.systemPrompt });
	}

	/**
	 * 为什么存在：人的一句必须同时进两本账：事件给人看，messages 给模型看。
	 * 功能作用：先 user_message，再 push user，再跑 loop。返回 void——终答是 assistant_message 事件。
	 */
	async ask(userText: string): Promise<void> {
		await emitAll(this.receivers, { type: "user_message", text: userText });
		this.messages.push({ role: "user", content: userText });
		await runCompletionsTurn(this.client, this.model, this.messages, this.receivers);
	}
}
