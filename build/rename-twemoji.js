const fs = require('fs');
const dir = 'img/twemoji';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.svg'));
let n = 0;
for (const f of files) {
  const ch = f.slice(0, -4);
  const hex = 'u' + ch.codePointAt(0).toString(16);
  const oldPath = dir + '/' + f;
  const newPath = dir + '/' + hex + '.svg';
  if (oldPath !== newPath) {
    fs.renameSync(oldPath, newPath);
    n++;
  }
}
console.log('重命名:', n, '文件; 总SVG:', fs.readdirSync(dir).filter(f => f.endsWith('.svg')).length);
