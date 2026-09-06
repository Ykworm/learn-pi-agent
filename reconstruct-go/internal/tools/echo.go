package tools

// 为什么存在：第 1 片只需要一个真工具，证明模型能发出 tool_calls、本机执行后再把结果送回。
// 功能作用：把参数里的 text 原样返回。EchoTool 给 Completions 的 tools 字段，RunEcho 给 loop 用。

import (
	"encoding/json"

	"github.com/openai/openai-go/v3"
)

var EchoTool = openai.ChatCompletionFunctionTool(openai.FunctionDefinitionParam{
	Name:        "echo",
	Description: openai.String("把 text 原样返回。复述或确认一段文字时使用。"),
	Parameters: openai.FunctionParameters{
		"type": "object",
		"properties": map[string]any{
			"text": map[string]any{"type": "string", "description": "要原样返回的文本"},
		},
		"required": []string{"text"},
	},
})

func RunEcho(argsJSON string) string {
	var parsed struct {
		Text *string `json:"text"`
	}
	if err := json.Unmarshal([]byte(argsJSON), &parsed); err != nil {
		return "echo: arguments 不是合法 JSON"
	}
	if parsed.Text == nil {
		return "echo: 缺少 text"
	}
	return *parsed.Text
}
