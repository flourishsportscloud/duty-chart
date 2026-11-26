/* App-shell cache. Bump VERSION when this file changes. Data calls (script.google.com) are never cached. */
var VERSION = 'dmr-v3';
var SHELL = ['./', './index.html', '../fis/fis-icon-192.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('message', function (e) { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;       // data and fonts go straight to the network
  e.respondWith(fetch(r).then(function (res) {                          // network first, so nobody runs stale code
    if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(r, copy); }); }
    return res;
  }).catch(function () { return caches.match(r).then(function (m) { return m || caches.match('./index.html'); }); }));
});
