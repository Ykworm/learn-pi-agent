/**
 * 为什么存在：要把 system / 历史 messages 和一次 ask() 绑在一起，否则每次提问都丢上下文。
 * 功能作用：构造 OpenAI client 与 messages；ask(userText) 追加一条 user 并跑完一个 turn，返回终答文本。
 */
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import { runCompletionsTurn } from "./loop.js";

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

	constructor(config: AgentConfig) {
		this.model = config.model;
		this.client = new OpenAI({
			apiKey: config.apiKey,
			baseURL: config.baseURL,
		});
		this.messages.push({ role: "system", content: config.systemPrompt });
	}

	async ask(userText: string): Promise<string> {
		this.messages.push({ role: "user", content: userText });
		return runCompletionsTurn(this.client, this.model, this.messages);
	}
}
