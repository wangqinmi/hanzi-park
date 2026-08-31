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
      if (webAudioEl) { webAudioEl.pause(); }
      if (window.AndroidTTS) { AndroidTTS.stop(); return; }
      speechSynthesis.cancel();
    } catch (e) {}
  }
  // 网页端打包语音播放（Audio 元素，file:// 下也可用）
  let webAudioEl = null;
  function playBundledWeb(name) {
    try {
      if (!webAudioEl) webAudioEl = new Audio();
      webAudioEl.src = 'audio/' + name;
      const p = webAudioEl.play();
      if (p && p.catch) p.catch(() => {});
      return true;
    } catch (e) { return false; }
  }
  let ttsWarned = false;
  function speak(text, rate) {
    try {
      // 打包预合成语音优先：零延迟、真人级音色、离线可用
      const bundled = window.AUDIO_MANIFEST && window.AUDIO_MANIFEST[text];
      if (bundled) {
        if (window.AndroidTTS && AndroidTTS.playBundled) {
          try { AndroidTTS.playBundled(bundled); return true; } catch (e) {}
        }
        if (playBundledWeb(bundled)) return true;
      }
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
  // 第二张插图（Twemoji 矢量图，ASCII 文件名）
  const twImg = ch => 'img/twemoji/u' + ch.codePointAt(0).toString(16) + '.svg';
  const readText = ch => ch + '。' + CD[ch].w[0] + '的' + ch + '。' + ch + '，' + CD[ch].w[0] + '的' + ch;
  const readChar = ch => speak(readText(ch));
  // APK：预合成语音进缓存，点按秒读
  function warmTts() {
    if (!window.AndroidTTS || !AndroidTTS.warm) return;
    for (let i = 0; i < arguments.length; i++) {
      const t = String(arguments[i]);
      if (window.AUDIO_MANIFEST && window.AUDIO_MANIFEST[t]) continue; // 已打包语音，无需预合成
      try { AndroidTTS.warm(t, 0.72); } catch (e) {}
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
  const VIEWS = ['home', 'school', 'picto', 'games', 'pinyin', 'achieve'];
  function nav(name) {
    for (const v of VIEWS) {
      const el = $('#view-' + v);
      el.classList.toggle('hidden', v !== name);
    }
    ttsStop();
    if (name === 'school') renderSchool();
    if (name === 'achieve') renderAchieve();
    if (name === 'pinyin') renderPinyin();
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
    $('#cd-pic').querySelector('.pic-inner').textContent = d.e;
    $('#cd-pic2-img').src = twImg(ch);
    $('#cd-pic2-img').alt = d.w[0];
    $('#cd-zi').textContent = ch;
    $('#cd-py').textContent = d.p;
    $('#cd-py').classList.add('tap-speak');
    $('#cd-py').title = '点一点学这个拼音';
    $('#cd-py').onclick = () => {
      sndPop();
      const key = findPYKey(stripTone(d.p));
      if (key) {
        $('#char-overlay').classList.add('hidden');
        ttsStop();
        openPinyin(key);
      }
    };
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
        '<div class="evolve-stage" data-ev="1"><img src="' + twImg(ch) + '" style="width:66px;height:66px"></div><div class="evolve-arrow">➜</div>' +
        '<div class="evolve-stage" data-ev="2"><svg viewBox="0 0 120 120">' + PICTO[ch] + '</svg></div><div class="evolve-arrow">➜</div>' +
        '<div class="evolve-stage zi" data-ev="3">' + ch + '</div></div></div>';
      ev.querySelectorAll('.evolve-stage').forEach(s => s.addEventListener('click', () => {
        sndPop();
        ev.querySelectorAll('.evolve-stage').forEach(x => x.classList.remove('active'));
        s.classList.add('active');
        const n = +s.dataset.ev;
        speak(n === 1 ? d.w[0] : n === 2 ? ch + '的古时候画像' : ch + '。' + d.w[0] + '的' + ch, 0.72);
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

  /* ---------- 拼音乐园 ---------- */
  const PY = window.PINYIN_DATA;
  const PY_GROUPS = window.PINYIN_GROUPS;
  const PY_FINAL_SUB = window.PINYIN_FINAL_SUB;
  let pyTab = '声母';
  const TONE_MAP = { 'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a', 'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e', 'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i', 'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o', 'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u', 'ǖ': 'ü', 'ǘ': 'ü', 'ǚ': 'ü', 'ǜ': 'ü' };
  function stripTone(py) {
    let o = '';
    for (const ch of py) o += TONE_MAP[ch] || ch;
    return o;
  }
  const WHOLE_KEYS = PY_GROUPS['整体认读'];
  const FINAL_KEYS = PY_GROUPS['韵母'];
  function findPYKey(base) {
    if (WHOLE_KEYS.includes(base)) return base;
    const sorted = [...FINAL_KEYS].sort((a, b) => b.length - a.length);
    for (const f of sorted) {
      if (base.endsWith(f)) return f;
      if (base.endsWith(f.replace('ü', 'u')) && f.includes('ü')) return f;
      if (f === 'ün' && base.endsWith('un')) {
        const pre = base.slice(0, -2);
        if (pre && 'jqxy'.includes(pre[pre.length - 1])) return f;
      }
    }
    return null;
  }
  function pySpeakText(key) {
    const d = PY[key];
    if (!d) return '';
    return d.rw + '，' + d.ph + '。' + d.ex.map(e => e.w).join('。') + '。';
  }
  function pyCard(k) {
    const d = PY[k];
    return '<button class="char-card py-card" data-py="' + k + '">' +
      '<span class="pic"><img src="img/pinyin/' + k + '.svg" style="width:40px;height:40px;vertical-align:middle"></span>' +
      '<div class="zi">' + k + '</div>' +
      '<div class="py">' + d.read + '</div></button>';
  }
  const PY_TABS = ['声母', '韵母', '整体认读', '声调', '拼读', '拼音游戏'];
  function renderPinyin() {
    const tabs = $('#py-tabs');
    tabs.innerHTML = PY_TABS.map(g =>
      '<button class="cat-tab' + (g === pyTab ? ' active' : '') + '" data-g="' + g + '">' + g +
      (PY_GROUPS[g] ? ' <span style="opacity:.6">' + PY_GROUPS[g].length + '</span>' : '') + '</button>').join('');
    tabs.querySelectorAll('.cat-tab').forEach(b => b.addEventListener('click', () => {
      sndPop(); pyTab = b.dataset.g; renderPinyin();
    }));
    const grid = $('#py-grid');
    const isGrid = pyTab === '声母' || pyTab === '韵母' || pyTab === '整体认读';
    grid.classList.toggle('hidden', !isGrid);
    $('#py-tone').classList.toggle('hidden', pyTab !== '声调');
    $('#py-spell').classList.toggle('hidden', pyTab !== '拼读');
    $('#py-games').classList.toggle('hidden', pyTab !== '拼音游戏');
    if (pyTab === '韵母') {
      grid.innerHTML = Object.entries(PY_FINAL_SUB).map(([sub, keys]) =>
        '<div class="py-group-head" style="grid-column:1/-1">' + sub + '</div>' +
        keys.map(pyCard).join('')).join('');
    } else if (isGrid) {
      grid.innerHTML = PY_GROUPS[pyTab].map(pyCard).join('');
    }
    grid.querySelectorAll('.py-card').forEach(b => b.addEventListener('click', () => {
      sndPop(); openPinyin(b.dataset.py);
    }));
    if (pyTab === '声调') renderTone();
    if (pyTab === '拼读') renderSpell();
    if (pyTab === '拼音游戏') renderPyGames();
  }

  /* ---- 声调学习 ---- */
  const TONE_NUM = { 'ā': 1, 'á': 2, 'ǎ': 3, 'à': 4, 'ē': 1, 'é': 2, 'ě': 3, 'è': 4, 'ī': 1, 'í': 2, 'ǐ': 3, 'ì': 4, 'ō': 1, 'ó': 2, 'ǒ': 3, 'ò': 4, 'ū': 1, 'ú': 2, 'ǔ': 3, 'ù': 4, 'ǖ': 1, 'ǘ': 2, 'ǚ': 3, 'ǜ': 4 };
  const TONE_POOL = (() => {
    const pool = [];
    for (const [ch, d] of Object.entries(CD)) {
      const marks = d.p.match(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g);
      if (marks && marks.length === 1 && /^[a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+$/.test(d.p)) {
        pool.push({ w: ch, py: d.p, tone: TONE_NUM[marks[0]] });
      }
    }
    return pool;
  })();
  let toneRight = null, toneScore = 0, toneStars = 0, toneTotal = 0, toneLock = false;
  function renderTone() {
    const tones = PY['a'].tones;
    const paths = ['M10 35 H90', 'M10 60 L90 15', 'M10 15 Q50 75 90 15', 'M10 15 L90 60'];
    $('#tone-cards').innerHTML = tones.map((t, i) =>
      '<button class="tone-card" data-w="' + t.w + '">' +
      '<svg viewBox="0 0 100 70"><path class="tp" d="' + paths[i] + '"/>' +
      '<circle class="td" r="7"><animateMotion dur="1.8s" repeatCount="indefinite" path="' + paths[i] + '"/></circle></svg>' +
      '<div class="tone-big">' + t.t + '</div>' +
      '<div class="tone-word">' + t.w + '（第' + ['一', '二', '三', '四'][i] + '声）</div></button>').join('');
    $('#tone-cards').querySelectorAll('.tone-card').forEach(b => b.addEventListener('click', () => {
      sndPop(); speak(b.dataset.w + '，' + b.dataset.w + '。', 0.75);
    }));
    $('#tone-light').innerHTML = [['爸', 'bà ba'], ['妈', 'mā ma'], ['了', 'le']].map(([w, py]) =>
      '<button class="chip" data-w="' + w + '">' + w + ' <span style="opacity:.55">' + py + '</span></button>').join('');
    $('#tone-light').querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
      sndPop(); speak(b.dataset.w + '。' + b.dataset.w + '。', 0.75);
    }));
    toneNext();
  }
  function toneNext() {
    if (toneLock) return;
    toneTotal++;
    toneRight = TONE_POOL[Math.floor(Math.random() * TONE_POOL.length)];
    $('#tone-q').textContent = '👂 听一听，是第几声？点「听声音」开始';
    $('#tone-opts').innerHTML = [1, 2, 3, 4].map(n =>
      '<button class="opt-btn" data-n="' + n + '" style="font-size:26px">' + ['一', '二', '三', '四'][n - 1] + '声</button>').join('');
    $('#tone-opts').querySelectorAll('.opt-btn').forEach(b => b.addEventListener('click', () => tonePick(b)));
  }
  $('#btn-tone-play').addEventListener('click', () => {
    if (toneRight) speak(toneRight.w + '，' + toneRight.w + '。', 0.75);
  });
  function tonePick(b) {
    if (toneLock) return;
    const n = +b.dataset.n;
    if (n === toneRight.tone) {
      toneLock = true;
      b.classList.add('right'); sndCorrect();
      toneScore++;
      mascotPraise();
      $('#tone-q').textContent = '🎉 答案：' + toneRight.w + ' ' + toneRight.py + '（第' + ['一', '二', '三', '四'][n - 1] + '声）';
      setTimeout(() => {
        toneLock = false;
        if (toneTotal % 10 === 0) {
          const earn = Math.round(toneScore / 2);
          addStars(earn); toneStars += earn;
          confetti(); sndFanfare();
          mascotSay('duck', '听声辨调太棒了！答对 ' + toneScore + ' 题，送你 ' + earn + ' 颗星星！', 3200);
        }
        toneNext();
      }, 900);
    } else {
      b.classList.add('wrong'); sndWrong(); mascotCheer();
      setTimeout(() => b.classList.remove('wrong'), 500);
    }
    $('#tone-score').textContent = toneScore;
    $('#tone-stars').textContent = toneStars;
  }

  /* ---- 拼读练习 ---- */
  let spellMode = 'two', spellI = null, spellM = null, spellF = null;
  function renderSpell() {
    document.querySelectorAll('[data-spell]').forEach(b => b.classList.toggle('active', b.dataset.spell === spellMode));
    $('#spell-m').classList.toggle('hidden', spellMode === 'two');
    $('#spell-i').dataset.label = '声母';
    $('#spell-m').dataset.label = '介母';
    $('#spell-f').dataset.label = '韵母';
    spellI = spellM = spellF = null;
    renderSpellChips();
    updateSpellResult('👆 点上面的字母开始拼读');
    $('#spell-rules').innerHTML = window.PINYIN_RULES.map(r =>
      '<div class="info-card"><h3>' + r.t + '</h3><div class="meaning">' + r.d + '</div><div class="word-chips">' +
      r.ex.map(w => '<button class="chip" data-w="' + w + '">' + w + '</button>').join('') + '</div></div>').join('');
    $('#spell-rules').querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
      sndPop(); speak(b.dataset.w + '，' + b.dataset.w + '。', 0.75);
    }));
  }
  function spellChip(row, k) {
    const sel = (row === 'i' && spellI === k) || (row === 'm' && spellM === k) || (row === 'f' && spellF === k);
    return '<button class="chip spell-chip' + (sel ? ' sel' : '') + '" data-row="' + row + '" data-k="' + k + '">' + k + '</button>';
  }
  function renderSpellChips() {
    $('#spell-i').innerHTML = PY_GROUPS['声母'].map(k => spellChip('i', k)).join('');
    $('#spell-m').innerHTML = ['i', 'u', 'ü'].map(k => spellChip('m', k)).join('');
    $('#spell-f').innerHTML = PY_GROUPS['韵母'].map(k => spellChip('f', k)).join('');
  }
  function updateSpellResult(html) {
    $('#spell-result').innerHTML = html;
  }
  function trySpell() {
    if (spellMode === 'two') {
      if (!spellI || !spellF) return;
      const hit = window.PINYIN_SPELL.two.find(s => s.i === spellI && s.f === spellF);
      if (hit) {
        updateSpellResult(spellI + ' ＋ ' + spellF + ' → <b>' + stripTone(hit.py) + '</b> · ' + hit.w + '（' + hit.py + '）');
        sndCorrect(); mascotPraise();
        speak(hit.w + '，' + hit.w + '。', 0.75);
      } else {
        updateSpellResult(spellI + ' ＋ ' + spellF + ' 这个组合没有常用字哦，换一个试试～');
        sndWrong(); mascotCheer();
      }
    } else {
      if (!spellI || !spellM || !spellF) return;
      const hit = window.PINYIN_SPELL.three.find(s => s.i === spellI && s.m === spellM && s.f === spellF);
      if (hit) {
        updateSpellResult(spellI + ' ＋ ' + spellM + ' ＋ ' + spellF + ' → <b>' + stripTone(hit.py) + '</b> · ' + hit.w + '（' + hit.py + '）');
        sndCorrect(); mascotPraise();
        speak(hit.w + '，' + hit.w + '。', 0.75);
      } else {
        updateSpellResult(spellI + ' ＋ ' + spellM + ' ＋ ' + spellF + ' 这个组合没有常用字哦，换一个试试～');
        sndWrong(); mascotCheer();
      }
    }
  }
  document.querySelector('#py-spell').addEventListener('click', e => {
    const b = e.target.closest('.spell-chip');
    if (!b) return;
    sndPop();
    const row = b.dataset.row, k = b.dataset.k;
    if (row === 'i') spellI = k;
    else if (row === 'm') spellM = k;
    else spellF = k;
    renderSpellChips();
    trySpell();
  });
  document.querySelectorAll('[data-spell]').forEach(b => b.addEventListener('click', () => {
    sndPop(); spellMode = b.dataset.spell; renderSpell();
  }));
  function openPinyin(key) {
    const d = PY[key];
    if (!d) return;
    curPYKey = key;
    $('#py-write-card').classList.add('hidden');
    $('#py-zi').textContent = key;
    $('#py-read').textContent = d.read;
    $('#py-cat').textContent = '🔤 ' + d.cat;
    $('#py-img').src = 'img/pinyin/' + key + '.svg';
    $('#py-img-cap').textContent = d.rw + '（' + d.read + '）';
    $('#py-tip').textContent = d.tip;
    $('#py-tip').onclick = () => speak(d.tip, 0.8);
    const tonesBox = $('#py-tones');
    if (d.tones && d.tones.length) {
      $('#py-tones-title').textContent = '🎵 四声调：点一点听发音（' + d.read + '）';
      tonesBox.innerHTML = d.tones.map(t =>
        '<button class="chip tone-chip" data-w="' + t.w + '">' + t.t +
        ' <span style="opacity:.6">' + t.w + '</span></button>').join('');
      tonesBox.querySelectorAll('.tone-chip').forEach(b => b.addEventListener('click', () => {
        sndPop(); speak(b.dataset.w + '，' + b.dataset.w + '。', 0.78);
      }));
    } else {
      $('#py-tones-title').textContent = '🎵 声调：声母本身不标调，和韵母拼在一起才标调哦';
      tonesBox.innerHTML = '<span style="color:#8D6E63;font-weight:700">例字：' + d.ex.map(e => e.w).join('、') + '</span>';
    }
    $('#py-ex').innerHTML = d.ex.map(e =>
      '<button class="chip" data-w="' + e.w + '">' + e.w +
      ' <span style="opacity:.55">' + e.py + '</span></button>').join('');
    $('#py-ex').querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
      sndPop();
      const w = b.dataset.w;
      if (CD[w]) {
        $('#pinyin-overlay').classList.add('hidden');
        ttsStop();
        openChar(w);
      } else {
        speak(w + '，' + w + '。', 0.78);
      }
    }));
    $('#pinyin-overlay').classList.remove('hidden');
    warmTts(pySpeakText(key));
  }
  $('#btn-py-read').addEventListener('click', () => {
    speak(pySpeakText($('#py-zi').textContent), 0.78);
  });
  $('#btn-close-pinyin').addEventListener('click', () => {
    $('#pinyin-overlay').classList.add('hidden');
    ttsStop();
  });
  $('#pinyin-overlay').addEventListener('click', e => {
    if (e.target === $('#pinyin-overlay')) {
      $('#pinyin-overlay').classList.add('hidden');
      ttsStop();
    }
  });

  /* ---- 拼音字母书写（四线三格） ---- */
  const LSPACE_W = 100, LSPACE_H = 130;
  const LSCALE = (WS - WPAD * 2) / LSPACE_H;
  const LTX = (WS - LSPACE_W * LSCALE) / 2;
  const LTY = (WS - LSPACE_H * LSCALE) / 2;
  const L2X = x => x * LSCALE + LTX;
  const L2Y = y => y * LSCALE + LTY;
  let curPYKey = null;
  let PW = null, pwCanvas = null, pwCtx = null, pwInk = null, pwIctx = null;
  let pwInputOn = false, pwDrawing = false, pwPts = [], pyWriteMode = 'demo';

  function pyStrokeOf(key) { return window.PINYIN_WRITE[key] || null; }
  function initPWCanvas() {
    if (pwCanvas) return;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    pwCanvas = $('#py-write-canvas');
    pwCanvas.width = WS * dpr; pwCanvas.height = WS * dpr;
    pwCanvas.style.width = '100%'; pwCanvas.style.height = '100%';
    pwCtx = pwCanvas.getContext('2d');
    pwCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pwInk = document.createElement('canvas');
    pwInk.width = WS * dpr; pwInk.height = WS * dpr;
    pwInk.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;z-index:2;';
    pwIctx = pwInk.getContext('2d');
    pwIctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pwIctx.lineWidth = 8; pwIctx.lineCap = 'round'; pwIctx.lineJoin = 'round';
    pwIctx.strokeStyle = 'rgba(255,159,67,.95)';
    const box = $('#py-write-box');
    box.style.position = 'relative';
    box.appendChild(pwInk);
    bindPWInput();
  }
  function initPW(key) {
    initPWCanvas();
    const strokes = pyStrokeOf(key);
    if (!strokes) { $('#py-write-hint').textContent = '⚠️ 这个字母暂时没有书写数据'; return false; }
    PW = {
      key,
      n: strokes.length,
      paths: strokes.map(d => new Path2D(d)),
      anims: strokes.map(d => sampleOutlinePts(d)),
      medians: strokes.map(d => sampleOutlinePts(d).pts.map(p => [L2X(p[0]), L2Y(p[1])])),
      done: new Array(strokes.length).fill(false),
      cur: 0, misses: 0, animToken: 0, mode: 'demo',
    };
    return true;
  }
  function pwDrawGrid(ctx) {
    ctx.save();
    ctx.lineWidth = 1.5;
    for (const [y, c] of [[0, '#BBDEFB'], [50, '#BBDEFB'], [90, '#F48FB1'], [115, '#BBDEFB']]) {
      ctx.strokeStyle = c;
      ctx.beginPath(); ctx.moveTo(L2X(0), L2Y(y)); ctx.lineTo(L2X(100), L2Y(y)); ctx.stroke();
    }
    ctx.restore();
  }
  function pwDrawStatic() {
    if (!PW) return;
    const ctx = pwCtx;
    ctx.clearRect(0, 0, WS, WS);
    pwDrawGrid(ctx);
    ctx.save();
    ctx.translate(LTX, LTY);
    ctx.scale(LSCALE, LSCALE);
    ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineDashOffset = 0;
    for (let i = 0; i < PW.n; i++) {
      if (PW.mode === 'free') ctx.strokeStyle = '#E4D7BF';
      else if (PW.done[i]) ctx.strokeStyle = '#E84393';
      else if (i === PW.cur && PW.mode === 'trace') { ctx.strokeStyle = '#FF9F43'; ctx.setLineDash([9, 7]); }
      else ctx.strokeStyle = '#E4D7BF';
      ctx.stroke(PW.paths[i]);
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
  function pwAnimateStroke(i, onDone) {
    if (!PW) return;
    const token = ++PW.animToken;
    const a = PW.anims[i];
    const L = a.total * 1.02 + 40;
    const dur = Math.min(1100, Math.max(420, 360 + a.total * 1.1));
    const t0 = performance.now();
    const ctx = pwCtx;
    function frame(t) {
      if (token !== PW.animToken) return;
      const p = Math.min(1, (t - t0) / dur);
      pwDrawStatic();
      ctx.save();
      ctx.translate(LTX, LTY);
      ctx.scale(LSCALE, LSCALE);
      ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#E84393';
      ctx.setLineDash([L, L]);
      ctx.lineDashOffset = L * (1 - p);
      ctx.stroke(PW.paths[i]);
      ctx.restore();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
      const target = p * a.total;
      let idx = 1;
      while (idx < a.cums.length && a.cums[idx] < target) idx++;
      const q = a.pts[Math.min(idx, a.pts.length - 1)];
      ctx.fillStyle = '#E84393';
      ctx.beginPath(); ctx.arc(L2X(q[0]), L2Y(q[1]), 6, 0, Math.PI * 2); ctx.fill();
      if (p < 1) requestAnimationFrame(frame);
      else if (onDone) onDone();
    }
    requestAnimationFrame(frame);
  }
  function pwClearInk() { if (pwIctx) pwIctx.clearRect(0, 0, WS, WS); }
  function pwDemoAll() {
    if (!PW) return;
    PW.mode = 'demo';
    PW.done.fill(false); PW.cur = 0; PW.misses = 0;
    pwClearInk();
    pwInputOn = false;
    pwDrawStatic();
    let i = 0;
    const step = () => {
      if (!PW || PW.mode !== 'demo') return;
      if (i >= PW.n) { $('#py-write-hint').textContent = '✨ 写完了！点"描一描"自己试试吧～'; return; }
      $('#py-write-hint').textContent = '第 ' + (i + 1) + ' / ' + PW.n + ' 笔';
      pwAnimateStroke(i, () => {
        PW.done[i] = true;
        pwDrawStatic();
        i++;
        if (PW && PW.mode === 'demo') setTimeout(step, 320);
      });
    };
    step();
  }
  function pwStartTrace() {
    if (!PW) return;
    PW.mode = 'trace';
    PW.animToken++;
    PW.done.fill(false); PW.cur = 0; PW.misses = 0;
    pwClearInk();
    pwDrawStatic();
    pwInputOn = true;
    $('#py-write-hint').textContent = '第 1 / ' + PW.n + ' 笔：跟着橙色笔画描一描';
  }
  function pwJudge() {
    if (!PW || PW.mode !== 'trace') return;
    const pts = PW.medians[PW.cur];
    if (!pwPts.length) { pwClearInk(); return; }
    if (pwPts.length < 4) { pwClearInk(); $('#py-write-hint').textContent = '笔画太短啦，再描长一点～'; pwInputOn = true; return; }
    const nSeg = pts.length - 1;
    const covered = new Array(nSeg).fill(false);
    const ds = pwPts.map(p => {
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
      pwInputOn = false;
      sndCorrect();
      PW.done[PW.cur] = true;
      setTimeout(() => { pwClearInk(); pwDrawStatic(); }, 240);
      if (PW.cur + 1 >= PW.n) {
        pwInputOn = false;
        $('#py-write-hint').textContent = '🎉 全部写完了！你太棒啦！';
        confetti(); sndFanfare(); mascotPraise();
      } else {
        PW.cur++; PW.misses = 0;
        $('#py-write-hint').textContent = '第 ' + (PW.cur + 1) + ' / ' + PW.n + ' 笔：真棒，继续！';
        setTimeout(() => { pwDrawStatic(); pwInputOn = true; }, 320);
      }
    } else {
      sndWrong();
      PW.misses++;
      pwInputOn = false;
      $('#py-write-hint').textContent = '差一点点，跟着橙色笔画再试一次～';
      const box = $('#py-write-box');
      box.classList.add('shake');
      setTimeout(() => box.classList.remove('shake'), 460);
      setTimeout(() => { pwClearInk(); pwDrawStatic(); pwInputOn = true; }, 460);
      if (PW.misses >= 2) {
        $('#py-write-hint').textContent = '差一点点～看，这一笔是这样写的！';
        pwAnimateStroke(PW.cur, () => { pwDrawStatic(); pwInputOn = true; });
      }
    }
  }
  function pwHintStroke() {
    if (!PW || PW.mode !== 'trace') return;
    pwInputOn = false;
    pwClearInk(); pwDrawStatic();
    $('#py-write-hint').textContent = '看，这一笔是这样写的～';
    pwAnimateStroke(PW.cur, () => { pwDrawStatic(); pwInputOn = true; });
  }
  function pwSkipStroke() {
    if (!PW || PW.mode !== 'trace') return;
    PW.animToken++;
    PW.done[PW.cur] = true;
    pwClearInk();
    if (PW.cur + 1 >= PW.n) {
      PW.cur = PW.n - 1;
      pwDrawStatic();
      $('#py-write-hint').textContent = '🎉 写完了！';
      confetti(); sndFanfare(); mascotPraise();
    } else {
      PW.cur++; PW.misses = 0;
      pwDrawStatic();
      $('#py-write-hint').textContent = '第 ' + (PW.cur + 1) + ' / ' + PW.n + ' 笔';
    }
  }
  function pwStartFree() {
    if (!PW) return;
    PW.mode = 'free';
    PW.animToken++;
    pwClearInk();
    pwDrawStatic();
    pwInputOn = true;
    $('#py-write-hint').textContent = '照着灰影子随便画，好玩就行～';
  }
  function bindPWInput() {
    function pos(e) {
      const r = pwInk.getBoundingClientRect();
      const t = e.touches && e.touches.length ? e.touches[0] : e;
      return [(t.clientX - r.left) * (WS / r.width), (t.clientY - r.top) * (WS / r.height)];
    }
    if (window.PointerEvent) {
      pwInk.addEventListener('pointerdown', e => {
        if (!pwInputOn) return;
        e.preventDefault();
        pwDrawing = true; pwPts = [pos(e)];
        pwIctx.beginPath(); pwIctx.moveTo(pwPts[0][0], pwPts[0][1]);
        pwIctx.lineTo(pwPts[0][0] + .1, pwPts[0][1] + .1); pwIctx.stroke();
        try { pwInk.setPointerCapture(e.pointerId); } catch (err) {}
      });
      pwInk.addEventListener('pointermove', e => {
        if (!pwDrawing) return;
        const p = pos(e); pwPts.push(p);
        pwIctx.lineTo(p[0], p[1]); pwIctx.stroke();
      });
      const up = () => { if (!pwDrawing) return; pwDrawing = false; pwJudge(); };
      pwInk.addEventListener('pointerup', up);
      pwInk.addEventListener('pointercancel', up);
    } else {
      pwInk.addEventListener('touchstart', e => {
        if (!pwInputOn) return;
        e.preventDefault();
        pwDrawing = true; pwPts = [pos(e)];
        pwIctx.beginPath(); pwIctx.moveTo(pwPts[0][0], pwPts[0][1]);
        pwIctx.lineTo(pwPts[0][0] + .1, pwPts[0][1] + .1); pwIctx.stroke();
      }, { passive: false });
      pwInk.addEventListener('touchmove', e => {
        if (pwDrawing) {
          e.preventDefault();
          const p = pos(e); pwPts.push(p);
          pwIctx.lineTo(p[0], p[1]); pwIctx.stroke();
        }
      }, { passive: false });
      pwInk.addEventListener('touchend', () => { if (pwDrawing) { pwDrawing = false; pwJudge(); } });
    }
  }
  function setPYWriteMode(mode) {
    if (!PW || PW.key !== curPYKey) { if (!initPW(curPYKey)) return; }
    pyWriteMode = mode;
    document.querySelectorAll('[data-pywt]').forEach(t => t.classList.toggle('active', t.dataset.pywt === mode));
    if (mode === 'demo') pwDemoAll();
    else if (mode === 'trace') pwStartTrace();
    else pwStartFree();
    updatePYWriteBtns(mode);
  }
  function updatePYWriteBtns(mode) {
    const b1 = $('#btn-py-replay'), b2 = $('#btn-py-quiz');
    if (mode === 'demo') { b1.textContent = '🔁 再看一遍'; b2.textContent = '✍️ 我来描一描'; }
    else if (mode === 'trace') { b1.textContent = '💡 提示这一笔'; b2.textContent = '⏭️ 跳过这一笔'; }
    else { b1.textContent = '🧹 清空画纸'; b2.textContent = '✍️ 去描一描'; }
  }
  $('#btn-py-write').addEventListener('click', () => {
    sndPop();
    $('#py-write-card').classList.remove('hidden');
    $('#py-write-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
    pyWriteMode = '';
    setPYWriteMode('demo');
  });
  document.querySelectorAll('[data-pywt]').forEach(t => t.addEventListener('click', () => { sndPop(); setPYWriteMode(t.dataset.pywt); }));
  $('#btn-py-replay').addEventListener('click', () => {
    sndPop();
    if (pyWriteMode === 'demo') setPYWriteMode('demo');
    else if (pyWriteMode === 'trace') pwHintStroke();
    else pwClearInk();
  });
  $('#btn-py-quiz').addEventListener('click', () => {
    sndPop();
    if (pyWriteMode === 'demo') setPYWriteMode('trace');
    else if (pyWriteMode === 'trace') pwSkipStroke();
    else setPYWriteMode('trace');
  });

  /* ---- 拼音游戏 ---- */
  let pygTab = 'find';
  function renderPyGames() {
    document.querySelectorAll('[data-pyg]').forEach(b => b.classList.toggle('active', b.dataset.pyg === pygTab));
    ['find', 'build', 'train'].forEach(g => $('#pyg-' + g).classList.toggle('hidden', g !== pygTab));
    if (pygTab === 'find') pygFindNext();
    if (pygTab === 'build') pygBuildNext();
    if (pygTab === 'train') pygTrainNext();
  }
  document.querySelectorAll('[data-pyg]').forEach(b => b.addEventListener('click', () => { sndPop(); pygTab = b.dataset.pyg; renderPyGames(); }));

  let pygFindRight = null, pygFindScore = 0, pygFindStars = 0, pygFindTotal = 0, pygFindLock = false;
  function pygFindPoolBuild() {
    const pool = [];
    for (const [ch, d] of Object.entries(CD)) {
      const m = d.p.match(/^(zh|ch|sh|[bpmfdtnlgkhjqxzcsryw])/);
      if (m) pool.push({ w: ch, py: d.p, i: m[1] });
    }
    return pool;
  }
  function pygFindNext() {
    if (pygFindLock) return;
    pygFindTotal++;
    const pool = pygFindPoolBuild();
    pygFindRight = pool[Math.floor(Math.random() * pool.length)];
    $('#pyg-find-q').textContent = '👂 听一听，这个词的声母是谁？';
    $('#pyg-find-q').dataset.i = pygFindRight.i;
    speak(pygFindRight.w + '，' + pygFindRight.w + '。', 0.75);
    const others = ['b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'zh', 'ch', 'sh', 'r', 'z', 'c', 's', 'y', 'w']
      .filter(x => x !== pygFindRight.i).sort(() => Math.random() - .5).slice(0, 3);
    const opts = [pygFindRight.i, ...others].sort(() => Math.random() - .5);
    $('#pyg-find-opts').innerHTML = opts.map(k =>
      '<button class="opt-btn" data-k="' + k + '" style="font-size:34px">' + k + '</button>').join('');
    $('#pyg-find-opts').querySelectorAll('.opt-btn').forEach(b => b.addEventListener('click', () => pygFindPick(b)));
  }
  function pygFindPick(b) {
    if (pygFindLock) return;
    pygFindLock = true;
    if (b.dataset.k === pygFindRight.i) {
      b.classList.add('right'); sndCorrect();
      pygFindScore++;
      mascotPraise();
      $('#pyg-find-q').textContent = '🎉 答案：' + pygFindRight.w + ' ' + pygFindRight.py + '（声母 ' + pygFindRight.i + '）';
      setTimeout(() => {
        pygFindLock = false;
        if (pygFindTotal % 10 === 0) {
          const earn = Math.round(pygFindScore / 2);
          addStars(earn); pygFindStars += earn;
          confetti(); sndFanfare();
          mascotSay('cat', '声母找得真准！答对 ' + pygFindScore + ' 题，送你 ' + earn + ' 颗星星！', 3200);
        }
        pygFindNext();
      }, 900);
    } else {
      b.classList.add('wrong'); sndWrong(); mascotCheer();
      setTimeout(() => { b.classList.remove('wrong'); pygFindLock = false; }, 550);
    }
    $('#pyg-find-score').textContent = pygFindScore;
    $('#pyg-find-stars').textContent = pygFindStars;
  }
  $('#pyg-find-play').addEventListener('click', () => {
    if (pygFindRight) speak(pygFindRight.w + '，' + pygFindRight.w + '。', 0.75);
  });

  let pygBuildEntry = null, pygBuildSelI = null, pygBuildScore = 0, pygBuildStars = 0, pygBuildTotal = 0, pygBuildLock = false;
  function pygBuildChips() {
    $('#pyg-build-i').innerHTML = PY_GROUPS['声母'].map(k =>
      '<button class="chip spell-chip' + (pygBuildSelI === k ? ' sel' : '') + '" data-row="i" data-k="' + k + '">' + k + '</button>').join('');
    $('#pyg-build-f').innerHTML = PY_GROUPS['韵母'].map(k =>
      '<button class="chip spell-chip" data-row="f" data-k="' + k + '">' + k + '</button>').join('');
  }
  function pygBuildNext() {
    if (pygBuildLock) return;
    pygBuildTotal++;
    pygBuildEntry = window.PINYIN_SPELL.two[Math.floor(Math.random() * window.PINYIN_SPELL.two.length)];
    pygBuildSelI = null;
    $('#pyg-build-q').textContent = '👂 听一听，拼出这个词的音节！';
    $('#pyg-build-q').dataset.i = pygBuildEntry.i;
    $('#pyg-build-q').dataset.f = pygBuildEntry.f;
    $('#pyg-build-result').textContent = '👆 先选声母，再选韵母';
    pygBuildChips();
    speak(pygBuildEntry.w + '，' + pygBuildEntry.w + '。', 0.75);
  }
  function pygBuildPick(b) {
    if (pygBuildLock) return;
    const row = b.dataset.row, k = b.dataset.k;
    if (row === 'i') { pygBuildSelI = k; pygBuildChips(); return; }
    if (!pygBuildSelI) { $('#pyg-build-result').textContent = '先选一个声母哦～'; return; }
    if (pygBuildSelI === pygBuildEntry.i && k === pygBuildEntry.f) {
      pygBuildLock = true;
      sndCorrect(); mascotPraise();
      pygBuildScore++;
      S.pySpell = (S.pySpell || 0) + 1; store.save();
      $('#pyg-build-result').textContent = '🎉 ' + pygBuildSelI + ' ＋ ' + k + ' → ' + stripTone(pygBuildEntry.py) + ' · ' + pygBuildEntry.w + '（' + pygBuildEntry.py + '）';
      setTimeout(() => {
        pygBuildLock = false;
        if (pygBuildTotal % 8 === 0) {
          const earn = Math.round(pygBuildScore / 2);
          addStars(earn); pygBuildStars += earn;
          confetti(); sndFanfare();
          mascotSay('rabbit', '拼读小能手！拼对 ' + pygBuildScore + ' 个，送你 ' + earn + ' 颗星星！', 3200);
        }
        pygBuildNext();
      }, 1000);
    } else {
      sndWrong(); mascotCheer();
      $('#pyg-build-result').textContent = pygBuildSelI + ' ＋ ' + k + ' 不对哦，再听一听、换一换～';
      pygBuildSelI = null;
      setTimeout(pygBuildChips, 550);
    }
    $('#pyg-build-score').textContent = pygBuildScore;
    $('#pyg-build-stars').textContent = pygBuildStars;
  }
  document.querySelector('#pyg-build').addEventListener('click', e => {
    const b = e.target.closest('.spell-chip');
    if (b) { sndPop(); pygBuildPick(b); }
  });
  $('#pyg-build-play').addEventListener('click', () => {
    if (pygBuildEntry) speak(pygBuildEntry.w + '，' + pygBuildEntry.w + '。', 0.75);
  });

  let pygTrainRight = null, pygTrainScore = 0, pygTrainStars = 0, pygTrainTotal = 0, pygTrainLock = false;
  function pygTrainNext() {
    if (pygTrainLock) return;
    pygTrainTotal++;
    pygTrainRight = TONE_POOL[Math.floor(Math.random() * TONE_POOL.length)];
    $('#pyg-train-q').textContent = '🚂 听一听，这个词该上哪节车厢？';
    $('#pyg-train-q').dataset.tone = pygTrainRight.tone;
    speak(pygTrainRight.w + '，' + pygTrainRight.w + '。', 0.75);
    $('#pyg-train-opts').innerHTML = [1, 2, 3, 4].map(n =>
      '<button class="opt-btn" data-n="' + n + '" style="font-size:24px">' + ['🚂', '🚃', '🚃', '🚃'][n - 1] +
      ' ' + ['一', '二', '三', '四'][n - 1] + '声</button>').join('');
    $('#pyg-train-opts').querySelectorAll('.opt-btn').forEach(b => b.addEventListener('click', () => pygTrainPick(b)));
  }
  function pygTrainPick(b) {
    if (pygTrainLock) return;
    pygTrainLock = true;
    if (+b.dataset.n === pygTrainRight.tone) {
      b.classList.add('right'); sndCorrect();
      pygTrainScore++;
      S.pyTone = (S.pyTone || 0) + 1; store.save();
      mascotPraise();
      $('#pyg-train-q').textContent = '🎉 ' + pygTrainRight.w + ' ' + pygTrainRight.py + ' 上了第' + ['一', '二', '三', '四'][pygTrainRight.tone - 1] + '节车厢！';
      setTimeout(() => {
        pygTrainLock = false;
        if (pygTrainTotal % 10 === 0) {
          const earn = Math.round(pygTrainScore / 2);
          addStars(earn); pygTrainStars += earn;
          confetti(); sndFanfare();
          mascotSay('bear', '声调小火车开得真稳！答对 ' + pygTrainScore + ' 题，送你 ' + earn + ' 颗星星！', 3200);
        }
        pygTrainNext();
      }, 950);
    } else {
      b.classList.add('wrong'); sndWrong(); mascotCheer();
      setTimeout(() => { b.classList.remove('wrong'); pygTrainLock = false; }, 550);
    }
    $('#pyg-train-score').textContent = pygTrainScore;
    $('#pyg-train-stars').textContent = pygTrainStars;
  }
  $('#pyg-train-play').addEventListener('click', () => {
    if (pygTrainRight) speak(pygTrainRight.w + '，' + pygTrainRight.w + '。', 0.75);
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
    const useTw = Math.random() < 0.5;
    $('#pl-pic').innerHTML = useTw
      ? '<img src="' + twImg(ch) + '" style="width:88px;height:88px;vertical-align:middle">'
      : CD[ch].e;
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
    $('#ev-stage1').innerHTML = '<img src="' + twImg(ch) + '" style="width:66px;height:66px">';
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
        if (id === 'ev-stage1') speak(d.w[0], 0.7);
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
    $('#gf-opts').innerHTML = opts.map(c => {
      const tw = Math.random() < 0.5;
      return '<button class="opt-btn" data-c="' + c + '">' + (tw
        ? '<img src="' + twImg(c) + '" style="width:58px;height:58px;vertical-align:middle">'
        : CD[c].e) + '</button>';
    }).join('');
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
    { n: 5, icon: '🎵', name: '声调小耳朵', desc: '听音辨调答对 5 题', src: 'pyTone' },
    { n: 10, icon: '🔤', name: '拼音小达人', desc: '拼音游戏拼对 10 次', src: 'pySpell' },
  ];
  function renderAchieve() {
    $('#badge-list').innerHTML = BADGES.map(b => {
      const n = b.src ? (S[b.src] || 0) : S.learned.length;
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
