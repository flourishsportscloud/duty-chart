/* FIS Co-Curricular Desk: offline app shell. Data calls (Apps Script) are never cached here. */
const V='fis-cc-shell-20261126155831';
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(['./','index.html','seed.txt'])).catch(()=>{}))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V&&k.indexOf('fis-cc-shell-')===0).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('message',e=>{if(e.data==='skip')self.skipWaiting()});
self.addEventListener('fetch',e=>{
 const r=e.request;if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
 e.respondWith(new Promise(ok=>{
  let done=false;const fromCache=()=>caches.match(r,{ignoreSearch:true}).then(m=>{if(!done){done=true;ok(m||Response.error())}});
  const t=setTimeout(fromCache,6000);
  fetch(r).then(n=>{clearTimeout(t);if(done)return;done=true;const cp=n.clone();caches.open(V).then(c=>c.put(r,cp)).catch(()=>{});ok(n)}).catch(()=>{clearTimeout(t);fromCache()});
 }));
});
