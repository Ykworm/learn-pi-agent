package session

// 为什么存在：事件若只活在内存里，下一进程就无法 --continue；落盘必须是听众，不能写进 loop。
// 功能作用：追加 jsonl；新 session 写一行头（不含 apiKey）；continue 时打开最近改过的那份。

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/events"
)

// FileConfig 为什么存在：文件头不是 AgentEvent，continue 时要拿回 model / systemPrompt，但不能拿回密钥。
// 功能作用：jsonl 第一行 type=session 里保存的、可公开的配置。
type FileConfig struct {
	BaseURL      string `json:"baseURL"`
	Model        string `json:"model"`
	SystemPrompt string `json:"systemPrompt"`
}

type headerLine struct {
	Type      string     `json:"type"`
	ID        string     `json:"id"`
	Timestamp string     `json:"timestamp"`
	CWD       string     `json:"cwd"`
	Config    FileConfig `json:"config"`
}

type eventLine struct {
	Type      string       `json:"type"`
	Timestamp string       `json:"timestamp"`
	Event     events.Event `json:"event"`
}

// Record 为什么存在：continue 需要一次性拿到头和全部事件。
// 功能作用：读盘结果。没有合法 session 头则为 nil。
type Record struct {
	Header headerLine
	Events []events.Event
}

// Manager 为什么存在：它是听众，必须全收；落盘不按 type 挑拣。
// 功能作用：持有当前 jsonl 路径和 session id。
type Manager struct {
	ID       string
	FilePath string
}

func newID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

func newFileName(id string) string {
	stamp := strings.NewReplacer(":", "-", ".", "-").Replace(time.Now().UTC().Format(time.RFC3339Nano))
	return stamp + "_" + id + ".jsonl"
}

func findLatestJSONL(dir string) string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return ""
	}
	var best string
	var bestTime time.Time
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".jsonl") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if best == "" || info.ModTime().After(bestTime) {
			best = filepath.Join(dir, entry.Name())
			bestTime = info.ModTime()
		}
	}
	return best
}

func parseRecord(filePath string) *Record {
	raw, err := os.ReadFile(filePath)
	if err != nil {
		return nil
	}
	text := strings.TrimSpace(string(raw))
	if text == "" {
		return nil
	}
	var header *headerLine
	var evs []events.Event
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var probe struct {
			Type string `json:"type"`
		}
		if json.Unmarshal([]byte(line), &probe) != nil {
			continue
		}
		switch probe.Type {
		case "session":
			var row headerLine
			if json.Unmarshal([]byte(line), &row) != nil {
				continue
			}
			if row.ID == "" || row.Config.BaseURL == "" || row.Config.Model == "" || row.Config.SystemPrompt == "" {
				continue
			}
			copied := row
			header = &copied
		case "event":
			var row eventLine
			if json.Unmarshal([]byte(line), &row) != nil {
				continue
			}
			if row.Event.Type == "" {
				continue
			}
			evs = append(evs, row.Event)
		}
	}
	if header == nil {
		return nil
	}
	return &Record{Header: *header, Events: evs}
}

func appendJSON(filePath string, value any) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	f, err := os.OpenFile(filePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = f.Write(append(raw, '\n'))
	return err
}

// Open 为什么存在：新开一次还是接着最近一份，是入口的旗标，不是 loop 的事。
// 功能作用：保证目录存在；continue 且找得到文件就打开它，否则新建路径（还不写盘）。
func Open(dir string, continueSession bool) *Manager {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		fmt.Fprintln(os.Stderr, err)
	}
	if continueSession {
		if latest := findLatestJSONL(dir); latest != "" {
			if rec := parseRecord(latest); rec != nil {
				return &Manager{ID: rec.Header.ID, FilePath: latest}
			}
		}
	}
	id := newID()
	return &Manager{ID: id, FilePath: filepath.Join(dir, newFileName(id))}
}

// WriteHeader 为什么存在：文件头不是事件，不能靠 On 写；新文件必须先有头。
// 功能作用：追加一行 type=session。不含 apiKey。
func (m *Manager) WriteHeader(cfg FileConfig) {
	cwd, _ := os.Getwd()
	err := appendJSON(m.FilePath, headerLine{
		Type:      "session",
		ID:        m.ID,
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		CWD:       cwd,
		Config:    cfg,
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
	}
}

func (m *Manager) Read() *Record {
	return parseRecord(m.FilePath)
}

// On 为什么存在：它是听众，必须全收；落盘不按 type 挑拣，token_usage 也要留下。
// 功能作用：追加一行 type=event。失败打到 stderr。
func (m *Manager) On(event events.Event) {
	err := appendJSON(m.FilePath, eventLine{
		Type:      "event",
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		Event:     event,
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
	}
}
