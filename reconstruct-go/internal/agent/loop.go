package agent

// 为什么存在：Agent 的全部运行时就是「调 Completions → 有 tool_calls 就执行再调」；缺了这层就只是单次聊天。
// 功能作用：在同一个 turn 里循环 POST Chat Completions，直到模型不再带 tool_calls。发生了什么只 Emit，不打印。

import (
	"context"
	"fmt"

	"github.com/openai/openai-go/v3"

	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/events"
	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/tools"
)

// runCompletionsTurn 为什么存在：一个 turn 里可能多次 HTTP；发请求、执行工具、广播事件都在这里，Ask 不管。
// 功能作用：循环直到没有 tool_calls。Go 切片传的是拷贝，所以还要把更新后的 messages 返回给 Ask。
func runCompletionsTurn(ctx context.Context, client openai.Client, model string, messages []openai.ChatCompletionMessageParamUnion, receivers []events.Receiver) ([]openai.ChatCompletionMessageParamUnion, error) {
	// 每个 turn 一次，不是每次 POST。
	events.Emit(receivers, events.AssistantStart())

	for {
		resp, err := client.Chat.Completions.New(ctx, openai.ChatCompletionNewParams{
			Model:    model,
			Messages: messages,
			Tools:    []openai.ChatCompletionToolUnionParam{tools.EchoTool},
			ToolChoice: openai.ChatCompletionToolChoiceOptionUnionParam{
				OfAuto: openai.String("auto"),
			},
		})
		if err != nil {
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
			// 带 tool_calls 的 assistant 必须先入 messages，模型下一轮才知道自己请过哪些工具。
			messages = append(messages, msg.ToParam())
			for _, call := range msg.ToolCalls {
				switch variant := call.AsAny().(type) {
				case openai.ChatCompletionMessageFunctionToolCall:
					// 先广播再执行：终端能看见「正在调」，而不是等工具跑完才出字。
					events.Emit(receivers, events.ToolCall(variant.ID, variant.Function.Name, variant.Function.Arguments))
					result := tools.Run(variant.Function.Name, variant.Function.Arguments)
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
