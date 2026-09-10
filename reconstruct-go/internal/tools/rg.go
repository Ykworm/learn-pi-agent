package tools

// 为什么存在：按内容搜若走 bash grep，没有匹配时退出码 1 会被当成失败；rg 专门处理这件事，并且不从 stdin 读。
// 功能作用：把 args 原样交给 ripgrep。没有匹配返回说明文字，不当错误。输出超过 1 MB 截断。

import (
	"context"
	"encoding/json"
	"os/exec"
	"strings"

	"github.com/openai/openai-go/v3"
)

// RgTool 为什么存在：HTTP 的 tools 字段要一份 JSON Schema，模型才知道能调 rg。
// 功能作用：声明 args。真正起进程的是 RunRg。
var RgTool = openai.ChatCompletionFunctionTool(openai.FunctionDefinitionParam{
	Name:        "rg",
	Description: openai.String("用 ripgrep 搜文件内容。args 原样传给 rg，不要给搜索词加引号。"),
	Parameters: openai.FunctionParameters{
		"type": "object",
		"properties": map[string]any{
			"args": map[string]any{
				"type":        "string",
				"description": "直接传给 rg 的参数，例如 \"-l runTool\" 或 \"--type ts COMPLETION_TOOLS src/\"",
			},
		},
		"required": []string{"args"},
	},
})

// RunRg 为什么存在：schema 只是说明书；本机还得起 rg。退出码 1 表示没有匹配，不是失败。
// 功能作用：解析 args，用 CommandContext 起进程，stdin 接到 /dev/null。ctx 取消返回 error；退出码 1 仍是没匹配。
func RunRg(ctx context.Context, argsJSON string) (string, error) {
	var parsed struct {
		Args *string `json:"args"`
	}
	if err := json.Unmarshal([]byte(argsJSON), &parsed); err != nil {
		return "rg: arguments 不是合法 JSON", nil
	}
	if parsed.Args == nil || strings.TrimSpace(*parsed.Args) == "" {
		return "rg: 缺少 args", nil
	}

	cmd := exec.CommandContext(ctx, "bash", "-c", "rg "+*parsed.Args+" < /dev/null")
	var stdout, stderr cappedBuffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()

	text := stdout.buf.String()
	if stderr.buf.Len() > 0 {
		if text != "" {
			text += "\n"
		}
		text += stderr.buf.String()
	}

	if ctx.Err() != nil {
		return "", ctx.Err()
	}
	if err != nil {
		if exit, ok := err.(*exec.ExitError); ok && exit.ExitCode() == 1 {
			return "No matches found", nil
		}
		if text == "" {
			text = err.Error()
		}
		return "ripgrep error: " + text, nil
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return "No matches found", nil
	}
	return text, nil
}
