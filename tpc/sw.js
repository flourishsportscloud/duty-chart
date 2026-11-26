/* FIS Teacher Preparation and Checking – app shell cache. Pages: network first (so nobody runs old code), saved copy when offline. Data requests are never touched. */
const CACHE='tpc-shell-v1';
self.addEventListener('install',e=>{ self.skipWaiting(); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.indexOf('tpc-shell-')===0&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch',e=>{ const r=e.request, u=new URL(r.url); if(r.method!=='GET'||u.origin!==self.location.origin) return;
  e.respondWith(new Promise(res=>{ let done=false; const fall=()=>caches.match(r,{ignoreSearch:true}).then(c=>{ if(!done){ done=true; res(c||fetch(r)); } });
    const t=setTimeout(fall,6000);
    fetch(r).then(resp=>{ clearTimeout(t); if(resp&&resp.ok){ const copy=resp.clone(); caches.open(CACHE).then(c=>c.put(r,copy)).catch(()=>{}); } if(!done){ done=true; res(resp); } }).catch(()=>{ clearTimeout(t); fall(); }); })); });
