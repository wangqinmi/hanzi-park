const { spawn } = require('child_process');
const fs = require('fs');
const { pathToFileURL } = require('url');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const URL = pathToFileURL(process.cwd() + '/index.html').href;
const OUT = 'build/shots';
fs.mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.pending = new Map(); }
  async open() {
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = () => rej(new Error('ws connect fail')); });
    this.ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
      } else if (this.observer) {
        this.observer(m);
      }
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
    '--remote-debugging-port=' + PORT, '--remote-allow-origins=*', '--user-data-dir=' + process.cwd() + '/build/chrome-profile',
    '--window-size=480,900', '--hide-scrollbars', '--force-device-scale-factor=1', 'about:blank',
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) { version = await r.json(); break; } } catch (e) {}
    await sleep(300);
  }
  if (!version) { console.error('Chrome 未启动'); chrome.kill(); process.exit(1); }

  const pg = await (await fetch('http://127.0.0.1:' + PORT + '/json/new?about:blank', { method: 'PUT' })).json();
  const cdp = new CDP(pg.webSocketDebuggerUrl);
  await cdp.open();

  const errors = [];
  cdp.observer = m => {
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION: ' + JSON.stringify(m.params.exceptionDetails).slice(0, 400));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('CONSOLE: ' + JSON.stringify(m.params.args).slice(0, 300));
    if (m.method === 'Page.loadEventFired' && loadResolve) loadResolve();
  };
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Log.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 480, height: 900, deviceScaleFactor: 2, mobile: true });

  async function shot(name) {
    await sleep(450);
    const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(OUT + '/' + name + '.png', Buffer.from(r.data, 'base64'));
    console.log('SHOT', name);
  }
  async function ev(expr) {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) errors.push('EVAL: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
    return r.result ? r.result.value : null;
  }

  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('hanzi-park-v1', JSON.stringify({learned:['鱼','马','一','日','月','大','小','上','下','人','口','手'],stars:15}))" });

  let loadResolve = null;
  const loadP = new Promise(res => { loadResolve = res; });
  await cdp.send('Page.navigate', { url: URL });
  await Promise.race([loadP, sleep(8000)]);

  await shot('01-home');
  await ev("document.querySelector('[data-nav=\\\"school\\\"]').click()");
  await shot('02-school');
  await ev("document.querySelector('.char-card').click()");
  await shot('03-char-detail');
  await ev("document.querySelector('#btn-write').click()");
  await sleep(3200);
  await shot('04-write-demo');
  await ev("document.querySelector('[data-wtab=\\\"trace\\\"]').click()");
  await sleep(1200);
  await shot('05-write-trace');
  await ev("document.querySelector('#btn-close-sheet').click()");
  await ev("document.querySelector('[data-nav=\\\"picto\\\"]').click()");
  await shot('06-picto-look');
  await ev("document.querySelector('[data-picto-tab=\\\"evolve\\\"]').click()");
  await shot('07-picto-evolve');
  await ev("document.querySelector('[data-nav=\\\"games\\\"]').click()");
  await shot('08-game-pair');
  await ev("document.querySelector('[data-game=\\\"memory\\\"]').click()");
  await shot('09-game-memory');
  await ev("document.querySelector('[data-game=\\\"find\\\"]').click()");
  await shot('10-game-find');
  await ev("document.querySelector('[data-nav=\\\"achieve\\\"]').click()");
  await shot('11-achievements');

  const checks = await ev('JSON.stringify({chars: document.querySelectorAll(\'.char-card\').length, hasHanziWriter: typeof HanziWriter !== \'undefined\', strokeData: Object.keys(window.HANZI_STROKES||{}).length, charData: Object.keys(window.CHAR_DATA||{}).length, catTabs: document.querySelectorAll(\'.cat-tab\').length, mascots: document.querySelectorAll(\'#view-home .m\').length})');
  console.log('DOM:', checks);

  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 10).join('\n') : 'NO-ERRORS');
  chrome.kill();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
