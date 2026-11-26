/* PM Reports app shell. Network first, so nobody runs stale code; the cached copy is used only when offline.
   Data calls (script.google.com) and fonts are never cached here. Bump VERSION when index.html changes. */
var VERSION = 'pm-v1';
var SHELL = ['./', './index.html', '../fis/fis-logo-192.png', '../fis/fis-icon-192.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).catch(function () {}));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf('pm-') === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('message', function (e) { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.indexOf('/pm/') < 0 && u.pathname.indexOf('/fis/fis-') < 0) return;
  e.respondWith(fetch(r).then(function (res) {
    if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(r, copy); }); }
    return res;
  }).catch(function () { return caches.match(r, { ignoreSearch: true }).then(function (m) { return m || caches.match('./index.html'); }); }));
});
