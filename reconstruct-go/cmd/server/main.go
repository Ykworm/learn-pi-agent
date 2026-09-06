package main

// 为什么存在：调试时需要一个常驻 HTTP 进程和下断点的入口；日常提问请用 cmd/cli。
// 功能作用：加载配置，启动 Gin：浏览器打开 GET /，提问走 POST /ask。

import (
	"log"

	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/config"
	"github.com/Ykworm/learn-pi-agent/reconstruct-go/internal/httpserver"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	engine := httpserver.New(cfg)
	log.Printf("listening on http://%s  浏览器打开 /  ，或 POST /ask", cfg.Listen)
	if err := engine.Run(cfg.Listen); err != nil {
		log.Fatal(err)
	}
}
