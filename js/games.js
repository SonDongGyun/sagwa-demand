/* ============================================================
   games.js — 진정성 심사 3종.
   각 게임은 start() 로 실행하고, {score: 0~100, detail} 로 resolve 한다.
   ============================================================ */
(function (global) {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var now = function () { return performance.now(); };

  /* ────────────────────────────────────────────────────────
     1. 정중히 고개 숙이기 — 각도를 초록 구간에 유지
     ──────────────────────────────────────────────────────── */
  function BowGame(opts) {
    var diff = clamp(opts.difficulty || 5, 1, 10);
    var LIMIT = 15;            // 제한 시간(초)
    var NEED = 3;              // 유지해야 하는 누적 시간(초)
    var MAX_ANGLE = 110;
    var ZONE = [78, 92];
    var RISE = 44 + diff * 2.6;
    var FALL = 36 + diff * 1.4;

    var figure = $('#bow-figure');
    var needle = $('#bow-needle');
    var heldEl = $('#bow-held');
    var holdFill = $('#bow-hold-fill');
    var timeEl = $('#bow-time');
    var timeFill = $('#bow-time-fill');
    var btn = $('#bow-btn');
    var msg = $('#bow-msg');

    var angle = 0, gust = 0, held = 0, left = LIMIT;
    var bumps = 0, down = false, running = false, started = false;
    var raf = 0, last = 0, nextGust = 0, resolveFn = null, cleanup = [];

    function on(target, type, fn, o) {
      target.addEventListener(type, fn, o);
      cleanup.push(function () { target.removeEventListener(type, fn, o); });
    }

    function press(e) {
      if (e && e.preventDefault) e.preventDefault();
      if (!running) return;
      down = true;
      btn.classList.add('is-down');
      if (!started) { started = true; last = now(); msg.textContent = '초록 구간을 유지하세요.'; }
    }
    function release() {
      down = false;
      btn.classList.remove('is-down');
    }

    function render() {
      figure.style.transform = 'rotate(' + angle.toFixed(1) + 'deg)';
      needle.style.left = (angle / MAX_ANGLE * 100).toFixed(2) + '%';
      heldEl.textContent = held.toFixed(2);
      holdFill.style.width = (held / NEED * 100).toFixed(1) + '%';
      timeEl.textContent = left.toFixed(1);
      timeFill.style.width = (left / LIMIT * 100).toFixed(1) + '%';
    }

    function tick(t) {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      if (!started) { render(); return; }

      var dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      left -= dt;

      // 몸이 흔들린다. 분노 게이지가 높을수록 자주, 세게.
      nextGust -= dt;
      if (nextGust <= 0) {
        nextGust = 1.6 - diff * 0.08 + Math.random() * 0.9;
        gust += (Math.random() < 0.5 ? -1 : 1) * (6 + diff * 1.6) * (0.5 + Math.random());
      }
      gust *= Math.pow(0.06, dt);

      angle += ((down ? RISE : -FALL) + gust) * dt;

      if (angle > MAX_ANGLE) {          // 이마를 찧었다
        angle = 58; gust = 0; bumps++;
        held = Math.max(0, held - 0.5);
        figure.classList.remove('oops');
        void figure.offsetWidth;
        figure.classList.add('oops');
        msg.textContent = '이마를 찧었습니다. 너무 깊습니다. (' + bumps + '회)';
      }
      angle = clamp(angle, 0, MAX_ANGLE);

      if (angle >= ZONE[0] && angle <= ZONE[1]) held = Math.min(NEED, held + dt);

      render();

      if (held >= NEED) return finish(true);
      if (left <= 0) { left = 0; render(); return finish(false); }
    }

    function finish(success) {
      running = false;
      cancelAnimationFrame(raf);
      release();
      cleanup.forEach(function (f) { f(); });
      cleanup = [];

      var score = success
        ? Math.round(clamp(58 + (left / LIMIT) * 42 - bumps * 11, 0, 100))
        : Math.round(clamp((held / NEED) * 46 - bumps * 6, 0, 100));

      msg.textContent = success
        ? '허리 각도 확인. 다음 심사로 넘어갑니다.'
        : '시간 초과. 성의가 부족합니다.';

      setTimeout(function () {
        resolveFn({ score: score, detail: { success: success, bumps: bumps, held: +held.toFixed(2), left: +left.toFixed(1) } });
      }, 700);
    }

    this.start = function () {
      angle = 0; gust = 0; held = 0; left = LIMIT; bumps = 0;
      down = false; started = false; running = true; nextGust = 1;
      msg.textContent = '버튼을 눌러 시작하세요.';
      render();

      on(btn, 'pointerdown', press);
      on(window, 'pointerup', release);
      on(window, 'pointercancel', release);
      on(window, 'keydown', function (e) {
        if (e.code === 'Space' || e.key === ' ') { if (!e.repeat) press(e); }
      });
      on(window, 'keyup', function (e) {
        if (e.code === 'Space' || e.key === ' ') release();
      });
      on(btn, 'contextmenu', function (e) { e.preventDefault(); });

      raf = requestAnimationFrame(function (t) { last = t; tick(t); });
      return new Promise(function (res) { resolveFn = res; });
    };
  }

  /* ────────────────────────────────────────────────────────
     2. 사과문 받아쓰기 — 한 글자도 틀리지 않게
     ──────────────────────────────────────────────────────── */
  function DictationGame(opts) {
    var sentence = opts.sentence;
    var LIMIT = 120;

    var targetEl = $('#dict-target');
    var input = $('#dict-input');
    var typoEl = $('#dict-typos');
    var timeEl = $('#dict-time');
    var progEl = $('#dict-progress');
    var fillEl = $('#dict-fill');
    var skipRow = $('#dict-skip-row');
    var skipBtn = $('#dict-skip');
    var msg = $('#dict-msg');

    var chars = Array.from(sentence);
    var spans = [];
    var typos = 0, checked = 0, composing = false;
    var startAt = 0, timer = 0, done = false;
    var resolveFn = null, cleanup = [];

    function on(target, type, fn) {
      target.addEventListener(type, fn);
      cleanup.push(function () { target.removeEventListener(type, fn); });
    }

    // 모바일 키보드는 따옴표를 " " 로 바꾸고, 말끝에 공백을 붙이고,
    // 두 번 탭하면 공백이 겹친다. 그 정도 차이로 막히지 않게 정규화해 비교한다.
    function norm(str) {
      return String(str)
        .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
        .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
        .replace(/[\u2010-\u2015]/g, '-')
        .replace(/\u2026/g, '...')
        .replace(/[\u00A0\u3000\u200B\uFEFF]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    var normTarget = norm(sentence);

    // 한글은 ㅈ → 저 처럼 조합되며 들어온다. 조합 중인 마지막 글자는
    // 아직 확정이 아니므로 채점에서도, 색칠에서도 제외한다.
    function settled() {
      return Array.from(input.value).length - (composing ? 1 : 0);
    }

    function paint() {
      var typed = Array.from(input.value);
      var limit = settled();
      for (var i = 0; i < spans.length; i++) {
        var s = spans[i];
        s.className = '';
        if (i < limit) s.className = typed[i] === chars[i] ? 'hit' : 'miss';
        else if (i === limit) s.className = 'cursor';
      }
    }

    /** 확정된 글자만 골라 오타를 센다. 지우면 그만큼 되돌린다. */
    function score() {
      var typed = Array.from(input.value);
      var limit = settled();
      if (limit < checked) { checked = limit; return; }
      for (var i = checked; i < limit; i++) {
        if (typed[i] !== chars[i]) typos++;
      }
      checked = limit;
      typoEl.textContent = typos;
    }

    /** 지금 어디까지 왔고 무엇이 막고 있는지 매 입력마다 알려준다. */
    function updateStatus() {
      var typed = Array.from(input.value);
      var limit = Math.min(settled(), chars.length);
      var wrong = 0;
      for (var i = 0; i < limit; i++) if (typed[i] !== chars[i]) wrong++;

      progEl.textContent = limit + ' / ' + chars.length;
      fillEl.style.width = (limit / chars.length * 100).toFixed(1) + '%';

      var elapsed = startAt ? (now() - startAt) / 1000 : 0;
      if (skipRow.hidden && (elapsed > 20 || settled() >= chars.length)) skipRow.hidden = false;

      if (!startAt) return;
      if (wrong) msg.textContent = '틀린 글자 ' + wrong + '개. 붉게 표시된 곳을 고치면 넘어갑니다.';
      else if (typed.length > chars.length) msg.textContent = '문장보다 길게 적었습니다. 뒤쪽을 지우세요.';
      else if (limit < chars.length) msg.textContent = (chars.length - limit) + '글자 남았습니다. 마침표까지 적으세요.';
      else msg.textContent = '';
    }

    function onInput(e) {
      if (e && typeof e.isComposing === 'boolean') composing = e.isComposing;
      if (!startAt && input.value.length) {
        startAt = now();
        timer = setInterval(function () {
          var el = (now() - startAt) / 1000;
          timeEl.textContent = el.toFixed(1);
          if (el > 20 && skipRow.hidden) skipRow.hidden = false;
          if (el >= LIMIT) finish(false, 'time');
        }, 100);
        msg.textContent = '';
      }
      score();
      paint();
      updateStatus();
      if (norm(input.value) === normTarget) finish(true);
    }

    function cheat(e) {
      e.preventDefault();
      typos += 3;
      typoEl.textContent = typos;
      msg.textContent = '붙여넣기는 진정성으로 인정되지 않습니다. 오타 +3';
      input.classList.remove('shake');
      void input.offsetWidth;
      input.classList.add('shake');
    }

    function matchedPrefix() {
      var typed = Array.from(input.value), n = 0;
      while (n < typed.length && n < chars.length && typed[n] === chars[n]) n++;
      return n;
    }

    function finish(success, reason) {
      if (done) return;
      done = true;
      clearInterval(timer);
      input.blur();
      input.readOnly = true;
      skipRow.hidden = true;
      cleanup.forEach(function (f) { f(); });
      cleanup = [];

      var elapsed = startAt ? (now() - startAt) / 1000 : LIMIT;
      var par = Math.max(14, chars.length * 0.62);
      var score = success
        ? Math.round(clamp(100 - typos * 5 - Math.max(0, elapsed - par) * 1.1, 0, 100))
        : Math.round(clamp((matchedPrefix() / chars.length) * 48 - typos * 3, 0, 100));

      msg.textContent = success ? '문장 일치 확인.'
        : reason === 'skip' ? '적은 데까지만 인정합니다.'
        : '시간 초과. 문장을 다 옮기지 못했습니다.';
      setTimeout(function () {
        resolveFn({ score: score, detail: { success: success, typos: typos, seconds: +elapsed.toFixed(1) } });
      }, 700);
    }

    this.start = function () {
      targetEl.textContent = '';
      spans = chars.map(function (ch) {
        var s = document.createElement('span');
        s.textContent = ch;
        targetEl.appendChild(s);
        return s;
      });
      input.value = '';
      input.readOnly = false;
      input.setAttribute('autocorrect', 'off');
      input.setAttribute('autocapitalize', 'off');
      typos = 0; checked = 0; composing = false; startAt = 0; done = false;
      typoEl.textContent = '0';
      timeEl.textContent = '0.0';
      progEl.textContent = '0 / ' + chars.length;
      fillEl.style.width = '0%';
      skipRow.hidden = true;
      msg.textContent = '입력창을 눌러 첫 글자를 적으면 시간이 흐릅니다.';
      paint();
      setTimeout(function () { input.focus(); }, 60);

      skipBtn.onclick = function () { finish(false, 'skip'); };
      on(input, 'input', onInput);
      on(input, 'compositionstart', function () { composing = true; });
      on(input, 'compositionend', function () { composing = false; onInput(); });
      on(input, 'paste', cheat);
      on(input, 'drop', cheat);

      return new Promise(function (res) { resolveFn = res; });
    };
  }

  /* ────────────────────────────────────────────────────────
     3. 사과 줍기 — 사과는 받고 변명과 돌은 피한다
     ──────────────────────────────────────────────────────── */
  function CatchGame(opts) {
    var diff = clamp(opts.difficulty || 5, 1, 10);
    var W = 480, H = 360, DURATION = 30;

    var canvas = $('#catch-canvas');
    var ctx = canvas.getContext('2d');
    var overlay = $('#catch-overlay');
    var startBtn = $('#catch-start');
    var scoreEl = $('#catch-score');
    var timeEl = $('#catch-time');
    var livesEl = $('#catch-lives');
    var msg = $('#catch-msg');

    var basket = { x: W / 2, w: 78, h: 34 };
    var items = [], pops = [];
    var score = 0, possible = 0, lives = 3, left = DURATION, spawnIn = 0.6;
    var running = false, raf = 0, last = 0, keys = { l: false, r: false };
    var resolveFn = null, cleanup = [];

    function on(target, type, fn, o) {
      target.addEventListener(type, fn, o);
      cleanup.push(function () { target.removeEventListener(type, fn, o); });
    }

    function fit() {
      var rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      var dpr = Math.min(2, global.devicePixelRatio || 1);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      var s = canvas.width / W;
      ctx.setTransform(s, 0, 0, s, 0, 0);
    }

    var KINDS = [
      { k: 'apple',  w: 58, pts:  10, r: 15, life: 0 },
      { k: 'gold',   w: 10, pts:  30, r: 13, life: 0 },
      { k: 'excuse', w: 20, pts: -12, r: 17, life: 1 },
      { k: 'stone',  w: 12, pts: -18, r: 15, life: 1 }
    ];

    function pickKind() {
      var total = KINDS.reduce(function (a, b) { return a + b.w; }, 0);
      var r = Math.random() * total;
      for (var i = 0; i < KINDS.length; i++) {
        r -= KINDS[i].w;
        if (r <= 0) return KINDS[i];
      }
      return KINDS[0];
    }

    function spawn() {
      var kind = pickKind();
      if (kind.pts > 0) possible += kind.pts;   // 받을 수 있었던 총점 = 만점 기준
      items.push({
        kind: kind,
        x: 26 + Math.random() * (W - 52),
        y: -24,
        vy: (kind.k === 'gold' ? 150 : 96) + diff * 9 + Math.random() * 50,
        spin: (Math.random() - 0.5) * 3
      });
    }

    /* 그리기 ------------------------------------------------ */
    function drawBackdrop() {
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#f7edd8');
      g.addColorStop(1, '#e3d4b4');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(35,32,28,.06)';
      ctx.lineWidth = 1;
      for (var y = 40; y < H; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(W, y + .5); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(35,32,28,.14)';
      ctx.fillRect(0, H - 14, W, 3);
    }

    function drawApple(x, y, r, gold) {
      ctx.save();
      ctx.translate(x, y);
      var g = ctx.createRadialGradient(-r * .35, -r * .4, r * .2, 0, 0, r);
      if (gold) { g.addColorStop(0, '#ffe08a'); g.addColorStop(1, '#b8892b'); }
      else { g.addColorStop(0, '#ef6a55'); g.addColorStop(1, '#a82418'); }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -r * .55);
      ctx.bezierCurveTo(r * 1.15, -r * 1.25, r * 1.3, r * .75, 0, r);
      ctx.bezierCurveTo(-r * 1.3, r * .75, -r * 1.15, -r * 1.25, 0, -r * .55);
      ctx.fill();
      ctx.strokeStyle = '#4a3a24'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -r * .7); ctx.lineTo(r * .18, -r * 1.25); ctx.stroke();
      ctx.fillStyle = '#4c7c46';
      ctx.beginPath();
      ctx.ellipse(r * .55, -r * 1.05, r * .42, r * .2, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.4)';
      ctx.beginPath(); ctx.ellipse(-r * .38, -r * .3, r * .2, r * .3, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    function drawStone(x, y, r, spin) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(spin);
      ctx.fillStyle = '#6f6a63';
      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.lineTo(-r * .55, -r * .85);
      ctx.lineTo(r * .5, -r * .95);
      ctx.lineTo(r, -r * .05);
      ctx.lineTo(r * .45, r * .9);
      ctx.lineTo(-r * .6, r * .8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      ctx.beginPath(); ctx.ellipse(-r * .25, -r * .35, r * .3, r * .18, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    function drawExcuse(x, y, r) {
      ctx.save();
      ctx.translate(x, y);
      var w = r * 2.3, h = r * 1.5;
      ctx.fillStyle = '#fffdf6';
      ctx.strokeStyle = '#8a8175';
      ctx.lineWidth = 2;
      var rad = 8;
      ctx.beginPath();
      ctx.moveTo(-w / 2 + rad, -h / 2);
      ctx.arcTo(w / 2, -h / 2, w / 2, h / 2, rad);
      ctx.arcTo(w / 2, h / 2, -w / 2, h / 2, rad);
      ctx.lineTo(-w / 2 + rad + 8, h / 2);
      ctx.lineTo(-w / 2 + 4, h / 2 + 9);
      ctx.lineTo(-w / 2 + rad + 2, h / 2);
      ctx.arcTo(-w / 2, h / 2, -w / 2, -h / 2, rad);
      ctx.arcTo(-w / 2, -h / 2, w / 2, -h / 2, rad);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#8e2018';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('변명', 0, 0);
      ctx.restore();
    }

    function drawBasket() {
      var x = basket.x, y = H - 14, w = basket.w, h = basket.h;
      ctx.save();
      ctx.fillStyle = '#a9743a';
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y - h);
      ctx.lineTo(x + w / 2, y - h);
      ctx.lineTo(x + w / 2 - 9, y);
      ctx.lineTo(x - w / 2 + 9, y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,38,16,.45)';
      ctx.lineWidth = 1.6;
      for (var i = 1; i < 4; i++) {
        var yy = y - h + (h / 4) * i;
        var t = i / 4, inset = 9 * t;
        ctx.beginPath();
        ctx.moveTo(x - w / 2 + inset, yy);
        ctx.lineTo(x + w / 2 - inset, yy);
        ctx.stroke();
      }
      ctx.fillStyle = '#c98b46';
      ctx.fillRect(x - w / 2 - 3, y - h - 7, w + 6, 8);
      ctx.restore();
    }

    function drawPops() {
      pops.forEach(function (p) {
        ctx.save();
        ctx.globalAlpha = clamp(p.life, 0, 1);
        ctx.fillStyle = p.color;
        ctx.font = 'bold 16px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
        ctx.restore();
      });
    }

    function draw() {
      drawBackdrop();
      items.forEach(function (it) {
        if (it.kind.k === 'apple') drawApple(it.x, it.y, it.kind.r, false);
        else if (it.kind.k === 'gold') drawApple(it.x, it.y, it.kind.r, true);
        else if (it.kind.k === 'stone') drawStone(it.x, it.y, it.kind.r, it.y * 0.02 * it.spin);
        else drawExcuse(it.x, it.y, it.kind.r);
      });
      drawBasket();
      drawPops();
    }

    /* 루프 -------------------------------------------------- */
    function tick(t) {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      var dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      left -= dt;

      if (keys.l) basket.x -= 340 * dt;
      if (keys.r) basket.x += 340 * dt;
      basket.x = clamp(basket.x, basket.w / 2, W - basket.w / 2);

      spawnIn -= dt;
      if (spawnIn <= 0) {
        spawn();
        spawnIn = Math.max(0.22, 0.78 - diff * 0.042 + Math.random() * 0.3);
      }

      var catchTop = H - 14 - basket.h;
      for (var i = items.length - 1; i >= 0; i--) {
        var it = items[i];
        it.y += it.vy * dt;

        var hit = it.y + it.kind.r * 0.6 >= catchTop &&
                  it.y - it.kind.r * 0.6 <= catchTop + basket.h &&
                  Math.abs(it.x - basket.x) < basket.w / 2 + it.kind.r * 0.5;

        if (hit) {
          items.splice(i, 1);
          score = Math.max(0, score + it.kind.pts);
          if (it.kind.life) {
            lives--;
            livesEl.textContent = lives > 0 ? '♥'.repeat(lives) : '—';
            msg.textContent = it.kind.k === 'stone' ? '돌은 받는 게 아닙니다.' : '변명을 주웠습니다.';
          }
          pops.push({
            x: it.x, y: catchTop - 6, life: 1,
            text: (it.kind.pts > 0 ? '+' : '') + it.kind.pts,
            color: it.kind.pts > 0 ? '#2f7a4f' : '#c0392b'
          });
          scoreEl.textContent = score;
          if (lives <= 0) { draw(); return finish('lives'); }
        } else if (it.y - it.kind.r > H) {
          items.splice(i, 1);
        }
      }

      for (var j = pops.length - 1; j >= 0; j--) {
        pops[j].y -= 34 * dt;
        pops[j].life -= dt * 1.5;
        if (pops[j].life <= 0) pops.splice(j, 1);
      }

      timeEl.textContent = Math.max(0, left).toFixed(1);
      draw();
      if (left <= 0) finish('time');
    }

    function finish(reason) {
      running = false;
      cancelAnimationFrame(raf);
      cleanup.forEach(function (f) { f(); });
      cleanup = [];

      // 만점 기준은 고정값이 아니라 "실제로 떨어진 사과의 총점".
      // 다 받으면 100점이다. 마음이 다 닳아 일찍 끝나면 남은 시간만큼
      // 더 떨어졌을 사과를 감안해 기준을 늘린다.
      var elapsed = Math.max(1, DURATION - Math.max(0, left));
      var expected = Math.max(1, possible * (DURATION / elapsed));
      var normalized = Math.round(clamp(score / expected * 100, 0, 100));

      overlay.hidden = false;
      overlay.innerHTML = '<p>' + (reason === 'lives' ? '마음이 다 닳았습니다.' : '심사 종료.')
        + '<br>주운 사과 <b>' + score + '</b>점 / 떨어진 사과 <b>' + Math.round(expected) + '</b>점'
        + '<br>→ 진정성 <b>' + normalized + '</b>점</p>';
      msg.textContent = '';
      setTimeout(function () {
        resolveFn({ score: normalized, detail: { raw: score, possible: Math.round(expected), lives: lives, reason: reason } });
      }, 1100);
    }

    function pointerMove(e) {
      var rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      basket.x = clamp((e.clientX - rect.left) / rect.width * W, basket.w / 2, W - basket.w / 2);
    }

    this.start = function () {
      items = []; pops = [];
      score = 0; possible = 0; lives = 3; left = DURATION; spawnIn = 0.5;
      basket.x = W / 2;
      scoreEl.textContent = '0';
      timeEl.textContent = DURATION.toFixed(1);
      livesEl.textContent = '♥♥♥';
      msg.textContent = '';
      overlay.hidden = false;
      overlay.innerHTML = '';
      overlay.appendChild(startBtn);
      startBtn.textContent = '시작';
      fit();
      draw();

      // ?debug=1 로 열면 게임 상태를 콘솔/자동화에서 들여다볼 수 있다.
      if (/[?&]debug=1/.test(location.search)) {
        global.__catchState = function () {
          return {
            w: W, h: H, basket: basket.x, score: score, possible: possible, lives: lives, left: left,
            items: items.map(function (i) { return { x: i.x, y: i.y, k: i.kind.k }; })
          };
        };
      }

      return new Promise(function (res) {
        resolveFn = res;
        startBtn.onclick = function () {
          overlay.hidden = true;
          running = true;
          on(window, 'resize', fit);
          on(canvas, 'pointermove', pointerMove);
          on(canvas, 'pointerdown', pointerMove);
          on(window, 'keydown', function (e) {
            if (e.key === 'ArrowLeft') { keys.l = true; e.preventDefault(); }
            if (e.key === 'ArrowRight') { keys.r = true; e.preventDefault(); }
          });
          on(window, 'keyup', function (e) {
            if (e.key === 'ArrowLeft') keys.l = false;
            if (e.key === 'ArrowRight') keys.r = false;
          });
          raf = requestAnimationFrame(function (t) { last = t; tick(t); });
        };
      });
    };
  }

  global.Games = { Bow: BowGame, Dictation: DictationGame, Catch: CatchGame };
})(window);
