package agent

// 为什么存在：Agent 的全部运行时就是「调 Completions → 有 tool_calls 就执行再调」；缺了这层就只是单次聊天。
// 功能作用：在同一个 turn 里循环 POST Chat Completions，直到模型不再带 tool_calls，或 ctx 被 cancel。发生了什么只 Emit，不打印。

import (
	"context"
	"errors"
	"fmt"

	"github.com/openai/openai-go/v3"

	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/events"
	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/tools"
)

// abortTurn 为什么存在：取消发生在 HTTP 途中、工具执行前、工具返回 cancel，都要先广播再停。
// 功能作用：发 interrupted，再返回 ErrInterrupted。Ask 会吞掉这个 error。
func abortTurn(receivers []events.Receiver, messages []openai.ChatCompletionMessageParamUnion) ([]openai.ChatCompletionMessageParamUnion, error) {
	events.Emit(receivers, events.Interrupted())
	return messages, ErrInterrupted
}

func canceled(err error) bool {
	return errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) || errors.Is(err, ErrInterrupted)
}

// runCompletionsTurn 为什么存在：一个 turn 里可能多次 HTTP；发请求、执行工具、广播事件都在这里，Ask 不管。
// 功能作用：循环直到没有 tool_calls。ctx 被 cancel 则发 interrupted 并结束。
func runCompletionsTurn(ctx context.Context, client openai.Client, model string, messages []openai.ChatCompletionMessageParamUnion, receivers []events.Receiver) ([]openai.ChatCompletionMessageParamUnion, error) {
	events.Emit(receivers, events.AssistantStart())

	for {
		if ctx.Err() != nil {
			return abortTurn(receivers, messages)
		}

		resp, err := client.Chat.Completions.New(ctx, openai.ChatCompletionNewParams{
			Model:    model,
			Messages: messages,
			Tools:    tools.CompletionsTools,
			ToolChoice: openai.ChatCompletionToolChoiceOptionUnionParam{
				OfAuto: openai.String("auto"),
			},
		})
		if err != nil {
			if canceled(err) || ctx.Err() != nil {
				return abortTurn(receivers, messages)
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
		if len(msg.ToolCalls) > 0 {
			messages = append(messages, msg.ToParam())
			for _, call := range msg.ToolCalls {
				if ctx.Err() != nil {
					return abortTurn(receivers, messages)
				}
				switch variant := call.AsAny().(type) {
				case openai.ChatCompletionMessageFunctionToolCall:
					events.Emit(receivers, events.ToolCall(variant.ID, variant.Function.Name, variant.Function.Arguments))
					result, runErr := tools.Run(ctx, variant.Function.Name, variant.Function.Arguments)
					if canceled(runErr) || ctx.Err() != nil {
						return abortTurn(receivers, messages)
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

		messages = append(messages, msg.ToParam())
		events.Emit(receivers, events.AssistantMessage(msg.Content))
		return messages, nil
	}
}
