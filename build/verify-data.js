const fs = require('fs');
global.window = {};
eval(fs.readFileSync('js/strokes.js', 'utf8'));
const LOCAL = window.HANZI_STROKES;
const ALL = Object.keys(LOCAL);

(async () => {
  let same = 0, diff = [], fail = [];
  for (let i = 0; i < ALL.length; i += 15) {
    const batch = ALL.slice(i, i + 15);
    await Promise.all(batch.map(async c => {
      const url = 'https://cdn.jsdelivr.net/gh/chanind/hanzi-writer-data@master/' + encodeURIComponent(c) + '.json';
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) { fail.push(c + '(HTTP' + res.status + ')'); return; }
        const remote = await res.json();
        const l = LOCAL[c];
        if (JSON.stringify(remote.strokes) === JSON.stringify(l.strokes) &&
            JSON.stringify(remote.medians) === JSON.stringify(l.medians)) {
          same++;
        } else {
          diff.push(c);
        }
      } catch (e) { fail.push(c + '(' + e.message.slice(0, 30) + ')'); }
    }));
    console.log('进度:', Math.min(i + 15, ALL.length) + '/' + ALL.length);
  }
  console.log('完全一致:', same, '/', ALL.length);
  console.log('内容不同:', diff.length ? diff.join('') : '无');
  console.log('下载失败:', fail.length ? fail.join(' ') : '无');
})();
