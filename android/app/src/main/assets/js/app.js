/* ===== 汉字乐园 · 主程序 ===== */
(function () {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const ALL = window.ALL_CHARS;
  const CD = window.CHAR_DATA;
  const PICTO = window.PICTO;
  const CATS = window.CATEGORIES;

  /* ---------- 存档 ---------- */
  const store = (() => {
    let mem = { learned: [], stars: 0 };
    let ok = false;
    try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); ok = true; } catch (e) {}
    const load = () => {
      if (!ok) return mem;
      try { const d = JSON.parse(localStorage.getItem('hanzi-park-v1') || 'null'); if (d) mem = Object.assign(mem, d); } catch (e) {}
      return mem;
    };
    const save = () => { if (ok) { try { localStorage.setItem('hanzi-park-v1', JSON.stringify(mem)); } catch (e) {} } };
    return { load, save, get: () => mem };
  })();
  store.load();
  const S = store.get();
  if (!Array.isArray(S.learned)) S.learned = [];
  const isLearned = ch => S.learned.includes(ch);

  /* ---------- 音效（WebAudio） ---------- */
  let AC = null;
  function ac() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (AC && AC.state === 'suspended') AC.resume();
    return AC;
  }
  function tone(freq, dur, type, vol, delay) {
    const ctx = ac(); if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.18, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  const sndPop = () => tone(660, .12, 'triangle', .15);
  const sndCorrect = () => { tone(523, .15, 'sine', .2); tone(659, .15, 'sine', .2, .12); tone(784, .3, 'sine', .22, .24); };
  const sndWrong = () => { tone(220, .25, 'sawtooth', .08); tone(180, .3, 'sawtooth', .08, .15); };
  const sndFanfare = () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, .22, 'triangle', .22, i * .13)); tone(1319, .5, 'triangle', .2, .55); };

  /* ---------- 五彩纸屑 ---------- */
  const confettiCanvas = $('#confetti-canvas');
  const ctx2d = confettiCanvas.getContext('2d');
  let confettiParts = [], confettiRunning = false;
  function resizeConfetti() { confettiCanvas.width = innerWidth; confettiCanvas.height = innerHeight; }
  addEventListener('resize', resizeConfetti); resizeConfetti();
  function confetti() {
    const colors = ['#FF6B6B', '#FFD93D', '#2ECC71', '#54A0FF', '#F368E0', '#FF9F43', '#A29BFE'];
    for (let i = 0; i < 90; i++) {
      confettiParts.push({
        x: Math.random() * confettiCanvas.width,
        y: -20 - Math.random() * confettiCanvas.height * .3,
        w: 6 + Math.random() * 7, h: 8 + Math.random() * 8,
        c: colors[i % colors.length],
        vy: 2.4 + Math.random() * 3, vx: -1.6 + Math.random() * 3.2,
        rot: Math.random() * Math.PI, vr: -.2 + Math.random() * .4,
      });
    }
    if (!confettiRunning) { confettiRunning = true; requestAnimationFrame(confettiTick); }
  }
  function confettiTick() {
    ctx2d.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    confettiParts = confettiParts.filter(p => p.y < confettiCanvas.height + 30);
    for (const p of confettiParts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.02; p.rot += p.vr;
      ctx2d.save(); ctx2d.translate(p.x, p.y); ctx2d.rotate(p.rot);
      ctx2d.fillStyle = p.c; ctx2d.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx2d.restore();
    }
    if (confettiParts.length) requestAnimationFrame(confettiTick);
    else { confettiRunning = false; ctx2d.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height); }
  }

  /* ---------- 语音朗读 ---------- */
  let voices = [];
  function loadVoices() {
    try {
      if (window.AndroidTTS) { voices = [{ lang: 'zh-CN', name: 'AndroidTTS' }]; return; }
      voices = speechSynthesis.getVoices();
    } catch (e) {}
  }
  loadVoices();
  try { speechSynthesis.onvoiceschanged = loadVoices; } catch (e) {}
  // 优先挑选自然音色的中文语音（如 Windows 上 Edge 的 Xiaoxiao Natural 等在线自然语音）
  function pickBestVoice() {
    const zh = voices.filter(v => /^zh/i.test(v.lang || ''));
    if (!zh.length) return null;
    const score = v => {
      const n = (v.name || '').toLowerCase();
      let s = 0;
      if (/natural|neural|online|premium|enhanced/.test(n)) s += 100;
      if (/xiaoxiao|xiaoyi|yunxi|yunyang|xiaohan|xiaomo|xiaorui|xiaoshuang/.test(n)) s += 80;
      if (/google/.test(n)) s += 40;
      if (/zh[-_]cn|mandarin|cmn/.test(n)) s += 20;
      if (/huihui|kangkang|yaoyao|ting-ting/.test(n)) s -= 30;
      return s;
    };
    return zh.slice().sort((a, b) => score(b) - score(a))[0];
  }
  function ttsStop() {
    try {
      if (window.AndroidTTS) { AndroidTTS.stop(); return; }
      speechSynthesis.cancel();
    } catch (e) {}
  }
  let ttsWarned = false;
  function speak(text, rate) {
    try {
      if (window.AndroidTTS) {
        AndroidTTS.speak(text, rate || 0.72, 1.15);
        if (!ttsWarned) {
          ttsWarned = true;
          setTimeout(() => {
            try {
              if (!AndroidTTS.ready()) {
                Mascot.show('cat', '没有检测到语音引擎，联网后就能听到自然的语音啦', 3400);
              }
            } catch (e) {}
          }, 1800);
        }
        return true;
      }
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      const v = pickBestVoice();
      if (v) u.voice = v;
      // 系统语音用接近自然的语速音调，降低机械感
      u.rate = Math.min(1.05, Math.max(0.85, rate || 0.9));
      u.pitch = 1.0;
      u.volume = 1;
      speechSynthesis.speak(u);
      return true;
    } catch (e) { return false; }
  }
  const readText = ch => ch + '。' + CD[ch].w[0] + '的' + ch + '。' + ch + '，' + CD[ch].w[0] + '的' + ch;
  const readChar = ch => speak(readText(ch));
  // APK：预合成语音进缓存，点按秒读
  function warmTts() {
    if (!window.AndroidTTS || !AndroidTTS.warm) return;
    for (let i = 0; i < arguments.length; i++) {
      try { AndroidTTS.warm(String(arguments[i]), 0.72); } catch (e) {}
    }
  }

  /* ---------- 吉祥物 ---------- */
  const PRAISE = ['太棒了！', '你真厉害！', '答对啦！', '好聪明呀！', '真了不起！', '给你点赞！', '你真棒，继续加油！'];
  const CHEER = ['再试一次吧！', '别灰心，再想想～', '没关系，你可以的！', '仔细看一看哦～'];
  const MASCOT_KEYS = ['cat', 'bear', 'rabbit', 'duck'];
  const rand = a => a[Math.floor(Math.random() * a.length)];
  const mascotPraise = () => Mascot.show(rand(MASCOT_KEYS), rand(PRAISE), 2200);
  const mascotCheer = () => Mascot.show(rand(MASCOT_KEYS), rand(CHEER), 2000);
  const mascotSay = (key, text, ms) => Mascot.show(key, text, ms);

  /* ---------- 视图导航 ---------- */
  const VIEWS = ['home', 'school', 'picto', 'games', 'achieve'];
  function nav(name) {
    for (const v of VIEWS) {
      const el = $('#view-' + v);
      el.classList.toggle('hidden', v !== name);
    }
    ttsStop();
    if (name === 'school') renderSchool();
    if (name === 'achieve') renderAchieve();
    if (name === 'picto') { renderPictoTab(); }
    if (name === 'games') { renderGames(); }
    window.scrollTo({ top: 0 });
  }
  document.querySelectorAll('.menu-card').forEach(b => b.addEventListener('click', () => { sndPop(); nav(b.dataset.nav); }));
  $('#btn-home-top').addEventListener('click', () => { sndPop(); nav('home'); });

  /* ---------- 首页 ---------- */
  function renderHome() {
    ['hero-m1', 'hero-m2', 'hero-m3', 'hero-m4'].forEach((id, i) => {
      $('#' + id).innerHTML = window.MASCOTS[MASCOT_KEYS[i]];
    });
    const h = new Date().getHours();
    const greet = h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
    $('#welcome-text').textContent = greet + '！小朋友，快来一起认汉字吧～';
    updateProgress();
    setTimeout(() => mascotSay('duck', '你好呀！我是阿鸭，跟我一起学汉字吧！', 3200), 600);
  }
  function updateProgress() {
    const n = S.learned.length;
    $('#progress-text').textContent = n;
    $('#progress-fill').style.width = (n / ALL.length * 100).toFixed(1) + '%';
    $('#star-count').textContent = S.stars;
  }
  function addStars(n) { S.stars += n; store.save(); updateProgress(); }

  /* ---------- 识字学堂 ---------- */
  let activeCat = 0;
  function renderSchool() {
    const tabs = $('#cat-tabs');
    tabs.innerHTML = CATS.map((c, i) =>
      '<button class="cat-tab' + (i === activeCat ? ' active' : '') + '" data-i="' + i + '" style="' + (i === activeCat ? 'border-color:' + c.color : '') + '">' +
      c.icon + ' ' + c.name + '<span style="opacity:.6">' + c.chars.length + '</span></button>'
    ).join('');
    tabs.querySelectorAll('.cat-tab').forEach(b => b.addEventListener('click', () => {
      sndPop(); activeCat = +b.dataset.i; renderSchool();
    }));
    renderCharGrid();
  }
  function renderCharGrid() {
    const grid = $('#char-grid');
    const chars = CATS[activeCat].chars;
    grid.innerHTML = chars.map(ch => {
      const d = CD[ch];
      return '<button class="char-card' + (isLearned(ch) ? ' learned' : '') + '" data-ch="' + ch + '">' +
        (isLearned(ch) ? '<span class="chk">⭐</span>' : '') +
        '<span class="pic">' + d.e + '</span>' +
        '<div class="zi">' + ch + '</div>' +
        '<div class="py">' + d.p + '</div></button>';
    }).join('');
    grid.querySelectorAll('.char-card').forEach(b => b.addEventListener('click', () => {
      sndPop(); openChar(b.dataset.ch);
    }));
  }

  /* ---------- 汉字详情 ---------- */
  let curChar = null;
  function openChar(ch) {
    curChar = ch;
    const d = CD[ch];
    const cat = CATS.find(c => c.chars.includes(ch));
    $('#cd-pic').textContent = d.e;
    $('#cd-zi').textContent = ch;
    $('#cd-py').textContent = d.p;
    $('#cd-cat').textContent = cat.icon + ' ' + cat.name + ' · 共' + strokesOf(ch) + '画';
    $('#cd-meaning').textContent = d.m;
    $('#cd-words').innerHTML = d.w.map(w => '<button class="chip" data-w="' + w + '">' + w + '</button>').join('');
    $('#cd-sentence').textContent = d.s;
    $('#cd-tip').textContent = '🎵 记忆口诀：' + d.t;
    $('#cd-words').querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => { sndPop(); speak(b.dataset.w, 0.7); }));
    // 学习页句子全部可点读
    $('#cd-meaning').classList.add('tap-speak');
    $('#cd-meaning').title = '点一点听解释';
    $('#cd-meaning').onclick = () => speak(d.m, 0.8);
    $('#cd-sentence').classList.add('tap-speak');
    $('#cd-sentence').title = '点一点听句子';
    $('#cd-sentence').onclick = () => speak(d.s, 0.78);
    $('#cd-tip').classList.add('tap-speak');
    $('#cd-tip').title = '点一点听口诀';
    $('#cd-tip').onclick = () => speak(d.t, 0.8);
    $('#cd-zi').classList.add('tap-speak');
    $('#cd-zi').title = '点一点听读这个字';
    $('#cd-zi').onclick = () => readChar(ch);
    // APK 预合成常用语音，减少点按等待
    warmTts(readText(ch), d.m, d.s);
    // 象形演变
    const ev = $('#cd-evolve');
    if (PICTO[ch]) {
      ev.innerHTML = '<div class="evolve"><h3>✨ 图画变汉字：点一点每一格</h3><div class="evolve-row">' +
        '<div class="evolve-stage" data-ev="1">' + d.e + '</div><div class="evolve-arrow">➜</div>' +
        '<div class="evolve-stage" data-ev="2"><svg viewBox="0 0 120 120">' + PICTO[ch] + '</svg></div><div class="evolve-arrow">➜</div>' +
        '<div class="evolve-stage zi" data-ev="3">' + ch + '</div></div></div>';
      ev.querySelectorAll('.evolve-stage').forEach(s => s.addEventListener('click', () => {
        sndPop();
        ev.querySelectorAll('.evolve-stage').forEach(x => x.classList.remove('active'));
        s.classList.add('active');
        const n = +s.dataset.ev;
        speak(n === 1 ? d.e : n === 2 ? ch + '的古时候画像' : ch + '。' + d.w[0] + '的' + ch, 0.72);
      }));
    } else ev.innerHTML = '';
    // 学会按钮
    const lb = $('#btn-learned');
    if (isLearned(ch)) { lb.classList.add('done'); lb.innerHTML = '⭐ 已学会！再点一次取消'; }
    else { lb.classList.remove('done'); lb.innerHTML = '⭐ 学会这个字啦！'; }
    // 收起写字面板，下次打开按新字重新初始化
    $('#cd-write-card').classList.add('hidden');
    $('#cd-mean-card').classList.remove('hidden');
    $('#char-overlay').classList.remove('hidden');
  }
  function strokesOf(ch) {
    const s = window.HANZI_STROKES[ch];
    return s ? s.strokes.length : '?';
  }
  $('#btn-close-sheet').addEventListener('click', () => {
    $('#char-overlay').classList.add('hidden');
    wCancelAnim();
    ttsStop();
  });
  $('#char-overlay').addEventListener('click', e => { if (e.target === $('#char-overlay')) $('#char-overlay').classList.add('hidden'); });
  $('#btn-read').addEventListener('click', () => {
    if (!speak('', 0)) return;
    const b = $('#btn-read'); b.classList.add('playing');
    readChar(curChar);
    setTimeout(() => b.classList.remove('playing'), 2600);
  });
  $('#btn-mean').addEventListener('click', () => {
    sndPop();
    $('#cd-mean-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('#cd-mean-card').style.animation = 'pulse .8s';
    setTimeout(() => $('#cd-mean-card').style.animation = '', 900);
    // 朗读字的解释
    speak(CD[curChar].m, 0.8);
  });
  $('#btn-learned').addEventListener('click', () => {
    const ch = curChar;
    if (isLearned(ch)) {
      S.learned = S.learned.filter(x => x !== ch);
      $('#btn-learned').classList.remove('done');
      $('#btn-learned').innerHTML = '⭐ 学会这个字啦！';
      mascotSay('cat', '没关系，再复习复习～', 1800);
    } else {
      S.learned.push(ch);
      $('#btn-learned').classList.add('done');
      $('#btn-learned').innerHTML = '⭐ 已学会！再点一次取消';
      addStars(1);
      confetti(); sndFanfare(); mascotPraise();
      setTimeout(() => {
        const next = ALL[(ALL.indexOf(ch) + 1) % ALL.length];
        mascotSay('rabbit', '接下来学"' + next + '"怎么样？', 2400);
      }, 1400);
    }
    store.save(); updateProgress();
  });

  /* ================================================================
     学写字 · 自研笔画引擎（演示动画 / 描红判分 / 自由画）
     笔画数据来源：hanzi-writer-data（Make Me a Hanzi 项目）
  ================================================================ */
  const WS = 320;                 // 逻辑画布尺寸
  const WPAD = 10;                // 内边距
  const DATA_SPACE = 1024;        // 笔画数据的坐标空间
  const WSCALE = (WS - WPAD * 2) / DATA_SPACE;
  let W = null;                   // { ch, n, paths[], medians[][], done[], cur, misses, animToken, mode }
  let writeMode = 'demo';
  let wCanvas = null, wBaseCtx = null;   // 底层：笔画演示/字影
  let wInk = null, wCtx = null;          // 上层：手指书写层
  let wInputEnabled = false, wDrawing = false, wPts = [];

  function setWriteHint(t) { const el = $('#write-hint'); if (el) el.textContent = t; }

  function initWriteCanvas() {
    if (wCanvas) return;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    wCanvas = $('#write-canvas');
    wCanvas.width = WS * dpr; wCanvas.height = WS * dpr;
    wCanvas.style.width = '100%'; wCanvas.style.height = '100%';
    wBaseCtx = wCanvas.getContext('2d');
    wBaseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    wInk = document.createElement('canvas');
    wInk.width = WS * dpr; wInk.height = WS * dpr;
    wInk.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;z-index:2;';
    wCtx = wInk.getContext('2d');
    wCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    wCtx.lineWidth = 10; wCtx.lineCap = 'round'; wCtx.lineJoin = 'round';
    wCtx.strokeStyle = 'rgba(255,159,67,.95)';
    const box = $('.write-box');
    box.style.position = 'relative';
    box.appendChild(wInk);
    bindInkInput();
  }

  // 采样轮廓路径（1024空间），用于笔顺动画的描边显现与笔尖定位
  function sampleOutlinePts(d) {
    const toks = d.match(/[MLQCZ]|-?\d+(\.\d+)?/g) || [];
    const pts = [];
    let x = 0, y = 0, sx = 0, sy = 0, i = 0;
    while (i < toks.length) {
      const c = toks[i++];
      const nums = [];
      while (i < toks.length && /^-?\d/.test(toks[i])) nums.push(parseFloat(toks[i++]));
      if (c === 'M') { x = nums[0]; y = nums[1]; sx = x; sy = y; pts.push([x, y]); }
      else if (c === 'L') { x = nums[0]; y = nums[1]; pts.push([x, y]); }
      else if (c === 'Q') {
        for (let k = 1; k <= 6; k++) {
          const t = k / 6, mt = 1 - t;
          pts.push([mt * mt * x + 2 * mt * t * nums[0] + t * t * nums[2], mt * mt * y + 2 * mt * t * nums[1] + t * t * nums[3]]);
        }
        x = nums[2]; y = nums[3];
      } else if (c === 'C') {
        for (let k = 1; k <= 6; k++) {
          const t = k / 6, mt = 1 - t;
          pts.push([mt * mt * mt * x + 3 * mt * mt * t * nums[0] + 3 * mt * t * t * nums[2] + t * t * t * nums[4],
                    mt * mt * mt * y + 3 * mt * mt * t * nums[1] + 3 * mt * t * t * nums[3] + t * t * t * nums[5]]);
        }
        x = nums[4]; y = nums[5];
      } else if (c === 'Z') { x = sx; y = sy; pts.push([x, y]); }
    }
    const cums = [0];
    let total = 0;
    for (let k = 1; k < pts.length; k++) {
      total += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      cums.push(total);
    }
    return { pts, cums, total };
  }

  function initWriteEngine(ch) {
    initWriteCanvas();
    const data = window.HANZI_STROKES[ch];
    if (!data || !Array.isArray(data.strokes) || !data.strokes.length) {
      setWriteHint('⚠️ 没有找到这个字的笔画数据');
      return false;
    }
    W = {
      ch,
      n: data.strokes.length,
      paths: data.strokes.map(d => new Path2D(d)),
      anims: data.strokes.map(d => sampleOutlinePts(d)),
      medians: data.medians.map(pts => pts.map(p => [p[0] * WSCALE + WPAD, (DATA_SPACE - p[1]) * WSCALE + WPAD])),
      done: new Array(data.strokes.length).fill(false),
      cur: 0, misses: 0, animToken: 0, mode: 'demo',
    };
    return true;
  }

  // 绘制静态字影（硬笔实心）：已完成=粉色；当前笔(描红时)=浅橙；其余=浅灰
  // 笔画数据为 1024 坐标空间且 y 轴向上，渲染时须做 y 翻转
  function wDrawStatic() {
    if (!W) return;
    const ctx = wBaseCtx;
    ctx.clearRect(0, 0, WS, WS);
    ctx.save();
    ctx.translate(WPAD, WPAD + DATA_SPACE * WSCALE);
    ctx.scale(WSCALE, -WSCALE);
    for (let i = 0; i < W.n; i++) {
      if (W.mode === 'free') { ctx.fillStyle = '#F0E2CE'; }
      else if (W.done[i]) { ctx.fillStyle = '#E84393'; }
      else if (i === W.cur && W.mode === 'trace') { ctx.fillStyle = '#FFC48C'; }
      else { ctx.fillStyle = '#F0E2CE'; }
      ctx.fill(W.paths[i]);
    }
    ctx.restore();
  }

  // 单笔书写动画（硬笔效果）：先填充整笔实体，再擦除未显现部分
  function wAnimateStroke(i, onDone) {
    if (!W) return;
    const token = ++W.animToken;
    const a = W.anims[i];
    const L = a.total * 1.02 + 120; // 虚线段长度需覆盖整条轮廓
    const dur = Math.min(1200, Math.max(450, 380 + a.total * 0.4));
    const t0 = performance.now();
    const ctx = wBaseCtx;
    function frame(t) {
      if (token !== W.animToken) return;
      const p = Math.min(1, (t - t0) / dur);
      wDrawStatic();
      ctx.save();
      ctx.translate(WPAD, WPAD + DATA_SPACE * WSCALE);
      ctx.scale(WSCALE, -WSCALE);
      // 1) 整笔实体填充
      ctx.fillStyle = '#E84393';
      ctx.fill(W.paths[i]);
      // 2) 擦除尚未写到的部分（从显现前端到笔画末尾的轮廓带）
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 82; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#000';
      ctx.setLineDash([L, L]);
      ctx.lineDashOffset = -p * L; // 保留 [0, pL]，擦除 [pL, L]
      ctx.stroke(W.paths[i]);
      ctx.restore();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
      // 3) 笔尖圆点（跟随显现前端）
      const target = p * a.total;
      let idx = 1;
      while (idx < a.cums.length && a.cums[idx] < target) idx++;
      const q = a.pts[Math.min(idx, a.pts.length - 1)];
      ctx.fillStyle = '#E84393';
      ctx.beginPath();
      ctx.arc(q[0] * WSCALE + WPAD, (DATA_SPACE - q[1]) * WSCALE + WPAD, 6, 0, Math.PI * 2);
      ctx.fill();
      if (p < 1) requestAnimationFrame(frame);
      else if (onDone) onDone();
    }
    requestAnimationFrame(frame);
  }

  function wCancelAnim() { if (W) W.animToken++; }

  /* ---- 看演示 ---- */
  function wDemoAll() {
    if (!W) return;
    W.mode = 'demo';
    W.done.fill(false); W.cur = 0; W.misses = 0;
    wClearInk();
    wInputEnabled = false;
    wDrawStatic();
    let i = 0;
    const step = () => {
      if (!W || W.mode !== 'demo') return;
      if (i >= W.n) { setWriteHint('✨ 写完了！点"描一描"自己试试吧～'); return; }
      setWriteHint('第 ' + (i + 1) + ' / ' + W.n + ' 笔');
      wAnimateStroke(i, () => {
        W.done[i] = true; // 写过的笔画保持粉色
        wDrawStatic();
        i++;
        if (W && W.mode === 'demo') setTimeout(step, 300);
      });
    };
    step();
  }

  /* ---- 描一描（描红判分） ---- */
  function wStartTrace() {
    if (!W) return;
    W.mode = 'trace';
    W.animToken++;
    W.done.fill(false); W.cur = 0; W.misses = 0;
    wClearInk();
    wDrawStatic();
    wInputEnabled = true;
    setWriteHint('第 1 / ' + W.n + ' 笔：跟着橙色笔画描一描');
  }

  function distToSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const L2 = dx * dx + dy * dy;
    let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return { d: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
  }

  function wFinishAll() {
    wInputEnabled = false;
    wClearInk();
    setWriteHint('🎉 全部写完了！你太棒啦！');
    confetti(); sndFanfare(); mascotPraise();
    if (W.ch && !isLearned(W.ch)) {
      S.learned.push(W.ch);
      addStars(1); store.save();
      const lb = $('#btn-learned');
      lb.classList.add('done'); lb.innerHTML = '⭐ 已学会！再点一次取消';
    }
    updateProgress();
  }

  const PASS_DIST = 20;
  const PASS_COVER = 0.55;
  function wJudge() {
    if (!W || W.mode !== 'trace') return;
    const pts = W.medians[W.cur];
    if (!wPts.length) { wClearInk(); return; }
    if (wPts.length < 4) { wClearInk(); setWriteHint('笔画太短啦，再描长一点～'); wInputEnabled = true; return; }
    const nSeg = pts.length - 1;
    const covered = new Array(nSeg).fill(false);
    const ds = wPts.map(p => {
      let best = 1e9, bestK = -1;
      for (let k = 0; k < nSeg; k++) {
        const r = distToSeg(p[0], p[1], pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]);
        if (r.d < best) { best = r.d; bestK = k; }
      }
      if (best < PASS_DIST) covered[bestK] = true;
      return best;
    }).sort((a, b) => a - b);
    const m = Math.max(3, Math.floor(ds.length * 0.8));
    const avg = ds.slice(0, m).reduce((a, b) => a + b, 0) / m;
    const cover = covered.filter(Boolean).length / nSeg;
    const ok = avg < PASS_DIST && cover >= PASS_COVER;
    if (ok) {
      wInputEnabled = false;
      sndCorrect();
      W.done[W.cur] = true;
      setTimeout(() => { wClearInk(); wDrawStatic(); }, 240);
      if (W.cur + 1 >= W.n) {
        wFinishAll();
      } else {
        W.cur++; W.misses = 0;
        setWriteHint('第 ' + (W.cur + 1) + ' / ' + W.n + ' 笔：真棒，继续！');
        setTimeout(() => { wDrawStatic(); wInputEnabled = true; }, 320);
      }
    } else {
      sndWrong();
      W.misses++;
      wInputEnabled = false;
      setWriteHint('差一点点，跟着橙色笔画再试一次～');
      const box = $('.write-box');
      box.classList.add('shake');
      setTimeout(() => box.classList.remove('shake'), 460);
      setTimeout(() => { wClearInk(); wDrawStatic(); wInputEnabled = true; }, 460);
      if (W.misses >= 2) {
        setWriteHint('差一点点～看，这一笔是这样写的！');
        wAnimateStroke(W.cur, () => { wDrawStatic(); wInputEnabled = true; });
      }
    }
  }

  function wHintStroke() {
    if (!W || W.mode !== 'trace') return;
    wInputEnabled = false;
    wClearInk(); wDrawStatic();
    setWriteHint('看，这一笔是这样写的～');
    wAnimateStroke(W.cur, () => { wDrawStatic(); wInputEnabled = true; });
  }

  function wSkipStroke() {
    if (!W || W.mode !== 'trace') return;
    W.animToken++;
    W.done[W.cur] = true;
    wClearInk();
    if (W.cur + 1 >= W.n) {
      W.cur = W.n - 1;
      wDrawStatic();
      wFinishAll();
    } else {
      W.cur++; W.misses = 0;
      wDrawStatic();
      setWriteHint('第 ' + (W.cur + 1) + ' / ' + W.n + ' 笔');
    }
  }

  /* ---- 自由画 ---- */
  function wStartFree() {
    if (!W) return;
    W.mode = 'free';
    W.animToken++;
    wClearInk();
    wDrawStatic();
    wInputEnabled = true;
    setWriteHint('照着灰影子随便画，好玩就行～');
  }

  function wClearInk() { if (wCtx) wCtx.clearRect(0, 0, WS, WS); }

  /* ---- 书写输入（Pointer / 触摸 / 鼠标 三兼容） ---- */
  function inkPos(e) {
    const r = wInk.getBoundingClientRect();
    const t = e.touches && e.touches.length ? e.touches[0] : e;
    return [(t.clientX - r.left) * (WS / r.width), (t.clientY - r.top) * (WS / r.height)];
  }
  function inkStartAt(p) {
    wDrawing = true; wPts = [p];
    wCtx.beginPath(); wCtx.moveTo(p[0], p[1]);
    wCtx.lineTo(p[0] + .1, p[1] + .1); wCtx.stroke();
  }
  function inkMoveTo(p) {
    if (!wDrawing) return;
    wPts.push(p);
    wCtx.lineTo(p[0], p[1]); wCtx.stroke();
  }
  function inkEnd() {
    if (!wDrawing) return;
    wDrawing = false;
    wJudge();
  }
  function bindInkInput() {
    if (window.PointerEvent) {
      wInk.addEventListener('pointerdown', e => {
        if (!wInputEnabled) return;
        e.preventDefault();
        inkStartAt(inkPos(e));
        try { wInk.setPointerCapture(e.pointerId); } catch (err) {}
      });
      wInk.addEventListener('pointermove', e => { if (wDrawing) inkMoveTo(inkPos(e)); });
      wInk.addEventListener('pointerup', inkEnd);
      wInk.addEventListener('pointercancel', inkEnd);
    } else {
      wInk.addEventListener('touchstart', e => {
        if (!wInputEnabled) return;
        e.preventDefault();
        inkStartAt(inkPos(e));
      }, { passive: false });
      wInk.addEventListener('touchmove', e => {
        if (wDrawing) { e.preventDefault(); inkMoveTo(inkPos(e)); }
      }, { passive: false });
      wInk.addEventListener('touchend', inkEnd);
      wInk.addEventListener('mousedown', e => { if (wInputEnabled) inkStartAt(inkPos(e)); });
      addEventListener('mousemove', e => { if (wDrawing) inkMoveTo(inkPos(e)); });
      addEventListener('mouseup', inkEnd);
    }
  }

  /* ---- 模式切换与按钮 ---- */
  function setWriteMode(mode) {
    if (!W || W.ch !== curChar) { if (!initWriteEngine(curChar)) return; }
    writeMode = mode;
    document.querySelectorAll('.write-tab').forEach(t => t.classList.toggle('active', t.dataset.wtab === mode));
    if (mode === 'demo') wDemoAll();
    else if (mode === 'trace') wStartTrace();
    else wStartFree();
    updateWriteBtns(mode);
  }
  function updateWriteBtns(mode) {
    const b1 = $('#btn-replay'), b2 = $('#btn-quiz');
    if (mode === 'demo') { b1.textContent = '🔁 再看一遍'; b2.textContent = '✍️ 我来描一描'; }
    else if (mode === 'trace') { b1.textContent = '💡 提示这一笔'; b2.textContent = '⏭️ 跳过这一笔'; }
    else { b1.textContent = '🧹 清空画纸'; b2.textContent = '✍️ 去描一描'; }
  }
  $('#btn-write').addEventListener('click', () => {
    sndPop();
    $('#cd-write-card').classList.remove('hidden');
    $('#cd-write-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (!W || W.ch !== curChar) initWriteEngine(curChar);
    setWriteMode('demo');
  });
  document.querySelectorAll('.write-tab').forEach(t => t.addEventListener('click', () => { sndPop(); setWriteMode(t.dataset.wtab); }));
  $('#btn-replay').addEventListener('click', () => {
    sndPop();
    if (writeMode === 'demo') setWriteMode('demo');
    else if (writeMode === 'trace') wHintStroke();
    else wClearInk();
  });
  $('#btn-quiz').addEventListener('click', () => {
    sndPop();
    if (writeMode === 'demo') setWriteMode('trace');
    else if (writeMode === 'trace') wSkipStroke();
    else setWriteMode('trace');
  });

  /* ---------- 方法一：图画变变变 ---------- */
  let pictoTab = 'look', plPool = [], plScore = 0, plStars = 0, plRounds = 0, plTotal = 0, plRight = null, plLock = false;
  function renderPictoTab() {
    document.querySelectorAll('[data-picto-tab]').forEach(b => b.classList.toggle('active', b.dataset.pictoTab === pictoTab));
    $('#picto-look').classList.toggle('hidden', pictoTab !== 'look');
    $('#picto-evolve').classList.toggle('hidden', pictoTab !== 'evolve');
    if (pictoTab === 'look') plNext();
    else renderEvolve();
  }
  document.querySelectorAll('[data-picto-tab]').forEach(b => b.addEventListener('click', () => { sndPop(); pictoTab = b.dataset.pictoTab; renderPictoTab(); }));

  function plNext() {
    if (plLock) return;
    plTotal++;
    if (!plPool.length) plPool = ALL.slice();
    const idx = Math.floor(Math.random() * plPool.length);
    const ch = plPool.splice(idx, 1)[0];
    plRight = ch;
    $('#pl-pic').textContent = CD[ch].e;
    $('#pl-pic').style.animation = 'none'; void $('#pl-pic').offsetWidth;
    $('#pl-pic').style.animation = 'pop .5s';
    const others = ALL.filter(x => x !== ch).sort(() => Math.random() - .5).slice(0, 3);
    const opts = [ch, ...others].sort(() => Math.random() - .5);
    $('#pl-opts').innerHTML = opts.map(c => '<button class="opt-btn" data-c="' + c + '">' + c + '</button>').join('');
    $('#pl-opts').querySelectorAll('.opt-btn').forEach(b => b.addEventListener('click', () => plPick(b)));
  }
  function plPick(b) {
    if (plLock) return;
    plLock = true;
    const c = b.dataset.c;
    if (c === plRight) {
      b.classList.add('right'); sndCorrect();
      plScore++; plRounds++;
      mascotPraise();
      setTimeout(() => {
        plLock = false;
        if (plTotal % 10 === 0) {
          const earn = Math.round(plScore / 2);
          addStars(earn); plStars += earn;
          confetti(); sndFanfare();
          mascotSay('bear', '这一关答对 ' + plScore + ' 题，送你 ' + earn + ' 颗星星！', 3200);
        }
        plNext();
      }, 750);
    } else {
      b.classList.add('wrong'); sndWrong(); mascotCheer();
      setTimeout(() => { b.classList.remove('wrong'); plLock = false; }, 550);
    }
    $('#pl-score').textContent = plScore;
    $('#pl-stars').textContent = plStars;
  }

  /* 象形变变变 */
  function renderEvolve() {
    const chars = ALL.filter(c => PICTO[c]);
    const chips = $('#evolve-chips');
    chips.innerHTML = chars.map(c => '<button class="cat-tab" data-c="' + c + '">' + CD[c].e + ' ' + c + '</button>').join('');
    chips.querySelectorAll('.cat-tab').forEach(b => b.addEventListener('click', () => { sndPop(); evShow(b.dataset.c); }));
    evShow(chars[0]);
  }
  function evShow(ch) {
    const d = CD[ch];
    $('#ev-stage1').textContent = d.e;
    $('#ev-stage2').innerHTML = '<svg viewBox="0 0 120 120">' + PICTO[ch] + '</svg>';
    $('#ev-stage3').textContent = ch;
    $('#ev-tip').textContent = '🎵 记忆口诀：' + d.t;
    ['ev-stage1', 'ev-stage2', 'ev-stage3'].forEach(id => {
      const el = $('#' + id);
      el.classList.remove('active');
      el.onclick = () => {
        sndPop();
        document.querySelectorAll('#picto-evolve .evolve-stage').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        if (id === 'ev-stage1') speak(d.e, 0.7);
        else speak(ch + '。' + d.w[0] + '的' + ch, 0.7);
      };
    });
  }

  /* ---------- 方法二：闯关大冒险 ---------- */
  let gameTab = 'pair', gameRendered = false;
  const DEFAULT_POOL = '一三八十人大小上下日月山水火木口手耳目';
  function gamePool(n) {
    let base = S.learned.length >= n ? S.learned.slice() : DEFAULT_POOL.split('');
    base = base.slice().sort(() => Math.random() - .5).slice(0, n);
    return base;
  }
  function renderGames() {
    document.querySelectorAll('[data-game]').forEach(b => b.classList.toggle('active', b.dataset.game === gameTab));
    ['pair', 'memory', 'find'].forEach(g => $('#game-' + g).classList.toggle('hidden', g !== gameTab));
    if (gameTab === 'pair') pairNew();
    if (gameTab === 'memory') memNew();
    if (gameTab === 'find') gfNext();
    gameRendered = true;
  }
  document.querySelectorAll('[data-game]').forEach(b => b.addEventListener('click', () => { sndPop(); gameTab = b.dataset.game; renderGames(); }));

  /* 连连看 */
  let pairSel = null, pairLock = false, pairLeft = 0, pairStars = 0;
  function pairNew() {
    const chars = gamePool(6);
    const cards = [];
    chars.forEach(ch => {
      cards.push({ ch, kind: 'pic', done: false });
      cards.push({ ch, kind: 'zi', done: false });
    });
    cards.sort(() => Math.random() - .5);
    pairSel = null; pairLock = false; pairLeft = 6;
    $('#pair-grid').innerHTML = cards.map((c, i) =>
      '<button class="pair-card" data-i="' + i + '" data-kind="' + c.kind + '" data-ch="' + c.ch + '">' +
      (c.kind === 'pic' ? CD[c.ch].e : c.ch) + '</button>').join('');
    $('#pair-grid').querySelectorAll('.pair-card').forEach(b => b.addEventListener('click', () => pairPick(b)));
  }
  function pairPick(b) {
    if (pairLock || b.classList.contains('done') || b.classList.contains('sel')) return;
    sndPop();
    b.classList.add('sel');
    if (!pairSel) { pairSel = b; return; }
    const a = pairSel, b2 = b;
    pairLock = true;
    if (a.dataset.ch === b2.dataset.ch && a.dataset.kind !== b2.dataset.kind) {
      a.classList.remove('sel'); b2.classList.remove('sel');
      a.classList.add('done'); b2.classList.add('done');
      sndCorrect(); mascotPraise();
      pairLeft--;
      pairSel = null; pairLock = false;
      if (pairLeft === 0) {
        addStars(3); pairStars += 3;
        confetti(); sndFanfare();
        mascotSay('cat', '全部连对啦！送你 3 颗星星！', 2600);
        setTimeout(pairNew, 1600);
      }
    } else {
      a.classList.add('wrongshake'); b2.classList.add('wrongshake');
      sndWrong(); mascotCheer();
      setTimeout(() => {
        a.classList.remove('sel', 'wrongshake'); b2.classList.remove('sel', 'wrongshake');
        pairSel = null; pairLock = false;
      }, 600);
    }
    $('#pair-stars').textContent = pairStars;
  }

  /* 翻翻乐 */
  let memFirst = null, memLock = false, memLeft = 0, memStars = 0;
  function memNew() {
    const chars = gamePool(6);
    const cards = [];
    chars.forEach(ch => {
      cards.push({ ch, kind: 'pic', ok: false });
      cards.push({ ch, kind: 'zi', ok: false });
    });
    cards.sort(() => Math.random() - .5);
    memFirst = null; memLock = false; memLeft = 6;
    $('#mem-grid').innerHTML = cards.map((c, i) =>
      '<div class="mem-card" data-i="' + i + '" data-kind="' + c.kind + '" data-ch="' + c.ch + '">' +
      '<div class="inner"><div class="mem-face front">?</div>' +
      '<div class="mem-face back">' + (c.kind === 'pic' ? CD[c.ch].e : c.ch) + '</div></div></div>').join('');
    $('#mem-grid').querySelectorAll('.mem-card').forEach(c => c.addEventListener('click', () => memPick(c)));
  }
  function memPick(card) {
    if (memLock || card.classList.contains('flip') || card.classList.contains('matched')) return;
    sndPop();
    card.classList.add('flip');
    const d = CD[card.dataset.ch];
    if (card.dataset.kind === 'zi') speak(card.dataset.ch, 0.7);
    if (!memFirst) { memFirst = card; return; }
    memLock = true;
    const a = memFirst, b2 = card;
    if (a.dataset.ch === b2.dataset.ch && a.dataset.kind !== b2.dataset.kind) {
      a.classList.add('matched'); b2.classList.add('matched');
      sndCorrect(); mascotPraise();
      memLeft--;
      memFirst = null; memLock = false;
      if (memLeft === 0) {
        addStars(3); memStars += 3;
        confetti(); sndFanfare();
        mascotSay('rabbit', '记忆大师！送你 3 颗星星！', 2600);
        setTimeout(memNew, 1600);
      }
    } else {
      sndWrong(); mascotCheer();
      setTimeout(() => {
        a.classList.remove('flip'); b2.classList.remove('flip');
        memFirst = null; memLock = false;
      }, 850);
    }
    $('#mem-stars').textContent = memStars;
  }

  /* 找朋友 */
  let gfRight = null, gfLock = false, gfScore = 0, gfStars = 0, gfRounds = 0, gfTotal = 0, gfPool = [];
  function gfNext() {
    if (gfLock) return;
    gfTotal++;
    if (!gfPool.length) gfPool = ALL.slice();
    const idx = Math.floor(Math.random() * gfPool.length);
    const ch = gfPool.splice(idx, 1)[0];
    gfRight = ch;
    $('#gf-zi').textContent = ch;
    speak(ch + '。' + CD[ch].w[0] + '的' + ch, 0.7);
    const others = ALL.filter(x => x !== ch).sort(() => Math.random() - .5).slice(0, 3);
    const opts = [ch, ...others].sort(() => Math.random() - .5);
    $('#gf-opts').innerHTML = opts.map(c => '<button class="opt-btn" data-c="' + c + '">' + CD[c].e + '</button>').join('');
    $('#gf-opts').querySelectorAll('.opt-btn').forEach(b => b.addEventListener('click', () => gfPick(b)));
  }
  function gfPick(b) {
    if (gfLock) return;
    gfLock = true;
    if (b.dataset.c === gfRight) {
      b.classList.add('right'); sndCorrect(); gfScore++; gfRounds++;
      mascotPraise();
      setTimeout(() => {
        gfLock = false;
        if (gfTotal % 10 === 0) {
          const earn = Math.round(gfScore / 2);
          addStars(earn); gfStars += earn;
          confetti(); sndFanfare();
          mascotSay('duck', '太厉害了！答对 ' + gfScore + ' 题，送你 ' + earn + ' 颗星星！', 3200);
        }
        gfNext();
      }, 750);
    } else {
      b.classList.add('wrong'); sndWrong(); mascotCheer();
      setTimeout(() => { b.classList.remove('wrong'); gfLock = false; }, 550);
    }
    $('#gf-score').textContent = gfScore;
    $('#gf-stars').textContent = gfStars;
  }

  /* ---------- 成就 ---------- */
  const BADGES = [
    { n: 1, icon: '🌱', name: '初识汉字', desc: '学会第 1 个字' },
    { n: 10, icon: '🐛', name: '小小书虫', desc: '学会 10 个字' },
    { n: 30, icon: '🦋', name: '破茧成蝶', desc: '学会 30 个字' },
    { n: 60, icon: '🐎', name: '识字小达人', desc: '学会 60 个字' },
    { n: 100, icon: '🦅', name: '汉字小明星', desc: '学会 100 个字' },
    { n: 120, icon: '🐉', name: '汉字小博士', desc: '学会全部 120 个字' },
  ];
  function renderAchieve() {
    const n = S.learned.length;
    $('#badge-list').innerHTML = BADGES.map(b => {
      const got = n >= b.n;
      return '<div class="badge ' + (got ? 'got' : 'locked') + '">' +
        '<span class="b-icon">' + b.icon + '</span>' +
        '<div class="b-name">' + b.name + '</div>' +
        '<div class="b-desc">' + b.desc + (got ? ' ✅' : ' 🔒') + '</div></div>';
    }).join('');
    const grid = $('#learned-grid');
    grid.innerHTML = S.learned.map(ch => '<div class="learned-cell">' + ch + '<span class="lp">' + CD[ch].p + '</span></div>').join('') ||
      '<div style="grid-column:1/-1;text-align:center;color:#8D6E63;font-weight:700">还没有学会的字，快去学堂学一学吧！</div>';
  }
  $('#btn-reset').addEventListener('click', () => {
    if (confirm('确定要重新开始吗？学会的字和星星都会被清空哦！')) {
      S.learned = []; S.stars = 0;
      store.save(); updateProgress(); renderAchieve();
      mascotSay('bear', '新的开始，加油哦！', 2000);
    }
  });

  /* ---------- 启动 ---------- */
  renderHome();
  nav('home');
})();
