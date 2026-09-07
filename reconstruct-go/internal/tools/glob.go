package tools

// 为什么存在：list 只列一层；按 **/*.ts 找文件若走 bash find，退出码和路径格式都不稳。
// 功能作用：在 path（默认 cwd）下按 glob 模式列出匹配项。目录名带 /。超过 1 MB 截断。

import (
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/bmatcuk/doublestar/v4"
	"github.com/openai/openai-go/v3"
)

// GlobTool 为什么存在：HTTP 的 tools 字段要一份 JSON Schema，模型才知道能调 glob。
// 功能作用：声明 pattern 和可选 path。真正搜盘的是 RunGlob。
var GlobTool = openai.ChatCompletionFunctionTool(openai.FunctionDefinitionParam{
	Name:        "glob",
	Description: openai.String("按 glob 模式找文件，例如 **/*.ts。只返回路径，不读内容。"),
	Parameters: openai.FunctionParameters{
		"type": "object",
		"properties": map[string]any{
			"pattern": map[string]any{"type": "string", "description": "glob 模式，例如 **/*.ts 或 src/**/*.json"},
			"path":    map[string]any{"type": "string", "description": "搜索起点（默认：当前工作目录）"},
		},
		"required": []string{"pattern"},
	},
})

// RunGlob 为什么存在：schema 只是说明书；本机还得按模式走目录树。
// 功能作用：解析 arguments，返回排序后的相对路径；没有匹配则说明找不到。错误当字符串返回。
func RunGlob(argsJSON string) string {
	var parsed struct {
		Pattern *string `json:"pattern"`
		Path    *string `json:"path"`
	}
	if err := json.Unmarshal([]byte(argsJSON), &parsed); err != nil {
		return "glob: arguments 不是合法 JSON"
	}
	if parsed.Pattern == nil || strings.TrimSpace(*parsed.Pattern) == "" {
		return "glob: 缺少 pattern"
	}

	root := "."
	if parsed.Path != nil && strings.TrimSpace(*parsed.Path) != "" {
		root = *parsed.Path
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		return "Glob error: " + err.Error()
	}
	info, err := os.Stat(abs)
	if err != nil {
		if os.IsNotExist(err) {
			return "Directory not found: " + abs
		}
		return "Glob error: " + err.Error()
	}
	if !info.IsDir() {
		return "Not a directory: " + abs
	}

	fsys := os.DirFS(abs)
	var matches []string
	err = doublestar.GlobWalk(fsys, *parsed.Pattern, func(path string, d fs.DirEntry) error {
		name := path
		if d.IsDir() {
			name += "/"
		}
		matches = append(matches, name)
		return nil
	})
	if err != nil {
		return "Glob error: " + err.Error()
	}
	if len(matches) == 0 {
		return "No files found matching the pattern"
	}
	sort.Strings(matches)
	return capText(strings.Join(matches, "\n"))
}
