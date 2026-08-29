const cnchar = require('./cnchar-check/node_modules/cnchar');
const order = require('./cnchar-check/node_modules/cnchar-order');
cnchar.use(order);
const fs = require('fs');
global.window = {};
eval(fs.readFileSync('js/strokes.js', 'utf8'));
const ST = window.HANZI_STROKES;

// 单段笔画（净方向判定）
const SINGLE = 'jfsltdk';
// 多段笔画（首段方向判定）：起笔向右
const RIGHT_HEAD = 'cearowp';
// 多段：起笔向下
const DOWN_HEAD = 'bzghuy';
// 多段：起笔左下
const PIE_HEAD = 'nm';

function netDir(med) {
  const dx = med[med.length-1][0] - med[0][0];
  const dy = med[med.length-1][1] - med[0][1];
  const m = Math.hypot(dx, dy) || 1;
  return [dx / m, dy / m];
}
function headDir(med) {
  // 前25%长度的方向
  let total = 0; const lens = [];
  for (let i = 1; i < med.length; i++) { const l = Math.hypot(med[i][0]-med[i-1][0], med[i][1]-med[i-1][1]); lens.push(l); total += l; }
  let acc = 0, idx = 1;
  while (idx < med.length && acc < total * 0.25) { acc += lens[idx-1]; idx++; }
  if (idx < 2) idx = 2;
  const dx = med[idx-1][0] - med[0][0], dy = med[idx-1][1] - med[0][1];
  const m = Math.hypot(dx, dy) || 1;
  return [dx / m, dy / m];
}

let fixed = 0;
const fixedList = [];
for (const [c, d] of Object.entries(ST)) {
  const raw = cnchar.stroke(c, 'order');
  const orderStr = (Array.isArray(raw) && raw.length ? raw[0] : raw) || '';
  if (!orderStr || orderStr.length !== d.strokes.length) continue;
  for (let i = 0; i < d.strokes.length; i++) {
    const L = orderStr[i];
    const med = d.medians[i];
    if (!med || med.length < 3) continue;
    let flip = false;
    if (SINGLE.includes(L)) {
      const D = netDir(med);
      if (L === 'j') { if (D[0] < -0.15) flip = true; }
      else if (L === 'f') { if (D[1] < -0.15) flip = true; }
      else if (L === 's') { if (D[1] < -0.15 || D[0] > 0.35) flip = true; }
      else if (L === 'l') { if (D[0] < -0.15 || D[1] < -0.15) flip = true; }
      else if (L === 't') { if (D[0] < -0.15 || D[1] > 0.15) flip = true; }
      // d/k 点：跳过
    } else if (RIGHT_HEAD.includes(L)) {
      const D = headDir(med);
      if (D[0] < -0.15) flip = true;
    } else if (DOWN_HEAD.includes(L)) {
      const D = headDir(med);
      if (D[1] < -0.15) flip = true;
    } else if (PIE_HEAD.includes(L)) {
      const D = headDir(med);
      if (D[1] < -0.15) flip = true;
    }
    if (flip) {
      med.reverse();
      fixed++;
      fixedList.push(c + '#' + (i+1));
    }
  }
}
fs.writeFileSync('js/strokes.js', 'window.HANZI_STROKES = ' + JSON.stringify(ST) + ';\n');
console.log('修复颠倒中线:', fixed, '笔');
fs.writeFileSync('build/fix3-list.json', JSON.stringify(fixedList));
// 关键用例验证
const v = ['一','十','月','火','雨','方','山','口','马','鸟','心','四','门','书','业'];
for (const c of v) {
  console.log(c, ST[c].medians.map(m => '[' + m[0][0] + ',' + m[0][1] + ']->[' + m[m.length-1][0] + ',' + m[m.length-1][1] + ']').join(' '));
}
