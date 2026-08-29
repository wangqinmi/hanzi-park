const fs = require('fs');
global.window = {};
eval(fs.readFileSync('js/data.js', 'utf8'));
const CD = window.CHAR_DATA;
const OUT = 'img/twemoji';
const FE0F = 0xFE0F;
const fails = ['水', '土', '下', '上', '方', '中', '左', '右', '白', '也'];

function candidates(emoji) {
  const cps = Array.from(emoji).map(c => c.codePointAt(0));
  const withFe = cps.map(cp => cp.toString(16)).join('-');
  const noFe = cps.filter(cp => cp !== FE0F).map(cp => cp.toString(16)).join('-');
  return [...new Set(withFe === noFe ? [withFe] : [withFe, noFe])];
}

(async () => {
  const stillFail = [];
  for (const ch of fails) {
    const emoji = CD[ch].e;
    let saved = false;
    for (const name of candidates(emoji)) {
      const url = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/' + name + '.svg';
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
          if (!res.ok) { console.log(ch, name, '状态:', res.status); break; }
          const svg = await res.text();
          if (svg.length > 100 && svg.includes('<svg')) {
            fs.writeFileSync(OUT + '/' + ch + '.svg', svg);
            console.log(ch, emoji, '→', name + '.svg', svg.length + 'B');
            saved = true;
            break;
          }
        } catch (e) {}
        await new Promise(r => setTimeout(r, 700));
      }
      if (saved) break;
    }
    if (!saved) stillFail.push(ch);
  }
  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.svg'));
  console.log('总计:', files.length, '/ 120', '仍失败:', stillFail.join(' ') || '无');
})();
