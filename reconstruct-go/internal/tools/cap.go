package tools

// 为什么存在：工具输出会进 messages；太大就把下一轮 Completions 的上下文撑爆。
// 功能作用：按字节数截断，并标明 truncated。各工具共用。

const MaxToolBytes = 1024 * 1024

// capText 为什么存在：三处工具都要把进 messages 的文本切到同一上限，不能各写一套。
// 功能作用：超过 MaxToolBytes 就截断，并接上 truncated 标记。
func capText(text string) string {
	b := []byte(text)
	if len(b) <= MaxToolBytes {
		return text
	}
	return string(b[:MaxToolBytes]) + "\n\n... [truncated - exceeded 1MB] ..."
}
