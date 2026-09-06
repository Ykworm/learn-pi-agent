package tools

// 为什么存在：loop 不应内嵌每个工具的实现；按名字分发，第 3 片加 read/bash 时只改这里。
// 功能作用：执行名为 name 的工具，argsJSON 是模型给的参数字符串，返回给模型看的文本。

func Run(name string, argsJSON string) string {
	switch name {
	case "echo":
		return RunEcho(argsJSON)
	default:
		return "未知工具: " + name
	}
}
