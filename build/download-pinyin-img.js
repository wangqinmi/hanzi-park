const fs = require('fs');
global.window = {};
eval(fs.readFileSync('js/pinyin-data.js', 'utf8'));
const D = window.PINYIN_DATA;
const OUT = 'img/pinyin';
fs.mkdirSync(OUT, { recursive: true });
const FE0F = 0xFE0F;

function candidates(emoji) {
  const cps = Array.from(emoji).map(c => c.codePointAt(0));
  const withFe = cps.map(cp => cp.toString(16)).join('-');
  const noFe = cps.filter(cp => cp !== FE0F).map(cp => cp.toString(16)).join('-');
  return [...new Set(withFe === noFe ? [withFe] : [withFe, noFe])];
}

(async () => {
  const fails = [];
  const entries = Object.entries(D);
  for (let i = 0; i < entries.length; i += 8) {
    const batch = entries.slice(i, i + 8);
    await Promise.all(batch.map(async ([key, d]) => {
      let saved = false;
      for (const name of candidates(d.img)) {
        const url = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/' + name + '.svg';
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
            if (!res.ok) break;
            const svg = await res.text();
            if (svg.length > 100 && svg.includes('<svg')) {
              fs.writeFileSync(OUT + '/' + key + '.svg', svg);
              saved = true;
              break;
            }
          } catch (e) {}
          await new Promise(r => setTimeout(r, 500));
        }
        if (saved) break;
      }
      if (!saved) fails.push(key);
    }));
    console.log('进度:', Math.min(i + 8, entries.length) + '/' + entries.length);
  }
  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.svg'));
  console.log('成功:', files.length, '/', entries.length, '失败:', fails.join(' ') || '无');
})();
