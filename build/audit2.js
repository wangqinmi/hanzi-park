const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9337;
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
    '--user-data-dir=' + process.cwd() + '/build/chrome-profile2', '--window-size=480,900', '--hide-scrollbars', '--force-device-scale-factor=1', 'about:blank',
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
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('hanzi-park-v1', JSON.stringify({learned:['鱼','马','一','日','月','大','小','上','下','人','口','手'],stars:15}))" });
  const loadP = new Promise(res => { loadResolve = res; });
  await cdp.send('Page.navigate', { url: URL });
  await Promise.race([loadP, sleep(8000)]);
  await sleep(600);

  async function ev(expr) {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) errors.push('EVAL: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
    return r.result ? r.result.value : null;
  }
  async function shot() {
    const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    return r.data;
  }
  async function analyze(b64) {
    const js = '(async () => {' +
      'var img = new Image();' +
      'img.src = "data:image/png;base64,' + b64 + '";' +
      'await new Promise(function(r){ img.onload = r; });' +
      'var w = 200, h = Math.round(img.height * 200 / img.width);' +
      'var c = document.createElement("canvas"); c.width = w; c.height = h;' +
      'var x = c.getContext("2d"); x.drawImage(img, 0, 0, w, h);' +
      'var d = x.getImageData(0, 0, w, h).data;' +
      'var px = function(i, j){ var k = (j * w + i) * 4; return [d[k], d[k+1], d[k+2]]; };' +
      'var hex = function(a){ return "#" + a.map(function(v){ return v.toString(16).padStart(2, "0"); }).join(""); };' +
      'var avg = function(i0, j0, i1, j1){ var r=0,g=0,b=0,n=0;' +
      '  for (var j=j0;j<j1;j+=3) for (var i=i0;i<i1;i+=3){ var p=px(i,j); r+=p[0]; g+=p[1]; b+=p[2]; n++; }' +
      '  return hex([r/n,g/n,b/n].map(Math.round)); };' +
      'var white=0,total=0,colorful=0;' +
      'for (var j=0;j<h;j+=4) for (var i=0;i<w;i+=4){ var p=px(i,j); total++;' +
      '  if (p[0]>235 && p[1]>235 && p[2]>235) white++;' +
      '  if (Math.max(p[0],p[1],p[2]) - Math.min(p[0],p[1],p[2]) > 40) colorful++; }' +
      'return JSON.stringify({ size: img.width + "x" + img.height,' +
      '  top: avg(0, 0, w, Math.round(h*0.08)),' +
      '  mid: avg(0, Math.round(h*0.45), w, Math.round(h*0.55)),' +
      '  bottom: avg(0, Math.round(h*0.92), w, h),' +
      '  whitePct: Math.round(white/total*100),' +
      '  colorPct: Math.round(colorful/total*100) });' +
      '})()';
    return await ev(js);
  }

  const layout = await ev('JSON.stringify((function(){' +
    'var vis = function(s){ var el = document.querySelector(s); return !!el && !el.closest(".hidden") && el.getBoundingClientRect().width > 0; };' +
    'var out = [];' +
    'out.push(["noHScroll", document.documentElement.scrollWidth <= window.innerWidth + 2]);' +
    'out.push(["homeVisible", vis("#view-home")]);' +
    'out.push(["menuCards", document.querySelectorAll(".menu-card").length]);' +
    'var ms = document.querySelectorAll(".menu-card"); var overlap = false;' +
    'for (var i=0;i<ms.length;i++) for (var j=i+1;j<ms.length;j++){' +
    '  var a = ms[i].getBoundingClientRect(), b = ms[j].getBoundingClientRect();' +
    '  if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlap = true; }' +
    'out.push(["menuNoOverlap", !overlap]);' +
    'var m1 = ms[0].getBoundingClientRect();' +
    'out.push(["menuCardWH", Math.round(m1.width), Math.round(m1.height)]);' +
    'var svg = document.querySelectorAll("#view-home .m svg");' +
    'out.push(["mascotSvg", svg.length, svg[0] ? Math.round(svg[0].getBoundingClientRect().width) : 0]);' +
    'return out; })())');

  const shots = {};
  shots['01-home'] = await shot();
  await ev("document.querySelector('[data-nav=\\\"school\\\"]').click()"); await sleep(300);
  shots['02-school'] = await shot();
  const school = await ev('JSON.stringify({cards: document.querySelectorAll(".char-card").length, tabs: document.querySelectorAll("#cat-tabs .cat-tab").length})');
  await ev("document.querySelector('.char-card').click()"); await sleep(400);
  shots['03-char-detail'] = await shot();
  const detail = await ev('JSON.stringify({zi: document.querySelector("#cd-zi").textContent, py: document.querySelector("#cd-py").textContent, pic: document.querySelector("#cd-pic").textContent, words: document.querySelectorAll("#cd-words .chip").length, evolve: !!document.querySelector("#cd-evolve .evolve"), sentence: document.querySelector("#cd-sentence").textContent.slice(0, 12)})');
  await ev("document.querySelector('#btn-write').click()"); await sleep(3000);
  shots['04-write-demo'] = await shot();
  const canvasCheck = await ev('(function(){ var c = document.querySelector("#write-canvas"); var x = c.getContext("2d"); var d = x.getImageData(0,0,c.width,c.height).data; var ink=0; for (var i=0;i<d.length;i+=40){ if (d[i]<220 || d[i+1]<220 || d[i+2]<220) ink++; } return JSON.stringify({w: c.width, ink: ink}); })()');
  await ev("document.querySelector('#btn-close-sheet').click()");
  await ev("document.querySelector('[data-nav=\\\"picto\\\"]').click()"); await sleep(400);
  shots['06-picto-look'] = await shot();
  const picto = await ev('JSON.stringify({q: document.querySelector("#pl-pic").textContent, opts: document.querySelectorAll("#pl-opts .opt-btn").length})');
  await ev("document.querySelector('[data-picto-tab=\\\"evolve\\\"]').click()"); await sleep(400);
  shots['07-picto-evolve'] = await shot();
  const evolve = await ev('JSON.stringify({chips: document.querySelectorAll("#evolve-chips .cat-tab").length, svg: !!document.querySelector("#ev-stage2 svg")})');
  await ev("document.querySelector('[data-nav=\\\"games\\\"]').click()"); await sleep(400);
  shots['08-game-pair'] = await shot();
  const pair = await ev('JSON.stringify({cards: document.querySelectorAll("#pair-grid .pair-card").length})');
  await ev("document.querySelector('[data-game=\\\"memory\\\"]').click()"); await sleep(400);
  shots['09-game-memory'] = await shot();
  const mem = await ev('JSON.stringify({cards: document.querySelectorAll("#mem-grid .mem-card").length})');
  await ev("document.querySelector('[data-game=\\\"find\\\"]').click()"); await sleep(400);
  shots['10-game-find'] = await shot();
  const find = await ev('JSON.stringify({zi: document.querySelector("#gf-zi").textContent, opts: document.querySelectorAll("#gf-opts .opt-btn").length})');
  await ev("document.querySelector('[data-nav=\\\"achieve\\\"]').click()"); await sleep(400);
  shots['11-achievements'] = await shot();
  const achieve = await ev('JSON.stringify({badges: document.querySelectorAll(".badge").length, got: document.querySelectorAll(".badge.got").length, cells: document.querySelectorAll(".learned-cell").length})');

  console.log('LAYOUT: ' + layout);
  console.log('SCHOOL: ' + school);
  console.log('DETAIL: ' + detail);
  console.log('CANVAS: ' + canvasCheck);
  console.log('PICTO: ' + picto);
  console.log('EVOLVE: ' + evolve);
  console.log('PAIR: ' + pair);
  console.log('MEM: ' + mem);
  console.log('FIND: ' + find);
  console.log('ACHIEVE: ' + achieve);
  for (const name in shots) {
    const a = await analyze(shots[name]);
    console.log('PX-' + name + ': ' + a);
  }
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO-ERRORS');
  chrome.kill();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
