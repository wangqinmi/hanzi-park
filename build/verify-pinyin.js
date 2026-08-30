const fs = require('fs');
global.window = {};
eval(fs.readFileSync('js/pinyin-data.js', 'utf8'));
eval(fs.readFileSync('js/data.js', 'utf8'));
const D = window.PINYIN_DATA;
const CD = window.CHAR_DATA;

const errors = [];
const ok = (cond, msg) => { if (!cond) errors.push(msg); };

// ===== 1. 权威呼读音对照表 =====
const REF = {
  b:'bō', p:'pō', m:'mō', f:'fō', d:'dē', t:'tē', n:'nē', l:'lē', g:'gē', k:'kē', h:'hē',
  j:'jī', q:'qī', x:'xī', zh:'zhī', ch:'chī', sh:'shī', r:'rī', z:'zī', c:'cī', s:'sī', y:'yī', w:'wū',
  a:'ā', o:'ō', e:'ē', i:'ī', u:'ū', ü:'ǖ',
  ai:'āi', ei:'ēi', ui:'uī', ao:'āo', ou:'ōu', iu:'iū', ie:'iē', üe:'üē', er:'ēr',
  an:'ān', en:'ēn', in:'īn', un:'ūn', ün:'ǖn', ang:'āng', eng:'ēng', ing:'īng', ong:'ōng',
  zhi:'zhī', chi:'chī', shi:'shī', ri:'rī', zi:'zī', ci:'cī', si:'sī', yi:'yī', wu:'wū', yu:'yū',
  ye:'yē', yue:'yuē', yuan:'yuān', yin:'yīn', yun:'yūn', ying:'yīng',
};

// ===== 2. 逐项校验 =====
if (Object.keys(D).length !== 63) errors.push('总数 ' + Object.keys(D).length + ' ≠ 63');
for (const [k, d] of Object.entries(D)) {
  ok(REF[k], k + ' 不在对照表');
  ok(d.read === REF[k], k + ' 读音错误: ' + d.read + ' ≠ 标准 ' + REF[k]);
  ok(d.rw && d.rw.length === 1, k + ' 呼读音例字异常: ' + d.rw);
  ok(d.ph && d.ph.includes(d.rw), k + ' 词组未包含例字: ' + d.ph);
  ok(d.tip && d.tip.length >= 4, k + ' 口诀缺失');
  ok(d.img, k + ' 图片缺失');
  ok(Array.isArray(d.ex) && d.ex.length >= 1, k + ' 例词缺失');
  for (const e of d.ex) {
    ok(e.w && e.py, k + ' 例词字段缺失: ' + JSON.stringify(e));
    ok(/^[a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+$/.test(e.py), k + ' 例词拼音非法: ' + e.py);
  }
  // 声调校验：声调例字的拼音必须含该声调元音
  if (d.tones !== null) {
    ok(Array.isArray(d.tones) && d.tones.length >= 1 && d.tones.length <= 4, k + ' 声调数量异常');
    for (const t of d.tones) {
      ok(/^[a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+$/.test(t.t), k + ' 声调拼写非法: ' + t.t);
      const toneVowel = t.t.match(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/);
      ok(toneVowel, k + ' 声调缺少声调符: ' + t.t);
      if (toneVowel) {
        // 归一化：ü 在 y/j/q/x 后写作 u（去点）；iu 缩写标调在 u（实词标在 o）
        // ü 去点归一；iu 一声在实词中标在 o（yōu）
        const baseVowel = t.t.replace(/ǖ|ǘ|ǚ|ǜ/g, m => 'ūúǔù'['ǖǘǚǜ'.indexOf(m)]).match(/[āáǎàēéěèīíǐìōóǒòūúǔù]/);
        const expect = (t.t === 'iū') ? 'ō' : (baseVowel ? baseVowel[0] : '');
        const wordNorm = t.py.replace(/ǖ|ǘ|ǚ|ǜ/g, m => 'ūúǔù'['ǖǘǚǜ'.indexOf(m)]);
        ok(expect && wordNorm.includes(expect), k + ' 声调例字读音不符: ' + t.t + ' vs ' + t.py);
      }
      ok(t.w && t.py, k + ' 声调例字缺失: ' + JSON.stringify(t));
    }
    const marks = d.tones.map(t => t.t.match(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/)?.[0]).filter(Boolean);
    ok(new Set(marks).size === marks.length, k + ' 声调重复: ' + JSON.stringify(d.tones));
  }
}

// ===== 3. 例字与120字库交叉 =====
let inLib = 0, outLib = 0;
for (const d of Object.values(D)) {
  for (const e of d.ex) { if (CD[e.w]) inLib++; else outLib++; }
  if (d.tones) for (const t of d.tones) { if (CD[t.w]) inLib++; else outLib++; }
}
console.log('例字统计: 120字库内', inLib, '库外', outLib);

// ===== 4. 校验120字拼音均可映射到拼音模块 =====
const FINAL_KEYS = Object.keys(REF).filter(k => /[aeiouü]/.test(k) && !['zh','ch','sh'].includes(k) && ['ai','ei','ui','ao','ou','iu','ie','üe','er','an','en','in','un','ün','ang','eng','ing','ong','a','o','e','i','u','ü'].includes(k));
const WHOLE_KEYS = ['zhi','chi','shi','ri','zi','ci','si','yi','wu','yu','ye','yue','yuan','yin','yun','ying'];
const TONE_MAP = { ā:'a',á:'a',ǎ:'a',à:'a', ē:'e',é:'e',ě:'e',è:'e', ī:'i',í:'i',ǐ:'i',ì:'i', ō:'o',ó:'o',ǒ:'o',ò:'o', ū:'u',ú:'u',ǔ:'u',ù:'u', ǖ:'ü',ǘ:'ü',ǚ:'ü',ǜ:'ü' };
function stripTone(py) {
  let out = '';
  for (const ch of py) out += TONE_MAP[ch] || ch;
  return out;
}
function findPYKey(base) {
  if (WHOLE_KEYS.includes(base)) return base;
  // 最长韵母后缀匹配
  const sorted = [...FINAL_KEYS].sort((a, b) => b.length - a.length);
  for (const f of sorted) {
    if (base.endsWith(f)) return f;
    // ue→üe 归一（jqx y 后去点）
    if (base.endsWith(f.replace('ü', 'u')) && f.includes('ü')) return f;
    // un→ün 归一
    if (f === 'ün' && base.endsWith('un')) {
      const pre = base.slice(0, -2);
      if (pre && 'jqxy'.includes(pre[pre.length - 1])) return f;
    }
  }
  return null;
}
let mapFail = 0;
for (const [ch, d] of Object.entries(CD)) {
  const base = stripTone(d.p);
  const key = findPYKey(base);
  if (!key) { mapFail++; errors.push('120字映射失败: ' + ch + ' pinyin=' + d.p + ' base=' + base); }
}
console.log('120字拼音映射: 失败', mapFail);

console.log(errors.length ? '❌ 问题 ' + errors.length + ' 项:\n' + errors.slice(0, 30).join('\n') : '✅ 读音准确性校验全部通过（63项读音/呼读音例字/声调例字/120字映射）');
