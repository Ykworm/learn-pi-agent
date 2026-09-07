package main

// 为什么存在：curl / 浏览器对「问一句」太重；需要和 TypeScript `npx tsx src/cli.ts` 一样的命令行入口。
// 功能作用：读配置和命令行上那一句 user，把 Console 和 SessionManager 挂上 Agent，跑一个 turn。Ctrl+C 取消 ctx。

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"

	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/agent"
	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/config"
	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/render"
	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/session"
)

func parseArgs(args []string) (continueSession bool, userText string) {
	var parts []string
	for _, arg := range args {
		if arg == "--continue" || arg == "-c" {
			continueSession = true
			continue
		}
		parts = append(parts, arg)
	}
	return continueSession, strings.TrimSpace(strings.Join(parts, " "))
}

func main() {
	continueSession, userText := parseArgs(os.Args[1:])
	if userText == "" {
		fmt.Fprintln(os.Stderr, `用法: go run ./cmd/cli [--continue] "列出当前目录"`)
		os.Exit(1)
	}

	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	sess := session.Open(filepath.Join(config.RootDir(), ".sessions"), continueSession)
	record := sess.Read()
	if record != nil {
		cfg.BaseURL = record.Header.Config.BaseURL
		cfg.Model = record.Header.Config.Model
		cfg.SystemPrompt = record.Header.Config.SystemPrompt
		fmt.Printf("[continue] %d events from %s\n", len(record.Events), sess.FilePath)
	} else {
		sess.WriteHeader(session.FileConfig{
			BaseURL:      cfg.BaseURL,
			Model:        cfg.Model,
			SystemPrompt: cfg.SystemPrompt,
		})
	}

	ag := agent.New(cfg, render.Console{}, sess)
	if record != nil {
		ag.RestoreFromEvents(record.Events)
	}
	ag.EmitSessionStart(sess.ID)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	if err := ag.Ask(ctx, userText); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
