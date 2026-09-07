package session

// 为什么存在：磁盘上是事件日志，Completions 只要 messages[]；两本账不能当同一份用。
// 功能作用：按 type 翻译成 Chat Completions 的 messages。system 来自配置，不来自事件。

import (
	"github.com/openai/openai-go/v3"

	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/events"
)

// EventsToMessages 为什么存在：原文 setEvents 把翻译和写入 Agent 绑在一起；纯函数才能单独盯 pending tool_calls。
// 功能作用：user / tool_call / tool_result / assistant_message 进 messages；其余 type 跳过。
func EventsToMessages(evs []events.Event, systemPrompt string) []openai.ChatCompletionMessageParamUnion {
	messages := []openai.ChatCompletionMessageParamUnion{
		openai.SystemMessage(systemPrompt),
	}
	var pending []openai.ChatCompletionMessageToolCallUnionParam

	flushPending := func() {
		if len(pending) == 0 {
			return
		}
		assistant := openai.ChatCompletionAssistantMessageParam{ToolCalls: pending}
		messages = append(messages, openai.ChatCompletionMessageParamUnion{OfAssistant: &assistant})
		pending = nil
	}

	for _, event := range evs {
		switch event.Type {
		case events.TypeUserMessage:
			messages = append(messages, openai.UserMessage(event.Text))
		case events.TypeAssistantStart:
			pending = nil
		case events.TypeToolCall:
			pending = append(pending, openai.ChatCompletionMessageToolCallUnionParam{
				OfFunction: &openai.ChatCompletionMessageFunctionToolCallParam{
					ID: event.ToolCallID,
					Function: openai.ChatCompletionMessageFunctionToolCallFunctionParam{
						Name:      event.Name,
						Arguments: event.Args,
					},
				},
			})
		case events.TypeToolResult:
			flushPending()
			messages = append(messages, openai.ToolMessage(event.Result, event.ToolCallID))
		case events.TypeAssistantMessage:
			messages = append(messages, openai.AssistantMessage(event.Text))
		}
	}
	return messages
}
