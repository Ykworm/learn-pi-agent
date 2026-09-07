package tools

// 为什么存在：coding agent 必须能看工作区里的文件；echo 做不到。
// 功能作用：按 path 读文件。无窗口且大于 1 MB 只给文件头；有 offset / limit 则按行取窗口。

import (
	"bufio"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/openai/openai-go/v3"
)

// ReadTool 为什么存在：HTTP 的 tools 字段要一份 JSON Schema，模型才知道能调 read。
// 功能作用：声明 path / offset / limit。真正读盘的是 RunRead。
var ReadTool = openai.ChatCompletionFunctionTool(openai.FunctionDefinitionParam{
	Name:        "read",
	Description: openai.String("读文件内容。大文件请用 offset / limit 按行取窗口，不要一次要全文。"),
	Parameters: openai.FunctionParameters{
		"type": "object",
		"properties": map[string]any{
			"path":   map[string]any{"type": "string", "description": "要读的文件路径"},
			"offset": map[string]any{"type": "number", "description": "从第几行开始（从 1 计）。省略则从文件头。"},
			"limit":  map[string]any{"type": "number", "description": "最多返回多少行。省略则读到文件尾或 1 MB 上限。"},
		},
		"required": []string{"path"},
	},
})

// RunRead 为什么存在：schema 只是说明书；本机还得真的打开文件。
// 功能作用：解析 arguments。无窗口且大于 1 MB 只给文件头；有 offset / limit 则按行取窗口。
func RunRead(argsJSON string) string {
	var parsed struct {
		Path   *string  `json:"path"`
		Offset *float64 `json:"offset"`
		Limit  *float64 `json:"limit"`
	}
	if err := json.Unmarshal([]byte(argsJSON), &parsed); err != nil {
		return "read: arguments 不是合法 JSON"
	}
	if parsed.Path == nil || strings.TrimSpace(*parsed.Path) == "" {
		return "read: 缺少 path"
	}

	file, err := filepath.Abs(*parsed.Path)
	if err != nil {
		return "read: " + err.Error()
	}
	info, err := os.Stat(file)
	if err != nil {
		if os.IsNotExist(err) {
			return "File not found: " + file
		}
		return "read: " + err.Error()
	}
	if info.IsDir() {
		return "Not a file: " + file
	}

	if parsed.Offset != nil && *parsed.Offset < 1 {
		return "read: offset 从 1 计"
	}
	if parsed.Limit != nil && *parsed.Limit < 1 {
		return "read: limit 至少为 1"
	}

	if parsed.Offset != nil || parsed.Limit != nil {
		start := 1
		if parsed.Offset != nil {
			start = int(*parsed.Offset)
		}
		limit := 0
		if parsed.Limit != nil {
			limit = int(*parsed.Limit)
		}
		return readLineWindow(file, start, limit)
	}

	if info.Size() > int64(MaxToolBytes) {
		f, err := os.Open(file)
		if err != nil {
			return "read: " + err.Error()
		}
		defer f.Close()
		buf := make([]byte, MaxToolBytes)
		n, err := io.ReadFull(f, buf)
		if err != nil && err != io.ErrUnexpectedEOF && err != io.EOF {
			return "read: " + err.Error()
		}
		return string(buf[:n]) + "\n\n... [truncated - exceeded 1MB] ..."
	}

	data, err := os.ReadFile(file)
	if err != nil {
		return "read: " + err.Error()
	}
	return string(data)
}

func readLineWindow(file string, start, limit int) string {
	f, err := os.Open(file)
	if err != nil {
		return "read: " + err.Error()
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), MaxToolBytes)

	var b strings.Builder
	n := 0
	taken := 0
	for sc.Scan() {
		n++
		if n < start {
			continue
		}
		if limit > 0 && taken >= limit {
			break
		}
		if b.Len() > 0 {
			b.WriteByte('\n')
		}
		b.Write(sc.Bytes())
		taken++
		if b.Len() >= MaxToolBytes {
			return capText(b.String())
		}
	}
	if err := sc.Err(); err != nil {
		return "read: " + err.Error()
	}
	return b.String()
}
