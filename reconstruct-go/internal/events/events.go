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

// Event 为什么存在：把「已经发生的事」从 loop 里抽出来；Go 没有 TS 联合类型，用 Type 当判别字段。
// 功能作用：一条事件。其余字段按 type 取值。JSON 标签与 TS 对齐，方便以后写同一份 jsonl。
type Event struct {
	Type             string `json:"type"`
	Text             string `json:"text,omitempty"`
	ToolCallID       string `json:"toolCallId,omitempty"`
	Name             string `json:"name,omitempty"`
	Args             string `json:"args,omitempty"`
	Result           string `json:"result,omitempty"`
	IsError          *bool  `json:"isError,omitempty"` // 指针：false 也会进 JSON；普通 bool+omitempty 会吞掉成功结果
	InputTokens      int    `json:"inputTokens,omitempty"`
	OutputTokens     int    `json:"outputTokens,omitempty"`
	TotalTokens      int    `json:"totalTokens,omitempty"`
	CacheReadTokens  int    `json:"cacheReadTokens,omitempty"`
	CacheWriteTokens int    `json:"cacheWriteTokens,omitempty"`
}

// Receiver 为什么存在：loop 只调用 On，不关心谁在听。
// 功能作用：处理一条事件。Go 这边是同步的；TS 的 on 返回 Promise，因为那边 emitAll 要 await。
type Receiver interface {
	On(event Event)
}

// Emit 为什么存在：不能在 loop 里写死「打给 Console」；听众是切片，第 5 片再往里加即可。
// 功能作用：把同一条事件按顺序发给每一个 receiver。没有 type → 组件路由表。
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

// ToolResult 为什么存在：成功也要带 isError=false，不能靠 omitempty 把字段省掉。
// 功能作用：构造 tool_result；先拷到局部变量再取地址，避免循环里共享同一个 bool。
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
