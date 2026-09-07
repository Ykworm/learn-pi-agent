package agent

import "errors"

// ErrInterrupted 为什么存在：HTTP 取消和子进程杀掉都要变成同一个 error，Ask 才能统一吞掉。
// 功能作用：这一 turn 被取消。不是普通工具失败。
var ErrInterrupted = errors.New("Interrupted")
