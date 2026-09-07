package tools

// 为什么存在：loop 不应内嵌每个工具的实现；HTTP 的 tools 字段和本机分发必须是同一张表。
// 功能作用：导出 Completions 用的工具表；按名字执行，返回给模型看的文本。bash 失败时 error 非 nil。

import (
	"context"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/responses"
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

// ResponsesTools 为什么存在：Responses 的 function tool 把 name 放在顶层，不再套一层 function。名字和 parameters 必须与 Completions 那张表相同。
// 功能作用：同一批工具，改成 POST /v1/responses 要的外套。strict 关掉，避免我们的 schema 过不了严格模式。
var ResponsesTools = completionsToResponsesTools()

func completionsToResponsesTools() []responses.ToolUnionParam {
	out := make([]responses.ToolUnionParam, 0, len(CompletionsTools))
	for _, tool := range CompletionsTools {
		fn := tool.GetFunction()
		if fn == nil {
			continue
		}
		out = append(out, responses.ToolUnionParam{
			OfFunction: &responses.FunctionToolParam{
				Name:        fn.Name,
				Description: fn.Description,
				Parameters:  fn.Parameters,
				Strict:      openai.Bool(false),
			},
		})
	}
	return out
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
