package main

// 为什么存在：交互不是另一种 Agent，只是进程不退、反复 Ask；--json 交互还要在 Ask 期间继续读 stdin。
// 功能作用：终端 REPL（readline 式一行一句）；JSON 交互（stdin 一行一条命令，interrupt 当场 cancel）。

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"sync"

	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/agent"
	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/events"
)

func runConsoleInteractive(ag *agent.Agent, rec events.Receiver) {
	fmt.Fprintln(os.Stderr, "交互：输入一句回车；exit / quit 结束。正在跑时 Ctrl+C 停这一 turn。")
	in := bufio.NewReader(os.Stdin)
	for {
		fmt.Print("> ")
		line, err := in.ReadString('\n')
		if err != nil {
			return
		}
		line = strings.TrimSpace(line)
		if line == "exit" || line == "quit" {
			return
		}
		if line == "" {
			continue
		}
		ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
		askErr := ag.Ask(ctx, line)
		stop()
		if askErr != nil {
			reportError(rec, askErr)
		}
	}
}

type jsonCommand struct {
	Type    string `json:"type"`
	Content string `json:"content"`
}

func runJSONInteractive(ag *agent.Agent, rec events.Receiver) {
	messages := make(chan string, 8)
	var mu sync.Mutex
	var cancel context.CancelFunc

	go func() {
		defer close(messages)
		sc := bufio.NewScanner(os.Stdin)
		for sc.Scan() {
			trimmed := strings.TrimSpace(sc.Text())
			if trimmed == "" {
				continue
			}
			var cmd jsonCommand
			if err := json.Unmarshal([]byte(trimmed), &cmd); err != nil {
				rec.On(events.Error("Invalid JSON: " + err.Error()))
				continue
			}
			switch cmd.Type {
			case "interrupt":
				mu.Lock()
				if cancel != nil {
					cancel()
				}
				mu.Unlock()
			case "message":
				if cmd.Content == "" {
					rec.On(events.Error("Message content is required"))
					continue
				}
				messages <- cmd.Content
			default:
				rec.On(events.Error("Unknown command type: " + cmd.Type))
			}
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt)
	defer signal.Stop(sig)
	go func() {
		for range sig {
			mu.Lock()
			c := cancel
			mu.Unlock()
			if c != nil {
				c()
			} else {
				os.Exit(0)
			}
		}
	}()

	for content := range messages {
		ctx, c := context.WithCancel(context.Background())
		mu.Lock()
		cancel = c
		mu.Unlock()
		if err := ag.Ask(ctx, content); err != nil {
			reportError(rec, err)
		}
		mu.Lock()
		cancel = nil
		mu.Unlock()
		c()
	}
}
