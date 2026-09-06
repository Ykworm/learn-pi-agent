package render

// 为什么存在：人要在终端看见 turn 里发生了什么；这些打印不能写在 loop 里。
// 功能作用：第一个听众。收到全部事件，自己 switch：token_usage 忽略，其余按 type 打印。

import (
	"fmt"
	"os"

	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/events"
)

type Console struct{}

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
	}
}
