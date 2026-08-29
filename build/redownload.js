const fs = require('fs');
const list = JSON.parse(fs.readFileSync('build/chars.json', 'utf8')).all;
(async () => {
  const results = {};
  let failed = [];
  for (let i = 0; i < list.length; i += 20) {
    const batch = list.slice(i, i + 20);
    await Promise.all(batch.map(async (ch) => {
      const url = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/' + encodeURIComponent(ch) + '.json';
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const data = await res.json();
          if (data && Array.isArray(data.strokes) && Array.isArray(data.medians)) {
            results[ch] = { strokes: data.strokes, medians: data.medians };
            return;
          }
          throw new Error('bad data');
        } catch (e) { await new Promise(r => setTimeout(r, 300)); }
      }
      failed.push(ch);
    }));
    console.log('进度:', Math.min(i + 20, list.length) + '/' + list.length);
  }
  fs.writeFileSync('js/strokes.js', 'window.HANZI_STROKES = ' + JSON.stringify(results) + ';\n');
  console.log('完成:', Object.keys(results).length, '失败:', failed.length, failed.join(''));
})();
