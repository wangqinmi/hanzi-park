const fs = require('fs');
global.window = {};
eval(fs.readFileSync('js/strokes.js', 'utf8'));
const ST = window.HANZI_STROKES;

// 完整采样轮廓路径（到第一个 Z 为止）
function sampleOutline(d) {
  const toks = d.match(/[MLQCZ]|-?\d+(\.\d+)?/g) || [];
  const pts = [];
  let x = 0, y = 0, i = 0;
  while (i < toks.length) {
    const c = toks[i++];
    const nums = [];
    while (i < toks.length && /^-?\d/.test(toks[i])) nums.push(parseFloat(toks[i++]));
    if (c === 'M') { x = nums[0]; y = nums[1]; pts.push([x, y]); }
    else if (c === 'L') { x = nums[0]; y = nums[1]; pts.push([x, y]); }
    else if (c === 'Q') {
      for (let k = 1; k <= 8; k++) {
        const t = k / 8, mt = 1 - t;
        pts.push([mt*mt*x + 2*mt*t*nums[0] + t*t*nums[2], mt*mt*y + 2*mt*t*nums[1] + t*t*nums[3]]);
      }
      x = nums[2]; y = nums[3];
    } else if (c === 'C') {
      for (let k = 1; k <= 8; k++) {
        const t = k / 8, mt = 1 - t;
        pts.push([mt*mt*mt*x + 3*mt*mt*t*nums[0] + 3*mt*t*t*nums[2] + t*t*t*nums[4], mt*mt*mt*y + 3*mt*mt*t*nums[1] + 3*mt*t*t*nums[3] + t*t*t*nums[5]]);
      }
      x = nums[4]; y = nums[5];
    } else if (c === 'Z') break; // 第一个闭合处停止
  }
  return pts;
}
// 轮廓前40%长度的方向（书写方向）
function outlineForwardDir(d) {
  const pts = sampleOutline(d);
  if (pts.length < 3) return null;
  let total = 0;
  const lens = [];
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]);
    lens.push(l); total += l;
  }
  let acc = 0, idx = 1;
  const target = total * 0.4;
  while (idx < pts.length && acc < target) { acc += lens[idx-1]; idx++; }
  if (idx < 2) idx = 2;
  return [pts[idx-1][0]-pts[0][0], pts[idx-1][1]-pts[0][1]];
}
// 中线整体方向
function medDir(med) {
  if (!med || med.length < 2) return null;
  return [med[med.length-1][0]-med[0][0], med[med.length-1][1]-med[0][1]];
}

let fixed = 0;
const fixedList = [];
for (const [c, d] of Object.entries(ST)) {
  for (let i = 0; i < d.strokes.length; i++) {
    const D1 = outlineForwardDir(d.strokes[i]);
    const D2 = medDir(d.medians[i]);
    if (!D1 || !D2) continue;
    const dot = D1[0]*D2[0] + D1[1]*D2[1];
    const mag = Math.hypot(D1[0], D1[1]) * Math.hypot(D2[0], D2[1]) || 1;
    if (dot / mag < -0.3) {
      d.medians[i].reverse();
      fixed++;
      fixedList.push(c + '#' + (i+1));
    }
  }
}
fs.writeFileSync('js/strokes.js', 'window.HANZI_STROKES = ' + JSON.stringify(ST) + ';\n');
console.log('修复颠倒中线:', fixed, '笔');
console.log(fixedList.join(' '));
