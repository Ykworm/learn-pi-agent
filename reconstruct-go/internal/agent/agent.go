package agent

// 为什么存在：要把 system / 历史 messages 和一次 Ask 绑在一起，否则每次提问都丢上下文。
// 功能作用：构造 OpenAI-compatible client 与 messages；Ask 广播 user_message，追加一条 user，再跑完一个 turn。终答走事件。
// Gin 每个请求 new 一个 Agent，所以一次 HTTP 就是一次 CLI 调用，不跨请求记历史（那是第 5 片）。

import (
	"context"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"

	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/config"
	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/events"
)

type Agent struct {
	client    openai.Client
	model     string
	messages  []openai.ChatCompletionMessageParamUnion
	receivers []events.Receiver
}

func New(cfg config.AppConfig, receivers ...events.Receiver) *Agent {
	return &Agent{
		client: openai.NewClient(
			option.WithAPIKey(cfg.APIKey),
			option.WithBaseURL(cfg.BaseURL),
		),
		model:     cfg.Model,
		receivers: receivers,
		messages: []openai.ChatCompletionMessageParamUnion{
			openai.SystemMessage(cfg.SystemPrompt),
		},
	}
}

func (a *Agent) Ask(ctx context.Context, userText string) error {
	events.Emit(a.receivers, events.UserMessage(userText))
	a.messages = append(a.messages, openai.UserMessage(userText))
	next, err := runCompletionsTurn(ctx, a.client, a.model, a.messages, a.receivers)
	if err != nil {
		return err
	}
	a.messages = next
	return nil
}
