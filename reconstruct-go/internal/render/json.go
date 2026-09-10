package render

// 为什么存在：程序要消费同一条事件流，不能去解析 Console 的 `[assistant]` 文本。
// 功能作用：最薄的听众。每条事件一行 JSON 打到 stdout。不 switch type。

import (
	"encoding/json"
	"fmt"

	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/events"
)

type Json struct{}

func (Json) On(event events.Event) {
	b, err := json.Marshal(event)
	if err != nil {
		fmt.Println(`{"type":"error","message":"marshal failed"}`)
		return
	}
	fmt.Println(string(b))
}
