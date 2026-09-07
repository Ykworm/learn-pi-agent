/**
 * 为什么存在：工具输出会进 messages；太大就把下一轮 Completions 的上下文撑爆。
 * 功能作用：按字节数截断，并标明 truncated。各工具共用。
 */

/**
 * 为什么存在：1 MB 这个数字要和 capText、按行窗口、bash 输出共用，不能散落魔法数。
 * 功能作用：工具返回值进 messages 的字节上限。
 */
export const MAX_TOOL_BYTES = 1024 * 1024;

/**
 * 为什么存在：三处工具都要把进 messages 的文本切到同一上限，不能各写一套。
 * 功能作用：超过 maxBytes 就截断，并接上 truncated 标记。
 */
export function capText(text: string, maxBytes = MAX_TOOL_BYTES): string {
	const buf = Buffer.from(text, "utf8");
	if (buf.length <= maxBytes) {
		return text;
	}
	return `${buf.subarray(0, maxBytes).toString("utf8")}\n\n... [truncated - exceeded 1MB] ...`;
}
