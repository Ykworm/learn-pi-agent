package agent

// 为什么存在：Agent 的全部运行时就是「调 Completions → 有 tool_calls 就执行再调」；缺了这层就只是单次聊天。
// 功能作用：在同一个 turn 里循环 POST Chat Completions，直到模型不再带 tool_calls，或 ctx 被 cancel。发生了什么只 Emit，不打印。

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/openai/openai-go/v3"

	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/events"
	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/tools"
)

// abortTurn 为什么存在：取消发生在 HTTP 途中、工具执行前、工具返回 cancel，都要先广播再停。
// 功能作用：发 interrupted，再返回 ErrInterrupted。Ask 会吞掉这个 error。
func abortTurn(receivers []events.Receiver) error {
	events.Emit(receivers, events.Interrupted())
	return ErrInterrupted
}

func canceled(err error) bool {
	return errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) || errors.Is(err, ErrInterrupted)
}

// reasoningContent 为什么存在：官方 ChatCompletionMessage 没有这个字段；DeepSeek 把 think 放在 content 旁边。
// 功能作用：从这次返回的原始 JSON 取出 reasoning_content。没有就空串。
func reasoningContent(msg openai.ChatCompletionMessage) string {
	raw := msg.RawJSON()
	if raw == "" {
		return ""
	}
	var body struct {
		ReasoningContent string `json:"reasoning_content"`
	}
	if err := json.Unmarshal([]byte(raw), &body); err != nil {
		return ""
	}
	return body.ReasoningContent
}

// assistantFromMessage 为什么存在：ToParam 丢掉厂商字段；本仓库 Completions 每次都带 tools，DeepSeek 要求 reasoning_content 原样送回。
// 功能作用：把这次返回的 assistant 变成下一轮 messages 里的一条，有 think 就 SetExtraFields。
func assistantFromMessage(msg openai.ChatCompletionMessage) openai.ChatCompletionMessageParamUnion {
	asst := msg.ToAssistantMessageParam()
	if text := reasoningContent(msg); text != "" {
		asst.SetExtraFields(map[string]any{"reasoning_content": text})
	}
	return openai.ChatCompletionMessageParamUnion{OfAssistant: &asst}
}

func emitThinking(receivers []events.Receiver, msg openai.ChatCompletionMessage) {
	if text := reasoningContent(msg); text != "" {
		events.Emit(receivers, events.Thinking(text))
	}
}

// runCompletionsTurn 为什么存在：一个 turn 里可能多次 HTTP；发请求、执行工具、广播事件都在这里，Ask 不管。
// 功能作用：循环直到没有 tool_calls。ctx 被 cancel 则发 interrupted 并结束。
func runCompletionsTurn(ctx context.Context, client openai.Client, model string, messages []openai.ChatCompletionMessageParamUnion, receivers []events.Receiver) ([]openai.ChatCompletionMessageParamUnion, error) {
	events.Emit(receivers, events.AssistantStart())

	for {
		if ctx.Err() != nil {
			return messages, abortTurn(receivers)
		}

		params := openai.ChatCompletionNewParams{
			Model:    model,
			Messages: messages,
			Tools:    tools.CompletionsTools,
			ToolChoice: openai.ChatCompletionToolChoiceOptionUnionParam{
				OfAuto: openai.String("auto"),
			},
		}
		// DeepSeek V4：不带 thinking.enabled，reasoning_content 有时是空的。
		params.SetExtraFields(map[string]any{
			"thinking": map[string]string{"type": "enabled"},
		})
		resp, err := client.Chat.Completions.New(ctx, params)
		if err != nil {
			if canceled(err) || ctx.Err() != nil {
				return messages, abortTurn(receivers)
			}
			return messages, err
		}

		if resp.JSON.Usage.Valid() {
			usage := resp.Usage
			events.Emit(receivers, events.TokenUsage(
				int(usage.PromptTokens),
				int(usage.CompletionTokens),
				int(usage.TotalTokens),
				int(usage.PromptTokensDetails.CachedTokens),
				0,
			))
		}

		if len(resp.Choices) == 0 {
			return messages, fmt.Errorf("Chat Completions 没有返回 message")
		}

		msg := resp.Choices[0].Message
		emitThinking(receivers, msg)
		if len(msg.ToolCalls) > 0 {
			messages = append(messages, assistantFromMessage(msg))
			for _, call := range msg.ToolCalls {
				if ctx.Err() != nil {
					return messages, abortTurn(receivers)
				}
				switch variant := call.AsAny().(type) {
				case openai.ChatCompletionMessageFunctionToolCall:
					events.Emit(receivers, events.ToolCall(variant.ID, variant.Function.Name, variant.Function.Arguments))
					result, runErr := tools.Run(ctx, variant.Function.Name, variant.Function.Arguments)
					if canceled(runErr) || ctx.Err() != nil {
						return messages, abortTurn(receivers)
					}
					if runErr != nil {
						text := runErr.Error()
						events.Emit(receivers, events.ToolResult(variant.ID, text, true))
						messages = append(messages, openai.ToolMessage(text, variant.ID))
						continue
					}
					events.Emit(receivers, events.ToolResult(variant.ID, result, false))
					messages = append(messages, openai.ToolMessage(result, variant.ID))
				default:
					result := "不支持的 tool 类型: " + call.Type
					events.Emit(receivers, events.ToolCall(call.ID, call.Type, ""))
					events.Emit(receivers, events.ToolResult(call.ID, result, true))
					messages = append(messages, openai.ToolMessage(result, call.ID))
				}
			}
			continue
		}

		messages = append(messages, assistantFromMessage(msg))
		events.Emit(receivers, events.AssistantMessage(msg.Content))
		return messages, nil
	}
}
