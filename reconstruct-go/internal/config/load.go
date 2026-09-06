package config

// 为什么存在：换 DeepSeek / 端口不应改 loop 或 Gin 路由；配置与 TypeScript 版同一套 JSON。
// 功能作用：读 reconstruct-go/config.json，再用 config.local.json 覆盖。若本目录没有密钥，会读 ../reconstruct/config.local.json。

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

type AppConfig struct {
	APIKey       string
	BaseURL      string
	Model        string
	SystemPrompt string
	Listen       string
}

type fileShape struct {
	BaseURL      string `json:"baseURL"`
	Model        string `json:"model"`
	SystemPrompt string `json:"systemPrompt"`
	APIKeyEnv    string `json:"apiKeyEnv"`
	APIKey       string `json:"apiKey"`
	Listen       string `json:"listen"`
}

func rootDir() string {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		return "."
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "../.."))
}

func readJSON(path string) (fileShape, error) {
	var out fileShape
	raw, err := os.ReadFile(path)
	if err != nil {
		return out, err
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return out, fmt.Errorf("%s: %w", path, err)
	}
	return out, nil
}

func pick(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func Load() (AppConfig, error) {
	root := rootDir()
	shared, err := readJSON(filepath.Join(root, "config.json"))
	if err != nil {
		return AppConfig{}, err
	}

	local := fileShape{}
	localPath := filepath.Join(root, "config.local.json")
	if _, err := os.Stat(localPath); err == nil {
		local, err = readJSON(localPath)
		if err != nil {
			return AppConfig{}, err
		}
	} else {
		sibling := filepath.Join(root, "..", "reconstruct", "config.local.json")
		if _, err := os.Stat(sibling); err == nil {
			local, err = readJSON(sibling)
			if err != nil {
				return AppConfig{}, err
			}
		}
	}

	baseURL := pick(local.BaseURL, shared.BaseURL)
	model := pick(local.Model, shared.Model)
	systemPrompt := pick(local.SystemPrompt, shared.SystemPrompt)
	apiKeyEnv := pick(local.APIKeyEnv, shared.APIKeyEnv)
	listen := pick(local.Listen, shared.Listen, "127.0.0.1:8080")
	if baseURL == "" || model == "" || systemPrompt == "" || apiKeyEnv == "" {
		return AppConfig{}, fmt.Errorf("config.json 需要 baseURL、model、systemPrompt、apiKeyEnv")
	}

	apiKey := pick(local.APIKey, os.Getenv(apiKeyEnv))
	if apiKey == "" {
		return AppConfig{}, fmt.Errorf("缺少 API 密钥。复制 config.local.example.json 为 config.local.json，或沿用 reconstruct/config.local.json，或设置 %s", apiKeyEnv)
	}

	return AppConfig{
		APIKey:       apiKey,
		BaseURL:      baseURL,
		Model:        model,
		SystemPrompt: systemPrompt,
		Listen:       listen,
	}, nil
}
