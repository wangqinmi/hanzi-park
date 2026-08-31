const fs = require('fs');
const crypto = require('crypto');

global.window = {};
eval(fs.readFileSync('js/data.js', 'utf8'));
eval(fs.readFileSync('js/pinyin-data.js', 'utf8'));
const CD = window.CHAR_DATA;
const PY = window.PINYIN_DATA;

/* ===== 收集全部朗读文本（与 app.js 的 speak 调用保持一致） ===== */
const texts = new Set();
const add = t => { if (t && t.length) texts.add(t); };

const readText = ch => ch + '。' + CD[ch].w[0] + '的' + ch + '。' + ch + '，' + CD[ch].w[0] + '的' + ch;

// 1. 汉字模块
for (const [ch, d] of Object.entries(CD)) {
  add(readText(ch));            // 听一听
  add(d.m);                     // 释义
  add(d.s);                     // 句子
  add(d.t);                     // 口诀
  for (const w of d.w) {        // 组词 + 游戏/声调模式
    add(w);
    add(w + '，' + w + '。');
  }
}
// 象形演变朗读
for (const [ch, d] of Object.entries(CD)) {
  add(ch + '。' + d.w[0] + '的' + ch);
  if (window.PICTO[ch]) add(ch + '的古时候画像');
}

// 2. 拼音模块
const pySpeakText = k => {
  const d = PY[k];
  return d.rw + '，' + d.ph + '。' + d.ex.map(e => e.w).join('。') + '。';
};
// 口诀音频版：把 "b b b" 这类字母重复替换为呼读音例字（纯汉字，发音准确）
function tipAudio(tip) {
  return tip.replace(/([a-zü]+)( \1){2}/g, (m, g) => {
    const rw = PY[g] ? PY[g].rw : g;
    return rw + rw + rw;
  });
}
for (const [k, d] of Object.entries(PY)) {
  add(pySpeakText(k));          // 听一听
  add(tipAudio(d.tip));         // 口诀
  if (d.tones) for (const t of d.tones) add(t.w + '，' + t.w + '。'); // 声调
  for (const e of d.ex) add(e.w + '，' + e.w + '。'); // 例字（库外字朗读）
}
// 轻声
for (const w of ['爸', '妈', '了']) add(w + '。' + w + '。');
// 规则卡例字
for (const r of window.PINYIN_RULES) for (const w of r.ex) add(w + '，' + w + '。');
// 拼读表例字
for (const s of window.PINYIN_SPELL.two) add(s.w + '，' + s.w + '。');
for (const s of window.PINYIN_SPELL.three) add(s.w + '，' + s.w + '。');

const list = [...texts];
const md5 = t => crypto.createHash('md5').update(t, 'utf8').digest('hex').slice(0, 10);
const manifest = {};
for (const t of list) manifest[t] = 'a' + md5(t) + '.mp3';
console.log('朗读文本总数（去重）:', list.length);

const OUT = 'audio';
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync('js/audio-manifest.js', 'window.AUDIO_MANIFEST = ' + JSON.stringify(manifest) + ';\n');
console.log('清单已写入 js/audio-manifest.js');

/* ===== Edge 神经网络语音批量合成 ===== */
const WebSocket = require('/tmp/ett/node_modules/ws');
function dateStr() {
  return new Date().toUTCString().replace('GMT', 'GMT+0000 (Coordinated Universal Time)');
}
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  });
}
function secMsGec() {
  const WIN_EPOCH = 11644473600;
  let ticks = Date.now() / 1000 + WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= 1e7;
  const str = Math.round(ticks) + '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
  return crypto.createHash('sha256').update(str, 'ascii').digest('hex').toUpperCase();
}
function synth(text) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1' +
      '?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4' +
      '&ConnectionId=' + uuid() + '&Sec-MS-GEC=' + secMsGec() + '&Sec-MS-GEC-Version=1-143.0.3650.75', {
      headers: {
        'Pragma': 'no-cache', 'Cache-Control': 'no-cache',
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const chunks = [];
    ws.on('open', () => {
      ws.send('X-Timestamp:' + dateStr() + '\r\n' +
        'Content-Type:application/json; charset=utf-8\r\n' +
        'Path:speech.config\r\n\r\n' +
        '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}');
      const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>" +
        "<voice name='zh-CN-XiaoxiaoNeural'><prosody pitch='+0Hz' rate='-22%' volume='+0%'>" + esc + "</prosody></voice></speak>";
      ws.send('X-RequestId:' + uuid() + '\r\n' +
        'Content-Type:application/ssml+xml\r\n' +
        'X-Timestamp:' + dateStr() + 'Z\r\n' +
        'Path:ssml\r\n\r\n' + ssml);
    });
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const hl = data.readUInt16BE(0);
        chunks.push(data.slice(2 + hl));
      }
      if (!isBinary && String(data).includes('Path:turn.end')) {
        ws.close();
        resolve(Buffer.concat(chunks));
      }
    });
    ws.on('error', e => reject(e));
    setTimeout(() => { ws.terminate(); reject(new Error('超时')); }, 20000);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const todo = list.filter(t => !fs.existsSync(OUT + '/' + manifest[t]));
  console.log('待合成:', todo.length, '/', list.length);
  let done = 0, fail = 0;
  const failed = [];
  const worker = async () => {
    while (todo.length) {
      const t = todo.shift();
      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        try {
          const audio = await synth(t);
          if (audio && audio.length > 400) {
            fs.writeFileSync(OUT + '/' + manifest[t], audio);
            ok = true;
          }
        } catch (e) {}
        if (!ok) await sleep(600);
      }
      if (ok) done++; else { fail++; failed.push(t); }
      if ((done + fail) % 50 === 0) console.log('进度:', done + fail, '/', todo.length + done + fail, '成功', done, '失败', fail);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.mp3'));
  console.log('合成完成: 成功', done, '失败', fail, '目录文件数', files.length, '/', list.length);
  if (failed.length) {
    fs.writeFileSync('build/audio-failed.txt', failed.join('\n'));
    console.log('失败清单已写入 build/audio-failed.txt');
  }
  // 校验：所有清单文件存在且非空
  let missing = 0;
  for (const t of list) {
    const f = OUT + '/' + manifest[t];
    if (!fs.existsSync(f) || fs.statSync(f).size < 400) missing++;
  }
  console.log(missing ? '❌ 缺失 ' + missing + ' 个' : '✅ 全部语音文件就绪，可直接打包');
})();
