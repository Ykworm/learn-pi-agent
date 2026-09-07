package tools

// 为什么存在：loop 不应内嵌每个工具的实现；HTTP 的 tools 字段和本机分发必须是同一张表。
// 功能作用：导出 Completions 用的工具表；按名字执行，返回给模型看的文本。bash 失败时 error 非 nil。

import (
	"context"

	"github.com/openai/openai-go/v3"
)

// CompletionsTools 为什么存在：create 的 tools 和 Run 的 switch 必须是同一张表，漏登一边模型会调一个本机没有的名字。
// 功能作用：本片注册 read / list / bash / glob / rg。
var CompletionsTools = []openai.ChatCompletionToolUnionParam{
	ReadTool,
	ListTool,
	BashTool,
	GlobTool,
	RgTool,
}

// Run 为什么存在：loop 只按名字调用，不内嵌每个工具的实现。
// 功能作用：执行名为 name 的工具。ctx 传给会起进程的 bash / rg。bash 失败时 error 非 nil；ctx 取消也走 error。
func Run(ctx context.Context, name string, argsJSON string) (string, error) {
	switch name {
	case "read":
		return RunRead(argsJSON), nil
	case "list":
		return RunList(argsJSON), nil
	case "bash":
		return RunBash(ctx, argsJSON)
	case "glob":
		return RunGlob(argsJSON), nil
	case "rg":
		return RunRg(ctx, argsJSON)
	default:
		return "未知工具: " + name, nil
	}
}
