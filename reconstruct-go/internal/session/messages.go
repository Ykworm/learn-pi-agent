package session

// 为什么存在：磁盘上是事件日志，两条 API 各自要不同形状的 input；两本账不能当同一份用。
// 功能作用：按 type 翻译成 Completions 的 messages，或 Responses 的 input。system 不来自事件。

import (
	"encoding/json"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/packages/param"
	"github.com/openai/openai-go/v3/responses"

	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/events"
)

func takeReasoning(pending *string) string {
	text := *pending
	*pending = ""
	return text
}

func appendThinking(pending *string, text string) {
	if text == "" {
		return
	}
	if *pending == "" {
		*pending = text
		return
	}
	*pending = *pending + "\n" + text
}

// completionsAssistant 为什么存在：官方 ToParam 会丢掉 reasoning_content；Completions 每次都带 tools，DeepSeek 要求把这个字段送回去。
// 功能作用：拼一条 assistant。有 reasoning 就 SetExtraFields。
func completionsAssistant(content *string, toolCalls []openai.ChatCompletionMessageToolCallUnionParam, reasoning string) openai.ChatCompletionMessageParamUnion {
	asst := openai.ChatCompletionAssistantMessageParam{ToolCalls: toolCalls}
	if content != nil {
		asst.Content.OfString = openai.String(*content)
	}
	if reasoning != "" {
		asst.SetExtraFields(map[string]any{"reasoning_content": reasoning})
	}
	return openai.ChatCompletionMessageParamUnion{OfAssistant: &asst}
}

// EventsToMessages 为什么存在：原文 setEvents 把翻译和写入 Agent 绑在一起；纯函数才能单独盯 pending tool_calls。
// 功能作用：user / tool_call / tool_result / assistant_message 进 messages。thinking 不单独成一条 role，挂到紧跟着的那条 assistant 的 reasoning_content。
func EventsToMessages(evs []events.Event, systemPrompt string) []openai.ChatCompletionMessageParamUnion {
	messages := []openai.ChatCompletionMessageParamUnion{
		openai.SystemMessage(systemPrompt),
	}
	var pending []openai.ChatCompletionMessageToolCallUnionParam
	var pendingReasoning string

	flushPending := func() {
		if len(pending) == 0 {
			return
		}
		messages = append(messages, completionsAssistant(nil, pending, takeReasoning(&pendingReasoning)))
		pending = nil
	}

	for _, event := range evs {
		switch event.Type {
		case events.TypeUserMessage:
			messages = append(messages, openai.UserMessage(event.Text))
		case events.TypeAssistantStart:
			pending = nil
			pendingReasoning = ""
		case events.TypeThinking:
			appendThinking(&pendingReasoning, event.Text)
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
			text := event.Text
			messages = append(messages, completionsAssistant(&text, nil, takeReasoning(&pendingReasoning)))
		}
	}
	return messages
}

func functionCallOutput(callID, output string) responses.ResponseInputItemUnionParam {
	item := responses.ResponseInputItemFunctionCallOutputParam{}
	item.CallID = openai.String(callID)
	item.Output.OfString = openai.String(output)
	return responses.ResponseInputItemUnionParam{OfFunctionCallOutput: &item}
}

// EventsToResponsesInput 为什么存在：同一份 jsonl 要再 POST /v1/responses 时，必须变成 type 条目，不能再用 role 消息。
// 功能作用：user / thinking / tool_call / tool_result / assistant_message 进 input。system 不进数组，loop 用 instructions。
func EventsToResponsesInput(evs []events.Event) responses.ResponseInputParam {
	var input responses.ResponseInputParam
	for _, event := range evs {
		switch event.Type {
		case events.TypeUserMessage:
			input = append(input, responses.ResponseInputItemParamOfMessage(event.Text, responses.EasyInputMessageRoleUser))
		case events.TypeThinking:
			raw, _ := json.Marshal(map[string]any{
				"type": "reasoning",
				"content": []map[string]string{
					{"type": "reasoning_text", "text": event.Text},
				},
			})
			input = append(input, param.Override[responses.ResponseInputItemUnionParam](json.RawMessage(raw)))
		case events.TypeToolCall:
			input = append(input, responses.ResponseInputItemParamOfFunctionCall(event.Args, event.ToolCallID, event.Name))
		case events.TypeToolResult:
			input = append(input, functionCallOutput(event.ToolCallID, event.Result))
		case events.TypeAssistantMessage:
			input = append(input, responses.ResponseInputItemParamOfMessage(event.Text, responses.EasyInputMessageRoleAssistant))
		}
	}
	return input
}
