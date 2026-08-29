const cnchar = require('cnchar');
const order = require('cnchar-order');
cnchar.use(order);
const fs = require('fs');
global.window = {};
eval(fs.readFileSync('js/strokes.js', 'utf8'));
const ALL = Object.keys(window.HANZI_STROKES);
const out = {};
for (const c of ALL) {
  try {
    const o = cnchar.stroke(c, 'order');
    out[c] = { order: Array.isArray(o) ? o : [String(o)], count: (Array.isArray(o) ? o : [String(o)]).length };
  } catch (e) { out[c] = { error: String(e) }; }
}
fs.writeFileSync('cnchar-orders.json', JSON.stringify(out, null, 1));
// 打印几个样本
for (const c of ['火', '月', '万', '方', '车', '九', '长', '马', '鸟', '为', '心', '四', '五', '山', '水', '里', '门', '女', '风', '电']) {
  console.log(c, JSON.stringify(out[c]));
}
console.log('总字数:', Object.keys(out).length, '错误数:', Object.values(out).filter(v => v.error).length);
