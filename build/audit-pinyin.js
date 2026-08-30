const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9339;
const URL = pathToFileURL(process.cwd() + '/index.html').href;
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.pending = new Map(); this.observer = null; }
  async open() {
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = () => rej(new Error('ws fail')); });
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
    '--user-data-dir=' + process.cwd() + '/build/chrome-profile4', '--window-size=480,900', '--hide-scrollbars', '--force-device-scale-factor=1', 'about:blank',
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

  // 1. 首页菜单包含拼音乐园
  const menuCount = await ev("document.querySelectorAll('.menu-card').length");
  check('首页5个菜单入口', menuCount === 5, '实际' + menuCount);

  // 2. 进入拼音乐园
  await ev("document.querySelector('[data-nav=\\\"pinyin\\\"]').click()");
  await sleep(300);
  const tabs = await ev("JSON.stringify(Array.from(document.querySelectorAll('#py-tabs .cat-tab')).map(b => b.textContent.trim()))");
  check('三个页签', tabs && tabs.includes('声母') && tabs.includes('韵母') && tabs.includes('整体认读'), tabs);
  const c1 = await ev("document.querySelectorAll('#py-grid .py-card').length");
  check('声母23张卡片', c1 === 23, '实际' + c1);

  // 3. 韵母页签
  await ev("document.querySelectorAll('#py-tabs .cat-tab')[1].click()");
  await sleep(300);
  const c2 = await ev("document.querySelectorAll('#py-grid .py-card').length");
  const g2 = await ev("document.querySelectorAll('#py-grid .py-group-head').length");
  check('韵母24张卡片+4个分组', c2 === 24 && g2 === 4, '卡片' + c2 + ' 分组' + g2);

  // 4. 整体认读页签
  await ev("document.querySelectorAll('#py-tabs .cat-tab')[2].click()");
  await sleep(300);
  const c3 = await ev("document.querySelectorAll('#py-grid .py-card').length");
  check('整体认读16张卡片', c3 === 16, '实际' + c3);

  // 5. 声母 b 详情
  await ev("document.querySelectorAll('#py-tabs .cat-tab')[0].click()");
  await sleep(300);
  await ev("document.querySelector('.py-card[data-py=\\\"b\\\"]').click()");
  await sleep(400);
  const db = await ev("JSON.stringify({zi: document.querySelector('#py-zi').textContent, read: document.querySelector('#py-read').textContent, cat: document.querySelector('#py-cat').textContent, img: document.querySelector('#py-img').naturalWidth > 0, tones: document.querySelectorAll('#py-tones .tone-chip').length})");
  const dbObj = JSON.parse(db || '{}');
  check('声母b详情正确', dbObj.zi === 'b' && dbObj.read === 'bō' && dbObj.cat.includes('声母') && dbObj.img === true && dbObj.tones === 0, db);
  await ev("document.querySelector('#btn-close-pinyin').click()");
  await sleep(200);

  // 6. 韵母 a 详情：4个声调
  await ev("document.querySelectorAll('#py-tabs .cat-tab')[1].click()");
  await sleep(300);
  await ev("document.querySelector('.py-card[data-py=\\\"a\\\"]').click()");
  await sleep(400);
  const da = await ev("JSON.stringify({read: document.querySelector('#py-read').textContent, tones: Array.from(document.querySelectorAll('#py-tones .tone-chip')).map(b => b.textContent.trim()), ex: document.querySelectorAll('#py-ex .chip').length})");
  const daObj = JSON.parse(da || '{}');
  check('韵母a详情4个声调', daObj.read === 'ā' && Array.isArray(daObj.tones) && daObj.tones.length === 4 && daObj.ex >= 1, da);
  // 点声调chip不报错
  await ev("document.querySelector('#py-tones .tone-chip').click()");
  await sleep(200);
  // 点例字（妈在字库内）→ 打开汉字详情
  await ev("document.querySelector('#py-ex .chip').click()");
  await sleep(500);
  const charOpen = await ev("!document.querySelector('#char-overlay').classList.contains('hidden') && document.querySelector('#cd-zi').textContent");
  check('例字跳转汉字卡', charOpen === '妈' || charOpen === '马', '打开的字:' + charOpen);
  await ev("document.querySelector('#btn-close-sheet').click()");
  await sleep(200);

  // 7. 声调学习页
  await ev("document.querySelector('#btn-close-pinyin').click()");
  await sleep(200);
  await ev("document.querySelectorAll('#py-tabs .cat-tab')[3].click()");
  await sleep(400);
  const toneCards = await ev("document.querySelectorAll('#tone-cards .tone-card').length");
  const toneLight = await ev("document.querySelectorAll('#tone-light .chip').length");
  check('声调页4张声调卡+3个轻声例', toneCards === 4 && toneLight === 3, '声调卡' + toneCards + ' 轻声' + toneLight);
  // 听音辨调：点听声音不报错 + 盲选答案能出结果
  await ev("document.querySelector('#btn-tone-play').click()");
  await sleep(300);
  await ev("document.querySelectorAll('#tone-opts .opt-btn')[0].click()");
  await sleep(1200);
  const toneQ = await ev("document.querySelector('#tone-q').textContent");
  check('听音辨调流程可运行', toneQ.includes('第') || toneQ.includes('答案'), toneQ.slice(0, 24));

  // 8. 拼读练习页：两拼
  await ev("document.querySelectorAll('#py-tabs .cat-tab')[4].click()");
  await sleep(400);
  const spellChips = await ev("document.querySelectorAll('#spell-i .spell-chip').length + '|' + document.querySelectorAll('#spell-f .spell-chip').length");
  check('拼读页声母+韵母芯片齐全', spellChips === '23|24', '声母|韵母=' + spellChips);
  await ev("document.querySelector('.spell-chip[data-row=\"i\"][data-k=\"b\"]').click()");
  await sleep(200);
  await ev("document.querySelector('.spell-chip[data-row=\"f\"][data-k=\"a\"]').click()");
  await sleep(300);
  const spellRes = await ev("document.querySelector('#spell-result').textContent");
  check('两拼 b+a 拼出 八', spellRes.includes('八') && spellRes.includes('ba'), spellRes.slice(0, 30));
  // 无效组合提示
  await ev("document.querySelector('.spell-chip[data-row=\"i\"][data-k=\"b\"]').click()");
  await sleep(200);
  await ev("document.querySelector('.spell-chip[data-row=\"f\"][data-k=\"ü\"]').click()");
  await sleep(300);
  const spellBad = await ev("document.querySelector('#spell-result').textContent");
  check('无效组合有提示', spellBad.includes('没有常用字') || spellBad.includes('试试'), spellBad.slice(0, 30));
  // 三拼
  await ev("document.querySelector('[data-spell=\"three\"]').click()");
  await sleep(300);
  await ev("document.querySelector('.spell-chip[data-row=\"i\"][data-k=\"g\"]').click()");
  await sleep(150);
  await ev("document.querySelector('.spell-chip[data-row=\"m\"][data-k=\"u\"]').click()");
  await sleep(150);
  await ev("document.querySelector('.spell-chip[data-row=\"f\"][data-k=\"a\"]').click()");
  await sleep(300);
  const spell3 = await ev("document.querySelector('#spell-result').textContent");
  check('三拼 g+u+a 拼出 瓜', spell3.includes('瓜') && spell3.includes('gua'), spell3.slice(0, 30));
  const rules = await ev("document.querySelectorAll('#spell-rules .info-card').length");
  check('拼读规则3张卡', rules === 3, '规则卡' + rules);

  // 9. 汉字详情拼音反向跳转（鱼 yú → yu）
  await ev("document.querySelector('[data-nav=\"school\"]').click()");
  await sleep(300);
  await ev("document.querySelectorAll('#cat-tabs .cat-tab')[2].click()");
  await sleep(300);
  await ev("document.querySelector('.char-card[data-ch=\\\"鱼\\\"]').click()");
  await sleep(400);
  await ev("document.querySelector('#cd-py').click()");
  await sleep(400);
  const pyJump = await ev("!document.querySelector('#pinyin-overlay').classList.contains('hidden') ? document.querySelector('#py-zi').textContent : null");
  check('汉字拼音跳转到拼音页', pyJump === 'yu', '拼音:' + pyJump);
  await ev("document.querySelector('#btn-close-pinyin').click()");
  await sleep(200);
  await ev("document.querySelector('#btn-close-sheet').click()");

  console.log(results.join('\n'));
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO-ERRORS');
  chrome.kill();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
