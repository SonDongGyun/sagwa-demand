/* ============================================================
   store.js — 서버가 있으면 사건을 남기고, 없으면 조용히 물러난다.

   모든 함수는 실패하면 null 을 돌려준다. 부르는 쪽은 그때 URL 토큰으로
   돌아가면 된다. 서버가 죽어도 앱은 죽지 않는다.
   ============================================================ */
(function (global) {
  'use strict';

  var KEEPER_KEY = 'sagwa.keeper';
  var CODE_RE = /^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/;
  var ready = null;

  /** 이 기기의 사건철 키. 서버엔 sha256 만 간다. 지우면 사건철도 잃는다. */
  function keeper() {
    var k = null;
    try { k = localStorage.getItem(KEEPER_KEY); } catch (e) {}
    if (k) return k;
    k = (global.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 14);
    try { localStorage.setItem(KEEPER_KEY, k); } catch (e) {}
    return k;
  }

  function call(path, method, body) {
    return fetch('/api/' + path, {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json', 'x-sagwa-keeper': keeper() },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().then(function (j) { return { status: r.status, body: j }; },
                           function () { return { status: r.status, body: null }; });
    });
  }

  /** 서버와 DB 가 둘 다 살아 있나. 한 번만 묻고 결과를 들고 있는다. */
  function available() {
    if (!ready) {
      ready = call('health').then(function (r) {
        return !!(r.body && r.body.db);
      }).catch(function () { return false; });
    }
    return ready;
  }

  /** 성공한 사건 상태만 통과시키고, 나머지는 전부 null 로 눕힌다. */
  function pass(r) {
    return (r && r.status === 200 && r.body && r.body.ok) ? r.body : null;
  }
  var nope = function () { return null; };

  global.Store = {
    isCode: function (s) { return typeof s === 'string' && CODE_RE.test(s); },
    keeper: keeper,
    available: available,

    createCase: function (d) {
      return call('case', 'POST', {
        to: d.to, from: d.from, what: d.what, anger: d.anger, terms: d.terms
      }).then(function (r) {
        return (r.status === 200 && r.body && r.body.c) ? r.body.c : null;
      }).catch(nope);
    },

    get: function (code) {
      return call('case?c=' + encodeURIComponent(code)).then(pass).catch(nope);
    },

    saveVerdict: function (code, v) {
      return call('verdict', 'POST', {
        c: code, s: v.score, b: v.bow, t: v.dict, cc: v.cat, p: v.penalty, grade: v.grade
      }).then(pass).catch(nope);
    },

    settle: function (code, word) {
      return call('settle', 'POST', { c: code, w: word || '' }).then(pass).catch(nope);
    },

    voidSeal: function (code, reason) {
      return call('void', 'POST', { c: code, reason: reason || '' }).then(pass).catch(nope);
    },

    casefile: function () {
      return call('casefile').then(function (r) {
        return (r.status === 200 && r.body && r.body.ok) ? r.body.cases : [];
      }).catch(function () { return []; });
    }
  };
})(window);
