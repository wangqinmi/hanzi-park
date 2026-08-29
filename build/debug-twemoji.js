const fs = require('fs');
global.window = {};
eval(fs.readFileSync('js/data.js', 'utf8'));
const CD = window.CHAR_DATA;
const FE0F = 0xFE0F;
(async () => {
  for (const ch of ['水', '下', '中']) {
    const emoji = CD[ch].e;
    const cps = Array.from(emoji).map(c => c.codePointAt(0));
    const withFe = cps.map(cp => cp.toString(16)).join('-');
    const noFe = cps.filter(cp => cp !== FE0F).map(cp => cp.toString(16)).join('-');
    console.log(ch, JSON.stringify(emoji), '| withFe:', withFe, '| noFe:', noFe);
    for (const name of [...new Set([withFe, noFe])]) {
      const url = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/' + name + '.svg';
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
        const t = await res.text();
        console.log('  ', name, '→', res.status, '长度:', t.length, t.slice(0, 15));
      } catch (e) {
        console.log('  ', name, '→ 异常:', e.message);
      }
    }
  }
})();
