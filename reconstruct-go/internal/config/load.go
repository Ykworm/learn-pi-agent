package config

// 为什么存在：换 DeepSeek / 端口不应改 loop 或 Gin 路由；配置与 TypeScript 版同一套 JSON。
// 功能作用：读 reconstruct-go/config.json，再用 config.local.json 覆盖。`--api` 选中哪一套，就用那一套的 baseURL / model / 密钥。

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

const (
	APICompletions = "completions"
	APIResponses   = "responses"
)

type AppConfig struct {
	APIKey       string
	BaseURL      string
	Model        string
	API          string
	SystemPrompt string
	Listen       string
}

type endpointShape struct {
	BaseURL   string `json:"baseURL"`
	Model     string `json:"model"`
	APIKeyEnv string `json:"apiKeyEnv"`
	APIKey    string `json:"apiKey"`
}

type fileShape struct {
	API          string        `json:"api"`
	SystemPrompt string        `json:"systemPrompt"`
	Listen       string        `json:"listen"`
	Completions  endpointShape `json:"completions"`
	Responses    endpointShape `json:"responses"`
	BaseURL      string        `json:"baseURL"`
	Model        string        `json:"model"`
	APIKeyEnv    string        `json:"apiKeyEnv"`
	APIKey       string        `json:"apiKey"`
}

// RootDir 为什么存在：session 文件要固定落在 reconstruct-go/.sessions，不跟调用时的 cwd 乱跑。
// 功能作用：返回本模块根目录（internal/config 再往上两级）。
func RootDir() string {
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

// NormalizeAPI 为什么存在：命令行、配置文件、session 头都要写同一对字符串，拼错就该当场失败。
// 功能作用：空串当成 completions；只接受 completions 或 responses。
func NormalizeAPI(value string) (string, error) {
	switch strings.TrimSpace(value) {
	case "", APICompletions:
		return APICompletions, nil
	case APIResponses:
		return APIResponses, nil
	default:
		return "", fmt.Errorf("未知 api: %s（要用 completions 或 responses）", value)
	}
}

func mergeLocal() (fileShape, fileShape, error) {
	root := RootDir()
	shared, err := readJSON(filepath.Join(root, "config.json"))
	if err != nil {
		return fileShape{}, fileShape{}, err
	}

	local := fileShape{}
	localPath := filepath.Join(root, "config.local.json")
	if _, err := os.Stat(localPath); err == nil {
		local, err = readJSON(localPath)
		if err != nil {
			return fileShape{}, fileShape{}, err
		}
		return shared, local, nil
	}

	sibling := filepath.Join(root, "..", "reconstruct", "config.local.json")
	if _, err := os.Stat(sibling); err == nil {
		local, err = readJSON(sibling)
		if err != nil {
			return fileShape{}, fileShape{}, err
		}
	}
	return shared, local, nil
}

func endpointFor(api string, shared, local fileShape) endpointShape {
	if api == APIResponses {
		return endpointShape{
			BaseURL:   pick(local.Responses.BaseURL, shared.Responses.BaseURL),
			Model:     pick(local.Responses.Model, shared.Responses.Model),
			APIKeyEnv: pick(local.Responses.APIKeyEnv, shared.Responses.APIKeyEnv),
			APIKey:    pick(local.Responses.APIKey),
		}
	}
	return endpointShape{
		BaseURL:   pick(local.Completions.BaseURL, shared.Completions.BaseURL, local.BaseURL, shared.BaseURL),
		Model:     pick(local.Completions.Model, shared.Completions.Model, local.Model, shared.Model),
		APIKeyEnv: pick(local.Completions.APIKeyEnv, shared.Completions.APIKeyEnv, local.APIKeyEnv, shared.APIKeyEnv),
		APIKey:    pick(local.Completions.APIKey, local.APIKey),
	}
}

// Load 为什么存在：两条信封各有一份 endpoint；选 api 时必须连 baseURL / 密钥一起换。
// 功能作用：apiOverride 非空则用它，否则用文件里的 api。返回选中那一套的完整配置。
func Load(apiOverride string) (AppConfig, error) {
	shared, local, err := mergeLocal()
	if err != nil {
		return AppConfig{}, err
	}

	api, err := NormalizeAPI(pick(apiOverride, local.API, shared.API, APICompletions))
	if err != nil {
		return AppConfig{}, err
	}

	systemPrompt := pick(local.SystemPrompt, shared.SystemPrompt)
	listen := pick(local.Listen, shared.Listen, "127.0.0.1:8080")
	ep := endpointFor(api, shared, local)
	if ep.BaseURL == "" || ep.Model == "" || systemPrompt == "" || ep.APIKeyEnv == "" {
		return AppConfig{}, fmt.Errorf("config.json 的 %s 需要 baseURL、model、apiKeyEnv，顶层需要 systemPrompt", api)
	}

	apiKey := pick(ep.APIKey, os.Getenv(ep.APIKeyEnv))
	if apiKey == "" {
		return AppConfig{}, fmt.Errorf("缺少 %s 的 API 密钥。在 config.local.json 的 %s.apiKey 填入，或设置 %s", api, api, ep.APIKeyEnv)
	}

	return AppConfig{
		APIKey:       apiKey,
		BaseURL:      ep.BaseURL,
		Model:        ep.Model,
		API:          api,
		SystemPrompt: systemPrompt,
		Listen:       listen,
	}, nil
}
