package agent

// 为什么存在：Agent 的全部运行时就是「调 Completions → 有 tool_calls 就执行再调」；缺了这层就只是单次聊天。
// 功能作用：在同一个 turn 里循环 POST Chat Completions，直到模型不再带 tool_calls。发生了什么只 Emit，不打印。
// 第 2 次及以后发给 DeepSeek 的请求都由这个 for 发出。assistant_start 只在进入循环前广播一次，不是每次 POST。

import (
	"context"
	"fmt"

	"github.com/openai/openai-go/v3"

	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/events"
	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/tools"
)

func runCompletionsTurn(ctx context.Context, client openai.Client, model string, messages []openai.ChatCompletionMessageParamUnion, receivers []events.Receiver) ([]openai.ChatCompletionMessageParamUnion, error) {
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
			messages = append(messages, msg.ToParam())
			for _, call := range msg.ToolCalls {
				switch variant := call.AsAny().(type) {
				case openai.ChatCompletionMessageFunctionToolCall:
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
