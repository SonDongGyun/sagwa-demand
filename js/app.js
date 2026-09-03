/* ============================================================
   app.js — 화면 전환, 요구서 작성/열람, 심사 진행, 판정.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  var TERMS = [
    '두 번 다시 안 그러겠다고 약속할 것',
    '변명을 한 마디도 붙이지 말 것',
    '"미안한데" 로 시작하지 말 것',
    '눈을 보고 말할 것',
    '카톡 말고 목소리로 할 것',
    '저녁은 네가 살 것',
    '웃으면서 넘기려 하지 말 것',
    '내가 왜 화났는지 먼저 말해볼 것'
  ];

  var ANGER = ['', '그냥 서운', '조금 서운', '삐짐', '많이 삐짐', '화남',
               '꽤 화남', '많이 화남', '매우 화남', '폭발 직전', '관계 재검토 중'];

  var GRADES = [
    { min: 92, letter: 'S', name: '전면 수용',   text: '흠잡을 데가 없습니다. 이 정도면 다음에 청구인이 실수했을 때 한 번 봐줘야 합니다.' },
    { min: 80, letter: 'A', name: '수용',        text: '진심이 확인되었습니다. 사과는 접수되었으며, 같은 사건의 재청구는 불가합니다.' },
    { min: 65, letter: 'B', name: '조건부 수용', text: '마음은 알겠습니다. 다만 요구 조건 이행 여부는 청구인이 직접 확인하겠다고 합니다.' },
    { min: 45, letter: 'C', name: '재심 권고',   text: '사과의 형식은 갖췄으나 온도가 부족합니다. 저녁 한 끼로 보충하시기 바랍니다.' },
    { min: 0,  letter: 'F', name: '기각',        text: '이건 사과가 아니라 절차 통과 시도입니다. 본 심사원은 청구인의 편에 섭니다.' }
  ];

  var state = {
    demand: null,
    receipt: null,
    dodges: 0,
    results: { bow: null, dictation: null, 'catch': null }
  };

  /* ── 유틸 ───────────────────────────────────────────── */

  function showScreen(id, note) {
    $$('.screen').forEach(function (s) { s.hidden = s.id !== id; });
    $('#topbar-note').textContent = note || '말로만 하는 사과는 접수되지 않습니다.';
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function docNo(seed) {
    var h = 0;
    for (var i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    var d = new Date();
    return '제' + String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0')
         + '-' + String(h % 10000).padStart(4, '0') + '호';
  }

  function dateStr(ts) {
    var d = new Date(ts || Date.now());
    return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  }

  function gradeOf(score) {
    for (var i = 0; i < GRADES.length; i++) if (score >= GRADES[i].min) return GRADES[i];
    return GRADES[GRADES.length - 1];
  }

  /** 받침 유무에 따라 조사를 고른다. pair = ['은','는'] 처럼 [받침O, 받침X]. */
  function josa(word, pair) {
    var arr = Array.from(word || '');
    var last = arr[arr.length - 1] || '';
    var code = last.charCodeAt(0);
    var hangul = code >= 0xAC00 && code <= 0xD7A3;
    var hasJong = hangul && (code - 0xAC00) % 28 !== 0;
    return word + (hasJong ? pair[0] : pair[1]);
  }

  /** 받아쓰기용으로 줄인다. 키보드로 칠 수 없는 문자는 절대 넣지 않는다. */
  function shorten(s, n) {
    var a = Array.from(s);
    if (a.length <= n) return s;
    var cut = a.slice(0, n).join('');
    var sp = cut.lastIndexOf(' ');
    return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,·]+$/, '');
  }

  function bindCopy(inputSel, btnSel, hintSel) {
    $(btnSel).addEventListener('click', function () {
      var value = $(inputSel).value;
      $(inputSel).select();
      Share.copy(value).then(function () {
        $(hintSel).textContent = '복사했습니다. 이제 붙여넣기만 하면 됩니다.';
      }).catch(function () {
        $(hintSel).textContent = '복사에 실패했습니다. 위 주소를 직접 선택해 복사하세요.';
      });
    });
  }

  /* ── 1. 요구서 작성 ─────────────────────────────────── */

  function initWriteScreen() {
    var termWrap = $('#f-terms');
    TERMS.forEach(function (t, i) {
      var label = document.createElement('label');
      label.className = 'term';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = String(i);
      if (i < 2) cb.checked = true;
      var span = document.createElement('span');
      span.textContent = t;
      label.appendChild(cb);
      label.appendChild(span);
      termWrap.appendChild(label);
    });

    var anger = $('#f-anger');
    function syncAnger() {
      var v = +anger.value;
      $('#f-anger-out').textContent = v + ' · ' + ANGER[v];
      $('#f-anger-fill').style.width = (v / 10 * 100) + '%';
    }
    anger.addEventListener('input', syncAnger);
    syncAnger();

    var what = $('#f-what');
    what.addEventListener('input', function () {
      $('#f-what-count').textContent = Array.from(what.value).length;
    });

    $('#write-docno').textContent = docNo(String(Date.now()));

    $('#form-demand').addEventListener('submit', function (e) {
      e.preventDefault();
      var to = $('#f-to').value.trim();
      var whatVal = what.value.trim();
      var bad = false;
      [[$('#f-to'), to], [what, whatVal]].forEach(function (pair) {
        pair[0].classList.toggle('invalid', !pair[1]);
        if (!pair[1]) bad = true;
      });
      if (bad) { $('#f-to').focus(); return; }

      var demand = {
        v: 1,
        to: to,
        from: $('#f-from').value.trim() || '익명의 청구인',
        what: whatVal,
        anger: +anger.value,
        terms: $$('#f-terms input:checked').map(function (cb) { return +cb.value; }),
        at: Date.now()
      };
      state.demand = demand;

      var url = Share.link({ d: Share.encode(demand) });
      $('#sent-link').value = url;
      $('#sent-to').textContent = demand.to;
      $('#copy-hint').textContent = '';
      showScreen('screen-sent', '요구서 발부 완료.');
      try { history.replaceState(null, '', url); } catch (err) { /* file:// 등 */ }
    });

    $('#btn-copy') && bindCopy('#sent-link', '#btn-copy', '#copy-hint');
    $('#btn-preview').addEventListener('click', function () { openDemand(state.demand); });
    $('#btn-rewrite').addEventListener('click', function () {
      try { history.replaceState(null, '', Share.link({})); } catch (err) {}
      showScreen('screen-write');
    });
  }

  /* ── 2. 요구서 열람 ─────────────────────────────────── */

  var typeTimer = 0;

  function openDemand(demand) {
    state.demand = demand;
    state.dodges = 0;
    state.results = { bow: null, dictation: null, 'catch': null };

    $('#demand-docno').textContent = docNo(demand.to + demand.what + demand.at);
    $('#d-to').textContent = demand.to;
    $('#d-from').textContent = demand.from;
    $('#d-anger').textContent = demand.anger + ' / 10 · ' + ANGER[demand.anger];
    $('#d-date').textContent = dateStr(demand.at);

    var terms = $('#d-terms');
    terms.textContent = '';
    var picked = (demand.terms || []).filter(function (i) { return TERMS[i]; });
    $('#d-terms-wrap').hidden = picked.length === 0;
    picked.forEach(function (i) {
      var li = document.createElement('li');
      li.textContent = TERMS[i];
      terms.appendChild(li);
    });

    var body = $('#d-what');
    body.textContent = '';
    body.classList.remove('done');
    clearInterval(typeTimer);
    var chars = Array.from(demand.what), n = 0;
    typeTimer = setInterval(function () {
      body.textContent += chars[n++];
      if (n >= chars.length) { clearInterval(typeTimer); body.classList.add('done'); }
    }, 32);

    resetDodge();
    showScreen('screen-demand', '요구서가 도착했습니다.');
  }

  function resetDodge() {
    var refuse = $('#btn-refuse');
    refuse.classList.remove('cornered');
    refuse.textContent = '미안한데 내가 왜?';
    refuse.style.left = '50%';
    refuse.style.top = '68px';
    refuse.style.transform = 'translateX(-50%)';
    $('#dodge-hint').textContent = '';
  }

  function initDemandScreen() {
    var field = $('#dodge-field');
    var refuse = $('#btn-refuse');

    var TAUNTS = [
      '어디 가세요.', '도망은 진정성이 아닙니다.', '기록되고 있습니다.',
      '이럴수록 점수만 깎입니다.', '이제 그만하시죠.', '…포기하세요.'
    ];

    function dodge(e) {
      if (state.dodges >= 6) return;
      // 터치에서는 pointerenter 와 touchstart 가 함께 오므로 한 번만 센다.
      if (e && e.type === 'pointerenter' && e.pointerType === 'touch') return;
      if (e) e.preventDefault();
      state.dodges++;

      var fw = field.clientWidth, fh = field.clientHeight;
      var bw = refuse.offsetWidth, bh = refuse.offsetHeight;
      var x = 6 + Math.random() * Math.max(1, fw - bw - 12);
      var y = 4 + Math.random() * Math.max(1, fh - bh - 60) + 56;
      refuse.style.left = x + 'px';
      refuse.style.top = Math.min(y, fh - bh - 4) + 'px';
      refuse.style.transform = 'none';

      var penalty = penaltyPoints();
      $('#dodge-hint').textContent = TAUNTS[Math.min(state.dodges - 1, TAUNTS.length - 1)]
        + ' 도주 시도 ' + state.dodges + '회 · 진정성 -' + penalty + '점';

      if (state.dodges >= 6) {
        refuse.classList.add('cornered');
        refuse.textContent = '...알겠어요, 할게요';
      }
    }

    refuse.addEventListener('pointerenter', dodge);
    refuse.addEventListener('focus', dodge);
    refuse.addEventListener('touchstart', dodge, { passive: false });
    refuse.addEventListener('click', function () {
      if (state.dodges < 6) { dodge(); return; }
      startTrials();
    });

    $('#btn-accept').addEventListener('click', startTrials);
  }

  function penaltyPoints() { return Math.min(12, state.dodges * 2); }

  /* ── 3. 심사 진행 ───────────────────────────────────── */

  function startTrials() {
    clearInterval(typeTimer);
    var d = state.demand;
    var diff = d.anger;

    showScreen('screen-bow', '심사 1 / 3 · 정중히 고개 숙이기');
    new Games.Bow({ difficulty: diff }).start().then(function (bow) {
      state.results.bow = bow;

      var sentence = josa(d.to, ['은', '는']) + ' ' + shorten(d.what, 30)
                   + ', 이 일에 대해 ' + d.from + '에게 진심으로 사과합니다. 다시는 안 그러겠습니다.';
      showScreen('screen-dictation', '심사 2 / 3 · 사과문 받아쓰기');
      return new Games.Dictation({ sentence: sentence }).start();
    }).then(function (dict) {
      state.results.dictation = dict;
      showScreen('screen-catch', '심사 3 / 3 · 사과 줍기');
      return new Games.Catch({ difficulty: diff }).start();
    }).then(function (cat) {
      state.results['catch'] = cat;
      showVerdict();
    });
  }

  /* ── 4. 판정 ────────────────────────────────────────── */

  function computeScore() {
    var r = state.results;
    var raw = r.bow.score * 0.3 + r.dictation.score * 0.3 + r['catch'].score * 0.4;
    return Math.round(clamp(raw - penaltyPoints(), 0, 100));
  }

  function showVerdict() {
    var d = state.demand;
    var r = state.results;
    var score = computeScore();
    var grade = gradeOf(score);

    $('#v-docno').textContent = docNo(d.to + d.at + score);
    $('#v-grade').textContent = grade.letter;
    $('#v-gradename').textContent = grade.name;
    $('#v-score').textContent = score;
    $('#v-bow').textContent = r.bow.score;
    $('#v-dict').textContent = r.dictation.score;
    $('#v-catch').textContent = r['catch'].score;

    var pen = penaltyPoints();
    $('#v-penalty-row').hidden = pen === 0;
    $('#v-penalty').textContent = '-' + pen;

    $('#v-text').textContent = grade.text;
    $('#v-to').textContent = d.to;
    $('#v-from').textContent = d.from;
    $('#v-what').textContent = d.what;
    $('#v-date').textContent = dateStr(Date.now());

    var stamp = $('#v-stamp');
    stamp.classList.remove('hit');
    setTimeout(function () { stamp.classList.add('hit'); }, 700);

    // 명예의 전당(로컬)
    var best = 0;
    try { best = +localStorage.getItem('sagwa.best') || 0; } catch (e) {}
    if (score > best) {
      try { localStorage.setItem('sagwa.best', String(score)); } catch (e) {}
      $('#v-best').textContent = '이 기기 최고 기록 경신 — ' + score + '점 (이전 ' + best + '점)';
    } else {
      $('#v-best').textContent = '이 기기 최고 기록 ' + best + '점';
    }

    var receipt = {
      v: 1, to: d.to, from: d.from, what: d.what, s: score,
      b: r.bow.score, t: r.dictation.score, c: r['catch'].score,
      p: pen, at: Date.now()
    };
    $('#v-link').value = Share.link({ r: Share.encode(receipt) });
    $('#v-copy-hint').textContent = '청구인에게 이 링크를 보내면 결과가 전달됩니다.';

    showScreen('screen-verdict', '심사 종료.');
  }

  function initVerdictScreen() {
    bindCopy('#v-link', '#v-copy', '#v-copy-hint');
    $('#v-retry').addEventListener('click', function () { openDemand(state.demand); });
    $('#v-print').addEventListener('click', function () { window.print(); });
    $('#v-new').addEventListener('click', function () {
      try { history.replaceState(null, '', Share.link({})); } catch (e) {}
      showScreen('screen-write');
    });
  }

  /* ── 5. 결과 수령 ───────────────────────────────────── */

  function openReceipt(rec) {
    var grade = gradeOf(rec.s);
    $('#r-to').textContent = rec.to;
    $('#r-grade').textContent = grade.letter;
    $('#r-gradename').textContent = grade.name;
    $('#r-score').textContent = rec.s;
    $('#r-bow').textContent = rec.b;
    $('#r-dict').textContent = rec.t;
    $('#r-catch').textContent = rec.c;
    $('#r-text').textContent = grade.text
      + (rec.p ? ' (도주 시도로 ' + rec.p + '점이 깎인 결과입니다.)' : '');
    $('#r-msg').textContent = '';
    state.receipt = rec;
    showScreen('screen-receipt', '심사 결과 도착.');
  }

  function initReceiptScreen() {
    $('#r-accept').addEventListener('click', function () {
      if (!state.receipt) return;
      openSeal(state.receipt);
    });
    $('#r-reject').addEventListener('click', function () {
      $('#r-msg').textContent = '재심이 청구되었습니다. 상대에게 링크를 다시 보내세요.';
    });
  }

  /* ── 6. 도장 찍기 ───────────────────────────── */

  var HOLD_MS = 1200;                 // 끝까지 누르고 있어야 하는 시간
  var seal = { rec: null, t: 0, drop: 100, holding: false, done: false, raf: 0, last: 0 };

  /** 이름을 도장에 새긴다. 세로쓰기 2~3글자. */
  function stampName(el, name, fallback) {
    var chars = Array.from(String(name || '').replace(/\s+/g, '')).slice(0, 3);
    if (!chars.length) chars = Array.from(fallback);
    el.textContent = '';
    chars.forEach(function (c, i) {
      if (i) el.appendChild(document.createElement('br'));
      el.appendChild(document.createTextNode(c));
    });
  }

  function dateTimeStr(ts) {
    var d = new Date(ts || Date.now());
    return dateStr(ts) + ' ' + String(d.getHours()).padStart(2, '0') + '시 '
         + String(d.getMinutes()).padStart(2, '0') + '분';
  }

  function openSeal(rec) {
    seal.rec = rec;
    seal.t = 0; seal.done = false; seal.holding = false;
    if (seal.raf) cancelAnimationFrame(seal.raf);
    seal.raf = 0;

    $('#seal-btn').disabled = false;
    $('#seal-btn').classList.remove('is-down');

    $('#seal-word').value = '';
    $('#seal-slot').classList.remove('inked');
    $('#seal-ink').textContent = '';
    $('#seal-face').textContent = Array.from(String(rec.from || '').replace(/\s+/g, '')).slice(0, 3).join('') || '수리';
    $('#seal-stamp').classList.remove('pressing');
    $('#seal-stamp').style.transform = 'translateY(0px)';
    $('#seal-fill').style.width = '0%';
    $('#seal-pct').textContent = '0';
    $('#seal-msg').textContent = '누르고 있으면 도장이 내려갑니다.';

    showScreen('screen-seal', '사과를 받아들이는 중.');

    // 화면이 보이는 뒤에야 좌표가 나온다. 도장면이 인주 자리까지 가는 거리.
    var slot = $('#seal-slot').getBoundingClientRect();
    var face = $('#seal-face').getBoundingClientRect();
    seal.drop = (slot.height && face.height)
      ? Math.max(40, Math.round(slot.top + slot.height * 0.6 - face.bottom))
      : 100;
  }

  function initSealScreen() {
    var btn = $('#seal-btn'), stamp = $('#seal-stamp'), sheet = $('.seal-sheet'),
        slot = $('#seal-slot'), ink = $('#seal-ink'), msg = $('#seal-msg');

    function paint() {
      stamp.style.transform = 'translateY(' + (seal.drop * seal.t).toFixed(1) + 'px)';
      $('#seal-fill').style.width = (seal.t * 100).toFixed(0) + '%';
      $('#seal-pct').textContent = Math.round(seal.t * 100);
    }

    function impress() {
      seal.done = true; seal.holding = false; seal.t = 1;
      paint();
      btn.classList.remove('is-down');
      btn.disabled = true;
      stampName(ink, seal.rec.from, '수리');
      slot.classList.add('inked');
      sheet.classList.add('shook');
      msg.textContent = '찍혔습니다. 수리증을 발급합니다.';

      setTimeout(function () {                       // 도장을 다시 들어올린다
        stamp.classList.remove('pressing');
        stamp.style.transform = 'translateY(0px)';
        sheet.classList.remove('shook');
      }, 340);

      setTimeout(function () {
        var word = $('#seal-word').value.trim();
        var r = seal.rec;
        openCert({
          v: 1, to: r.to, from: r.from, what: r.what, s: r.s,
          b: r.b, t: r.t, c: r.c, p: r.p, at: r.at,
          w: word ? shorten(word, 60) : '', aat: Date.now()
        }, true);
      }, 1250);
    }

    function tick(now) {
      var dt = Math.min(0.05, (now - seal.last) / 1000);
      seal.last = now;
      if (seal.holding) {
        seal.t += dt * 1000 / HOLD_MS;
        if (seal.t >= 1) { seal.raf = 0; return impress(); }
      } else {
        seal.t -= dt * 3.2;                          // 놓으면 튀어오른다
        if (seal.t <= 0) { seal.t = 0; paint(); seal.raf = 0; return; }
      }
      paint();
      seal.raf = requestAnimationFrame(tick);
    }

    function press(e) {
      if (seal.done || seal.holding) return;
      if (e && e.preventDefault) e.preventDefault();
      seal.holding = true;
      stamp.classList.add('pressing');
      btn.classList.add('is-down');
      msg.textContent = '그대로 누르고 계세요.';
      if (!seal.raf) { seal.last = performance.now(); seal.raf = requestAnimationFrame(tick); }
    }

    function release() {
      if (seal.done || !seal.holding) return;
      seal.holding = false;
      btn.classList.remove('is-down');
      stamp.classList.remove('pressing');
      msg.textContent = '덜 찍혔습니다. ' + Math.round(seal.t * 100)
        + '%에서 손을 떼셨습니다. 끝까지 누르세요.';
    }

    btn.addEventListener('pointerdown', press);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.addEventListener('keydown', function (e) {
      if ($('#screen-seal').hidden) return;
      if (e.target && e.target.tagName === 'INPUT') return;
      if (e.code === 'Space' || e.key === ' ' || e.key === 'Enter') {
        if (!e.repeat) press(e);
      }
    });
    window.addEventListener('keyup', function (e) {
      if (e.code === 'Space' || e.key === ' ' || e.key === 'Enter') release();
    });

    // 잘못 눌렀으면 돌아갈 수 있어야 한다. 강제로 용서시키지 않는다.
    $('#seal-back').addEventListener('click', function () {
      if (seal.done) return;
      seal.holding = false;
      if (seal.raf) cancelAnimationFrame(seal.raf);
      seal.raf = 0; seal.t = 0; paint();
      showScreen('screen-receipt', '심사 결과 도착.');
      $('#r-msg').textContent = '아직 수리하지 않았습니다. 마음이 풀리면 다시 누르세요.';
    });
  }

  /* ── 7. 사과 수리증 ────────────────────────── */

  /**
   * @param {object}  acc   수리 토큰
   * @param {boolean} mine  내가 방금 찍은 것이면 true(보낼 링크를 보여준다),
   *                        링크로 받아서 열었으면 false(사과비가 내린다).
   */
  function openCert(acc, mine) {
    var grade = gradeOf(acc.s);

    $('#a-docno').textContent = docNo(String(acc.from) + acc.to + acc.aat);
    var from = acc.from || '청구인', to = acc.to || '피청구인';
    $('#a-from').textContent = from;
    $('#a-fromj').textContent = josa(from, ['은', '는']).slice(String(from).length);
    $('#a-to').textContent = to;
    $('#a-what').textContent = acc.what || '—';
    $('#a-result').textContent = grade.letter + ' · ' + grade.name + ' · 진정성 ' + acc.s + '점';
    $('#a-date').textContent = dateTimeStr(acc.aat);

    var word = $('#a-word');
    word.textContent = acc.w ? '“' + acc.w + '”' : '';
    word.hidden = !acc.w;

    $('#a-sub').textContent = mine
      ? '아래 사과는 정식으로 수리되었습니다.'
      : (acc.to || '당신') + ' 님의 사과가 받아들여졌습니다.';

    stampName($('#a-stampname'), acc.from, '수리');
    var st = $('#a-stamp');
    st.classList.remove('hit');
    setTimeout(function () { st.classList.add('hit'); }, 600);

    $('#a-share').hidden = !mine;
    $('#a-copy-hint').textContent = '';
    $('#a-note').textContent = mine
      ? '사과한 사람에게 이 링크를 보내면 수리증이 전달됩니다.'
      : '이 건은 종결되었습니다. 수리증을 인쇄해 두셔도 됩니다.';

    if (mine) $('#a-link').value = Share.link({ a: Share.encode(acc) });

    showScreen('screen-cert', mine ? '수리증 발급 완료.' : '사과가 수리되었습니다.');
    if (!mine) appleRain(4200);
  }

  function initCertScreen() {
    bindCopy('#a-link', '#a-copy', '#a-copy-hint');
    $('#a-print').addEventListener('click', function () { window.print(); });
    $('#a-new').addEventListener('click', function () {
      try { history.replaceState(null, '', Share.link({})); } catch (e) {}
      showScreen('screen-write');
    });
  }

  /* ── 사과비 ─────────────────────────────── */

  function drawApple(ctx, x, y, r, gold) {
    ctx.save();
    ctx.translate(x, y);
    var g = ctx.createRadialGradient(-r * .35, -r * .4, r * .2, 0, 0, r);
    if (gold) { g.addColorStop(0, '#ffd76a'); g.addColorStop(1, '#e09400'); }
    else { g.addColorStop(0, '#ff6369'); g.addColorStop(1, '#b5252b'); }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -r * .55);
    ctx.bezierCurveTo(r * 1.15, -r * 1.25, r * 1.3, r * .75, 0, r);
    ctx.bezierCurveTo(-r * 1.3, r * .75, -r * 1.15, -r * 1.25, 0, -r * .55);
    ctx.fill();
    ctx.strokeStyle = '#5a4632';
    ctx.lineWidth = Math.max(1.4, r * .14);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -r * .68); ctx.lineTo(r * .18, -r * 1.22); ctx.stroke();
    ctx.fillStyle = '#30a46c';
    ctx.beginPath(); ctx.ellipse(r * .55, -r * 1.02, r * .42, r * .2, -.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /** 수리증을 받은 쪽 화면에만 사과를 뿌린다. */
  function appleRain(ms) {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var cv = document.createElement('canvas');
    cv.className = 'rain';
    cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);

    var ctx = cv.getContext('2d');
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = 0, h = 0;
    function fit() {
      w = window.innerWidth; h = window.innerHeight;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    fit();
    window.addEventListener('resize', fit);

    var drops = [];
    for (var i = 0; i < 34; i++) {
      drops.push({
        x: Math.random() * w, y: -Math.random() * h * 1.2,
        r: 6 + Math.random() * 6, vy: 95 + Math.random() * 150,
        sway: Math.random() * 6.28, spin: .7 + Math.random() * 1.6,
        gold: Math.random() < .14
      });
    }

    var start = 0, last = 0;
    function frame(now) {
      if (!start) { start = now; last = now; }
      var dt = Math.min(.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = .82;                    // 글씨를 덮지 않게
      for (var i = 0; i < drops.length; i++) {
        var p = drops[i];
        p.y += p.vy * dt;
        p.sway += dt * p.spin * 2;
        if (p.y - p.r * 1.4 > h) { p.y = -p.r * 2; p.x = Math.random() * w; }
        drawApple(ctx, p.x + Math.sin(p.sway) * 14, p.y, p.r, p.gold);
      }
      if (now - start < ms) {
        requestAnimationFrame(frame);
      } else {
        window.removeEventListener('resize', fit);
        cv.style.opacity = '0';
        setTimeout(function () { if (cv.parentNode) cv.parentNode.removeChild(cv); }, 750);
      }
    }
    requestAnimationFrame(frame);
  }

  /* ── 진입 ───────────────────────────────────────────── */

  function boot() {
    initWriteScreen();
    initDemandScreen();
    initVerdictScreen();
    initReceiptScreen();
    initSealScreen();
    initCertScreen();

    var acc = Share.decode(Share.param('a'));
    if (acc && acc.to && acc.aat) { openCert(acc, false); return; }

    var rec = Share.decode(Share.param('r'));
    if (rec && rec.to) { openReceipt(rec); return; }

    var demand = Share.decode(Share.param('d'));
    if (demand && demand.to && demand.what) { openDemand(demand); return; }

    showScreen('screen-write');
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
