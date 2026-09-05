/**
 * 可视化调试练习文件（不是 agent）。
 * 在下一行打断点，然后 F5 选「Debug reconstruct: debug-me.ts」。
 */
function sumUntil(n: number): number {
	let total = 0;
	for (let i = 1; i <= n; i++) {
		total += i;
	}
	return total;
}

const n = 5;
const result = sumUntil(n);
console.log(`1 + … + ${n} = ${result}`);
