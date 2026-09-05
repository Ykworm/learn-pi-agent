/**
 * 为什么存在：loop 不应内嵌每个工具的实现；这里按名字分发，第 3 片加 read/bash 时只改这一处。
 * 功能作用：执行名为 name 的工具，argsJson 是模型给的参数字符串，返回给模型看的文本。
 */
import { runEcho } from "./echo.js";

export function runTool(name: string, argsJson: string): string {
	switch (name) {
		case "echo":
			return runEcho(argsJson);
		default:
			return `未知工具: ${name}`;
	}
}
