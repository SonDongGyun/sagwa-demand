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

  function ellipsis(s, n) {
    var a = Array.from(s);
    return a.length > n ? a.slice(0, n).join('') + '…' : s;
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

      var sentence = '저 ' + josa(d.to, ['은', '는']) + ' "' + ellipsis(d.what, 34)
                   + '" 에 대하여 ' + d.from + '에게 진심으로 사과합니다. 다시는 같은 일이 없도록 하겠습니다.';
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
    showScreen('screen-receipt', '심사 결과 도착.');
  }

  function initReceiptScreen() {
    $('#r-accept').addEventListener('click', function () {
      $('#r-msg').textContent = '사과가 접수되었습니다. 이 건은 여기서 종결합니다. 🍎';
    });
    $('#r-reject').addEventListener('click', function () {
      $('#r-msg').textContent = '재심이 청구되었습니다. 상대에게 링크를 다시 보내세요.';
    });
  }

  /* ── 진입 ───────────────────────────────────────────── */

  function boot() {
    initWriteScreen();
    initDemandScreen();
    initVerdictScreen();
    initReceiptScreen();

    var rec = Share.decode(Share.param('r'));
    if (rec && rec.to) { openReceipt(rec); return; }

    var demand = Share.decode(Share.param('d'));
    if (demand && demand.to && demand.what) { openDemand(demand); return; }

    showScreen('screen-write');
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
