const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9340;
const URL = pathToFileURL(process.cwd() + '/index.html').href;
const sleep = ms => new Promise(r => setTimeout(r, ms));
class CDP {
  constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.pending = new Map(); this.observer = null; }
  async open() {
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = () => rej(new Error('ws fail')); });
    this.ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
      else if (this.observer) this.observer(m);
    };
  }
  send(method, params = {}) { const id = ++this.id; return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
}
(async () => {
  const chrome = spawn(CHROME, ['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--remote-debugging-port='+PORT,'--remote-allow-origins=*','--user-data-dir='+process.cwd()+'/build/chrome-profile5','--window-size=480,900','about:blank'], { stdio: 'ignore' });
  let ready = false;
  for (let i = 0; i < 40; i++) { try { const r = await fetch('http://127.0.0.1:'+PORT+'/json/version'); if (r.ok) { ready = true; break; } } catch (e) {} await sleep(300); }
  const pg = await (await fetch('http://127.0.0.1:'+PORT+'/json/new?about:blank', { method: 'PUT' })).json();
  const cdp = new CDP(pg.webSocketDebuggerUrl);
  await cdp.open();
  const errors = [];
  cdp.observer = m => { if (m.method === 'Runtime.exceptionThrown') errors.push('EX: ' + JSON.stringify(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text).slice(0, 200)); };
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 480, height: 900, deviceScaleFactor: 2, mobile: true });
  let loadResolve; const loadP = new Promise(res => { loadResolve = res; });
  cdp.observer = m => { if (m.method === 'Runtime.exceptionThrown') errors.push('EX: ' + (m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text).slice(0, 200)); if (m.method === 'Page.loadEventFired' && loadResolve) loadResolve(); };
  await cdp.send('Page.navigate', { url: URL });
  await Promise.race([loadP, sleep(8000)]);
  await sleep(400);
  async function ev(expr) { const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result ? r.result.value : JSON.stringify(r.exceptionDetails || ''); }
  // 打开 鱼
  await ev("document.querySelector('[data-nav=\\\"school\\\"]').click()"); await sleep(300);
  await ev("document.querySelectorAll('#cat-tabs .cat-tab')[2].click()"); await sleep(300);
  console.log('鱼卡存在:', await ev("!!document.querySelector('.char-card[data-ch=\\\"鱼\\\"]')"));
  await ev("document.querySelector('.char-card[data-ch=\\\"鱼\\\"]').click()"); await sleep(400);
  console.log('字卡打开:', await ev("document.querySelector('#cd-zi').textContent"), '拼音:', await ev("document.querySelector('#cd-py').textContent"));
  console.log('cd-py 存在:', await ev("!!document.querySelector('#cd-py')"));
  console.log('cd-py onclick:', await ev("typeof document.querySelector('#cd-py').onclick"));
  const r = await ev("document.querySelector('#cd-py').click()");
  await sleep(500);
  console.log('拼音弹层:', await ev("document.querySelector('#py-zi').textContent"), '| 隐藏:', await ev("document.querySelector('#pinyin-overlay').classList.contains('hidden')"));
  console.log('错误:', errors.join(' | ') || '无');
  chrome.kill(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
