package main

// 为什么存在：同一套 Agent / 事件要换三种入口：问一句就退、终端里接着问、程序用 stdin/stdout 对话。
// 功能作用：解析 --continue / --json / --help 和位置参数；按有没有句子、有没有 --json 选皮。loop 只 Emit。

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"

	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/agent"
	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/config"
	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/events"
	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/render"
	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/session"
)

type parsedCLI struct {
	help            bool
	continueSession bool
	json            bool
	messages        []string
}

func parseArgs(args []string) (parsedCLI, error) {
	var parsed parsedCLI
	for _, arg := range args {
		switch arg {
		case "--help", "-h":
			parsed.help = true
		case "--continue", "-c":
			parsed.continueSession = true
		case "--json":
			parsed.json = true
		default:
			if strings.HasPrefix(arg, "-") {
				return parsedCLI{}, fmt.Errorf("未知参数: %s", arg)
			}
			parsed.messages = append(parsed.messages, arg)
		}
	}
	return parsed, nil
}

func printHelp() {
	fmt.Print(`用法: go run ./cmd/cli [options] [messages...]

  go run ./cmd/cli "列出当前目录"
  go run ./cmd/cli "第一句" "第二句"
  go run ./cmd/cli
  go run ./cmd/cli --continue
  go run ./cmd/cli --json "列出当前目录"
  go run ./cmd/cli --json

Options:
  --continue, -c    继续最近一份 session
  --json            事件一行一个 JSON 打到 stdout
  --help, -h        显示这段说明

无位置参数 = 交互。每个位置参数是一句独立的 user，按顺序 Ask 再退。
`)
}

func reportError(rec events.Receiver, err error) {
	if err == nil {
		return
	}
	rec.On(events.Error(err.Error()))
}

func runSingleShot(ag *agent.Agent, rec events.Receiver, messages []string) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	for _, text := range messages {
		if err := ag.Ask(ctx, text); err != nil {
			reportError(rec, err)
		}
		if ctx.Err() != nil {
			return nil
		}
	}
	return nil
}

func main() {
	parsed, err := parseArgs(os.Args[1:])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if parsed.help {
		printHelp()
		return
	}

	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	sess := session.Open(filepath.Join(config.RootDir(), ".sessions"), parsed.continueSession)
	record := sess.Read()
	if record != nil {
		cfg.BaseURL = record.Header.Config.BaseURL
		cfg.Model = record.Header.Config.Model
		cfg.SystemPrompt = record.Header.Config.SystemPrompt
		if !parsed.json {
			fmt.Printf("[continue] %d events from %s\n", len(record.Events), sess.FilePath)
		}
	} else {
		sess.WriteHeader(session.FileConfig{
			BaseURL:      cfg.BaseURL,
			Model:        cfg.Model,
			SystemPrompt: cfg.SystemPrompt,
		})
	}

	var rec events.Receiver = render.Console{}
	if parsed.json {
		rec = render.Json{}
	}
	ag := agent.New(cfg, rec, sess)
	if record != nil {
		ag.RestoreFromEvents(record.Events)
	}
	ag.EmitSessionStart(sess.ID)

	if len(parsed.messages) == 0 {
		if parsed.json {
			runJSONInteractive(ag, rec)
		} else {
			runConsoleInteractive(ag, rec)
		}
		return
	}
	if err := runSingleShot(ag, rec, parsed.messages); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
