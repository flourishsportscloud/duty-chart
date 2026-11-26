/* Lost and Found Desk: app shell cache. Bump V on every release so phones pick up the new version. */
var V = "lf-2026-11-26a", SHELL = ["./", "index.html", "fis-logo.jpeg"];
self.addEventListener("install", function (e) { e.waitUntil(caches.open(V).then(function (c) { return c.addAll(SHELL); }).catch(function () {})); });
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== V; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("message", function (e) { if (e.data === "skip") self.skipWaiting(); });
/* network first (fresh code and fonts when online), cached copy after 6 s or when offline; data calls go straight to the network */
self.addEventListener("fetch", function (e) {
  var r = e.request; if (r.method !== "GET") return;
  var u = new URL(r.url); if (u.origin !== location.origin) return;
  e.respondWith(new Promise(function (ok, no) {
    var done = false;
    var t = setTimeout(function () { caches.match(r).then(function (m) { if (m && !done) { done = true; ok(m); } }); }, 6000);
    fetch(r).then(function (res) {
      clearTimeout(t); if (!done) { done = true; ok(res); }
      if (res && res.ok) { var cp = res.clone(); caches.open(V).then(function (c) { c.put(r, cp); }); }
    }, function () {
      clearTimeout(t);
      caches.match(r).then(function (m) { return m || caches.match("index.html"); }).then(function (m) { if (!done) { done = true; m ? ok(m) : no(); } });
    });
  }));
});
