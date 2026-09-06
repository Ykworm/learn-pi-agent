package events

// 为什么存在：loop 不能既执行又打印，否则换终端 / JSON / 以后的 jsonl 就要改循环。
// 功能作用：本片会广播的事件形状；Emit 把同一条事件同步发给所有听众，不按 type 路由。

const (
	TypeUserMessage      = "user_message"
	TypeAssistantStart   = "assistant_start"
	TypeToolCall         = "tool_call"
	TypeToolResult       = "tool_result"
	TypeAssistantMessage = "assistant_message"
	TypeTokenUsage       = "token_usage"
)

// Event 是一条已发生的事实。Go 没有 TS 那种联合类型，用 Type 区分，其余字段按 type 取值。
type Event struct {
	Type             string `json:"type"`
	Text             string `json:"text,omitempty"`
	ToolCallID       string `json:"toolCallId,omitempty"`
	Name             string `json:"name,omitempty"`
	Args             string `json:"args,omitempty"`
	Result           string `json:"result,omitempty"`
	IsError          *bool  `json:"isError,omitempty"`
	InputTokens      int    `json:"inputTokens,omitempty"`
	OutputTokens     int    `json:"outputTokens,omitempty"`
	TotalTokens      int    `json:"totalTokens,omitempty"`
	CacheReadTokens  int    `json:"cacheReadTokens,omitempty"`
	CacheWriteTokens int    `json:"cacheWriteTokens,omitempty"`
}

type Receiver interface {
	On(event Event)
}

func Emit(receivers []Receiver, event Event) {
	for _, receiver := range receivers {
		receiver.On(event)
	}
}

func UserMessage(text string) Event {
	return Event{Type: TypeUserMessage, Text: text}
}

func AssistantStart() Event {
	return Event{Type: TypeAssistantStart}
}

func ToolCall(id, name, args string) Event {
	return Event{Type: TypeToolCall, ToolCallID: id, Name: name, Args: args}
}

func ToolResult(id, result string, isError bool) Event {
	flag := isError
	return Event{Type: TypeToolResult, ToolCallID: id, Result: result, IsError: &flag}
}

func AssistantMessage(text string) Event {
	return Event{Type: TypeAssistantMessage, Text: text}
}

func TokenUsage(input, output, total, cacheRead, cacheWrite int) Event {
	return Event{
		Type:             TypeTokenUsage,
		InputTokens:      input,
		OutputTokens:     output,
		TotalTokens:      total,
		CacheReadTokens:  cacheRead,
		CacheWriteTokens: cacheWrite,
	}
}
