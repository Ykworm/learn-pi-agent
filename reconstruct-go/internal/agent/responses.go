package agent

// 为什么存在：Responses 和 Completions 是两套信封，不是两套 Agent；缺了这层就只能走 /v1/chat/completions。
// 功能作用：在同一个 turn 里循环 POST /v1/responses，直到这次 output 没有 function_call。发生了什么只 Emit，不打印。

import (
	"context"
	"encoding/json"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/packages/param"
	"github.com/openai/openai-go/v3/responses"
	"github.com/openai/openai-go/v3/shared"

	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/events"
	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/tools"
)

func outputToInput(item responses.ResponseOutputItemUnion) responses.ResponseInputItemUnionParam {
	return param.Override[responses.ResponseInputItemUnionParam](json.RawMessage(item.RawJSON()))
}

func functionCallOutput(callID, output string) responses.ResponseInputItemUnionParam {
	item := responses.ResponseInputItemFunctionCallOutputParam{}
	item.CallID = openai.String(callID)
	item.Output.OfString = openai.String(output)
	return responses.ResponseInputItemUnionParam{OfFunctionCallOutput: &item}
}

func emitReasoning(receivers []events.Receiver, item responses.ResponseOutputItemUnion) {
	reason := item.AsReasoning()
	for _, content := range reason.Content {
		if content.Type == "reasoning_text" {
			events.Emit(receivers, events.Thinking(content.Text))
		}
	}
	for _, part := range reason.Summary {
		if part.Type == "summary_text" {
			events.Emit(receivers, events.Thinking(part.Text))
		}
	}
}

func emitOutputMessage(receivers []events.Receiver, item responses.ResponseOutputItemUnion) {
	msg := item.AsMessage()
	for _, content := range msg.Content {
		switch content.Type {
		case "output_text":
			events.Emit(receivers, events.AssistantMessage(content.Text))
		case "refusal":
			events.Emit(receivers, events.AssistantMessage("Refusal: "+content.Refusal))
		}
	}
}

// runResponsesTurn 为什么存在：一个 turn 里可能多次 HTTP；发请求、执行工具、广播事件都在这里，Ask 不管。
// 功能作用：循环直到这次 output 没有 function_call。system 走 instructions，不进 input。
func runResponsesTurn(ctx context.Context, client openai.Client, model, systemPrompt string, input responses.ResponseInputParam, receivers []events.Receiver) (responses.ResponseInputParam, error) {
	events.Emit(receivers, events.AssistantStart())

	for {
		if ctx.Err() != nil {
			return input, abortTurn(receivers)
		}

		resp, err := client.Responses.New(ctx, responses.ResponseNewParams{
			Model:             shared.ResponsesModel(model),
			Instructions:      openai.String(systemPrompt),
			ParallelToolCalls: openai.Bool(true),
			Input: responses.ResponseNewParamsInputUnion{
				OfInputItemList: input,
			},
			Tools: tools.ResponsesTools,
			ToolChoice: responses.ResponseNewParamsToolChoiceUnion{
				OfToolChoiceMode: openai.Opt(responses.ToolChoiceOptionsAuto),
			},
		})
		if err != nil {
			if canceled(err) || ctx.Err() != nil {
				return input, abortTurn(receivers)
			}
			return input, err
		}

		if resp.JSON.Usage.Valid() {
			usage := resp.Usage
			cacheRead := 0
			cacheWrite := 0
			if usage.JSON.InputTokensDetails.Valid() {
				cacheRead = int(usage.InputTokensDetails.CachedTokens)
				cacheWrite = int(usage.InputTokensDetails.CacheWriteTokens)
			}
			events.Emit(receivers, events.TokenUsage(
				int(usage.InputTokens),
				int(usage.OutputTokens),
				int(usage.TotalTokens),
				cacheRead,
				cacheWrite,
			))
		}

		sawFunctionCall := false
		sawMessage := false
		for _, item := range resp.Output {
			input = append(input, outputToInput(item))
			switch item.Type {
			case "reasoning":
				emitReasoning(receivers, item)
			case "message":
				emitOutputMessage(receivers, item)
				sawMessage = true
			case "function_call":
				if ctx.Err() != nil {
					return input, abortTurn(receivers)
				}
				sawFunctionCall = true
				call := item.AsFunctionCall()
				events.Emit(receivers, events.ToolCall(call.CallID, call.Name, call.Arguments))
				result, runErr := tools.Run(ctx, call.Name, call.Arguments)
				if canceled(runErr) || ctx.Err() != nil {
					return input, abortTurn(receivers)
				}
				if runErr != nil {
					text := runErr.Error()
					events.Emit(receivers, events.ToolResult(call.CallID, text, true))
					input = append(input, functionCallOutput(call.CallID, text))
					continue
				}
				events.Emit(receivers, events.ToolResult(call.CallID, result, false))
				input = append(input, functionCallOutput(call.CallID, result))
			}
		}

		if sawFunctionCall {
			continue
		}
		if sawMessage {
			return input, nil
		}
		return input, nil
	}
}
