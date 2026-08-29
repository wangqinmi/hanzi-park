const fs = require('fs');
global.window = {};
eval(fs.readFileSync('js/strokes.js', 'utf8'));
const ST = window.HANZI_STROKES;

function sampleHead(d) {
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
    } else break;
  }
  return pts;
}
function headDir(pts, frac) {
  const n = Math.max(2, Math.floor(pts.length * frac));
  return [pts[n-1][0]-pts[0][0], pts[n-1][1]-pts[0][1]];
}
function medHeadDir(med, frac) {
  const n = Math.max(2, Math.floor(med.length * frac));
  return [med[n-1][0]-med[0][0], med[n-1][1]-med[0][1]];
}

let fixed = 0;
const fixedList = [];
for (const [c, d] of Object.entries(ST)) {
  for (let i = 0; i < d.strokes.length; i++) {
    const hp = sampleHead(d.strokes[i]);
    const med = d.medians[i];
    if (hp.length < 3 || !med || med.length < 2) continue;
    const D1 = headDir(hp, 0.25);
    const D2 = medHeadDir(med, 0.25);
    const dot = D1[0]*D2[0] + D1[1]*D2[1];
    const mag = Math.hypot(D1[0], D1[1]) * Math.hypot(D2[0], D2[1]) || 1;
    if (dot / mag < -0.3) {
      med.reverse();
      fixed++;
      fixedList.push(c + '#' + (i+1));
    }
  }
}
fs.writeFileSync('js/strokes.js', 'window.HANZI_STROKES = ' + JSON.stringify(ST) + ';\n');
console.log('修复颠倒中线:', fixed, '笔');
console.log(fixedList.join(' '));
