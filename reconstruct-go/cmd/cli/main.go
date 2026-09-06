package main

// 为什么存在：curl / 浏览器对「问一句」太重；需要和 TypeScript `npx tsx src/cli.ts` 一样的命令行入口。
// 功能作用：读配置和命令行上那一句 user，把 Console 挂上 Agent，跑一个 turn。打印由听众做。不经过 Gin。

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/agent"
	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/config"
	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/render"
)

func main() {
	userText := strings.TrimSpace(strings.Join(os.Args[1:], " "))
	if userText == "" {
		fmt.Fprintln(os.Stderr, `用法: go run ./cmd/cli "请用 echo 工具重复：hello"`)
		os.Exit(1)
	}

	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	if err := agent.New(cfg, render.Console{}).Ask(context.Background(), userText); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
