const cnchar = require('cnchar');
const order = require('cnchar-order');
cnchar.use(order);
const fs = require('fs');
global.window = {};
eval(fs.readFileSync('js/strokes.js', 'utf8'));
const ST = window.HANZI_STROKES;

// cnchar 字母 → 基本笔画素序列
const CN = {
  j: ['h'], f: ['v'], s: ['p'], l: ['n'], d: ['d'], k: ['d'], t: ['t'],
  c: ['h','v'], b: ['v','h'], n: ['p','t'], e: ['h','p'], a: ['h','v','p'], m: ['p','d'],
  r: ['h','v','g'], o: ['h','v','g'], z: ['v','h','g'], w: ['h','p','g'], g: ['v','g'], y: ['g'],
  u: ['v','h','g'], h: ['v','t'], i: ['?'], q: ['?'], v: ['?'], p: ['?'], x: ['?'],
};

function medLen(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]);
  return L;
}
function winDir(ax, ay) {
  const X = Math.abs(ax), Y = Math.abs(ay);
  if (X > Y * 1.5) return 'h';
  if (Y > X * 1.5) return 'v';
  if (ay > 0) return ax < 0 ? 'p' : 'n';
  if (ay < 0) return ax > 0 ? 't' : 'p';
  return null;
}

// 中线 → 笔画素序列
function describeMed(med) {
  const L = medLen(med);
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const p of med) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  const w = maxX - minX, h = maxY - minY;
  if (L < 75 || (w < 80 && h < 80 && L < 150)) return ['d']; // 点
  // 把中线插值为 24 点再取 12 窗
  const pts = [];
  for (let k = 0; k < 24; k++) {
    const t = k / 23 * (med.length - 1);
    const i0 = Math.floor(t), i1 = Math.min(med.length - 1, i0 + 1), f = t - i0;
    pts.push([med[i0][0] + (med[i1][0]-med[i0][0]) * f, med[i0][1] + (med[i1][1]-med[i0][1]) * f]);
  }
  const W = 12;
  const dirs = [];
  for (let k = 0; k < W; k++) {
    const a = pts[Math.floor(k * 23 / W)], b = pts[Math.floor((k + 1) * 23 / W)];
    const d = winDir(b[0]-a[0], b[1]-a[1]);
    if (d) dirs.push(d);
  }
  // 合并连续方向，单窗闪现丢弃
  const seq = [];
  let cur = null, cnt = 0;
  const flush = () => { if (cur && cnt >= 2) seq.push(cur); cur = null; cnt = 0; };
  for (const d of dirs) {
    if (d === cur) { cnt++; continue; }
    flush();
    cur = d; cnt = 1;
  }
  flush();
  if (!seq.length && dirs.length) seq.push(dirs[0]);
  // 末端钩/提检测：上挑长度需超过 55 才算钩/提（抑制顿笔小提）
  let tail = Math.max(1, Math.floor(med.length * 0.18));
  const a = med[med.length - 1 - tail], b = med[med.length - 1];
  const tl = Math.hypot(b[0]-a[0], b[1]-a[1]);
  if (tl > 55) {
    const dx = b[0]-a[0], dy = b[1]-a[1];
    if (dy < -10 && Math.abs(dy) > Math.abs(dx) * 1.2) {
      if (seq[seq.length-1] !== 'g') seq.push('g');
    } else if (dy < -10 && Math.abs(dy) > Math.abs(dx) * 0.5) {
      if (seq[seq.length-1] !== 't') seq.push('t');
    }
  }
  return seq;
}

const ALL = Object.keys(ST);
let diffs = 0;
const rows = [];
for (const c of ALL) {
  const raw = cnchar.stroke(c, 'order');
  const orderStr = (Array.isArray(raw) && raw.length ? raw[0] : raw) || '';
  if (!orderStr) { rows.push(c + ' | cnchar 无数据'); continue; }
  const cn = [];
  for (const l of orderStr) cn.push(...(CN[l] || ['?']));
  const mine = [];
  for (const m of ST[c].medians) mine.push(...describeMed(m));
  const match = JSON.stringify(cn) === JSON.stringify(mine);
  if (!match) diffs++;
  rows.push((match ? '✓ ' : '✗ ') + c + ' [' + ST[c].strokes.length + '笔] 标准:' + orderStr + '→' + cn.join('') + ' 数据:' + mine.join(''));
}
console.log('总字数:', ALL.length, '疑似不一致:', diffs);
fs.writeFileSync('compare-report.txt', rows.join('\n'));
console.log(rows.filter(r => r.startsWith('✗')).join('\n'));
