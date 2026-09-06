package httpserver

// 为什么存在：Go 版可以用浏览器当入口，对应 TypeScript 的 cli.ts；loop 仍然是内部的 Completions 循环。
// 功能作用：GET / 提供输入页；POST /ask 同时挂收集器和 Console，turn 结束后 JSON 带回事件列表。

import (
	_ "embed"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/agent"
	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/config"
	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/events"
	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/render"
)

//go:embed index.html
var indexHTML []byte

type askBody struct {
	Message string `json:"message"`
}

type eventCollector struct {
	Events []events.Event `json:"events"`
}

func (c *eventCollector) On(event events.Event) {
	c.Events = append(c.Events, event)
}

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
		col := &eventCollector{}
		err := agent.New(cfg, col, render.Console{}).Ask(c.Request.Context(), body.Message)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"error":  err.Error(),
				"events": col.Events,
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"text":   lastAssistantText(col.Events),
			"events": col.Events,
		})
	})

	return r
}
