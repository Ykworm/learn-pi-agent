package render

// 为什么存在：人要在终端看见 turn 里发生了什么；这些打印不能写在 loop 里。
// 功能作用：第一个听众。收到全部事件，自己 switch：token_usage 忽略，其余按 type 打印。

import (
	"fmt"
	"os"
	"strings"

	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/events"
)

const toolResultPreviewLines = 10

// previewToolResult 为什么存在：终端只给人看前几行；事件里的 result 仍是工具返回的全文（已按 1 MB 切过）。
// 功能作用：超过 10 行就只留下开头，并标明还有多少行没印。
func previewToolResult(result string) string {
	lines := strings.Split(result, "\n")
	if len(lines) <= toolResultPreviewLines {
		return result
	}
	hidden := len(lines) - toolResultPreviewLines
	return strings.Join(lines[:toolResultPreviewLines], "\n") + fmt.Sprintf("\n... (%d more lines)", hidden)
}

type Console struct{}

// On 为什么存在：fan-out 把每条事件都送来；这里才决定人眼看什么。
// 功能作用：按 type 打印。[user] / [assistant] / [tool] 是给人看的标签，不是 API 的 role。
func (Console) On(event events.Event) {
	switch event.Type {
	case events.TypeSessionStart:
		fmt.Printf("[session] %s  model=%s\n\n", event.SessionID, event.Model)
	case events.TypeUserMessage:
		fmt.Println("[user]")
		fmt.Println(event.Text)
		fmt.Println()
	case events.TypeAssistantStart:
		fmt.Println("[assistant]")
	case events.TypeToolCall:
		fmt.Printf("[tool] %s(%s)\n", event.Name, event.Args)
	case events.TypeToolResult:
		preview := previewToolResult(event.Result)
		if event.IsError != nil && *event.IsError {
			fmt.Fprintln(os.Stderr, preview)
		} else {
			fmt.Println(preview)
		}
		fmt.Println()
	case events.TypeAssistantMessage:
		fmt.Println(event.Text)
		fmt.Println()
	case events.TypeInterrupted:
		fmt.Println("[interrupted]")
		fmt.Println()
	case events.TypeTokenUsage:
		// 收到了但不印。SessionManager 会原样写入 jsonl。
	}
}
