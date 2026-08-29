const fs = require('fs');
global.window = {};
eval(fs.readFileSync('js/data.js', 'utf8'));
const CD = window.CHAR_DATA;
const OUT = 'img/twemoji';
fs.mkdirSync(OUT, { recursive: true });

const FE0F = 0xFE0F;
function candidates(emoji) {
  const cps = Array.from(emoji).map(c => c.codePointAt(0));
  const withFe = cps.map(cp => cp.toString(16)).join('-');
  const noFe = cps.filter(cp => cp !== FE0F).map(cp => cp.toString(16)).join('-');
  const list = withFe === noFe ? [withFe] : [withFe, noFe];
  return [...new Set(list)];
}

(async () => {
  const fails = [];
  const entries = Object.entries(CD);
  for (let i = 0; i < entries.length; i += 10) {
    const batch = entries.slice(i, i + 10);
    await Promise.all(batch.map(async ([ch, d]) => {
      const emoji = d.e;
      let saved = false;
      for (const name of candidates(emoji)) {
        const url = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/' + name + '.svg';
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
          if (!res.ok) continue;
          const svg = await res.text();
          if (svg.length > 300 && svg.includes('<svg')) {
            fs.writeFileSync(OUT + '/' + ch + '.svg', svg);
            saved = true;
            break;
          }
        } catch (e) {}
      }
      if (!saved) fails.push(ch + '(' + emoji + ')');
    }));
    console.log('进度:', Math.min(i + 10, entries.length) + '/' + entries.length);
  }
  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.svg'));
  console.log('成功下载:', files.length, '/', entries.length);
  console.log('失败:', fails.length ? fails.join(' ') : '无');
})();
