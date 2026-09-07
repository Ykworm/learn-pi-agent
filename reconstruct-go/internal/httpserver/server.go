package httpserver

// 为什么存在：Go 版可以用浏览器当入口，对应 TypeScript 的 cli.ts；loop 仍然是内部的 Completions 循环。
// 功能作用：GET / 提供输入页；POST /ask 同时挂收集器、Console 和 SessionManager，turn 结束后 JSON 带回事件列表。

import (
	_ "embed"
	"net/http"
	"path/filepath"

	"github.com/gin-gonic/gin"

	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/agent"
	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/config"
	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/events"
	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/render"
	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/session"
)

//go:embed index.html
var indexHTML []byte

type askBody struct {
	Message  string `json:"message"`
	Continue bool   `json:"continue"`
}

// eventCollector 为什么存在：网页不能在 loop 里直接写浏览器；POST /ask 仍是一次请求一次响应。
// 功能作用：第二个听众。把事件攒进切片，等 turn 结束随 JSON 返回。和 Console、SessionManager 同时挂上，就是数组 fan-out。
type eventCollector struct {
	Events []events.Event `json:"events"`
}

func (c *eventCollector) On(event events.Event) {
	c.Events = append(c.Events, event)
}

// lastAssistantText 为什么存在：调试页仍想单独显示终答；终答已经在事件流里，不要再让 Ask 返回字符串。
// 功能作用：从后往前也能用「最后一条 assistant_message」；一个 turn 通常只有一条。
func lastAssistantText(evs []events.Event) string {
	text := ""
	for _, event := range evs {
		if event.Type == events.TypeAssistantMessage {
			text = event.Text
		}
	}
	return text
}

func New(cfg config.AppConfig) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())

	r.GET("/", func(c *gin.Context) {
		c.Data(http.StatusOK, "text/html; charset=utf-8", indexHTML)
	})

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	r.POST("/ask", func(c *gin.Context) {
		var body askBody
		if err := c.ShouldBindJSON(&body); err != nil || body.Message == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "需要 JSON 字段 message"})
			return
		}
		turnCfg := cfg
		sess := session.Open(filepath.Join(config.RootDir(), ".sessions"), body.Continue)
		record := sess.Read()
		if record != nil {
			turnCfg.BaseURL = record.Header.Config.BaseURL
			turnCfg.Model = record.Header.Config.Model
			turnCfg.SystemPrompt = record.Header.Config.SystemPrompt
		} else {
			sess.WriteHeader(session.FileConfig{
				BaseURL:      turnCfg.BaseURL,
				Model:        turnCfg.Model,
				SystemPrompt: turnCfg.SystemPrompt,
			})
		}
		col := &eventCollector{}
		ag := agent.New(turnCfg, col, render.Console{}, sess)
		if record != nil {
			ag.RestoreFromEvents(record.Events)
		}
		ag.EmitSessionStart(sess.ID)
		err := ag.Ask(c.Request.Context(), body.Message)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"error":       err.Error(),
				"events":      col.Events,
				"sessionFile": sess.FilePath,
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"text":        lastAssistantText(col.Events),
			"events":      col.Events,
			"sessionFile": sess.FilePath,
		})
	})

	return r
}
