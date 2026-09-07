package tools

// 为什么存在：还没有专用工具的操作（改文件、跑测试、git）都先走 shell；本片不单独做 write。
// 功能作用：用 bash -c 执行 command。输出超过 1 MB 截断。非 0 退出码返回 error，让 loop 标 isError。

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"

	"github.com/openai/openai-go/v3"
)

// BashTool 为什么存在：HTTP 的 tools 字段要一份 JSON Schema，模型才知道能调 bash。
// 功能作用：声明 command。真正起进程的是 RunBash。
var BashTool = openai.ChatCompletionFunctionTool(openai.FunctionDefinitionParam{
	Name:        "bash",
	Description: openai.String("在 bash 里执行一条命令。工作目录是进程的 cwd。"),
	Parameters: openai.FunctionParameters{
		"type": "object",
		"properties": map[string]any{
			"command": map[string]any{"type": "string", "description": "要执行的命令"},
		},
		"required": []string{"command"},
	},
})

type cappedBuffer struct {
	buf       bytes.Buffer
	truncated bool
}

func (c *cappedBuffer) Write(p []byte) (int, error) {
	if c.truncated {
		return len(p), nil
	}
	remain := MaxToolBytes - c.buf.Len()
	if remain <= 0 {
		c.truncated = true
		c.buf.WriteString("\n\n... [truncated - exceeded 1MB] ...")
		return len(p), nil
	}
	if len(p) > remain {
		c.buf.Write(p[:remain])
		c.buf.WriteString("\n\n... [truncated - exceeded 1MB] ...")
		c.truncated = true
		return len(p), nil
	}
	return c.buf.Write(p)
}

// RunBash 为什么存在：schema 只是说明书；本机还得起 bash。失败必须变成 error，loop 才能标 isError。
// 功能作用：解析 command，用 CommandContext 跑 bash -c。ctx 取消时杀掉子进程，返回 ctx.Err()，不要当成工具失败。
func RunBash(ctx context.Context, argsJSON string) (string, error) {
	var parsed struct {
		Command *string `json:"command"`
	}
	if err := json.Unmarshal([]byte(argsJSON), &parsed); err != nil {
		return "bash: arguments 不是合法 JSON", nil
	}
	if parsed.Command == nil || strings.TrimSpace(*parsed.Command) == "" {
		return "bash: 缺少 command", nil
	}

	cmd := exec.CommandContext(ctx, "bash", "-c", *parsed.Command)
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
		if text == "" {
			text = fmt.Sprintf("Command failed: %s", err)
		}
		return "", fmt.Errorf("%s", text)
	}
	if text == "" {
		return "Command executed successfully", nil
	}
	return text, nil
}
