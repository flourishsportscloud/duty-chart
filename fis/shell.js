/* FIS shell: shared reliability layer for every FIS staff app (ES5, no dependencies).
   Loaded first in <head>. Does not change features or data. */
(function (w, d) {
  'use strict';
  if (w.FIS && w.FIS._v) return;
  var FIS = w.FIS = { _v: 3, pending: 0 };
  var lastTouch = 0, overlays = 0, ownsHistory = false, bar;
  var OVERLAY = '.sheet,.modal,.dlg,.drawer,.overlay,.sheet-bg,[role=dialog]';
  function ls(f) { try { return f(); } catch (e) { return undefined; } }

  /* ---- 0. detect apps that manage history themselves (leave them alone) ---- */
  var oAdd = w.addEventListener;
  w.addEventListener = function (t) { if (t === 'popstate' || t === 'hashchange') ownsHistory = true; return oAdd.apply(this, arguments); };
  var oPush = history.pushState;
  history.pushState = function () { if (!FIS._own) ownsHistory = true; return oPush.apply(this, arguments); };

  /* ---- 1. touch: no pull-to-refresh, no long-press menus on buttons/tiles ---- */
  var css = d.createElement('style');
  css.textContent =
    'html,body{overscroll-behavior-y:none}' +
    '.sheet,.modal,.dlg,.drawer,.panel,[class*=scroll]{overscroll-behavior:contain}' +
    'button,.btn,[role=button],.tab,.tile,.chip,.fchip,.card,.lc,nav a,summary,label.opt,.seg label{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation}' +
    'input,textarea,select,[contenteditable],[contenteditable] *{-webkit-user-select:text;user-select:text;-webkit-touch-callout:default}' +
    '#fis-bar{position:fixed;left:0;right:0;top:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;padding:4px 8px;font:600 13px/1.3 system-ui,sans-serif}' +
    '#fis-bar>div{pointer-events:auto;max-width:520px;width:100%;padding:8px 12px;border-radius:10px;color:#fff;box-shadow:0 2px 10px rgba(0,0,0,.3);text-align:center}' +
    '#fis-bar .off{background:#8a5a00}#fis-bar .err{background:#a32a22}#fis-bar .new{background:#1E3560;cursor:pointer}#fis-bar .pend{background:#355c9a}#fis-bar .info{background:#2d3a4d}';
  (d.head || d.documentElement).appendChild(css);
  var SEL = 'button,.btn,[role=button],.tab,.tile,.chip,.fchip,.card,.lc,nav a,summary';
  function editable(t) { return t && t.closest && t.closest('input,textarea,select,[contenteditable]'); }
  d.addEventListener('contextmenu', function (e) {
    if (editable(e.target)) return;
    if (e.target.closest && e.target.closest(SEL)) e.preventDefault();
  }, true);
  ['touchstart', 'touchmove', 'pointerdown', 'keydown', 'input'].forEach(function (n) {
    d.addEventListener(n, function () { lastTouch = Date.now(); }, { passive: true, capture: true });
  });

  /* ---- status bar (offline / pending / errors / new version) ---- */
  function ensureBar() {
    if (bar && bar.parentNode) return bar;
    bar = d.createElement('div'); bar.id = 'fis-bar';
    (d.body || d.documentElement).appendChild(bar); return bar;
  }
  function note(cls, text, key, ms, onTap) {
    var b = ensureBar(), old = key && b.querySelector('[data-k="' + key + '"]');
    if (old) { old.textContent = text; return old; }
    var n = d.createElement('div'); n.className = cls; n.textContent = text; if (key) n.setAttribute('data-k', key);
    if (onTap) n.onclick = onTap;
    b.appendChild(n); if (ms) setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, ms); return n;
  }
  function drop(key) { var n = bar && bar.querySelector('[data-k="' + key + '"]'); if (n && n.parentNode) n.parentNode.removeChild(n); }
  FIS.note = note;
  function net() { if (navigator.onLine === false) note('off', 'Offline. Your changes will wait on this phone and send when the internet is back.', 'off'); else drop('off'); }
  w.addEventListener('online', net); w.addEventListener('offline', net);
  d.addEventListener('DOMContentLoaded', net);
  FIS.setPending = function (n) {
    FIS.pending = n | 0;
    if (FIS.pending > 0) note('pend', FIS.pending + (FIS.pending === 1 ? ' change' : ' changes') + ' waiting to send', 'pend'); else drop('pend');
  };
  FIS.dirty = function () { return FIS.pending > 0; };
  w.addEventListener('beforeunload', function (e) { if (FIS.dirty()) { e.preventDefault(); e.returnValue = ''; return ''; } });

  /* ---- 2. global error handler + storage warnings ---- */
  var lastErr = 0;
  function logErr(kind, msg, src) {
    ls(function () {
      var a = JSON.parse(localStorage.getItem('fis_errlog') || '[]'); a.push({ t: new Date().toISOString(), k: kind, m: String(msg).slice(0, 300), s: String(src || '').slice(0, 120), u: location.pathname });
      localStorage.setItem('fis_errlog', JSON.stringify(a.slice(-30)));
    });
  }
  function friendly(kind, msg, src) {
    logErr(kind, msg, src);
    var now = Date.now(); if (now - lastErr < 10000) return; lastErr = now;
    note('err', 'Something went wrong. Your saved data is safe. Tap to reload.', 'err', 8000, function () { location.reload(); });
  }
  w.addEventListener('error', function (e) {
    var m = e && e.message || ''; if (/ResizeObserver|^Script error\.?$/.test(m) && !e.filename) return; if (m === 'Script error.') return;
    friendly('error', m, e.filename + ':' + e.lineno);
  });
  w.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason, m = r && (r.message || r) || 'rejection'; if (/Failed to fetch|NetworkError|Load failed/i.test(String(m))) { logErr('net', m); return; }
    friendly('promise', m, '');
  });
  var sProto = w.Storage && Storage.prototype, oSet = sProto && sProto.setItem, oRem = sProto && sProto.removeItem;
  var SESSION_KEY = /tok|token|(^|[-_])me$|key$|_me$/i;
  if (sProto) {
    sProto.setItem = function (k, v) {
      try { oSet.call(this, k, v); }
      catch (e) {
        if (e && (e.name === 'QuotaExceededError' || e.code === 22)) note('err', 'Phone storage is full. Free some space, or changes cannot be kept on this phone.', 'quota', 12000);
        throw e;
      }
      if (this === w.localStorage && SESSION_KEY.test(k) && String(v).length < 2048) idb('put', k, String(v));
    };
    sProto.removeItem = function (k) { oRem.call(this, k); if (this === w.localStorage && SESSION_KEY.test(k)) idb('del', k); };
  }

  /* ---- 3. keep the login: ask the phone not to evict storage, mirror session keys to IndexedDB ---- */
  ls(function () { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); });
  var DBN = 'fis-session-' + location.pathname.split('/').slice(0, 3).join('/');
  function idb(op, k, v, cb) {
    try {
      var rq = indexedDB.open(DBN, 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('kv'); };
      rq.onerror = function () { cb && cb(); };
      rq.onsuccess = function () {
        var db = rq.result, tx = db.transaction('kv', op === 'all' ? 'readonly' : 'readwrite'), st = tx.objectStore('kv');
        if (op === 'put') st.put(v, k); else if (op === 'del') st.delete(k);
        else if (op === 'all') { var o = {}, c = st.openCursor(); c.onsuccess = function () { var x = c.result; if (x) { o[x.key] = x.value; x.continue(); } else cb && cb(o); }; }
        tx.oncomplete = function () { db.close(); }; tx.onerror = function () { db.close(); cb && cb(); };
      };
    } catch (e) { cb && cb(); }
  }
  (function restore() {
    if (!w.indexedDB) return;
    idb('all', 0, 0, function (o) {
      if (!o) return; var n = 0;
      Object.keys(o).forEach(function (k) { if (ls(function () { return localStorage.getItem(k); }) === null) { ls(function () { oSet.call(localStorage, k, o[k]); n++; }); } });
      if (n && !ls(function () { return sessionStorage.getItem('fis_restored'); })) { ls(function () { sessionStorage.setItem('fis_restored', '1'); }); location.reload(); }
    });
  })();

  /* ---- 4. no surprise refresh: hold timers while the user is touching, typing or has a popup open ---- */
  var oInt = w.setInterval;
  function busy() {
    var a = d.activeElement;
    return (Date.now() - lastTouch < 4000) || (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || (a && a.isContentEditable)) || overlays > 0;
  }
  w.setInterval = function (fn, ms) {
    if (typeof fn !== 'function' || !(ms >= 8000)) return oInt.apply(w, arguments);
    var extra = Array.prototype.slice.call(arguments, 2), waiting = false;
    return oInt.call(w, function () {
      if (d.hidden) return;
      if (busy()) { if (waiting) return; waiting = true; (function wait() { setTimeout(function () { if (d.hidden) { waiting = false; return; } if (busy()) wait(); else { waiting = false; try { fn.apply(w, extra); } catch (e) { friendly('timer', e && e.message, ''); } } }, 1500); })(); return; }
      fn.apply(w, extra);
    }, ms);
  };
  /* new version: show a banner, reload only when the user taps (never mid-edit) */
  FIS.newVersion = function (url) { note('new', 'New version ready. Tap to refresh.', 'ver', 0, function () { if (url) location.replace(url); else location.reload(); }); };

  /* ---- 5. phone Back: one popup at a time, and "press back again" at home ---- */
  function visible(el) { var r = el.getBoundingClientRect(); if (!r.width || !r.height) return false; var s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0'; }
  function openOverlays() { var out = []; [].forEach.call(d.querySelectorAll(OVERLAY), function (el) { if (!el.closest('#fis-bar') && visible(el) && getComputedStyle(el).position !== 'static' && (el.getBoundingClientRect().height > 80)) out.push(el); }); return out; }
  function closeTop() {
    var list = openOverlays(); if (!list.length) return false; var el = list[list.length - 1];
    var b = el.querySelector('[data-close],[data-x],.close,.x,[aria-label="Close"],[aria-label="Back"],#close');
    if (!b) { [].some.call(el.querySelectorAll('button,[role=button]'), function (c) { if (/^\s*(close|cancel|back|done|×|✕|x)\s*$/i.test(c.textContent)) { b = c; return true; } }); }
    if (b) { b.click(); return true; } return false;
  }
  var pushedFor = 0, exitArmed = false, scanT;
  function scan() {
    if (ownsHistory) return; var n = openOverlays().length;
    if (n > overlays) { for (var i = overlays; i < n; i++) { FIS._own = 1; oPush.call(history, { fisOv: 1 }, ''); FIS._own = 0; pushedFor++; } }
    else if (n < overlays && pushedFor > 0 && !FIS._popping) { var k = overlays - n; pushedFor -= k; FIS._popping = 1; history.go(-k); setTimeout(function () { FIS._popping = 0; }, 400); }
    overlays = n;
  }
  function queueScan() { clearTimeout(scanT); scanT = setTimeout(scan, 60); }
  d.addEventListener('DOMContentLoaded', function () {
    new MutationObserver(queueScan).observe(d.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'] });
    setTimeout(function () { if (ownsHistory) return; ls(function () { history.replaceState({ fisBase: 1 }, ''); FIS._own = 1; oPush.call(history, { fisHome: 1 }, ''); FIS._own = 0; }); }, 400);
  });
  oAdd.call(w, 'popstate', function (e) {
    if (ownsHistory) return;
    if (FIS._popping) return;
    if (overlays > 0 && pushedFor > 0) { FIS._popping = 1; pushedFor--; closeTop(); setTimeout(function () { FIS._popping = 0; scan(); }, 150); return; }
    var st = e.state || {};
    if (st.fisBase) {
      if (exitArmed) { exitArmed = false; history.back(); return; }
      exitArmed = true; note('info', 'Press back again to exit', 'exit', 2500); setTimeout(function () { exitArmed = false; }, 2500);
      FIS._own = 1; oPush.call(history, { fisHome: 1 }, ''); FIS._own = 0;
    }
  });

  /* ---- 6. service worker: versioned app-shell cache, network first ---- */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    var me = d.currentScript && d.currentScript.src;
    if (me) {
      var swUrl = new URL('../sw.js', me).href;
      navigator.serviceWorker.register(swUrl).then(function (reg) {
        function swTap(r) { note('new', 'New version ready. Tap to refresh.', 'ver', 0, function () { var w2 = r.waiting; if (w2) { navigator.serviceWorker.addEventListener('controllerchange', function () { location.reload(); }); w2.postMessage('SKIP_WAITING'); setTimeout(function () { location.reload(); }, 1500); } else location.reload(); }); }
        function watch(sw) { sw.addEventListener('statechange', function () { if (sw.state === 'installed' && navigator.serviceWorker.controller) swTap(reg); }); }
        if (reg.waiting && navigator.serviceWorker.controller) swTap(reg);
        reg.addEventListener('updatefound', function () { if (reg.installing) watch(reg.installing); });
        var had = !!navigator.serviceWorker.controller;
                d.addEventListener('visibilitychange', function () { if (!d.hidden) reg.update().catch(function () {}); });
      }).catch(function () {});
    }
  }
})(window, document);
