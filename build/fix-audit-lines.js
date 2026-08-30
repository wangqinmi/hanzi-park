const fs = require('fs');
let lines = fs.readFileSync('build/audit-pinyin.js', 'utf8').split('\n');
// 在 check 定义行之后插入辅助函数
let checkLine = lines.findIndex(l => l.includes('const check ='));
lines.splice(checkLine + 1, 0, '  const clickSel = sel => ev("document.querySelector(" + JSON.stringify(sel) + ").click()");');
const reps = {
  194: "  await clickSel(\".opt-btn[data-k='\" + findAns + \"']\");",
  204: "  await clickSel(\"#pyg-build-i .spell-chip[data-k='\" + bi + \"']\");",
  206: "  await clickSel(\"#pyg-build-f .spell-chip[data-k='\" + bf + \"']\");",
  215: "  await clickSel(\"#pyg-train-opts .opt-btn[data-n='\" + tn + \"']\");",
};
// 注意插入 helper 后行号 +1
for (const [n, txt] of Object.entries(reps)) {
  lines[+n - 1 + 1] = txt;
}
fs.writeFileSync('build/audit-pinyin.js', lines.join('\n'));
console.log('已重写（helper + 4行）');
