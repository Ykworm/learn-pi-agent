package tools

// 为什么存在：模型经常要先看见「这里有哪些名字」，再决定 read 哪一个。
// 功能作用：列一层目录。目录名带 /。不递归。

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"github.com/openai/openai-go/v3"
)

// ListTool 为什么存在：HTTP 的 tools 字段要一份 JSON Schema，模型才知道能调 list。
// 功能作用：声明可选 path。真正列目录的是 RunList。
var ListTool = openai.ChatCompletionFunctionTool(openai.FunctionDefinitionParam{
	Name:        "list",
	Description: openai.String("列出目录内容。目录名以 / 结尾。只列这一层，不递归。"),
	Parameters: openai.FunctionParameters{
		"type": "object",
		"properties": map[string]any{
			"path": map[string]any{"type": "string", "description": "目录路径（默认：当前工作目录）"},
		},
	},
})

// RunList 为什么存在：schema 只是说明书；本机还得真的读一层目录。
// 功能作用：解析 arguments，返回这一层的名字；目录带 /。超过 1 MB 截断。
func RunList(argsJSON string) string {
	var parsed struct {
		Path *string `json:"path"`
	}
	if err := json.Unmarshal([]byte(argsJSON), &parsed); err != nil {
		return "list: arguments 不是合法 JSON"
	}

	path := "."
	if parsed.Path != nil && strings.TrimSpace(*parsed.Path) != "" {
		path = *parsed.Path
	}

	dir, err := filepath.Abs(path)
	if err != nil {
		return "list: " + err.Error()
	}
	info, err := os.Stat(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return "Directory not found: " + dir
		}
		return "list: " + err.Error()
	}
	if !info.IsDir() {
		return "Not a directory: " + dir
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return "list: " + err.Error()
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() {
			name += "/"
		}
		names = append(names, name)
	}
	return capText(strings.Join(names, "\n"))
}
