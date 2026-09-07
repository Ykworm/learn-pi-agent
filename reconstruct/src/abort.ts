/**
 * 为什么存在：HTTP 取消、子进程被杀、loop 里看到 aborted，都要变成同一句话，ask 才能统一吞掉。
 * 功能作用：构造 / 识别 Interrupted；Completions 和 Responses 两条 loop 共用 abortTurn。不要和普通工具失败混成 isError 的 tool_result。
 */
import { emitAll, type AgentEventReceiver } from "./events.js";

/**
 * 为什么存在：自己 throw 的、ask 认的、和原文 executeTool 再抛的，必须是同一句。
 * 功能作用：Interrupted 错误的 message。不要改成别的字符串。
 */
export const INTERRUPTED_MESSAGE = "Interrupted";

/**
 * 为什么存在：throw 的必须是同一句，ask 才能用字符串认出来。
 * 功能作用：构造 Interrupted 错误。
 */
export function interruptedError(): Error {
	return new Error(INTERRUPTED_MESSAGE);
}

/**
 * 为什么存在：OpenAI SDK 取消时抛 AbortError，我们自己 throw 的是 message 为 Interrupted。
 * 功能作用：两种都当成这一 turn 被取消。
 */
export function isInterrupted(err: unknown): boolean {
	if (typeof err === "object" && err !== null && "name" in err && (err as { name: string }).name === "AbortError") {
		return true;
	}
	return err instanceof Error && err.message === INTERRUPTED_MESSAGE;
}

/**
 * 为什么存在：取消发生在 create() 途中、工具执行前、工具抛 Interrupted，两条 loop 都要先广播再停。
 * 功能作用：发 interrupted，再 throw。ask() 会吞掉这个错误。
 */
export async function abortTurn(receivers: readonly AgentEventReceiver[]): Promise<never> {
	await emitAll(receivers, { type: "interrupted" });
	throw interruptedError();
}
