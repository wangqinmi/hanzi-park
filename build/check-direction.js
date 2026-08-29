const fs = require('fs');
global.window = {};
eval(fs.readFileSync('js/strokes.js', 'utf8'));
const ST = window.HANZI_STROKES;

// 采样轮廓路径首20%
function sampleHead(d, frac) {
  const toks = d.match(/[MLQCZ]|-?\d+(\.\d+)?/g) || [];
  const pts = [];
  let x = 0, y = 0, i = 0;
  while (i < toks.length && pts.length < 60) {
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
    } else break; // Z
  }
  return pts;
}
function headDir(pts, frac) {
  const n = Math.max(2, Math.floor(pts.length * frac));
  const a = pts[0], b = pts[n - 1];
  return [b[0]-a[0], b[1]-a[1]];
}
function medHeadDir(med, frac) {
  const n = Math.max(2, Math.floor(med.length * frac));
  const a = med[0], b = med[n - 1];
  return [b[0]-a[0], b[1]-a[1]];
}

let reversed = 0, total = 0;
const revList = [];
for (const [c, d] of Object.entries(ST)) {
  for (let i = 0; i < d.strokes.length; i++) {
    const hp = sampleHead(d.strokes[i]);
    const med = d.medians[i];
    if (hp.length < 3 || !med || med.length < 2) continue;
    total++;
    const D1 = headDir(hp, 0.25);
    const D2 = medHeadDir(med, 0.25);
    const dot = D1[0]*D2[0] + D1[1]*D2[1];
    const mag = Math.hypot(D1[0], D1[1]) * Math.hypot(D2[0], D2[1]) || 1;
    if (dot / mag < -0.3) {
      reversed++;
      revList.push(c + '#' + (i+1));
    }
  }
}
console.log('总笔画数:', total, '中线颠倒:', reversed);
console.log('颠倒列表:', revList.join(' '));
fs.writeFileSync('build/reversed-list.json', JSON.stringify(revList));
