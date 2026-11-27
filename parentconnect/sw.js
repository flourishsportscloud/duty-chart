/* Parent Connect service worker: keeps the app opening when the connection is poor. Network first, so staff always get the newest page when online. */
const V='pc-202611271022';
const SHELL=['./','./index.html','./manifest.webmanifest','../fis/fis-logo-192.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL).catch(()=>{})))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('message',e=>{if(e.data==='skip')self.skipWaiting()});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);if(u.origin!==location.origin)return;
  e.respondWith(fetch(r).then(res=>{if(res&&res.ok){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp)).catch(()=>{})}return res})
    .catch(()=>caches.match(r).then(m=>m||caches.match('./index.html'))));
});
