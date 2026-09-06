package render

// 为什么存在：人要在终端看见 turn 里发生了什么；这些打印不能写在 loop 里。
// 功能作用：第一个听众。收到全部事件，自己 switch：token_usage 忽略，其余按 type 打印。

import (
	"fmt"
	"os"

	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/events"
)

type Console struct{}

// On 为什么存在：fan-out 把每条事件都送来；这里才决定人眼看什么。
// 功能作用：按 type 打印。[user] / [assistant] / [tool] 是给人看的标签，不是 API 的 role。
func (Console) On(event events.Event) {
	switch event.Type {
	case events.TypeUserMessage:
		fmt.Println("[user]")
		fmt.Println(event.Text)
		fmt.Println()
	case events.TypeAssistantStart:
		fmt.Println("[assistant]")
	case events.TypeToolCall:
		fmt.Printf("[tool] %s(%s)\n", event.Name, event.Args)
	case events.TypeToolResult:
		if event.IsError != nil && *event.IsError {
			fmt.Fprintln(os.Stderr, event.Result)
		} else {
			fmt.Println(event.Result)
		}
		fmt.Println()
	case events.TypeAssistantMessage:
		fmt.Println(event.Text)
		fmt.Println()
	case events.TypeTokenUsage:
		// 收到了但不印。第 5 片写 jsonl 的听众会全收，包括这一条。
	}
}
