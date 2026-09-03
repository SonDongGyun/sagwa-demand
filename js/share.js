/* ============================================================
   share.js — URL 하나에 요구서/결과를 통째로 담는다.
   서버가 없으므로 상태는 base64url(JSON) 로 인코딩해 쿼리에 싣는다.
   ============================================================ */
(function (global) {
  'use strict';

  function toBase64Url(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(str) {
    var b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    b64 += '='.repeat((4 - (b64.length % 4)) % 4);
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function encode(obj) {
    try {
      return toBase64Url(JSON.stringify(obj));
    } catch (e) {
      return '';
    }
  }

  function decode(token) {
    if (!token) return null;
    try {
      var obj = JSON.parse(fromBase64Url(token));
      return obj && typeof obj === 'object' ? obj : null;
    } catch (e) {
      return null;
    }
  }

  /** 현재 페이지 기준 공유 링크. params 예: { d: '...' } */
  function link(params) {
    var base = location.origin === 'null'
      ? location.href.split('?')[0].split('#')[0]   // file:// 로 열었을 때
      : location.origin + location.pathname;
    var qs = new URLSearchParams(params).toString();
    return base + (qs ? '?' + qs : '');
  }

  function param(name) {
    return new URLSearchParams(location.search).get(name);
  }

  /** 클립보드 복사. execCommand 로 폴백. */
  function copy(text) {
    if (navigator.clipboard && global.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(fallback);
    }
    return fallback();

    function fallback() {
      return new Promise(function (resolve, reject) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('copy failed'));
      });
    }
  }

  global.Share = { encode: encode, decode: decode, link: link, param: param, copy: copy };
})(window);
