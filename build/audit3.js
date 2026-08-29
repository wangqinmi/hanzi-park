const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9338;
const URL = pathToFileURL(process.cwd() + '/index.html').href;
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.pending = new Map(); this.observer = null; }
  async open() {
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = () => rej(new Error('ws connect fail')); });
    this.ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
      } else if (this.observer) this.observer(m);
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
}

(async () => {
  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage',
    '--remote-debugging-port=' + PORT, '--remote-allow-origins=*',
    '--user-data-dir=' + process.cwd() + '/build/chrome-profile3', '--window-size=480,900', '--hide-scrollbars', '--force-device-scale-factor=1', 'about:blank',
  ], { stdio: 'ignore' });
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) { ready = true; break; } } catch (e) {}
    await sleep(300);
  }
  if (!ready) { console.log('CHROME-FAIL'); chrome.kill(); process.exit(1); }
  const pg = await (await fetch('http://127.0.0.1:' + PORT + '/json/new?about:blank', { method: 'PUT' })).json();
  const cdp = new CDP(pg.webSocketDebuggerUrl);
  await cdp.open();
  const errors = [];
  let loadResolve = null;
  cdp.observer = m => {
    if (m.method === 'Runtime.exceptionThrown') errors.push('EX: ' + JSON.stringify(m.params.exceptionDetails).slice(0, 300));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('CON: ' + JSON.stringify(m.params.args).slice(0, 250));
    if (m.method === 'Page.loadEventFired' && loadResolve) loadResolve();
  };
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 480, height: 900, deviceScaleFactor: 2, mobile: true });
  const loadP = new Promise(res => { loadResolve = res; });
  await cdp.send('Page.navigate', { url: URL });
  await Promise.race([loadP, sleep(8000)]);
  await sleep(500);

  async function ev(expr) {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) errors.push('EVAL: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
    return r.result ? r.result.value : null;
  }

  const results = [];
  const check = (name, pass, detail) => { results.push((pass ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' | ' + detail : '')); };

  const scribbleJs = '(async () => {' +
    'var ink = document.querySelector(".write-box canvas:last-child");' +
    'var r = ink.getBoundingClientRect();' +
    'function pe(type, x, y) { ink.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 7, pointerType: "touch", isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1 })); }' +
    'pe("pointerdown", r.left + 20, r.top + 20);' +
    'for (var i = 1; i <= 10; i++) { pe("pointermove", r.left + 20 + i * 8, r.top + 20); await new Promise(function(res){ setTimeout(res, 12); }); }' +
    'pe("pointerup", r.left + 100, r.top + 20);' +
    '})()';
  const traceJs = n => '(async () => {' +
    'var ink = document.querySelector(".write-box canvas:last-child");' +
    'var r = ink.getBoundingClientRect();' +
    'var med = window.HANZI_STROKES["月"].medians[' + n + '];' +
    'function pe(type, x, y) { ink.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 8, pointerType: "touch", isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1 })); }' +
    'var pts = med.map(function(p){ return [p[0] * 300 / 1024 + 10, (1024 - p[1]) * 300 / 1024 + 10]; });' +
    'pe("pointerdown", r.left + pts[0][0] * r.width / 320, r.top + pts[0][1] * r.height / 320);' +
    'for (var i = 1; i < pts.length; i++) { pe("pointermove", r.left + pts[i][0] * r.width / 320, r.top + pts[i][1] * r.height / 320); await new Promise(function(res){ setTimeout(res, 14); }); }' +
    'pe("pointerup", r.left + pts[pts.length-1][0] * r.width / 320, r.top + pts[pts.length-1][1] * r.height / 320);' +
    '})()';

  await ev("document.querySelector('[data-nav=\\\"school\\\"]').click()");
  await sleep(300);
  await ev("document.querySelectorAll('#cat-tabs .cat-tab')[1].click()");
  await sleep(300);
  const hasCard = await ev("!!document.querySelector('.char-card[data-ch=\\\"月\\\"]')");
  check('找到 月 字卡', hasCard);
  await ev("document.querySelector('.char-card[data-ch=\\\"月\\\"]').click()");
  await sleep(400);
  const twemoji = await ev("JSON.stringify({src: document.querySelector('#cd-pic2-img').getAttribute('src'), loaded: document.querySelector('#cd-pic2-img').naturalWidth > 0, emoji: document.querySelector('#cd-pic .pic-inner').textContent})");
  const tw = JSON.parse(twemoji || '{}');
  check('第二张图已加载（Twemoji矢量图）', tw.loaded === true && (tw.src || '').indexOf('twemoji') >= 0, JSON.stringify(tw));
  const strokesOf = await ev("window.HANZI_STROKES['月'].strokes.length");
  check('月 有4笔', strokesOf === 4, '实际' + strokesOf);
  const medRange = await ev("(function(){var m=window.HANZI_STROKES['月'].medians[0];var mx=0;for(var i=0;i<m.length;i++){mx=Math.max(mx,m[i][0],m[i][1]);}return mx;})()");
  check('中线坐标在0-1024内', medRange > 0 && medRange <= 1024, 'max=' + medRange);

  await ev("document.querySelector('#btn-write').click()");
  await sleep(350);
  const shot1 = await ev("document.querySelector('#write-canvas').toDataURL()");
  await sleep(1200);
  const shot2 = await ev("document.querySelector('#write-canvas').toDataURL()");
  check('看演示：笔画动画在动', shot1 !== shot2);
  const hintDemo = await ev("document.querySelector('#write-hint').textContent");
  check('演示提示显示笔画进度', hintDemo.indexOf('笔') >= 0, hintDemo.slice(0, 30));
  const pxBase = await ev("(function(){var c=document.querySelector('#write-canvas');var d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;var n=0;for(var i=3;i<d.length;i+=28)if(d[i]>0)n++;return n;})()");
  check('看演示：画布已绘制笔画', pxBase > 50, '透明采样=' + pxBase);
  await sleep(3800);
  const hintDone = await ev("document.querySelector('#write-hint').textContent");
  check('演示结束提示', hintDone.indexOf('描一描') >= 0 || hintDone.indexOf('写完') >= 0, hintDone.slice(0, 30));

  await ev("document.querySelector('[data-wtab=\\\"trace\\\"]').click()");
  await sleep(300);
  const hintT1 = await ev("document.querySelector('#write-hint').textContent");
  check('描一描启动提示第1笔', hintT1.indexOf('第 1 /') >= 0, hintT1.slice(0, 30));
  await ev(scribbleJs);
  await sleep(200);
  const hintWrong = await ev("document.querySelector('#write-hint').textContent");
  check('乱画被判错并鼓励', hintWrong.indexOf('差一点点') >= 0 || hintWrong.indexOf('再试') >= 0, hintWrong.slice(0, 30));
  await sleep(700);

  const halfJs = '(async () => {' +
    'var ink = document.querySelector(".write-box canvas:last-child");' +
    'var r = ink.getBoundingClientRect();' +
    'var med = window.HANZI_STROKES["月"].medians[0];' +
    'function pe(type, x, y) { ink.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 9, pointerType: "touch", isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1 })); }' +
    'var pts = med.map(function(p){ return [p[0] * 300 / 1024 + 10, (1024 - p[1]) * 300 / 1024 + 10]; });' +
    'var mid = Math.floor(pts.length / 2);' +
    'pe("pointerdown", r.left + pts[0][0] * r.width / 320, r.top + pts[0][1] * r.height / 320);' +
    'for (var i = 1; i < mid; i++) { pe("pointermove", r.left + pts[i][0] * r.width / 320, r.top + pts[i][1] * r.height / 320); await new Promise(function(res){ setTimeout(res, 14); }); }' +
    'pe("pointerup", r.left + pts[mid-1][0] * r.width / 320, r.top + pts[mid-1][1] * r.height / 320);' +
    '})()';
  await ev(halfJs);
  await sleep(250);
  const hintHalf = await ev("document.querySelector('#write-hint').textContent");
  check('描半笔判错（覆盖率不足）', hintHalf.indexOf('差一点点') >= 0 || hintHalf.indexOf('是这样写') >= 0, hintHalf.slice(0, 30));
  await sleep(1800);

  await ev(traceJs(0));
  await sleep(600);
  const hintT2 = await ev("document.querySelector('#write-hint').textContent");
  check('第1笔描对 → 进入第2笔', hintT2.indexOf('第 2 /') >= 0, hintT2.slice(0, 30));

  await ev("document.querySelector('#btn-replay').click()");
  await sleep(250);
  const hintTip = await ev("document.querySelector('#write-hint').textContent");
  check('提示这一笔按钮生效', hintTip.indexOf('是这样写') >= 0, hintTip.slice(0, 30));
  await sleep(1300);

  await ev("document.querySelector('#btn-quiz').click()");
  await sleep(250);
  const hintSkip = await ev("document.querySelector('#write-hint').textContent");
  check('跳过这一笔按钮生效', hintSkip.indexOf('第 3 /') >= 0, hintSkip.slice(0, 30));

  await ev(traceJs(2));
  await sleep(600);
  const hintT4 = await ev("document.querySelector('#write-hint').textContent");
  check('第3笔描对 → 进入第4笔', hintT4.indexOf('第 4 /') >= 0, hintT4.slice(0, 30));
  await ev(traceJs(3));
  await sleep(900);
  const hintAll = await ev("document.querySelector('#write-hint').textContent");
  check('第4笔描对 → 全部写完', hintAll.indexOf('写完') >= 0, hintAll.slice(0, 30));
  const learned = await ev("JSON.parse(localStorage.getItem('hanzi-park-v1')).learned");
  check('描完后 月 已计入学会', Array.isArray(learned) && learned.indexOf('月') >= 0);
  const lbText = await ev("document.querySelector('#btn-learned').textContent");
  check('学会按钮已点亮', lbText.indexOf('已学会') >= 0, lbText);

  await ev("document.querySelector('[data-wtab=\\\"free\\\"]').click()");
  await sleep(300);
  await ev(scribbleJs);
  await sleep(300);
  const pxFree = await ev("(function(){var c=document.querySelector('.write-box canvas:last-child');var d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;var n=0;for(var i=3;i<d.length;i+=28)if(d[i]>0)n++;return n;})()");
  check('自由画：手指轨迹已上屏', pxFree > 20, '墨迹采样=' + pxFree);
  await ev("document.querySelector('#btn-replay').click()");
  await sleep(200);
  const pxFree2 = await ev("(function(){var c=document.querySelector('.write-box canvas:last-child');var d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;var n=0;for(var i=3;i<d.length;i+=28)if(d[i]>0)n++;return n;})()");
  check('自由画：清空画纸生效', pxFree2 <= 5, '剩余墨迹=' + pxFree2);

  await ev("document.querySelector('#btn-close-sheet').click()");
  await sleep(300);
  // 8. 方向检查：打开 方（点在字的上方）
  await ev("document.querySelectorAll('#cat-tabs .cat-tab')[7].click()");
  await sleep(300);
  await ev("document.querySelector('.char-card[data-ch=\\\"方\\\"]').click()");
  await sleep(300);
  await ev("document.querySelector('#btn-write').click()");
  await sleep(900);
  const orient = await ev("(function(){var c=document.querySelector('#write-canvas');var x=c.getContext('2d');var d=x.getImageData(0,0,c.width,c.height).data;var W=c.width,H=c.height;for(var y=0;y<H;y++){for(var xx=0;xx<W;xx+=2){var k=(y*W+xx)*4;if(d[k+3]>0&&!(d[k]>245&&d[k+1]>245&&d[k+2]>245)){return JSON.stringify({topInkY:y,H:H,ratio:+(y/H).toFixed(3)});}}}return 'none';})()");
  const orientObj = JSON.parse(orient || '{}');
  check('字方向正确（点的墨迹在上方）', orientObj.ratio < 0.4, 'topInk 比例=' + orientObj.ratio);
  await ev("document.querySelector('#btn-close-sheet').click()");
  await sleep(300);
  await ev("document.querySelectorAll('#cat-tabs .cat-tab')[0].click()");
  await sleep(300);
  await ev("document.querySelector('.char-card[data-ch=\\\"一\\\"]').click()");
  await sleep(300);
  await ev("document.querySelector('#btn-write').click()");
  await sleep(300);
  const hintYi = await ev("document.querySelector('#write-hint').textContent");
  check('换字后提示为 第 1 / 1 笔', hintYi.indexOf('第 1 / 1') >= 0, hintYi.slice(0, 30));

  console.log(results.join('\n'));
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO-ERRORS');
  chrome.kill();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
