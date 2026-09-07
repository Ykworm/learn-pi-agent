package agent

// 为什么存在：要把 system / 历史 messages 和一次 Ask 绑在一起，否则每次提问都丢上下文。
// 功能作用：构造 OpenAI-compatible client 与 messages；Ask 广播 user_message，追加一条 user，再跑完一个 turn。终答走事件。
// Gin 每个请求 New 一个 Agent；跨请求的记忆来自 jsonl，不是 Agent 字段。

import (
	"context"
	"errors"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"

	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/config"
	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/events"
	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/session"
)

type Agent struct {
	client       openai.Client
	model        string
	baseURL      string
	systemPrompt string
	messages     []openai.ChatCompletionMessageParamUnion
	// receivers 是全量 fan-out 的听众表。loop 不读内容，只把它传给 events.Emit。
	receivers []events.Receiver
}

// New 为什么存在：听众是构造时挂上的，不是 loop 里 fmt.Println。
// 功能作用：可变参数就是 receivers[]。CLI 传 Console 和 SessionManager。
func New(cfg config.AppConfig, receivers ...events.Receiver) *Agent {
	return &Agent{
		client: openai.NewClient(
			option.WithAPIKey(cfg.APIKey),
			option.WithBaseURL(cfg.BaseURL),
		),
		model:        cfg.Model,
		baseURL:      cfg.BaseURL,
		systemPrompt: cfg.SystemPrompt,
		receivers:    receivers,
		messages: []openai.ChatCompletionMessageParamUnion{
			openai.SystemMessage(cfg.SystemPrompt),
		},
	}
}

// EmitSessionStart 为什么存在：session_start 不是 loop 里的事，但 Console 和 jsonl 都要看见同一条。
// 功能作用：在 Ask 之前广播一次。不进 messages。
func (a *Agent) EmitSessionStart(sessionID string) {
	events.Emit(a.receivers, events.SessionStart(sessionID, a.model, a.baseURL, a.systemPrompt))
}

// RestoreFromEvents 为什么存在：--continue 读到的是事件，当前进程的 messages 还是空的。
// 功能作用：用 EventsToMessages 整份替换 messages（含 system），不是 append。
func (a *Agent) RestoreFromEvents(evs []events.Event) {
	a.messages = session.EventsToMessages(evs, a.systemPrompt)
}

// Ask 为什么存在：人的一句必须同时进两本账：事件给人看，messages 给模型看。
// 功能作用：先 user_message，再 append user，再跑 loop。ctx 取消则吞掉 ErrInterrupted（事件已经发过）。
func (a *Agent) Ask(ctx context.Context, userText string) error {
	events.Emit(a.receivers, events.UserMessage(userText))
	a.messages = append(a.messages, openai.UserMessage(userText))
	next, err := runCompletionsTurn(ctx, a.client, a.model, a.messages, a.receivers)
	a.messages = next
	if errors.Is(err, ErrInterrupted) {
		return nil
	}
	return err
}
