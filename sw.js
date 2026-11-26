/* FIS service worker: versioned shell cache, network first for pages and scripts, cache fallback offline.
   Never touches cross-origin requests (Google Apps Script data goes straight to the network). */
var V = 'fis-shell-v3';
self.addEventListener('install', function () { /* wait: new version activates when the user taps the banner */ });
self.addEventListener('message', function (e) { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('fis-shell-') === 0 && k !== V; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
function netFirst(req) {
  return new Promise(function (res) {
    var done = false, t = setTimeout(function () { caches.match(req, { ignoreSearch: true }).then(function (c) { if (c && !done) { done = true; res(c); } }); }, 4000);
    fetch(req).then(function (r) {
      clearTimeout(t); if (r && r.ok) { var cp = r.clone(); caches.open(V).then(function (c) { c.put(req, cp); }); }
      if (!done) { done = true; res(r); }
    }).catch(function () { clearTimeout(t); caches.match(req, { ignoreSearch: true }).then(function (c) { if (!done) { done = true; res(c || Response.error()); } }); });
  });
}
self.addEventListener('fetch', function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (/\.(png|jpe?g|webp|svg|woff2?|ico)$/i.test(u.pathname)) {
    e.respondWith(caches.match(r).then(function (c) { return c || fetch(r).then(function (n) { var cp = n.clone(); caches.open(V).then(function (x) { x.put(r, cp); }); return n; }); })); return;
  }
  e.respondWith(netFirst(r));
});
