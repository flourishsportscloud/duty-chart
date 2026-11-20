
const VEH = window.FIS_R.veh;
const WALK = window.FIS_R.walk;
const STAFF = ["Juhi Ma'am","Priyanka S Ma'am","Mansi Ma'am","Komal Ma'am","Bhagyashree Ma'am","Ram Sir","Chandan Sir","Rashmi Ma'am","Renuka Ma'am","Vijay Sir","Yashika Ma'am","Saurabh & Anoop","Unallocated"];
const RANGES=[[1,3,0],[4,6,1],[7,9,2],[10,12,3],[13,15,4],[16,18,5],[19,22,6],[23,26,7],[27,30,8],[31,34,9],[35,38,10]];
function defaultStaff(v){
  if(v.t==='Auto') return "Saurabh & Anoop";
  if(v.t==='Pre-Primary') return "Unallocated";
  const n=+v.k.replace(/\D/g,''); const r=RANGES.find(r=>n>=r[0]&&n<=r[1]); return r?STAFF[r[2]]:"Unallocated";
}
// Students who have left (TC): hidden everywhere. Default list used until the Settings list is first saved.
const LEFT_DEFAULT={'B9-21':{name:'Medhansh Singh Dev',cls:'Sixth - A',v:'B9',note:'TC'}};
const ALLKIDS={};VEH.concat(WALK).forEach(v=>v.kids.forEach(k=>ALLKIDS[v.k+'-'+k[0]]={k:v.k,kid:k,l:v.l}));
function applyLeft(left){let ch=false;VEH.concat(WALK).forEach(v=>{const keep=v.kids.filter(k=>!left[v.k+'-'+k[0]]);if(keep.length!==v.kids.length){v.kids=keep;ch=true}});
  Object.keys(left).forEach(id=>{if(KID[id]){delete KID[id];ch=true}});return ch}
const VBY={}; VEH.concat(WALK).forEach(v=>VBY[v.k]=v);
const KID={}; // id -> {id,n,name,cls,v}
VEH.forEach(v=>v.kids.forEach(k=>{const id=v.k+'-'+k[0];KID[id]={id,n:k[0],name:k[1],cls:k[2],v:v.k}}));
WALK.forEach(v=>v.kids.forEach(k=>{const id=v.k+'-'+k[0];KID[id]={id,n:k[0],name:k[1],cls:k[2],v:v.k,walk:true}}));
let LEFT=Object.assign({},LEFT_DEFAULT);applyLeft(LEFT);
const CLS_ORDER=['P.G.','Nursery','L.KG.','U.KG.','First','Second','Third','Fourth','Fifth','Sixth','Seventh','Eighth','Ninth','Tenth','Eleventh','Twelfth'];
function clsKey(c){const [g,s]=c.split(' - ');return [CLS_ORDER.indexOf(g),s||'']}
const CLASSES=[...new Set(Object.values(KID).map(k=>k.cls))].sort((a,b)=>{const x=clsKey(a),y=clsKey(b);return x[0]-y[0]||x[1].localeCompare(y[1])});
const seg=s=>s.replace(/[^A-Za-z0-9]/g,'_');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.getElementById(id);
function toast(t){const e=$('toast');e.textContent=t;e.classList.add('on');clearTimeout(toast.h);toast.h=setTimeout(()=>e.classList.remove('on'),1800)}
const nowHM=()=>{const d=new Date();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')};
const hm12=hm=>{if(!hm)return '';const [h,m]=hm.split(':').map(Number);return ((h%12)||12)+':'+String(m).padStart(2,'0')+(h<12?' am':' pm')};
const to24=s=>{if(!s)return '';const m=String(s).match(/(\d+):(\d+)\s*(am|pm)?/i);if(!m)return '';let h=+m[1];if(m[3]){const pm=m[3].toLowerCase()==='pm';if(pm&&h<12)h+=12;if(!pm&&h===12)h=0}return String(h).padStart(2,'0')+':'+m[2]};
const nowT=()=>new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
function todayStr(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
const LS={get(k,d){try{const v=localStorage.getItem('fisTA:'+k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem('fisTA:'+k,JSON.stringify(v))}catch(e){}}};

/* ---------- store: shared db, or device-only fallback ---------- */
let DB=null, LOCAL=false;
const local={data:LS.get('local',{}),subs:[]};
function localSave(){LS.set('local',local.data)}
function localNotify(){local.subs.forEach(s=>s.fire())}
const store={
  subCol(path,cb){
    if(DB){let t=setTimeout(()=>setSync('Slow network – data may be out of date','warn'),10000);
      return DB.collection(path).onSnapshot(s=>{if(!s.metadata.fromCache){clearTimeout(t);setSync('Live ✓')}const o={};s.docs.forEach(d=>o[d.id]=d.data());cb(o)},e=>{clearTimeout(t);setSync('Sync error')});}
    const sub={fire(){const o={};const pre=path+'/';Object.keys(local.data).forEach(p=>{if(p.startsWith(pre)&&!p.slice(pre.length).includes('/'))o[p.slice(pre.length)]=local.data[p]});cb(o)}};
    local.subs.push(sub);sub.fire();return()=>{local.subs=local.subs.filter(x=>x!==sub)};
  },
  async getCol(path){
    if(DB){try{const s=await DB.collection(path).get();const o={};s.docs.forEach(d=>o[d.id]=d.data());return o}catch(e){return {}}}
    const o={};const pre=path+'/';Object.keys(local.data).forEach(p=>{if(p.startsWith(pre)&&!p.slice(pre.length).includes('/'))o[p.slice(pre.length)]=local.data[p]});return o;
  },
  subDoc(path,cb){
    if(DB){return DB.doc(path).onSnapshot(s=>cb(s.exists?s.data():null),()=>{});}
    const sub={fire(){cb(local.data[path]||null)}};local.subs.push(sub);sub.fire();return()=>{local.subs=local.subs.filter(x=>x!==sub)};
  },
  // per-doc write queue: one write at a time per doc
  q:{},
  async set(path,data){
    if(!DB){local.data[path]=JSON.parse(JSON.stringify(data));localSave();localNotify();return}
    const prev=this.q[path]||Promise.resolve();
    const p=prev.catch(()=>{}).then(()=>DB.doc(path).set(data)).catch(e=>{
      if(e&&e.code==='invalid_argument'){toast('You do not have permission to save. Ask the Director for Contributor access.')}
      else if(e&&e.code==='unavailable'){return new Promise(r=>setTimeout(r,800+Math.random()*800)).then(()=>DB.doc(path).set(data))}
      else toast('Save failed – try again');
    });
    this.q[path]=p;return p;
  },
  prefetch(dates){return DB&&DB.prefetch?DB.prefetch(dates):Promise.resolve()},
  async del(path){if(!DB){delete local.data[path];localSave();localNotify();return}return DB.doc(path).delete().catch(()=>toast('Delete failed'))}
};
function setSync(t){ $('sync').textContent=t }

/* ---------- Google Sheet store (FIS hub): same interface as the shared db ---------- */
const GAS=(()=>{
  const call=window.FIS_CALL;
  const dayOf=p=>p.startsWith('config/')?'config':p.split('/')[1];
  const keep=()=>new Set(['config',S.date,todayStr()]);
  let cache=LS.get('gcache',{}),rev=LS.get('grev',0),outbox=LS.get('goutbox',[]);
  if(LS.get('gver',0)!==2){cache={};rev=0;LS.set('gver',2)}   // v2: reload everything once after the date-matching fix
  const loaded=new Set(rev?Object.keys(cache).map(dayOf).concat(['config']):[]);
  const subs=new Set(),dayP={};let busy=false,state='',lastErr='';
  function persist(){const k=keep(),c={};Object.keys(cache).forEach(p=>{if(k.has(dayOf(p)))c[p]=cache[p]});LS.set('gcache',c);LS.set('grev',rev);LS.set('goutbox',outbox)}
  function status(s){if(s===state)return;state=s;setSync(s);const b=$('localBanner');if(b)b.classList.toggle('hide',!/^Offline/.test(s))}
  function pending(p){return outbox.some(o=>o.p===p)}
  function apply(docs){let ch=false;(docs||[]).forEach(d=>{if(pending(d.p))return;if(d.del){if(d.p in cache){delete cache[d.p];ch=true}}else{cache[d.p]=d.j;ch=true}});return ch}
  function fireAll(){subs.forEach(s=>s.fire())}
  function colSnap(path){const pre=path+'/',docs=[];Object.keys(cache).forEach(p=>{if(p.startsWith(pre)&&!p.slice(pre.length).includes('/')){const v=cache[p];docs.push({id:p.slice(pre.length),data:()=>JSON.parse(JSON.stringify(v))})}});
    return {metadata:{fromCache:!loaded.has(dayOf(pre))},docs}}
  function ensure(days){const need=[...new Set(days)].filter(d=>d!=='config'&&!loaded.has(d)&&!dayP[d]);
    if(need.length||(!loaded.has('config')&&!dayP.config)){
      const p=call('days',[need]).then(r=>{rev=rev?Math.min(rev,r.rev):r.rev;apply(r.docs);loaded.add('config');need.forEach(d=>loaded.add(d));persist();fireAll();status(outbox.length?'Saving…':'Live ✓')})
        .catch(e=>{status(e.net?'Offline – saved on this phone':'Sync error');throw e}).finally(()=>{need.forEach(d=>delete dayP[d]);if(!need.length)delete dayP.config});
      need.forEach(d=>dayP[d]=p);if(!need.length)dayP.config=p;}
    return Promise.all([...new Set(days)].map(d=>dayP[d]||dayP.config).filter(Boolean)).catch(()=>{});}
  async function flush(){
    while(outbox.length){const o=outbox[0];status('Saving…');
      try{await call(o.op,o.op==='set'?[o.p,o.v]:[o.p])}
      catch(e){if(e.net){status('Offline – saved on this phone');return false}if(e.message!==lastErr){lastErr=e.message;toast('Not saved: '+e.message)}}
      outbox.shift();persist();}
    return true;}
  async function pull(){if(busy)return;busy=true;
    try{if(!(await flush()))return;
      const days=[...loaded].filter(d=>d!=='config').sort().slice(-40);
      const r=await call('sync',[rev,days]);
      if(r.rev<rev){cache={};loaded.clear();rev=0;persist();busy=false;await ensure([...keep()]);return}
      rev=r.rev;if(apply(r.docs))fireAll();persist();status('Live ✓');
    }catch(e){status(e.net?'Offline – saved on this phone':'Sync error')}finally{busy=false}}
  setInterval(()=>{if(!document.hidden)pull()},15000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)pull()});addEventListener('online',pull);
  setTimeout(pull,1500);
  function write(op,p,v){if(op==='set')cache[p]=JSON.parse(JSON.stringify(v));else delete cache[p];
    outbox=outbox.filter(o=>o.p!==p);outbox.push({op,p,v});persist();fireAll();pull();return Promise.resolve()}
  return {
    collection(path){return {
      onSnapshot(cb){const sub={fire(){cb(colSnap(path))}};subs.add(sub);sub.fire();ensure([dayOf(path+'/')]);return()=>subs.delete(sub)},
      async get(){await ensure([dayOf(path+'/')]);return colSnap(path)}}},
    doc(path){return {
      onSnapshot(cb){const sub={fire(){const v=cache[path];cb({exists:v!=null,data:()=>JSON.parse(JSON.stringify(v))})}};subs.add(sub);sub.fire();ensure(['config']);return()=>subs.delete(sub)},
      set(v){return write('set',path,v)},delete(){return write('del',path)}}},
    prefetch(dates){const need=dates.filter(d=>!loaded.has(d));const parts=[];for(let i=0;i<need.length;i+=31)parts.push(ensure(need.slice(i,i+31)));return Promise.all(parts)}
  };
})();

/* ---------- state ---------- */
const S={date:todayStr(),view:(v=>['ss','duty','late','unif','early','sb','day','dep','dash','school','alloc'].includes(v)?v:'school')(LS.get('view','duty')),veh:{},gate:{},sb:{},alloc:{},sbReg:{},walkReg:{},out:{},derr:{},sbSeg:LS.get('sbSeg','sb'),ss:{},ssList:{},managers:[],privVan:{},lateAfter:'07:45',openVeh:null,depVeh:null};
let unsubs=[];
function subscribeDate(){
  unsubs.forEach(u=>u&&u());unsubs=[];
  const d=S.date;
  unsubs.push(store.subCol('att/'+d+'/veh',o=>{S.veh=o;render()}));
  unsubs.push(store.subCol('att/'+d+'/gate',o=>{S.gate=o;render()}));
  unsubs.push(store.subCol('att/'+d+'/sb',o=>{S.sb=o;render()}));
  unsubs.push(store.subCol('att/'+d+'/out',o=>{S.out=o;render()}));
  unsubs.push(store.subCol('att/'+d+'/derr',o=>{S.derr=o;render()}));
  unsubs.push(store.subCol('att/'+d+'/ss',o=>{S.ss=o;render()}));
}
function subscribeConfig(){
  store.subDoc('config/alloc',o=>{S.alloc=(o&&o.map)||{};render()});
  store.subDoc('config/sbRegular',o=>{S.sbReg=(o&&o.kids)||{};render()});
  store.subDoc('config/walkRegular',o=>{S.walkReg=(o&&o.kids)||{};render()});
  store.subDoc('config/settings',o=>{S.settings=o||{};S.lateAfter=(o&&o.lateAfter)||'08:00';S.lateAfterPP=(o&&o.lateAfterPP)||'09:00';
    const nl=(o&&o.left)?o.left:LEFT_DEFAULT;const back=Object.keys(LEFT).some(id=>!nl[id]);LEFT=Object.assign({},nl);applyLeft(LEFT);
    if(back)toast('A student was restored – close and reopen the app to see them');render()});
  store.subCol('config',o=>{const m={};Object.keys(o).forEach(k=>{if(k.startsWith('ss-'))m[k.slice(3)]=o[k]});S.ssList=m;render()});
  store.subDoc('config/privateVan',o=>{S.privVan=(o&&o.kids)||{};render()});
  store.subDoc('config/managers',o=>{S.managers=(o&&o.names)||[];fillStaffSelects();fillSbBy();render()});
}
const staffOf=k=>S.alloc[k]||defaultStaff(VBY[k]);
const ALL_V='All Vehicles';
const isMgr=w=>w===ALL_V||S.managers.includes(w);
// who is recorded as marker: the selected staff, or for 'All Vehicles' the vehicle's in-charge (or logged-in user)
const markBy=(sel,vk)=>{const w=$(sel).value;return w===ALL_V?((window.FIS_ME||'')+(window.FIS_ME?' (All Vehicles)':'')||staffOf(vk)):w};
const vehOf=w=>isMgr(w)?VEH:VEH.filter(v=>staffOf(v.k)===w);
const LATE_NAMES=["Chandan Soni Sir (Gate)","Narendra Dara Sir (Gate)"];
const FO_NAMES=["Megha Ma'am (Front Office)","Harshvardhan Soni Sir (Front Office)","Vaishali Ma'am (Front Office)","Preeti Jain Ma'am (Front Office)"];
function modeOf(k){if(k.walk)return S.privVan[k.id]?'Private Van':'By Walk';const t=VBY[k.v].t;return t==='Auto'?'Auto':t==='Bus'?'Bus':t==='Van'?'School Van':(k.v==='VI'?'School Van':'Bus')}
function modeLabel(k){return k.walk?modeOf(k):VBY[k.v].l}
const PL_NAMES=["Poonam Ma'am (PL)","Garima Ma'am (PL)","Renu Harsh Ma'am (PL)"];
const PM_NAMES=["Sanjana Ma'am (PM)","Neetu Ma'am (PM)","Divyanshi Ma'am (PM)","Diksha Ma'am (PM)"];
const CM_NAMES=["Mansi Ma'am (CM)","Rashami Ma'am (CM)","Pooja Ma'am (CM)","Upendra Sir (CM)","Saba Ma'am (CM)"];
function meTeacher(){const n=(window.FIS_ME||'').trim();return n?n+' (Teacher)':''}
function fillSbBy(){$('sbBy').innerHTML=byOpts(LS.get('sbBy',ALLBY),[['PL – Classes 6 to 11',PL_NAMES],['PM – Classes 1 to 5',PM_NAMES],['Front Office',FO_NAMES],['Managers',mgrNames()]])}
function fillStaffSelects(){
  const opts=(cur)=>'<option'+(cur===ALL_V?' selected':'')+'>'+ALL_V+'</option><optgroup label="Vehicle duty staff">'+STAFF.map(s=>'<option'+(s===cur?' selected':'')+'>'+esc(s)+'</option>').join('')+'</optgroup>'+
    (S.managers.length?'<optgroup label="Managers – all vehicles">'+S.managers.map(s=>'<option'+(s===cur?' selected':'')+'>'+esc(s)+'</option>').join('')+'</optgroup>':'');
  $('dutyStaff').innerHTML=opts(LS.get('staff',STAFF[0]));
  $('depStaff').innerHTML=opts(LS.get('depStaff',LS.get('staff',STAFF[0])));
  $('gateBy').innerHTML=byOpts(LS.get('gateBy',ALLBY),[['Front Office',FO_NAMES],['Managers',mgrNames()]]);
}

/* ===== shared: class names, marked-by, class picker, class strips ===== */
const GNAME={'P.G.':'P.G.','Nursery':'Nursery','L.KG.':'L.KG.','U.KG.':'U.KG.'};
function gradeName(g){return GNAME[g]||('Class '+(ORD[g]||g))}
function clsName(c){const [g,s]=String(c||'').split(' - ');return gradeName(g)+(s?' – '+s:'')}
function secLbl(c){const [g,s]=String(c||'').split(' - ');return (ORD[g]||g)+(s?'-'+s:'')}
function fmtDL(d){return new Date(d+'T00:00').toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'})}
const byName=(a,b)=>a.name.localeCompare(b.name);
const ALLBY='__ALL';
function mgrNames(){return S.managers.map(m=>m+' (Manager)')}
function byOpts(cur,groups){return '<option value="'+ALLBY+'"'+(cur===ALLBY?' selected':'')+'>All</option>'+groups.map(g=>g[1].length?'<optgroup label="'+g[0]+'">'+g[1].map(s=>'<option'+(s===cur?' selected':'')+'>'+esc(s)+'</option>').join('')+'</optgroup>':'').join('')}
function needBy(id){if($(id).value!==ALLBY)return false;toast('Choose your name in "Marked by" to mark');return true}
function byShort(b){return String(b||'').replace(/ \((Front Office|Gate|PL|PM|Manager)\)/,'')}
function cpGet(key){S.cp=S.cp||{};if(!S.cp[key])S.cp[key]=(LS.get('cp_'+key,[])||[]).filter(c=>CLASSES.includes(c));return S.cp[key]}
function cpSet(key,arr){S.cp=S.cp||{};S.cp[key]=CLASSES.filter(c=>arr.includes(c));LS.set('cp_'+key,S.cp[key]);render()}
function cpHas(key,cls){const a=cpGet(key);return !a.length||a.includes(cls)}
function cpList(key){const a=cpGet(key);return a.length?a:CLASSES}
const cpNorm=x=>String(x).toLowerCase().replace(/[\s.\-–]/g,'');
function cpSecs(key){const a=new Set(cpGet(key));const q=cpNorm((S.cpQ||{})[key]||'');
  const list=(key==='ss'?SS_CLS():CLASSES).filter(c=>!q||cpNorm(secLbl(c)).includes(q)||cpNorm(clsName(c)).includes(q));
  return list.length?list.map(c=>'<button class="cpc sm'+(a.has(c)?' on':'')+'" data-cps="'+key+'|'+esc(c)+'">'+esc(secLbl(c))+'</button>').join(''):'<span class="muted">No class found.</span>'}
function cpHtml(key,gl){const a=new Set(cpGet(key));const open=(S.cpOpen||{})[key];
  return '<div class="cpk"><label class="f">Classes'+(a.size?' · '+a.size+' selected':' · all')+'</label><div class="cprow"><button class="cpc'+(a.size?'':' on')+'" data-cpall="'+key+'">All classes</button>'+
    (gl||GRADES).map(g=>{const secs=CLASSES.filter(c=>c.split(' - ')[0]===g);const n=secs.filter(c=>a.has(c)).length;return '<button class="cpc'+(n===secs.length?' on':n?' half':'')+'" data-cpg="'+key+'|'+esc(g)+'">'+esc(ORD[g]||g)+'</button>'}).join('')+'</div>'+
    '<details class="cpsec"'+(open?' open':'')+' data-cpd="'+key+'"><summary>Search / choose sections</summary><input type="search" class="cpq" data-cpq="'+key+'" placeholder="Search class – e.g. 4, LKG, 7B" value="'+esc((S.cpQ||{})[key]||'')+'" autocomplete="off"><div class="cprow" data-cpbox="'+key+'">'+cpSecs(key)+'</div></details></div>'}
function cpRender(elId,key){const el=$(elId);const ae=document.activeElement;if(ae&&el.contains(ae)&&ae.classList.contains('cpq'))return;el.innerHTML=cpHtml(key)}
function catHead(title,n,c){return '<div class="cathead c-'+(c||'')+'"><span>'+esc(title)+'</span><b>'+n+'</b></div>'}
function nrow(name,det,right){return '<div class="nb"><div class="nn">'+name+'</div>'+(det?'<div class="nd">'+det+'</div>':'')+'</div>'+(right?'<div class="nr">'+right+'</div>':'')}
function strips(rows,rowFn,opt){opt=opt||{};const by={};rows.forEach(r=>(by[r.k.cls]=by[r.k.cls]||[]).push(r));const cl=CLASSES.filter(c=>by[c]);
  if(!cl.length)return '<p class="muted empty">'+(opt.empty||'None.')+'</p>';
  return cl.map(c=>'<div class="cstrip"><span>'+esc(clsName(c))+'</span><small>'+by[c].length+'</small></div>'+by[c].sort(opt.sort||((a,b)=>a.k.name.localeCompare(b.k.name))).map((r,i)=>'<div class="nrow"'+(opt.attr?opt.attr(r):'')+'><span class="no">'+(i+1)+'</span>'+rowFn(r)+'</div>').join('')).join('')}
const dots=a=>a.filter(Boolean).join(' · ');
/* ---------- per-kid computation ---------- */
function sbOf(id){const fo=((S.gate[id]||{}).out||{}).type;if(fo==='SB')return true;if(fo==='VEH'||fo==='EARLY'||fo==='GOWALK'||fo==='HOME')return false;const c=KID[id].cls;if((((S.ss||{})[seg(c)]||{}).kids||{})[id]==='P')return true;const day=S.sb[seg(c)];const ov=day&&day.kids?day.kids[id]:undefined;return ov===undefined?!!S.sbReg[id]:(ov===true||ov==='D')}
// Doubt case: kept back from the vehicle until Front Office confirms with the parent
function sbDoubt(id){if(((S.gate[id]||{}).out||{}).type)return false;const day=S.sb[seg(KID[id].cls)];return !!(day&&day.kids&&day.kids[id]==='D')}
function sbState(id){return sbDoubt(id)?'D':sbOf(id)}
function kidStatus(id){
  const k=KID[id];const g=S.gate[id]||{};const it=g.in&&g.in.type;const ot=g.out&&g.out.type;
  if(k.walk){
    const IN=it==='ABS'?'A':it?it:'W';const present=IN!=='A';
    const OUT=!present?'':ot==='EARLY'?'EARLY':ot==='HOME'?'HOME':sbOf(id)?'SB':'HOME';
    return {IN,OUT,present,m:null,g,fo:!!(it||ot)};
  }
  const vd=S.veh[k.v]||{};const m=(vd.marks||{})[k.n];
  let IN, present=false;
  if(it==='ABS'){IN='A'}
  else if(it){IN=it;present=true}
  else if(m==='P'){IN='P';present=true}
  else if(m==='PD'){IN='PD';present=true}
  else if(m==='A'){IN='A'}
  else IN='U';
  let OUT='';
  if(present){
    if(ot==='EARLY')OUT='EARLY';
    else if(ot==='GOWALK')OUT='GOWALK';
    else if(ot==='VEH')OUT='VEH';
    else if(ot==='SB')OUT='SB';
    else if(m==='PD'&&(vd.depBy||{})[k.n]==='PARENT')OUT='GOWALK';
    else if(S.walkReg[id])OUT='GOWALK';
    else if(sbOf(id))OUT='SB';
    else OUT='VEH';
  }
  return {IN,OUT,present,m,g,fo:!!(it||ot)};
}
const LBL={PD:'Dropped by Parent',PRES:'Present (on time)',W:'By walk',HOME:'Home – By Walk',ABS:'Absent (FO)',P:'Present',A:'Absent',U:'Pending',LATE:'Late Arrival',WALKIN:'Came by walk',EARLY:'Leaving Early',GOWALK:'Parent Pick-up',SB:'Stayback',VEH:'Boarding Vehicle'};
function vehStats(v){
  const s={roll:v.kids.length,bus:0,abs:0,un:0,late:0,walkin:0,early:0,gowalk:0,sb:0,dep:0,present:0};
  v.kids.forEach(k=>{const st=kidStatus(v.k+'-'+k[0]);
    if(st.IN==='P'||st.IN==='PRES')s.bus++;else if(st.IN==='A')s.abs++;else if(st.IN==='U')s.un++;else if(st.IN==='LATE')s.late++;else if(st.IN==='WALKIN'||st.IN==='PD')s.walkin++;
    if(st.present)s.present++;
    if(st.OUT==='EARLY')s.early++;else if(st.OUT==='GOWALK')s.gowalk++;else if(st.OUT==='SB')s.sb++;else if(st.OUT==='VEH')s.dep++;});
  const vd=S.veh[v.k];s.submitted=!!(vd&&vd.submitted);s.time=vd&&vd.time||'';s.by=vd&&vd.by||'';
  return s;
}

/* ---------- views ---------- */
function setView(v){S.view=v;LS.set('view',v);document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
  ['ss','duty','late','unif','early','sb','day','dep','dash','school','alloc'].forEach(x=>$('v-'+x).classList.toggle('hide',x!==v));
render()}

function render(){
  if(S.view==='duty')renderDuty();
  if(S.view==='sb')renderSB();
  if(S.view==='ss')renderSS();
  if(S.view==='late')renderLate();
  if(S.view==='early')renderEarly();
  if(S.view==='day')renderDay();
  if(S.view==='unif')renderUnif();
  if(S.view==='dash')renderDash();
  if(S.view==='school')renderSchool();
  if(S.view==='dep')renderDep();
  if(S.view==='alloc')renderAlloc();
  if(modalVeh)renderModal();
  if(gatePick)renderFO();
}

/* DUTY */
const DRV_U=/^(B([1-9]|1[0-6]|34)|B[A-H])$/,CON_U=/^(B(1|2|3|4|5|8|9|10|14|15)|B[A-H])$/;
function hasDrvU(vk){return DRV_U.test(vk)}function hasConU(vk){return CON_U.test(vk)}
function vcardInfo(v){const s=vehStats(v);const vd=S.veh[v.k]||{},od=S.out[v.k]||{};const ch=((S.derr[v.k]||{}).checks)||{};
  const tk=x=>x==='OK'?'<b class="ok">✓</b>':x==='NOT'?'<b class="no">✗</b>':'<b>–</b>';
  const fo=foCountVeh(v);
  let h='<div class="vtime"><div><span>In</span><strong>'+(vd.arr?esc(hm12(vd.arr)):'–')+'</strong></div><div><span>Out</span><strong>'+(od.submitted&&od.time?esc(String(od.time).replace(/^0/,'')):'–')+'</strong></div></div>'+
    '<div class="vstats"><div><span>T</span><strong>'+s.roll+'</strong></div><div class="p"><span>P</span><strong>'+s.bus+'</strong></div><div class="a"><span>A</span><strong>'+s.abs+'</strong></div><div class="s"><span>S</span><strong>'+s.sb+'</strong></div></div>';
  if(fo)h+='<div class="vfo">Front Office updates: '+fo+(s.early||s.late?'<small>'+[s.early?'Early leaver '+s.early:'',s.late?'Late comer '+s.late:''].filter(Boolean).join(' · ')+'</small>':'')+'</div>';
  const u=[];if(hasDrvU(v.k))u.push('<div><em>Driver</em><i>'+'M '+tk(vd.driverU)+' D '+tk(ch.driver)+'</i></div>');if(hasConU(v.k))u.push('<div><em>Conductor</em><i>M '+tk(vd.condU)+' D '+tk(ch.conductor)+'</i></div>');
  if(u.length)h+='<div class="vuni">'+u.join('')+'</div>';
  return h}
function renderDuty(){
  const who=$('dutyStaff').value;
  const mine=vehOf(who);
  $('dutyHint').textContent=isMgr(who)?(who===ALL_V?'All ':'Manager – all ')+mine.length+' vehicles':mine.length?mine.map(v=>v.l).join(', '):'No vehicles allocated';
  if(S.openVeh&&!isMgr(who)&&staffOf(S.openVeh)!==who)S.openVeh=null;
  if(S.openVeh){$('dutyList').classList.add('hide');$('dutyVeh').classList.remove('hide');renderDutyVeh();return}
  $('dutyList').classList.remove('hide');$('dutyVeh').classList.add('hide');
  $('dutyList').innerHTML='<div class="secthead"><i></i><span>'+(isMgr(who)?'All Vehicles':'Assigned Vehicles')+'</span><small>Tap a vehicle to mark attendance</small></div><div class="grid">'+mine.map(v=>{const s=vehStats(v);const marked=s.roll-s.un;
    const pill=s.submitted?'<span class="pill done">Submitted '+esc(s.time)+'</span>':marked?'<span class="pill part">'+marked+'/'+s.roll+' marked</span>':'<span class="pill pend">Pending</span>';
    return '<button class="vcard" data-open="'+v.k+'"><b>'+esc(v.l)+'</b>'+(isPPveh(v.k)?'<div class="st" style="color:var(--late);font-weight:700">Pre-Primary · 9:00 AM – 2:00 PM</div>':'')+(isMgr(who)?'<div class="st">'+esc(staffOf(v.k))+'</div>':'')+vcardInfo(v)+'<div style="margin-top:6px">'+pill+'</div></button>'}).join('')+'</div>';
}
let draft=null; // local edits before save for the open vehicle
function renderDutyVeh(){
  const v=VBY[S.openVeh];const vd=S.veh[v.k]||{};
  if(!draft)draft=Object.assign({},vd.marks||{});
  if(!mDraft)mDraft={driverU:vd.driverU||null,condU:vd.condU||null,depBy:Object.assign({},vd.depBy||{}),extra:JSON.parse(JSON.stringify(vd.extra||{}))};
  const isAuto=v.t==='Auto';const ex=mDraft.extra||{};
  const c={P:0,A:0,U:0,PD:0};v.kids.forEach(k=>c[draft[k[0]]||'U']++);Object.keys(ex).forEach(x=>c[draft[x]||'U']++);
  const dirty=JSON.stringify(sortObj(draft))!==JSON.stringify(sortObj(vd.marks||{}))||(mDraft&&((mDraft.driverU||null)!==(vd.driverU||null)||(mDraft.condU||null)!==(vd.condU||null)||JSON.stringify(sortObj(mDraft.depBy||{}))!==JSON.stringify(sortObj(vd.depBy||{}))||JSON.stringify(mDraft.extra||{})!==JSON.stringify(vd.extra||{})));
  const tgL=st=>st==='P'?'Present':st==='A'?'Absent':st==='PD'?'By Parent':'—';
  const pdLine=n=>draft[n]==='PD'?'<div class="row" style="gap:6px;margin-top:4px"><span class="muted" style="font-size:12px">Going home:</span><button class="tg XS '+((mDraft.depBy||{})[n]==='PARENT'?'PD':'U')+'" data-depby="'+n+':PARENT">By Parent</button><button class="tg XS '+((mDraft.depBy||{})[n]!=='PARENT'?'P':'U')+'" data-depby="'+n+':AUTO">Auto will come</button></div>':'';
  $('dutyVeh').innerHTML='<div class="row" style="justify-content:space-between"><button class="btn ghost sm" id="backV">← Back</button><b style="font-size:17px">'+esc(v.l)+'</b><span class="muted">'+esc(staffOf(v.k))+'</span></div>'+(isPPveh(v.k)?'<p class="muted" style="margin:4px 0 0;color:var(--late)"><b>Pre-Primary · School 9:00 AM – 2:00 PM</b> · late after '+hm12(ppCut())+'</p>':'')+
   '<div class="counts"><div><b>'+v.kids.length+'</b>Total</div><div><b style="color:var(--p)">'+c.P+'</b>Present</div><div><b style="color:var(--a)">'+c.A+'</b>Absent</div><div><b style="color:var(--un)">'+c.U+'</b>Pending</div>'+(vd.submitted?'<div><b style="font-size:14px">'+esc(vd.time)+'</b>Submitted by '+esc(vd.by)+'</div>':'')+'</div>'+
   (foCountVeh(v)?'<div class="banner" style="background:var(--brand2);color:var(--brand)"><b>Front Office updates ('+foCountVeh(v)+')</b> – late arrivals / early pickups for this vehicle are shown under each child. Front Office marks override this list.</div>':'')+
   mchkHtml(v.k)+
   '<div class="row" style="margin-bottom:6px"><button class="btn green sm" id="allP">Mark All Present</button><button class="btn ghost sm" id="clrV">Clear</button><span class="muted">Tap the status to switch Present / Absent'+(isAuto?' / By Parent (auto did not come, parent dropped)':'')+'</span></div>'+
   v.kids.map(k=>{const st=draft[k[0]]||'U';const id=v.k+'-'+k[0];const g=S.gate[id];
     return '<div class="kid"><div class="n">'+k[0]+'</div><div class="nm"><div>'+esc(k[1])+'</div><span>'+esc(k[2])+(sbOf(id)?' · <span class="tag t-SB">Stayback</span>':'')+(S.walkReg[id]?' · <span class="tag t-GOWALK">Goes by walk</span>':'')+'</span>'+foLine(id)+pdLine(k[0])+'</div><button class="tg '+st+'" data-tg="'+k[0]+'">'+tgL(st)+'</button></div>'}).join('')+
   extraHtml(v,ex)+
   '<div class="stick"><label class="f" style="margin:0">Arrival time</label><input type="time" id="arrT" value="'+esc(vd.arr||'')+'"><button class="btn" id="saveV" '+(c.U&&!dirty?'':'')+'>'+(vd.submitted?(dirty?'Update Attendance':'Saved ✓'):'Submit Attendance')+'</button><span class="muted">'+(dirty?'Changes not yet submitted':'')+'</span></div>';
}
function extraHtml(v,ex){const keys=Object.keys(ex);
  return '<h3 style="margin-top:14px">Today only'+(keys.length?' ('+keys.length+')':'')+'</h3>'+keys.map(x=>{const e=ex[x];const st=draft[x]||'U';
      return '<div class="kid" style="background:#f6f8ff"><div class="n">+</div><div class="nm"><div>'+esc(e.name)+' <span class="tag t-LATE">Today only</span></div><span>'+esc(e.cls||'')+(e.from?' · usually '+esc(e.from):'')+'</span></div><div style="display:flex;gap:6px;align-items:center"><button class="tg '+st+'" data-tg="'+x+'">'+(st==='P'?'Present':st==='A'?'Absent':'—')+'</button><button class="btn ghost sm" data-exdel="'+x+'">×</button></div></div>'}).join('')+
    '<div class="row" style="margin-top:6px"><select id="exPick" style="flex:1"><option value="">Add a student travelling today only…</option>'+Object.values(KID).filter(k=>k.v!==v.k).sort((a,b)=>a.name.localeCompare(b.name)).map(k=>'<option value="'+k.id+'">'+esc(k.name)+' – '+esc(k.cls)+' ('+esc(VBY[k.v].l)+')</option>').join('')+'</select></div>'+
    '<div class="row" style="margin-top:6px"><input type="text" id="exName" placeholder="Or new student name" style="flex:2;min-width:140px"><select id="exCls" style="flex:1"><option value="">Class</option>'+CLASSES.map(c=>'<option>'+esc(c)+'</option>').join('')+'</select><button class="btn sm" id="exAdd">Add</button></div>';}
function sortObj(o){const r={};Object.keys(o).sort().forEach(k=>r[k]=o[k]);return r}

/* GATE */
let gatePick=null;
function renderFO(){const _lh=gatePick?lateHist(gatePick):[];window._lateRec=_lh.length?'<p style="margin:8px 0 0;color:var(--late);font-size:13px"><b>'+_lh.length+'× late this month:</b> '+_lh.map(x=>esc(fmtD(x.d))+(x.t?' '+esc(x.t):'')).join(', ')+'</p>':'';
  if(!gatePick){return}
  const k=KID[gatePick];const st=kidStatus(k.id);const g=S.gate[k.id]||{};
  $('modalRoot').innerHTML='<div class="modal" id="fobg"><div class="card"><button class="x" id="gx">×</button><h2>'+esc(k.name)+'</h2><div class="muted">'+esc(k.cls)+' · '+esc(modeLabel(k))+'</div>'+
    '<div class="muted" style="margin-top:6px">Now: <span class="tag t-'+st.IN+'">IN: '+esc(LBL[st.IN]||st.IN)+'</span> <span class="tag t-'+(st.OUT||'U')+'">OUT: '+esc(st.OUT?LBL[st.OUT]:'—')+'</span>'+(k.walk?'':' · Vehicle duty: '+esc(LBL[st.m||'U']))+(S.sbReg[k.id]?' · Regular SB':'')+'</div>'+
    '<h3>IN – Arrival</h3><div class="row" style="margin-bottom:8px"><label class="f" style="margin:0">IN time</label><input type="time" id="gInT" value="'+esc(fv('inT',to24(g.in&&g.in.time)||nowHM()))+'"><span class="muted">Late after '+hm12(kidCut(k.id))+'</span></div><div class="opts">'+
      opt('in','PRES','Present – on time','Arrived before '+hm12(kidCut(k.id)),g)+opt('in','LATE','Late Arrival','Arrived after '+hm12(kidCut(k.id)),g)+opt('in','ABS','Absent','Not in school today',g)+'</div>'+
    '<h3>OUT – Departure</h3><div class="row" style="margin-bottom:8px"><label class="f" style="margin:0">OUT time</label><input type="time" id="gOutT" value="'+esc(fv('outT',to24(g.out&&g.out.time)||nowHM()))+'"><span class="muted">used for Leaving Early</span></div><div class="opts">'+
      opt('out','EARLY','Leaving Early','Leaves before dispersal (time above)',g)+
      (k.walk?opt('out','HOME',modeOf(k),'Regular mode of going home',g):opt('out','VEH','By '+(VBY[k.v].t==='Auto'?'':VBY[k.v].t==='Van'||k.v==='VI'?'School ':'School ')+VBY[k.v].l,'Regular mode of transport',g)+opt('out','GOWALK','Parent Pick-up','Parent collects the student today',g))+
      opt('out','SB','Stayback','Staying after school today',g)+'</div>'+
    (k.walk?'<div class="row" style="margin-top:10px"><span class="muted">Entry-Exit Mode: <b>'+modeOf(k)+'</b></span><button class="btn ghost sm" data-pvan="'+k.id+'">'+(S.privVan[k.id]?'Change to By Walk':'Change to Private Van')+'</button></div>':'')+
    (k.walk?'':'<div class="row" style="margin-top:10px"><span class="muted">'+(S.walkReg[k.id]?'Special list – arrives by vehicle, parent pick-up daily':'Not on the special list')+'</span><button class="btn ghost sm" data-wreg="'+k.id+'">'+(S.walkReg[k.id]?'Remove from Special List':'Add to Special List')+'</button></div>')+
    '<div class="row" style="margin-top:10px"><input type="text" id="gRem" placeholder="Remark (optional)" value="'+esc(gDraft&&gDraft.rem!==undefined?gDraft.rem:(g.rem||''))+'" style="flex:1"><button class="btn" id="gSave">Save</button></div>'+
    '<h3>Report an Error</h3>'+((g.errs||[]).length?(g.errs||[]).map((e,i)=>'<div class="nrow"><span class="no">'+(i+1)+'</span>'+nrow(esc(e.type),dots([esc(e.ph),esc(e.time),e.rem?'<b>'+esc(e.rem)+'</b>':'','by '+esc(byShort(e.by))]),'<button class="btn ghost sm" data-gerrdel="'+i+'">×</button>')+'</div>').join(''):'')+
    '<div class="row"><select id="gErrPh"><option>Arrival</option><option'+(new Date().getHours()>=12?' selected':'')+'>Departure</option></select><select id="gErrT" style="flex:1;min-width:180px">'+FO_ERR.map(t=>'<option>'+esc(t)+'</option>').join('')+'</select></div>'+
    '<div class="row" style="margin-top:8px"><input type="text" id="gErrRem" placeholder="What was the case? (remark)" style="flex:1"><button class="btn ghost" id="gErrAdd">Add Error</button></div>'+
    (window._lateRec||'')+'<p class="muted" style="margin:8px 0 0">Saving as: <b>'+esc(foBy||$('gateBy').value)+'</b>'+(g.by?' · last marked by '+esc(g.by):'')+'</p></div></div>';
}
let gDraft=null;let foBy=null;
const FO_ERR=['Wrong marking in vehicle','Marked present – child absent','Marked absent – child present','Came with parent – not marked','Left with parent – not informed','Sent in wrong vehicle','Stay back marked wrongly','Late entry not marked','Other'];
const fv=(k,d)=>gDraft&&gDraft[k]!==undefined?gDraft[k]:d;
function opt(side,type,t,sub,g){const cur=(gDraft?gDraft[side]:(g[side]&&g[side].type))===type;return '<button class="opt t-'+type+(cur?' sel':'')+'" data-gopt="'+side+':'+type+'">'+t+'<small>'+sub+'</small></button>'}

/* FRONT OFFICE INFO (shared to bus lists & PL) */
function outPlan(k,g){const o=g.out&&g.out.type;
  if(o==='EARLY')return {t:'Leaving Early '+(g.out.time||''),c:'EARLY'};
  if(o==='GOWALK')return {t:'Parent Pick-up',c:'GOWALK'};
  if(o==='SB')return {t:'Stayback',c:'SB'};
  if(o==='VEH')return {t:'Going by '+VBY[k.v].l+' (regular)',c:'VEH'};
  if(o==='HOME')return {t:'Going home – '+modeOf(k),c:'HOME'};
  if(sbDoubt(k.id))return {t:'Stayback doubt – Front Office to confirm',c:'LATE'};
  return {t:k.walk?'Going home – '+modeOf(k):'Going by '+VBY[k.v].l+' (regular)',c:k.walk?'HOME':'VEH'};}
function foLine(id){const k=KID[id];const g=S.gate[id];if(!g||!(g.in||g.out))return '';
  const p=[];if(g.in)p.push('<span class="tag t-'+g.in.type+'">'+esc(LBL[g.in.type]||g.in.type)+(g.in.type!=='ABS'&&g.in.time?' '+esc(g.in.time):'')+'</span>');
  if(g.in&&g.in.type==='ABS'){}else{const op=outPlan(k,g);p.push('<span class="tag t-'+op.c+'">'+esc(op.t)+'</span>')}
  return '<div style="margin-top:4px;font-size:12px"><b style="color:var(--brand)">Front Office:</b> '+p.join(' ')+(g.rem?' · '+esc(g.rem):'')+(g.by?' <span class="muted">('+esc(g.by.replace(' (Front Office)',''))+')</span>':'')+'</div>';}
function foCountVeh(v){return v.kids.filter(k=>{const g=S.gate[v.k+'-'+k[0]];return g&&(g.in||g.out)}).length}

/* STUDENT INFORMATION (PL) – Early leavers & Late comers */
function infoRows(type){const c=$('sbClass').value;
  return Object.values(KID).filter(k=>(!c||k.cls===c)).map(k=>({k,g:S.gate[k.id]||{}})).filter(r=>type==='EARLY'?(r.g.out&&r.g.out.type==='EARLY'):(r.g.in&&r.g.in.type==='LATE'))
    .sort((a,b)=>CLASSES.indexOf(a.k.cls)-CLASSES.indexOf(b.k.cls)||a.k.name.localeCompare(b.k.name))}
function renderInfoList(type){
  const rows=infoRows(type);const c=$('sbClass').value;
  $('sbHint').textContent=type==='EARLY'?'Students leaving early today, as updated by Front Office – with time, how they go and remark.':'Students who came late today and entered through Front Office – with IN time and how they will go home.';
  const title=(type==='EARLY'?'Early Leavers':'Late Comers')+' – '+(c||'All classes')+' ('+rows.length+')';
  $('sbList').innerHTML='<h2>'+esc(title)+'</h2>'+(rows.length?rows.map((r,i)=>{const k=r.k,g=r.g;const op=outPlan(k,g);
    return '<div class="kid"><div class="n">'+(i+1)+'</div><div class="nm"><div>'+esc(k.name)+'</div><span>'+esc(k.cls)+' · '+esc(modeLabel(k))+(g.rem?' · '+esc(g.rem):'')+(g.by?' ('+esc(g.by.replace(' (Front Office)',''))+')':'')+'</span></div>'+
      '<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">'+(type==='EARLY'?'<span class="tag t-EARLY">Leaving '+esc(g.out.time||'')+'</span>'+(g.in?'<span class="tag t-'+g.in.type+'">IN: '+esc(LBL[g.in.type])+' '+esc(g.in.time||'')+'</span>':''):'<span class="tag t-LATE">IN '+esc(g.in.time||'')+'</span><span class="tag t-'+op.c+'">'+esc(op.t)+'</span>')+'</div></div>'}).join(''):'<p class="muted">None today.</p>');
  // summary class-wise
  const all=Object.values(KID).map(k=>({k,g:S.gate[k.id]||{}}));
  const sum=CLASSES.map(cl=>{const e=all.filter(r=>r.k.cls===cl&&r.g.out&&r.g.out.type==='EARLY').length,l=all.filter(r=>r.k.cls===cl&&r.g.in&&r.g.in.type==='LATE').length;return e||l?'<tr><td class="l">'+esc(cl)+'</td><td>'+(l||'')+'</td><td>'+(e||'')+'</td></tr>':''}).join('');
  $('sbSum').innerHTML=sum?'<div class="tw" style="max-height:none"><table><tr><th>Class</th><th>Late Comers</th><th>Early Leavers</th></tr>'+sum+'</table></div>':'<span class="muted">No late comers or early leavers today.</span>';
}
function segCounts(){const all=Object.values(S.gate);return {e:Object.entries(S.gate).filter(([id,g])=>KID[id]&&g.out&&g.out.type==='EARLY').length,l:Object.entries(S.gate).filter(([id,g])=>KID[id]&&g.in&&g.in.type==='LATE').length}}

/* STAYBACK */
function sbTag(k){return k.walk?'<span class="tag t-WALKIN">'+modeOf(k)+'</span>':'<span class="tag t-VEH">'+esc(VBY[k.v].l)+'</span>'}
/* STUDENT INFORMATION (PL) – multi-class, all three parts on one screen */
function selClasses(){return cpGet('sb')}
function setClasses(arr){cpSet('sb',arr)}
function setGrade(g){}
function sbDraftOf(id){const d=(S.sbDraft||{})[seg(KID[id].cls)]||{};return id in d?d[id]:undefined}
function sbDay(id){return ((S.sb[seg(KID[id].cls)]||{}).kids||{})[id]}
function sbVal(id){const dv=sbDraftOf(id);return dv!==undefined?dv:sbDay(id)}
function sbCands(c){return Object.values(KID).filter(k=>k.cls===c&&(S.sbReg[k.id]||sbDay(k.id)!==undefined||sbDraftOf(k.id)!==undefined||((S.gate[k.id]||{}).out||{}).type==='SB')).sort(byName)}
function sbHow(k){const st=kidStatus(k.id);const g=st.g||{};const o=g.out&&g.out.type;
  if(sbDay(k.id)==='D')return '<span class="tag t-LATE">Doubt – kept back, Front Office to confirm</span>';
  if(st.IN==='A')return '<span class="tag t-A">Absent today</span>';
  if(o==='EARLY')return '<span class="tag t-EARLY">Left early '+esc(g.out.time||'')+'</span>';
  if(o==='GOWALK')return '<span class="tag t-GOWALK">Parent pick-up</span>';
  if(o==='VEH')return '<span class="tag t-VEH">Went by '+esc(VBY[k.v].l)+'</span>';
  if(o==='HOME')return '<span class="tag t-U">Went home – '+esc(modeOf(k))+'</span>';
  if(o==='SB')return '<span class="tag t-SB">Stay back – Front Office</span>';
  return ''}
const SBV={true:['Staying','SB'],false:['Not staying','U'],A:['Absent','A'],D:['Doubt','LATE']};
function sbRow(k){const dv=sbDraftOf(k.id),v=sbVal(k.id);const b=(val,code,lbl,c)=>'<button class="sbo'+(v===val?' on '+c:'')+'" data-sbv="'+k.id+'|'+code+'">'+lbl+'</button>';
  return nrow(esc(k.name),dots([esc(modeLabel(k)),S.sbReg[k.id]?'Regular list':'Today only',sbHow(k),dv!==undefined?'<b style="color:var(--late)">not saved</b>':''])+
    '<div class="sbopts">'+b(true,'S','Staying','s')+b(false,'N','Not staying','n')+b('A','A','Absent','a')+b('D','D','Doubt','d')+'</div>',
    v===undefined?'<span class="sbdash">–</span>':'<span class="tag t-'+SBV[v][1]+'">'+SBV[v][0]+'</span>')}
function renderSB(){
  if(document.activeElement!==$('sbBy'))fillSbBy();
  cpRender('sbChips','sb');
  const mode=$('sbMode').value;const view=$('sbBy').value===ALLBY;
  if(mode==='reg'){const cls=cpGet('sb');$('sbHint').textContent='Regular stay back list – applies to every date. Choose the classes, then tap a student to add or remove.';
    $('sbList').innerHTML=cls.length?catHead('Regular Stay Back List',Object.values(KID).filter(k=>cls.includes(k.cls)&&S.sbReg[k.id]).length,'SB')+strips(Object.values(KID).filter(k=>cls.includes(k.cls)).map(k=>({k})),r=>nrow(esc(r.k.name),esc(modeLabel(r.k)),'<button class="tg '+(S.sbReg[r.k.id]?'SB':'noSB')+'" data-sbreg="'+r.k.id+'">'+(S.sbReg[r.k.id]?'Regular':'—')+'</button>')):'<p class="muted empty">Choose one or more classes above to edit the regular list.</p>';
    renderSBSum();return}
  $('sbHint').innerHTML=view?'Viewing all entries. Choose your name in <b>Marked by</b> to mark.':'Mark each student yourself – <b>Staying</b>, <b>Not staying</b>, <b>Absent</b> or <b>Doubt</b> (Front Office confirms with the parent) – then press Save for the class. A grey dash means not marked yet.';
  const list=cpList('sb');let tot=0,h='';
  list.forEach(c=>{const ks=sbCands(c);if(!ks.length)return;tot+=ks.length;const sg=seg(c);const d=S.sb[sg];const dn=Object.keys((S.sbDraft||{})[sg]||{}).length;
    const n=x=>ks.filter(k=>sbVal(k.id)===x).length;const um=ks.filter(k=>sbVal(k.id)===undefined).length;
    h+='<div class="cstrip"><span>'+esc(clsName(c))+'</span><small>'+ks.length+'</small></div><div class="sbcount"><span class="tag t-SB">Staying '+n(true)+'</span><span class="tag t-U">Not staying '+n(false)+'</span><span class="tag t-A">Absent '+n('A')+'</span><span class="tag t-LATE">Doubt '+n('D')+'</span><span class="tag t-U">– Not marked '+um+'</span>'+(d&&d.by?'<em>Marked by '+esc(byShort(d.by))+' '+esc(d.time||'')+'</em>':'')+'</div>'+
      ks.map((k,i)=>'<div class="nrow'+(sbDraftOf(k.id)!==undefined?' drf':'')+'"><span class="no">'+(i+1)+'</span>'+sbRow(k)+'</div>').join('')+
      (view?'':'<div class="row sbact">'+(um?'<button class="btn ghost sm" data-sball="'+esc(c)+'">Mark remaining '+um+' as Staying</button>':'')+(dn?'<button class="btn" data-sbsave="'+esc(sg)+'" style="flex:1">Save '+esc(clsName(c))+' ('+dn+')</button><button class="btn ghost" data-sbcancel="'+esc(sg)+'">Cancel</button>':'')+'</div>')});
  const inL=k=>list.includes(k.cls);const srt=(a,b)=>CLASSES.indexOf(a.cls)-CLASSES.indexOf(b.cls)||a.name.localeCompare(b.name);
  const opts=arr=>arr.sort(srt).map(k=>'<option value="'+k.id+'">'+esc(secLbl(k.cls))+' – '+esc(k.name)+' ('+esc(modeLabel(k))+')</option>').join('');
  const add=view?'':'<div class="row" style="margin-top:16px"><select id="sbAdd" style="flex:1"><option value="">Add a student staying today only…</option>'+opts(Object.values(KID).filter(k=>inL(k)&&!S.sbReg[k.id]&&sbVal(k.id)===undefined))+'</select></div>';
  $('sbList').innerHTML=catHead('Stay Back – '+fmtDL(S.date),tot,'SB')+(h||'<p class="muted empty">No stay back students in the selected classes.</p>')+add;
  renderSBSum();
}
function renderSBSum(){
  const list=cpList('sb');let T={s:0,d:0,n:0,a:0,u:0},h='';
  list.forEach(c=>{const ks=sbCands(c);if(!ks.length)return;const g={s:[],d:[],n:[],a:[],u:[]};
    ks.forEach(k=>{const v=sbDay(k.id);const fo=((S.gate[k.id]||{}).out||{}).type==='SB';(v==='D'&&!fo?g.d:v===true||(v===undefined&&fo)?g.s:v===false?g.n:v==='A'?g.a:g.u).push(k)});
    Object.keys(T).forEach(x=>T[x]+=g[x].length);const d=S.sb[seg(c)];
    const ln=(arr,t,cc)=>arr.length?'<div class="sumline"><span class="tag t-'+cc+'">'+t+' · '+arr.length+'</span><ol>'+arr.map(k=>'<li><b>'+esc(k.name)+'</b><i>'+dots([esc(modeLabel(k)),sbHow(k)])+'</i></li>').join('')+'</ol></div>':'';
    h+='<div class="cstrip"><span>'+esc(clsName(c))+'</span><small>'+g.s.length+' staying</small></div>'+ln(g.s,'Staying','SB')+ln(g.d,'Doubt – confirm with parent','LATE')+ln(g.n,'Not staying','U')+ln(g.a,'Absent','A')+ln(g.u,'Not marked','U')+(d&&d.by?'<p class="muted" style="margin:6px 6px 0">Marked by '+esc(byShort(d.by))+' '+esc(d.time||'')+'</p>':'')});
  $('sbSumH').innerHTML=catHead('Stay Back Summary',T.s,'SB')+'<div class="sbcount"><span class="tag t-SB">Staying '+T.s+'</span><span class="tag t-LATE">Doubt '+T.d+'</span><span class="tag t-U">Not staying '+T.n+'</span><span class="tag t-A">Absent '+T.a+'</span><span class="tag t-U">– Not marked '+T.u+'</span></div>';
  $('sbSum').innerHTML=h||'<p class="muted empty">Nothing to show.</p>';
}

/* ===== SMART STUDY SESSION ===== */
const SS_GRADES=()=>GRADES.filter(g=>/^\d+$/.test(String(ORD[g]))&&+ORD[g]>=1&&+ORD[g]<=10);
const SS_CLS=()=>CLASSES.filter(c=>SS_GRADES().includes(c.split(' - ')[0]));
function ssDoc(c){return S.ssList[seg(c)]||{}}
function ssEntry(id){return (ssDoc(KID[id].cls).kids||{})[id]}
function ssMembers(c){const kd=ssDoc(c).kids||{};return Object.keys(kd).filter(id=>KID[id]&&!kd[id].rm).map(id=>Object.assign({k:KID[id]},kd[id])).sort((a,b)=>a.k.name.localeCompare(b.k.name))}
function ssDayVal(id){return ((S.ss[seg(KID[id].cls)]||{}).kids||{})[id]}
function ssDraftOf(id){const d=(S.ssDraft||{})[seg(KID[id].cls)]||{};return id in d?d[id]:undefined}
function ssVal(id){const d=ssDraftOf(id);return d!==undefined?d:ssDayVal(id)}
const SSV={P:['Attended','P'],N:['Not attended','A'],A:['Absent','U']};
function ssWhy(m){return m.src==='poor'?(m.pp===false?'<span class="tag t-U">Improved – not in latest poor list</span>':'<span class="tag t-A">Poor performer'+(m.run?' · '+m.run+' low in a row':'')+'</span>'):'<span class="tag t-GOWALK">Added by '+esc(byShort(m.by||'PL'))+'</span>'}
function renderSS(){
  if(document.activeElement!==$('ssBy'))$('ssBy').innerHTML=byOpts(LS.get('ssBy',ALLBY),[['PL – Classes 6 to 11',PL_NAMES],['PM – Classes 1 to 5',PM_NAMES],['Managers',mgrNames()]]);
  const ae=document.activeElement;if(!(ae&&$('ssCp').contains(ae)&&ae.classList.contains('cpq')))$('ssCp').innerHTML=cpHtml('ss',SS_GRADES());
  const mode=$('ssMode').value,view=$('ssBy').value===ALLBY;const P=S.ssPull||{};const meta=S.ssList._meta||{};
  $('ssPull').innerHTML='<div class="row" style="align-items:flex-end"><div><label class="f">Poor performer = below 60% in</label><select id="ssRun">'+[2,3,4].map(n=>'<option value="'+n+'"'+(n===(meta.run||2)?' selected':'')+'>'+n+'+ tests in a row</option>').join('')+'</select></div>'+
    (P.needPw?'<div style="flex:1;min-width:180px"><label class="f">FIS Reports password</label><input type="password" id="ssPw" autocomplete="current-password" style="width:100%"></div>':'')+
    '<button class="btn" id="ssPullBtn"'+(P.busy?' disabled':'')+'>'+(P.busy?'Updating…':'Update list from Poor Performers')+'</button></div>'+
    '<p class="muted" style="margin:8px 0 0">'+(meta.asOf?'Last updated from FIS Reports (data as of '+esc(meta.asOf)+') by '+esc(byShort(meta.by||''))+' '+esc(meta.time||'')+'. ':'Not updated from FIS Reports yet. ')+'New poor performers are added; names a PL removed stay removed; frozen names stay frozen.</p>'+
    (P.msg?'<p class="muted" style="margin:6px 0 0;color:var(--navy)">'+P.msg+'</p>':'')+(P.unmatched&&P.unmatched.length?'<details class="allst"><summary>'+P.unmatched.length+' names not found in the school list – add them by hand</summary><p class="muted" style="margin:8px 6px">'+P.unmatched.map(esc).join(' · ')+'</p></details>':'');
  const list=cpList('ss').filter(c=>SS_CLS().includes(c));let h='',T={P:0,N:0,A:0,u:0,f:0,all:0};
  list.forEach(c=>{const ms=ssMembers(c);const act=ms.filter(m=>!m.frz),frz=ms.filter(m=>m.frz);const sg=seg(c);
    if(mode==='att'&&!ms.length)return;if(mode==='edit'&&!ms.length&&cpGet('ss').length===0)return;
    const n=x=>act.filter(m=>ssVal(m.k.id)===x).length;const um=act.filter(m=>ssVal(m.k.id)===undefined).length;T.P+=n('P');T.N+=n('N');T.A+=n('A');T.u+=um;T.f+=frz.length;T.all+=ms.length;
    const d=S.ss[sg];const dn=Object.keys((S.ssDraft||{})[sg]||{}).length;
    h+='<div class="cstrip"><span>'+esc(clsName(c))+'</span><small>'+act.length+(frz.length?' + '+frz.length+' frozen':'')+'</small></div>';
    if(mode==='att'){
      h+='<div class="sbcount"><span class="tag t-P">Attended '+n('P')+'</span><span class="tag t-A">Not attended '+n('N')+'</span><span class="tag t-U">Absent '+n('A')+'</span><span class="tag t-U">– Not marked '+um+'</span>'+(d&&d.by?'<em>Marked by '+esc(byShort(d.by))+' '+esc(d.time||'')+'</em>':'')+'</div>'+
        '<div class="tw sstw"><table class="sst"><tr><th>No.</th><th class="l">Student · recent test marks</th><th>'+esc(fmtD(S.date))+'</th></tr>'+act.map((m,i)=>{const v=ssVal(m.k.id);const b=(code,lbl,cc)=>'<button class="sbo'+(v===code?' on '+cc:'')+'" data-ssv="'+m.k.id+'|'+code+'">'+lbl+'</button>';
          return '<tr'+(ssDraftOf(m.k.id)!==undefined?' class="drf"':'')+'><td><b>'+(i+1)+'</b></td><td class="l"><div class="nn">'+esc(m.k.name)+'</div><div class="nd">'+dots([ssWhy(m),esc(modeLabel(m.k)),sbHow(m.k),ssDraftOf(m.k.id)!==undefined?'<b style="color:var(--late)">not saved</b>':''])+'</div><div>'+ssMarks(m.k.id,4)+'</div></td><td><div class="ssb">'+b('P','Attended','g')+b('N','Not attended','r')+b('A','Absent','a')+'</div></td></tr>'}).join('')+'</table></div>'+
        (frz.length?'<div class="sumline frz"><span class="tag t-U">Frozen – not staying · '+frz.length+'</span><ol>'+frz.map(m=>'<li><b>'+esc(m.k.name)+'</b><i>'+dots([esc(m.why||'Parents not allowing'),esc(modeLabel(m.k))])+'</i></li>').join('')+'</ol></div>':'')+
        (view?'':'<div class="row sbact">'+(um?'<button class="btn ghost sm" data-ssall="'+esc(c)+'">Mark remaining '+um+' as Attended</button>':'')+(dn?'<button class="btn" data-sssave="'+esc(sg)+'" style="flex:1">Save '+esc(clsName(c))+' ('+dn+')</button><button class="btn ghost" data-sscancel="'+esc(sg)+'">Cancel</button>':'')+'</div>');
    }else{
      const kd=ssDoc(c).kids||{};const rm=Object.keys(kd).filter(id=>KID[id]&&kd[id].rm);
      h+=ms.map((m,i)=>'<div class="nrow"><span class="no">'+(i+1)+'</span>'+nrow(esc(m.k.name),dots([ssWhy(m),m.frz?'<span class="tag t-U">Frozen'+(m.why?' – '+esc(m.why):'')+'</span>':'',esc(modeLabel(m.k))])+(view?'':'<div class="sbopts c2"><button class="sbo" data-ssfrz="'+m.k.id+'">'+(m.frz?'Unfreeze':'Freeze (not staying)')+'</button><button class="sbo" data-ssrm="'+m.k.id+'">Remove</button></div>'),'')+'</div>').join('')||'<p class="muted empty">No students in the list.</p>';
      if(rm.length)h+='<div class="sumline"><span class="tag t-U">Removed · '+rm.length+'</span><ol>'+rm.map(id=>'<li><b>'+esc(KID[id].name)+'</b>'+(view?'':' <button class="btn ghost sm" data-ssback="'+id+'">Add back</button>')+'</li>').join('')+'</ol></div>';
      if(!view){const opts=Object.values(KID).filter(k=>k.cls===c&&!(kd[k.id]&&!kd[k.id].rm)).sort(byName);h+='<div class="row" style="margin:10px 0 4px"><select data-ssadd="'+esc(c)+'" style="flex:1"><option value="">Add a student to '+esc(clsName(c))+'…</option>'+opts.map(k=>'<option value="'+k.id+'">'+esc(k.name)+' ('+esc(modeLabel(k))+')</option>').join('')+'</select></div>'}
    }});
  $('ssHint').innerHTML=view?'Viewing only. Choose your name in <b>Marked by</b> to mark or edit.':mode==='att'?'Tap <b>Attended</b> (green) or <b>Not attended</b> (red) for each student, then press Save. <b>Absent</b> = absent from school. The recent test marks from FIS Reports show under each name: <b>green</b> = he attended Smart Study in the 7 days before that test, <b>red</b> = he did not. The date-wise record is below. Frozen students are not staying.':'Freeze students whose parents do not allow them to stay, remove names, or add students. Changes save straight away.';
  ssLoadTests();$('ssList').innerHTML=catHead('Smart Study Session – '+fmtDL(S.date),T.all,'SB')+(mode==='att'?'<div class="sbcount"><span class="tag t-P">Attended '+T.P+'</span><span class="tag t-A">Not attended '+T.N+'</span><span class="tag t-U">Absent '+T.A+'</span><span class="tag t-U">– Not marked '+T.u+'</span><span class="tag t-U">Frozen '+T.f+'</span></div>':'')+(h||'<p class="muted empty">'+(mode==='att'?'No Smart Study students in the selected classes. Use "Update list from Poor Performers" or switch to Edit list to add students.':'Choose classes above.')+'</p>');
  if(mode==='att')renderSSRec(list);else if($('ssRec'))$('ssRec').innerHTML='';
}
/* Smart Study – test marks from FIS Reports + date-wise record */
const SSR={st:'',tests:null,asOf:''};
async function ssReadReports(pw){const b64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));const hex=h=>Uint8Array.from(h.match(/../g).map(x=>parseInt(x,16)));const base='../reports/';
  const lock=await (await fetch(base+'lock.json',{cache:'no-cache'})).json();let key=null;
  if(pw){const bk=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:hex(lock.salt),iterations:lock.iter},bk,256);
    key=await crypto.subtle.importKey('raw',bits,'AES-GCM',false,['decrypt']);const u=hex(lock.check);await crypto.subtle.decrypt({name:'AES-GCM',iv:u.slice(0,12)},key,u.slice(12));
    try{localStorage.setItem('fisReportsKey',JSON.stringify({salt:lock.salt,k:btoa(String.fromCharCode(...new Uint8Array(bits)))}))}catch(e){}}
  else{let sv=null;try{sv=JSON.parse(localStorage.getItem('fisReportsKey')||'null')}catch(e){}if(sv&&sv.salt===lock.salt)key=await crypto.subtle.importKey('raw',b64(sv.k),'AES-GCM',false,['decrypt'])}
  if(!key)return null;
  const buf=new Uint8Array(await (await fetch(base+'data.bin',{cache:'no-cache'})).arrayBuffer());
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:buf.slice(0,12)},key,buf.slice(12))))}
function ssSetTests(data){const T={};const mm={};
  (data.tests||[]).forEach(([sec,subj,lesson,date,max,marks])=>{if(!/[A-Za-z]/.test(subj||'')||!max)return;const c=ssClsOf(sec);if(!c||!SS_CLS().includes(c))return;
    Object.keys(marks||{}).forEach(nm=>{const key=c+'|'+nm;if(!(key in mm)){const k=ssMatch(nm,c);mm[key]=k?k.id:null}const id=mm[key];if(!id)return;(T[id]=T[id]||[]).push({subj,lesson,date:date||'',max,v:marks[nm]})})});
  Object.values(T).forEach(a=>a.sort((x,y)=>y.date.localeCompare(x.date)));SSR.tests=T;SSR.asOf=data.asOf||'';SSR.st='ok'}
async function ssLoadTests(){if(SSR.st)return;SSR.st='loading';try{const d=await ssReadReports();if(!d){SSR.st='nokey';return}ssSetTests(d)}catch(e){SSR.st='err'}if(S.view==='ss')render()}
function ssAddDays(d,n){const x=new Date(d+'T00:00');x.setDate(x.getDate()+n);return ymd(x)}
function ssTestTone(id,t){if(!t.date)return '';const from=ssAddDays(t.date,-7);let a=false,n=false;Object.keys(SSH.data).concat([S.date]).forEach(d=>{if(d<from||d>=t.date)return;const v=((ssH(d)[seg(KID[id].cls)]||{}).kids||{})[id];if(v==='P')a=true;else if(v==='N')n=true});return a?'g':n?'r':''}
function ssMarks(id,max){if(SSR.st!=='ok')return SSR.st==='loading'?'<span class="mk">Loading marks…</span>':'';const ts=(SSR.tests[id]||[]).slice(0,max||4);if(!ts.length)return '<span class="mk">No test marks found</span>';return ssChips(id,ts)}
function ssChips(id,ts){
  return ts.map(t=>{const num=typeof t.v==='number';const pc=num?Math.round(t.v/t.max*100):null;const tone=ssTestTone(id,t);
    return '<span class="mk '+tone+'" title="'+esc(t.subj+' '+(t.lesson||''))+'">'+esc(t.subj)+(t.lesson?' '+esc(String(t.lesson)).slice(0,14):'')+' · <b class="'+(pc!==null&&pc<60?'low':'')+'">'+(num?t.v+'/'+t.max:esc(String(t.v||'–')))+'</b>'+(t.date?' · '+esc(fmtD(t.date).replace(/^\w+, /,'')):'')+(tone==='g'?' ✓':tone==='r'?' ✗':'')+'</span>'}).join('')}
const SSH={key:'',data:{},loading:false};
function ssH(d){return d===S.date?(S.ss||{}):(SSH.data[d]||{})}
function ssDays(from,to){const out=[];let d=from;let g=0;while(d<=to&&g++<400){if(new Date(d+'T00:00').getDay()!==0)out.push(d);d=ssAddDays(d,1)}return out.slice(-62)}
function ssFrom(){const f=LS.get('ssFrom','');return f&&f<=S.date?f:ssAddDays(S.date,-30)}
async function loadSSH(dates){const ds=dates.filter(d=>d!==S.date);const key=ds.join(',')+'#'+(S.recTick||0);if(SSH.key===key||SSH.loading)return;SSH.loading=true;SSH.key=key;const data={};
  if(store.prefetch)await store.prefetch(ds);await Promise.all(ds.map(async d=>{data[d]=await store.getCol('att/'+d+'/ss')}));SSH.data=data;SSH.loading=false;if(S.view==='ss')render()}
function renderSSRec(list){const el=$('ssRec');if(!el)return;const from=ssFrom();const days=ssDays(from,S.date);loadSSH(days);
  const ae=document.activeElement;if(ae&&ae.id==='ssFromIn')return;
  let h='<div class="row" style="justify-content:space-between;align-items:flex-end"><div class="secthead" style="margin:0"><i></i><span>Smart Study Record</span><small>date-wise · tap a date to open it</small></div><div class="row"><div><label class="f">From</label><input type="date" id="ssFromIn" value="'+from+'" max="'+S.date+'"></div><div><label class="f">Till</label><b style="display:block;padding:9px 0">'+esc(fmtD(S.date))+'</b></div></div></div>';
  if(SSH.loading){el.innerHTML=h+'<p class="muted empty">Loading '+days.length+' days…</p>';return}
  const cls=list.filter(c=>ssMembers(c).length);
  if(!cls.length){el.innerHTML=h+'<p class="muted empty">No Smart Study students in the selected classes.</p>';return}
  const wd=d=>['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(d+'T00:00').getDay()]+'<br>'+d.slice(8)+'/'+d.slice(5,7);
  cls.forEach(c=>{const ms=ssMembers(c);const sg=seg(c);const sd=days.filter(d=>d===S.date||Object.keys((ssH(d)[sg]||{}).kids||{}).length);
    h+='<div class="cstrip"><span>'+esc(clsName(c))+'</span><small>'+ms.length+' students · '+sd.length+' days</small></div><div class="tw" style="max-height:none"><table class="ssg"><tr><th>No.</th><th class="l">Student</th>'+sd.map(d=>'<th class="'+(d===S.date?'cur':'')+'" data-ssdate="'+d+'" style="cursor:pointer">'+wd(d)+'</th>').join('')+'<th>Att.</th><th>Not</th><th class="l">Test marks in this period</th></tr>'+
      ms.map((m,i)=>{let a=0,nn=0;const cells=sd.map(d=>{const v=d===S.date?ssVal(m.k.id):((ssH(d)[sg]||{}).kids||{})[m.k.id];if(v==='P')a++;if(v==='N')nn++;return '<td>'+(v?'<span class="sc '+v+'">'+(v==='P'?'✓':v==='N'?'✗':'A')+'</span>':'<span class="muted">·</span>')+'</td>'}).join('');
        const tl=SSR.st==='ok'?(SSR.tests[m.k.id]||[]).filter(t=>t.date>=from&&t.date<=S.date):[];
        return '<tr><td>'+(i+1)+'</td><td class="l"><b>'+esc(m.k.name)+'</b>'+(m.frz?' <span class="tag t-U">Frozen</span>':'')+'</td>'+cells+'<td><b style="color:#1F6B47">'+a+'</b></td><td><b style="color:#A42A47">'+nn+'</b></td><td class="l" style="white-space:normal;min-width:200px">'+(SSR.st!=='ok'?'':tl.length?ssChips(m.k.id,tl):'<span class="muted">No test in this period</span>')+'</td></tr>'}).join('')+'</table></div>'});
  h+='<p class="muted" style="margin:10px 0 0"><span class="sc P">✓</span> attended · <span class="sc N">✗</span> not attended · <span class="sc A">A</span> absent. Marks: green ✓ = attended Smart Study in the 7 days before the test, red ✗ = did not attend. '+(SSR.st==='nokey'?'<b>Test marks: enter the FIS Reports password once in the box above and press Update.</b>':SSR.asOf?'Marks from FIS Reports (data as of '+esc(SSR.asOf)+').':'')+'</p>';
  el.innerHTML=h}
async function ssWriteList(c,fn){const sg=seg(c);const cur=S.ssList[sg]||{cls:c,kids:{}};const kids=JSON.parse(JSON.stringify(cur.kids||{}));fn(kids);
  await store.set('config/ss-'+sg,Object.assign({},cur,{cls:c,kids,by:$('ssBy').value,time:nowHM(),ts:Date.now()}))}
async function ssSave(sg){const dr=(S.ssDraft||{})[sg];if(!dr)return;const ids=Object.keys(dr);if(!ids.length)return;const c=KID[ids[0]].cls;const cur=S.ss[sg]||{};const kids=Object.assign({},cur.kids||{});ids.forEach(id=>kids[id]=dr[id]);
  await store.set('att/'+S.date+'/ss/'+sg,{cls:c,kids,by:$('ssBy').value,time:nowHM(),ts:Date.now()});delete S.ssDraft[sg];toast(clsName(c)+' Smart Study saved');render()}
/* poor performers from FIS Reports (same site, staff password) */
const ssNorm=s=>String(s||'').toLowerCase().replace(/[^a-z ]/g,' ').replace(/\s+/g,' ').trim();
function ssMatch(nm,cls){const ks=Object.values(KID).filter(k=>k.cls===cls);const n=ssNorm(nm);let m=ks.filter(k=>ssNorm(k.name)===n);if(m.length===1)return m[0];
  const t=n.split(' ');const f=t[0],l=t[t.length-1];m=ks.filter(k=>{const u=ssNorm(k.name).split(' ');return u[0]===f&&(t.length<2||u[u.length-1]===l)});if(m.length===1)return m[0];
  m=ks.filter(k=>ssNorm(k.name).split(' ')[0]===f);return m.length===1?m[0]:null}
function ssPoor(tests,run){const bySec={};tests.forEach(t=>(bySec[t.sec]=bySec[t.sec]||[]).push(t));const out={};
  Object.keys(bySec).forEach(sec=>{const ts=bySec[sec].slice().sort((a,b)=>(a.date||'').localeCompare(b.date||''));const names=[...new Set(ts.flatMap(t=>Object.keys(t.marks)))];
    names.forEach(nm=>{let r=0,best=0;ts.forEach(t=>{const v=t.marks[nm];if(v==='A'||v==='NG'||v===''||v===undefined)return;if(typeof v==='number'&&t.max&&v/t.max*100<60){r++;best=Math.max(best,r)}else r=0});if(best>=run)(out[sec]=out[sec]||[]).push({nm,best})})});return out}
function ssClsOf(sec){const m=/^(\d+)\s*-?\s*([A-Za-z])$/.exec(String(sec).trim());if(!m)return null;const g=GRADES.find(g=>String(ORD[g])===m[1]);return g&&CLASSES.find(c=>c===g+' - '+m[2].toUpperCase())}
async function ssPull(){if(needBy('ssBy'))return;S.ssPull={busy:true};render();
  const b64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));const hex=h=>Uint8Array.from(h.match(/../g).map(x=>parseInt(x,16)));const base='../reports/';
  try{const lock=await (await fetch(base+'lock.json',{cache:'no-cache'})).json();let key=null;
    const pwEl=$('ssPw');const pw=pwEl&&pwEl.value.trim();
    if(pw){const bk=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:hex(lock.salt),iterations:lock.iter},bk,256);
      key=await crypto.subtle.importKey('raw',bits,'AES-GCM',false,['decrypt']);try{const u=hex(lock.check);await crypto.subtle.decrypt({name:'AES-GCM',iv:u.slice(0,12)},key,u.slice(12))}catch(e){S.ssPull={needPw:true,msg:'Wrong Reports password. Please try again.'};render();return}
      try{localStorage.setItem('fisReportsKey',JSON.stringify({salt:lock.salt,k:btoa(String.fromCharCode(...new Uint8Array(bits)))}))}catch(e){}}
    else{let sv=null;try{sv=JSON.parse(localStorage.getItem('fisReportsKey')||'null')}catch(e){}if(sv&&sv.salt===lock.salt)key=await crypto.subtle.importKey('raw',b64(sv.k),'AES-GCM',false,['decrypt'])}
    if(!key){S.ssPull={needPw:true,msg:'Enter the FIS Reports password once on this phone, then press Update.'};render();return}
    const buf=new Uint8Array(await (await fetch(base+'data.bin',{cache:'no-cache'})).arrayBuffer());
    const data=JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:buf.slice(0,12)},key,buf.slice(12))));
    const tests=(data.tests||[]).map(([sec,subj,lesson,date,max,marks])=>({sec,subj,date,max,marks})).filter(t=>/[A-Za-z]/.test(t.subj)&&t.max);
    const run=+($('ssRun')||{}).value||2;const poor=ssPoor(tests,run);const un=[];let added=0,total=0;const by=$('ssBy').value;
    for(const c of SS_CLS()){const secKey=Object.keys(poor).find(s=>ssClsOf(s)===c);const found={};
      (secKey?poor[secKey]:[]).forEach(p=>{const k=ssMatch(p.nm,c);if(k)found[k.id]=p.best;else un.push(secLbl(c)+': '+p.nm)});
      const cur=(S.ssList[seg(c)]||{}).kids||{};const kids=JSON.parse(JSON.stringify(cur));let ch=false;
      Object.keys(found).forEach(id=>{total++;if(!kids[id]){kids[id]={src:'poor',run:found[id],by,since:S.date};added++;ch=true}else if(kids[id].src==='poor'&&(kids[id].run!==found[id]||kids[id].pp===false)){kids[id].run=found[id];delete kids[id].pp;ch=true}});
      Object.keys(kids).forEach(id=>{if(kids[id].src==='poor'&&!found[id]&&kids[id].pp!==false){kids[id].pp=false;ch=true}});
      if(ch)await store.set('config/ss-'+seg(c),Object.assign({},S.ssList[seg(c)]||{},{cls:c,kids,by,time:nowHM(),ts:Date.now()}))}
    await store.set('config/ss-_meta',{asOf:data.asOf||'',run,by,time:fmtD(S.date)+' '+nowHM(),ts:Date.now()});
    S.ssPull={msg:'Done: '+total+' poor performers found in Classes 1–10, '+added+' newly added.',unmatched:un};try{ssSetTests(data)}catch(e){}}
  catch(e){S.ssPull={msg:'Could not read FIS Reports here ('+esc(e.message||e)+'). Open the app from the FIS hub and try again.'}}
  render()}
/* MORNING ATTENDANCE – names & numbers */
function morningNames(list){
  const vk=new Set(list.map(v=>v.k));const all=Object.values(KID).filter(k=>k.walk||vk.has(k.v));
  const cat={ABS:[],LATE:[],EARLY:[],SB:[]};
  all.forEach(k=>{const st=kidStatus(k.id);const g=st.g||{};
    if(st.IN==='A')cat.ABS.push([k,g.in&&g.in.type==='ABS'?'Front Office'+(g.rem?' – '+g.rem:''):'Vehicle register']);
    if(st.IN==='LATE')cat.LATE.push([k,(g.in.time||'')+' → '+outPlan(k,g).t]);
    if(st.OUT==='EARLY')cat.EARLY.push([k,(g.out&&g.out.time||'')+(g.rem?' – '+g.rem:'')]);
    if(st.OUT==='SB')cat.SB.push([k,k.walk?'Walker':VBY[k.v].l]);});
  const blk=(key,title,cls)=>{const arr=cat[key];const by={};arr.forEach(x=>(by[x[0].cls]=by[x[0].cls]||[]).push(x));const cl=CLASSES.filter(c=>by[c]);
    return '<details class="nmblk"'+(arr.length&&arr.length<=40?' open':'')+'><summary><span class="tag t-'+cls+'" style="font-size:13px">'+title+'</span> <b>'+arr.length+'</b></summary>'+(cl.length?'<div class="tw" style="max-height:none;margin-top:8px"><table><tr><th>Class</th><th>No.</th><th>Names</th></tr>'+cl.map(c=>'<tr><td class="l"><b>'+esc(c)+'</b></td><td><b>'+by[c].length+'</b></td><td class="l" style="white-space:normal">'+by[c].map(x=>esc(x[0].name)+' <span class="muted">('+esc(key==='SB'?x[1]:modeLabel(x[0])+(x[1]?' · '+x[1]:''))+')</span>').join('; ')+'</td></tr>').join('')+'</table></div>':'<p class="muted">None.</p>')+'</details>'};
  return '<div class="secthead"><i></i><span>Student-wise – '+fmtD(S.date)+'</span><small>Names and numbers, class-wise</small></div>'+blk('ABS','Absent','A')+blk('LATE','Late Arrival','LATE')+blk('EARLY','Leaving Early','EARLY')+blk('SB','Stayback','SB');
}

async function saveSBClass(sg,by){const dr=(S.sbDraft||{})[sg];if(!dr)return;const ids=Object.keys(dr);if(!ids.length)return;const c=KID[ids[0]].cls;const cur=S.sb[sg]||{};const kids=Object.assign({},cur.kids||{});
  ids.forEach(id=>{kids[id]=dr[id]});
  await store.set('att/'+S.date+'/sb/'+sg,{cls:c,kids,by:by||$('sbBy').value||'PL',time:nowT(),ts:Date.now()});delete S.sbDraft[sg];toast(clsName(c)+' stay back saved')}
async function setDaySB(id,val,by){const c=KID[id].cls;const p='att/'+S.date+'/sb/'+seg(c);const cur=S.sb[seg(c)]||{};const kids=Object.assign({},cur.kids||{});
  kids[id]=val;
  await store.set(p,{cls:c,kids,by:by||$('sbBy').value||'PL',time:nowT(),ts:Date.now()});}

/* DASHBOARD */
function renderDash(){
  const f=$('dashF').value, sf=$('dashS').value;
  const sel=$('dashS');const cur=sel.value;const staffs=[...new Set(VEH.map(v=>staffOf(v.k)))];
  sel.innerHTML='<option value="">All staff</option>'+staffs.map(s=>'<option'+(s===cur?' selected':'')+'>'+esc(s)+'</option>').join('');
  const list=VEH.filter(v=>(!f||v.t===f)&&(!sf||staffOf(v.k)===sf));
  const dv=$('dashV').value;$('copyRep').classList.toggle('hide',!!dv);$('dashExtra').classList.toggle('hide',!dv);$('dashT').parentElement.classList.remove('hide');$('dashNote').classList.remove('hide');$('dashF').classList.remove('hide');$('dashS').classList.remove('hide');
  if(dv==='rec'){renderDashRecords();return}
  if(dv==='latem'){renderLateMonthly();return}
  if(dv==='unifm'){renderUnifMonthly();return}
  if(dv==='vehw'){renderVehWise(list);return}
  if(dv==='berr'){renderBusErr(list);return}
  if(dv==='arr'){renderDashArr(list);return}
  if(dv==='dep'){renderDashDep(list);return}
  if(dv==='week'){renderDashWeek(list);return}
  const T={roll:0,bus:0,abs:0,un:0,late:0,walkin:0,early:0,gowalk:0,sb:0,dep:0,present:0,sub:0};
  const rows=list.map(v=>{const s=vehStats(v);Object.keys(T).forEach(k=>{if(k!=='sub')T[k]+=s[k]});if(s.submitted)T.sub++;
    const status=s.submitted?'<span class="pill done">Done</span>':s.un<s.roll?'<span class="pill part">Partial</span>':'<span class="pill pend">Pending</span>';
    return '<tr class="click" data-veh="'+v.k+'"><td><b>'+esc(v.l)+'</b></td><td class="l">'+esc(staffOf(v.k))+'</td><td>'+s.roll+'</td><td>'+s.bus+'</td><td style="color:var(--a)">'+(s.abs||'')+'</td><td>'+(s.un||'')+'</td><td>'+(s.late+s.walkin||'')+'</td><td><b>'+s.present+'</b></td><td>'+(s.early||'')+'</td><td>'+(s.gowalk||'')+'</td><td style="color:var(--sb)">'+(s.sb||'')+'</td><td><b>'+s.dep+'</b></td><td>'+esc(s.arr||(S.veh[v.k]&&S.veh[v.k].arr)||'')+'</td><td>'+status+'</td></tr>'}).join('');
  $('dashT').innerHTML='<thead><tr><th>Vehicle</th><th>Duty</th><th>Total</th><th>IN (veh)</th><th>Absent</th><th>Pending</th><th>Late / Walk-in</th><th>Present in school</th><th>Early leave</th><th>Going by walk</th><th>SB</th><th>Departure</th><th>Arrival</th><th>Status</th></tr></thead><tbody>'+rows+
   '<tr class="tot"><td>Total</td><td class="l">'+T.sub+'/'+list.length+' submitted</td><td>'+T.roll+'</td><td>'+T.bus+'</td><td>'+T.abs+'</td><td>'+T.un+'</td><td>'+(T.late+T.walkin)+'</td><td>'+T.present+'</td><td>'+T.early+'</td><td>'+T.gowalk+'</td><td>'+T.sb+'</td><td>'+T.dep+'</td><td></td><td></td></tr></tbody>';
  $('kpis').innerHTML=[['Transport Students',T.roll],['Present in School',T.present,'var(--p)'],['Absent',T.abs,'var(--a)'],['Pending',T.un,'var(--un)'],['Late Arrivals',T.late+T.walkin,'var(--late)'],['Early Leavers + Pick-up',T.early+T.gowalk,'var(--early)'],['Stayback',T.sb,'var(--sb)'],['Departing by Vehicle',T.dep,'var(--brand)'],['Vehicles Submitted',T.sub+'/'+list.length]].map(k=>'<div class="kpi"><span>'+k[0]+'</span><b style="color:'+(k[2]||'var(--ink)')+'">'+k[1]+'</b></div>').join('');
  S.lastReport={list,T};
  $('dashExtra').classList.remove('hide');$('dashExtra').innerHTML=morningNames(list);
}
function reportText(){
  const {list,T}=S.lastReport;const d=new Date(S.date+'T00:00');
  let t='*FIS Student Entry Exit – '+d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})+'*\n';
  t+='Total '+T.roll+' | Present '+T.present+' | Absent '+T.abs+' | Late/Walk-in '+(T.late+T.walkin)+' | Early '+T.early+' | By walk '+T.gowalk+' | SB '+T.sb+' | Departure '+T.dep+'\n\n';
  list.forEach(v=>{const s=vehStats(v);t+=v.l+' ('+staffOf(v.k)+'): '+s.present+'/'+s.roll+' present'+(s.abs?', '+s.abs+' abs':'')+(s.un?', '+s.un+' not marked':'')+(s.sb?', SB '+s.sb:'')+' → dep '+s.dep+(s.submitted?'':' ⏳')+'\n'});
  const pend=list.filter(v=>!vehStats(v).submitted);if(pend.length)t+='\n⏳ Pending: '+pend.map(v=>v.l).join(', ');
  return t;
}
let modalVeh=null;
function renderModal(){
  const v=VBY[modalVeh];const s=vehStats(v);const vd=S.veh[v.k]||{};
  $('modalRoot').innerHTML='<div class="modal" id="mbg"><div class="card"><button class="x" id="mx">×</button><h2>'+esc(v.l)+' — '+esc(staffOf(v.k))+'</h2><div class="muted">'+(vd.submitted?'Submitted by '+esc(vd.by)+' at '+esc(vd.time):'Not submitted')+(vd.arr?' · Arrival '+esc(vd.arr):'')+'</div>'+
  '<div class="counts"><div><b>'+s.roll+'</b>Total</div><div><b>'+s.present+'</b>Present</div><div><b>'+s.abs+'</b>Absent</div><div><b>'+s.sb+'</b>SB</div><div><b>'+s.dep+'</b>Departure</div></div>'+
  '<div class="tw"><table><tr><th>S.No.</th><th>SB</th><th>Name</th><th>Class</th><th>IN</th><th>OUT</th></tr>'+v.kids.map(k=>{const id=v.k+'-'+k[0];const st=kidStatus(id);return '<tr><td>'+k[0]+'</td><td>'+(st.OUT==='SB'||sbOf(id)?'<span class="tag t-SB">Stayback</span>':'')+'</td><td class="l">'+esc(k[1])+'</td><td>'+esc(k[2])+'</td><td><span class="tag t-'+st.IN+'">'+LBL[st.IN]+'</span></td><td>'+(st.OUT?'<span class="tag t-'+st.OUT+'">'+LBL[st.OUT]+'</span>':'')+'</td></tr>'}).join('')+'</table></div></div></div>';
}

/* DEPARTURE CHECKS & ERRORS */
const DERR_TYPES=['Wrong marking','Child stayed back (marked going)','Child not staying back (marked SB)','Child missing at departure','Driver uniform','Conductor uniform','Other'];
function depChecksHtml(v){
  const de=S.derr[v.k]||{};const ch=de.checks||{};const items=de.items||[];
  const chk=(key,lbl)=>'<div class="row" style="margin:4px 0"><span style="min-width:150px;font-weight:600">'+lbl+'</span>'+
    ['OK','NOT'].map(val=>'<button class="tg '+(ch[key]===val?(val==='OK'?'P':'A'):'U')+'" data-chk="'+key+':'+val+'">'+(val==='OK'?'In Uniform':'Not in Uniform')+'</button>').join(' ')+'</div>';
  return '<div class="card" style="margin:12px 0 0;border:1px solid var(--line)"><h2>Departure Checks</h2>'+(hasDrvU(v.k)?chk('driver','Driver uniform'):'')+(hasConU(v.k)?chk('conductor','Conductor uniform'):'')+(!hasDrvU(v.k)&&!hasConU(v.k)?'<p class="muted" style="margin:0 0 6px">No uniform check for this vehicle.</p>':'')+
    '<h3>Report an Error</h3><div class="row"><select id="derrType" style="min-width:200px">'+DERR_TYPES.map(t=>'<option>'+esc(t)+'</option>').join('')+'</select>'+
    '<select id="derrKid" style="min-width:180px"><option value="">Child (optional)</option>'+v.kids.map(k=>'<option value="'+v.k+'-'+k[0]+'">'+k[0]+'. '+esc(k[1])+'</option>').join('')+'</select></div>'+
    '<div class="row" style="margin-top:8px"><input type="text" id="derrRem" placeholder="What happened? (remark)" style="flex:1"><button class="btn" id="derrAdd">Add Error</button></div>'+
    (items.length?'<div style="margin-top:10px">'+items.map((it,i)=>'<div class="kid"><div class="nm"><div><span class="tag t-A">'+esc(it.type)+'</span> '+(it.kid&&KID[it.kid]?esc(KID[it.kid].name):'')+'</div><span>'+esc(it.time||'')+' · '+esc(it.by||'')+(it.rem?' · '+esc(it.rem):'')+'</span></div><button class="btn ghost sm" data-derrcp="'+i+'">Copy</button><button class="btn ghost sm" data-derrwa="'+i+'">WhatsApp</button><button class="btn ghost sm" data-derrdel="'+i+'">Remove</button></div>').join('')+'<div class="row" style="margin-top:8px"><button class="btn ghost sm" data-derrall="cp">Copy all errors</button><button class="btn ghost sm" data-derrall="wa">Send all to WhatsApp</button></div></div>':'<p class="muted" style="margin:8px 0 0">No errors reported.</p>')+'</div>';
}
async function saveDerr(vk,patch){const cur=S.derr[vk]||{};await store.set('att/'+S.date+'/derr/'+vk,Object.assign({checks:cur.checks||{},items:cur.items||[]},patch,{ts:Date.now()}))}

/* DASHBOARD VIEWS */
function weekDates(d){const x=new Date(d+'T00:00');const day=(x.getDay()+6)%7;x.setDate(x.getDate()-day);const out=[];for(let i=0;i<6;i++){const y=new Date(x);y.setDate(x.getDate()+i);out.push(y.getFullYear()+'-'+String(y.getMonth()+1).padStart(2,'0')+'-'+String(y.getDate()).padStart(2,'0'))}return out}
const WK={key:'',data:{},loading:false};
async function loadWeek(){
  const dates=weekDates(S.date);const key=dates[0]+(S.weekTick||0);if(WK.key===key||WK.loading)return;
  WK.loading=true;WK.key=key;const data={};
  await store.prefetch(dates);
  for(const d of dates){data[d]={};for(const c of ['veh','gate','sb','out','derr']){data[d][c]=await store.getCol('att/'+d+'/'+c)}}
  WK.data=data;WK.loading=false;if(S.view==='dash')renderDash();
}
function withDate(dd,fn){const keep={veh:S.veh,gate:S.gate,sb:S.sb,out:S.out,derr:S.derr,ss:S.ss};Object.assign(S,dd);try{return fn()}finally{Object.assign(S,keep)}}
function fmtD(d){return new Date(d+'T00:00').toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short'})}
function renderDashDep(list){
  let T={go:0,b:0,early:0,sb:0,walk:0,err:0,du:0,cu:0,dep:0};
  const rows=list.map(v=>{const od=S.out[v.k]||{};const de=S.derr[v.k]||{};const ch=de.checks||{};const s=vehStats(v);const b=Object.keys(od.marks||{}).length;const ne=(de.items||[]).length;
    T.go+=s.dep;T.b+=b;T.early+=s.early;T.sb+=s.sb;T.walk+=s.gowalk;T.err+=ne;if(ch.driver==='NOT')T.du++;if(ch.conductor==='NOT')T.cu++;if(od.submitted)T.dep++;
    const u=x=>x==='OK'?'<span class="tag t-P">✓</span>':x==='NOT'?'<span class="tag t-A">✗</span>':'<span class="muted">–</span>';
    return '<tr class="click" data-veh="'+v.k+'"><td><b>'+esc(v.l)+'</b></td><td class="l">'+esc(staffOf(v.k))+'</td><td><b>'+s.dep+'</b></td><td>'+b+'</td><td>'+(s.early||'')+'</td><td>'+(s.gowalk||'')+'</td><td>'+(s.sb||'')+'</td><td>'+u(ch.driver)+'</td><td>'+u(ch.conductor)+'</td><td style="color:var(--a)">'+(ne?'<b>'+ne+'</b>':'')+'</td><td>'+(od.submitted?'<span class="pill done">'+esc(od.time)+'</span>':'<span class="pill pend">Pending</span>')+'</td></tr>'}).join('');
  $('dashT').innerHTML='<thead><tr><th>Vehicle</th><th>Duty</th><th>Going</th><th>Boarded</th><th>Leaving early</th><th>By walk</th><th>SB</th><th>Driver uniform</th><th>Conductor uniform</th><th>Errors</th><th>Departed</th></tr></thead><tbody>'+rows+
    '<tr class="tot"><td>Total</td><td class="l">'+T.dep+'/'+list.length+' departed</td><td>'+T.go+'</td><td>'+T.b+'</td><td>'+T.early+'</td><td>'+T.walk+'</td><td>'+T.sb+'</td><td>'+(T.du?T.du+' ✗':'')+'</td><td>'+(T.cu?T.cu+' ✗':'')+'</td><td>'+T.err+'</td><td></td></tr></tbody>';
  $('kpis').innerHTML=[['Going in vehicles',T.go,'var(--brand)'],['Boarded',T.b,'var(--p)'],['Vehicles departed',T.dep+'/'+list.length],['Departure errors',T.err,'var(--a)'],['Driver not in uniform',T.du,'var(--a)'],['Conductor not in uniform',T.cu,'var(--a)']].map(k=>'<div class="kpi"><span>'+k[0]+'</span><b style="color:'+(k[2]||'var(--ink)')+'">'+k[1]+'</b></div>').join('');
  const errs=[];list.forEach(v=>((S.derr[v.k]||{}).items||[]).forEach(it=>errs.push([v,it])));
  $('dashExtra').innerHTML='<div class="row"><h2 style="margin:0">Departure errors – '+fmtD(S.date)+'</h2><button class="btn ghost sm" id="berrDayCp">Copy day-wise message</button><button class="btn sm" id="berrDayWa">Send to WhatsApp</button></div>'+(errs.length?'<div class="tw" style="max-height:none"><table><tr><th>Vehicle</th><th>Error</th><th>Child</th><th>Remark</th><th>By / time</th></tr>'+errs.map(([v,it])=>'<tr><td><b>'+esc(v.l)+'</b></td><td><span class="tag t-A">'+esc(it.type)+'</span></td><td class="l">'+(it.kid&&KID[it.kid]?esc(KID[it.kid].name)+' <span class="muted">'+esc(KID[it.kid].cls)+'</span>':'')+'</td><td class="l">'+esc(it.rem||'')+'</td><td>'+esc(it.by||'')+' '+esc(it.time||'')+'</td></tr>').join('')+'</table></div>':'<p class="muted">No departure errors.</p>');
}
function renderDashWeek(list){
  loadWeek();const dates=weekDates(S.date);
  if(WK.loading||!WK.data[dates[0]]){$('dashT').innerHTML='<tr><td>Loading week…</td></tr>';$('kpis').innerHTML='';$('dashExtra').innerHTML='';return}
  const per={};const obs=[];const uni={};
  dates.forEach(d=>withDate(WK.data[d],()=>{list.forEach(v=>{const s=vehStats(v);const marked=s.roll-s.un>0;(per[v.k]=per[v.k]||{})[d]=marked?{p:s.present,a:s.abs,sb:s.sb,dep:s.dep}:null;
    const de=S.derr[v.k]||{};const ch=de.checks||{};const u=(uni[v.k]=uni[v.k]||{d:0,c:0,e:0});if(ch.driver==='NOT'){u.d++;obs.push([d,v,'Driver not in uniform','',''])}if(ch.conductor==='NOT'){u.c++;obs.push([d,v,'Conductor not in uniform','',''])}
    (de.items||[]).forEach(it=>{u.e++;obs.push([d,v,it.type,it.kid&&KID[it.kid]?KID[it.kid].name:'',it.rem||''])});})}));
  const dayTot=dates.map(d=>list.reduce((a,v)=>{const c=per[v.k][d];if(c){a.p+=c.p;a.a+=c.a}return a},{p:0,a:0}));
  $('kpis').innerHTML=[['Week',fmtD(dates[0])+' – '+fmtD(dates[5])],['Departure errors',Object.values(uni).reduce((a,u)=>a+u.e,0),'var(--a)'],['Driver uniform ✗',Object.values(uni).reduce((a,u)=>a+u.d,0),'var(--a)'],['Conductor uniform ✗',Object.values(uni).reduce((a,u)=>a+u.c,0),'var(--a)']].map(k=>'<div class="kpi"><span>'+k[0]+'</span><b style="font-size:'+(k[0]==='Week'?'15px':'24px')+';color:'+(k[2]||'var(--ink)')+'">'+k[1]+'</b></div>').join('');
  $('dashT').innerHTML='<thead><tr><th>Vehicle</th><th>Duty</th>'+dates.map(d=>'<th>'+fmtD(d)+'<br><span style="font-weight:400">P / A</span></th>').join('')+'<th>Week absent</th></tr></thead><tbody>'+
    list.map(v=>{let wa=0;return '<tr class="click" data-veh="'+v.k+'"><td><b>'+esc(v.l)+'</b></td><td class="l">'+esc(staffOf(v.k))+'</td>'+dates.map(d=>{const c=per[v.k][d];if(!c)return '<td class="muted">–</td>';wa+=c.a;return '<td><b style="color:var(--p)">'+c.p+'</b> / <b style="color:'+(c.a?'var(--a)':'var(--un)')+'">'+c.a+'</b></td>'}).join('')+'<td style="color:var(--a)"><b>'+(wa||'')+'</b></td></tr>'}).join('')+
    '<tr class="tot"><td>Total</td><td></td>'+dayTot.map(t=>'<td>'+t.p+' / '+t.a+'</td>').join('')+'<td>'+dayTot.reduce((a,t)=>a+t.a,0)+'</td></tr></tbody>';
  $('dashExtra').innerHTML='<h2>Weekly observation</h2>'+
    '<div class="tw" style="max-height:none;margin-bottom:12px"><table><tr><th>Vehicle</th><th>Duty</th><th>Driver uniform ✗ (days)</th><th>Conductor uniform ✗ (days)</th><th>Departure errors</th></tr>'+
    list.filter(v=>{const u=uni[v.k];return u&&(u.d||u.c||u.e)}).map(v=>{const u=uni[v.k];return '<tr><td><b>'+esc(v.l)+'</b></td><td class="l">'+esc(staffOf(v.k))+'</td><td style="color:var(--a)">'+(u.d||'')+'</td><td style="color:var(--a)">'+(u.c||'')+'</td><td style="color:var(--a)">'+(u.e||'')+'</td></tr>'}).join('')+'</table></div>'+
    (obs.length?'<div class="tw" style="max-height:none"><table><tr><th>Date</th><th>Vehicle</th><th>Observation</th><th>Child</th><th>Remark</th></tr>'+obs.map(o=>'<tr><td>'+fmtD(o[0])+'</td><td><b>'+esc(o[1].l)+'</b></td><td><span class="tag t-A">'+esc(o[2])+'</span></td><td class="l">'+esc(o[3])+'</td><td class="l">'+esc(o[4])+'</td></tr>').join('')+'</table></div>':'<p class="muted">No observations this week.</p>')+
    '<button class="btn ghost sm" id="wkRefresh" style="margin-top:10px">Refresh Week</button>';
}

/* VEHICLE-WISE REPORT */
function vehWiseData(v){const vd=S.veh[v.k]||{},od=S.out[v.k]||{};const g={ABS:[],PEND:[],LATE:[],EARLY:[],SB:[],SBD:[],PARENT:[],PD:[],TODAY:[]};let present=0,going=0,boarded=0;
  v.kids.forEach(k=>{const id=v.k+'-'+k[0];if(!KID[id])return;const st=kidStatus(id);const gt=st.g||{};const nm={n:k[0],name:k[1],cls:k[2]};
    if(!st.present){(st.IN==='U'?g.PEND:g.ABS).push(nm);return}
    present++;if(st.IN==='LATE')g.LATE.push(Object.assign({t:gt.in&&gt.in.time},nm));if(st.IN==='PD')g.PD.push(nm);
    if(st.OUT==='VEH'){going++;if((od.marks||{})[k[0]])boarded++}
    else if(st.OUT==='EARLY')g.EARLY.push(Object.assign({t:gt.out&&gt.out.time},nm));
    else if(st.OUT==='SB')(sbDoubt(id)?g.SBD:g.SB).push(nm);
    else if(st.OUT==='GOWALK')g.PARENT.push(nm)});
  Object.entries(vd.extra||{}).forEach(([x,e])=>{const m=(vd.marks||{})[x];g.TODAY.push({n:'+',name:e.name,cls:e.cls||'',t:m==='P'?'Present':m==='A'?'Absent':''});if(m==='P'){going++;if((od.marks||{})[x])boarded++}});
  return {vd,od,g,present,going,boarded,roll:v.kids.filter(k=>KID[v.k+'-'+k[0]]).length}}
const VW_SEG=[['ABS','Absent','A'],['PEND','Not marked','U'],['LATE','Late Arrival','LATE'],['PD','Dropped by Parent','PD'],['EARLY','Leaving Early','EARLY'],['SB','Stayback','SB'],['SBD','Stayback doubt','LATE'],['PARENT','Parent Pick-up','GOWALK'],['TODAY','Today only','VEH']];
function renderVehWise(list){
  $('dashT').parentElement.classList.add('hide');$('dashNote').classList.add('hide');
  let T={roll:0,present:0,abs:0,going:0,boarded:0};
  const cards=list.map(v=>{const d=vehWiseData(v);T.roll+=d.roll;T.present+=d.present;T.abs+=d.g.ABS.length;T.going+=d.going;T.boarded+=d.boarded;
    const nm=a=>a.map(x=>esc(x.name)+' <span class="muted">('+esc(shortCls(x.cls))+(x.t?' · '+esc(x.t):'')+')</span>').join(', ');
    return '<div class="card" style="margin-bottom:10px;padding:12px"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><b style="font-size:16px;color:var(--brand)">'+esc(v.l)+'</b> <span class="muted">· '+esc(staffOf(v.k))+'</span></div><span class="muted">'+(d.vd.arr?'Arrived '+esc(hm12(d.vd.arr)):'Arrival –')+'</span></div>'+
      '<div class="row" style="gap:6px;margin:6px 0"><span class="tag t-PRES">Present '+d.present+'/'+d.roll+'</span><span class="tag t-A">Absent '+d.g.ABS.length+'</span><span class="tag t-VEH">Going home '+d.going+'</span><span class="tag '+(d.od.submitted?'t-PRES':'t-U')+'">Boarded '+(d.od.submitted?d.boarded+'/'+d.going:'not submitted')+'</span>'+(d.vd.submitted?'':'<span class="tag t-U">Morning not submitted</span>')+'</div>'+
      VW_SEG.filter(s=>d.g[s[0]].length).map(s=>'<div style="margin:4px 0;font-size:14px"><span class="tag t-'+s[2]+'">'+s[1]+' '+d.g[s[0]].length+'</span> '+nm(d.g[s[0]])+'</div>').join('')+'</div>'}).join('');
  $('kpis').innerHTML=[['Students',T.roll,'var(--brand)'],['Present',T.present,'var(--p)'],['Absent',T.abs,'var(--a)'],['Going home in vehicles',T.going,'var(--brand)'],['Boarded',T.boarded,'var(--p)']].map(k=>'<div class="kpi"><span>'+k[0]+'</span><b style="color:'+k[2]+'">'+k[1]+'</b></div>').join('');
  $('dashExtra').innerHTML='<div class="row" style="margin-bottom:10px"><b>Departure Audit – '+esc(fmtD(S.date))+'</b><button class="btn ghost sm" id="vwCopy">Copy List (WhatsApp)</button><span class="muted">Use the vehicle-type and staff filters above.</span></div>'+(cards||'<p class="muted">No vehicles.</p>');
}
function vehWiseText(){const f=$('dashF').value,sf=$('dashS').value;const list=VEH.filter(v=>(!f||v.t===f)&&(!sf||staffOf(v.k)===sf));
  return '*Departure Audit – '+fmtD(S.date)+'*\n'+list.map(v=>{const d=vehWiseData(v);
    return '\n*'+v.l+'* ('+staffOf(v.k)+')'+(d.vd.arr?' · arrived '+hm12(d.vd.arr):'')+'\nPresent '+d.present+'/'+d.roll+' · Absent '+d.g.ABS.length+' · Going home '+d.going+(d.od.submitted?' · Boarded '+d.boarded:'')+
      VW_SEG.filter(s=>d.g[s[0]].length).map(s=>'\n'+s[1]+': '+d.g[s[0]].map(x=>x.name+' '+shortCls(x.cls)+(x.t?' ('+x.t+')':'')).join(', ')).join('')}).join('\n')}

/* UNIFORM DEFAULTERS – MONTHLY */
function unifMonthlyRows(){const dates=periodDates('month');const by={};dates.forEach(d=>{const gc=d===S.date?S.gate:((RG.data[d]||{}).gate||{});Object.entries(gc).forEach(([id,g])=>{if(g.unif&&(g.unif.items||[]).length&&KID[id])(by[id]=by[id]||[]).push({d,u:g.unif})})});
  const it=S.unifItem||'';const min=S.unifMin||1;
  return Object.entries(by).map(([id,a])=>{const c={};a.forEach(x=>x.u.items.forEach(i=>c[i]=(c[i]||0)+1));return {k:KID[id],a,c}}).filter(r=>(!it||r.c[it])&&r.a.length>=min)
    .sort((x,y)=>y.a.length-x.a.length||CLASSES.indexOf(x.k.cls)-CLASSES.indexOf(y.k.cls)||x.k.name.localeCompare(y.k.name))}
function renderUnifMonthly(){
  $('dashT').parentElement.classList.add('hide');$('dashNote').classList.add('hide');$('dashF').classList.add('hide');$('dashS').classList.add('hide');$('kpis').innerHTML='';
  const dates=periodDates('month');const mon=new Date(S.date+'T00:00').toLocaleDateString('en-IN',{month:'long',year:'numeric'});
  const ctl='<div class="row" style="margin-bottom:10px"><b>'+esc(mon)+'</b><select id="unifItem"><option value="">All defects</option>'+UNIF.map(u=>'<option value="'+u[0]+'"'+(S.unifItem===u[0]?' selected':'')+'>'+u[1]+'</option>').join('')+'</select><select id="unifMin">'+[1,2,3,4,5].map(n=>'<option value="'+n+'"'+((S.unifMin||1)===n?' selected':'')+'>'+(n===1?'All defaulters':n+'+ days')+'</option>').join('')+'</select><button class="btn ghost sm" id="unifCopy">Copy List (WhatsApp)</button></div>';
  loadRange(dates);if(RG.loading||!dates.every(d=>d===S.date||RG.data[d])){$('dashExtra').innerHTML=ctl+'<p class="muted">Loading '+dates.length+' days…</p>';return}
  const rows=unifMonthlyRows();const tc={};rows.forEach(r=>Object.entries(r.c).forEach(([i,n])=>tc[i]=(tc[i]||0)+n));
  $('kpis').innerHTML=[['Uniform defaulters',rows.length,'var(--late)'],['Defaulter days',rows.reduce((s,r)=>s+r.a.length,0),'var(--late)'],['3+ days',rows.filter(r=>r.a.length>=3).length,'var(--a)']].map(k=>'<div class="kpi"><span>'+k[0]+'</span><b style="color:'+k[2]+'">'+k[1]+'</b></div>').join('');
  $('dashExtra').innerHTML=ctl+'<div class="row" style="gap:6px;margin-bottom:10px">'+UNIF.map(u=>'<span class="tag '+(tc[u[0]]?'t-LATE':'t-U')+'">'+u[1]+' '+(tc[u[0]]||0)+'</span>').join('')+'</div>'+
    (rows.length?'<div class="tw"><table class="grid"><tr><th>#</th><th class="l">Student</th><th>Class</th><th>Vehicle / Mode</th><th>Days</th>'+UNIF.map(u=>'<th>'+u[1].replace(' Forget','').replace('Wrong ','')+'</th>').join('')+'<th class="l">Dates</th></tr>'+
    rows.map((r,i)=>'<tr><td>'+(i+1)+'</td><td class="l"><b>'+esc(r.k.name)+'</b></td><td>'+esc(shortCls(r.k.cls))+'</td><td>'+esc(vehShort(r.k))+'</td><td><b style="color:'+(r.a.length>=3?'var(--a)':'var(--late)')+'">'+r.a.length+'</b></td>'+UNIF.map(u=>'<td>'+(r.c[u[0]]||'')+'</td>').join('')+'<td class="l">'+r.a.map(x=>esc(fmtD(x.d).replace(/^\w+, /,''))+' ('+esc(unifTxt(x.u))+')').join('; ')+'</td></tr>').join('')+'</table></div>':'<p class="muted">No uniform defaulters recorded this month.</p>');
}
function unifMonthlyText(){const mon=new Date(S.date+'T00:00').toLocaleDateString('en-IN',{month:'long',year:'numeric'});
  return '*Uniform Defaulters – '+mon+(S.unifItem?' ('+UNIFL[S.unifItem]+')':'')+'*\n'+unifMonthlyRows().map((r,i)=>(i+1)+'. '+r.k.name+' '+shortCls(r.k.cls)+' - '+vehShort(r.k)+' - '+r.a.length+' time'+(r.a.length>1?'s':'')+' ('+UNIF.filter(u=>r.c[u[0]]).map(u=>u[1]+(r.c[u[0]]>1?' ×'+r.c[u[0]]:'')).join(', ')+')').join('\n')}


/* BUS ERROR REPORT – MONTHLY (departure errors + driver/conductor uniform, morning & departure) */
function busErrRows(list){const dates=periodDates('month');const rows=[];const per={};
  dates.forEach(d=>{const dd=d===S.date?{veh:S.veh,derr:S.derr}:(RG.data[d]||{});
    list.forEach(v=>{const p=(per[v.k]=per[v.k]||{v,n:0,t:{},du:0,cu:0});const vd=(dd.veh||{})[v.k]||{};const de=(dd.derr||{})[v.k]||{};const ch=de.checks||{};
      (de.items||[]).filter(it=>it.type!=='Driver uniform'&&it.type!=='Conductor uniform').forEach(it=>{p.n++;p.t[it.type]=(p.t[it.type]||0)+1;rows.push({d,v,type:it.type,kid:it.kid,rem:it.rem||'',by:(it.by||'')+(it.time?' · '+it.time:'')})});
      const dr=[];if(vd.driverU==='NOT')dr.push('morning');if(ch.driver==='NOT')dr.push('departure');((de.items||[]).filter(it=>it.type==='Driver uniform')).forEach(it=>{if(!dr.includes('departure'))dr.push('departure')});
      const cr=[];if(vd.condU==='NOT')cr.push('morning');if(ch.conductor==='NOT')cr.push('departure');((de.items||[]).filter(it=>it.type==='Conductor uniform')).forEach(it=>{if(!cr.includes('departure'))cr.push('departure')});
      if(dr.length){p.du++;p.n++;rows.push({d,v,type:'Driver not in uniform',kid:'',rem:dr.join(' & '),by:''})}
      if(cr.length){p.cu++;p.n++;rows.push({d,v,type:'Conductor not in uniform',kid:'',rem:cr.join(' & '),by:''})}})});
  if(S.berrType)return {rows:rows.filter(r=>r.type===S.berrType),per};return {rows,per}}

function errMsg(d,v,it){const k=it.kid&&KID[it.kid];return '*Bus Error – '+v.l+'*\nDate: '+fmtD(d)+'\nDuty: '+staffOf(v.k)+'\nError: '+it.type+(k?'\nChild: '+k.name+' ('+shortCls(k.cls)+')':'')+(it.rem?'\nRemark: '+it.rem:'')+(it.by?'\nReported by: '+it.by+(it.time?' at '+it.time:''):'')}
async function waSend(txt){try{await navigator.clipboard.writeText(txt);toast('Copied – opening WhatsApp')}catch(e){}window.open('https://wa.me/?text='+encodeURIComponent(txt),'_blank')}
async function copyTxt(txt){try{await navigator.clipboard.writeText(txt);toast('Copied')}catch(err){showText(txt)}}
let BERR_ROWS=[];
const BERR_T=['Wrong marking','Child stayed back (marked going)','Child not staying back (marked SB)','Child missing at departure','Other'];
function renderBusErr(list){
  $('dashT').parentElement.classList.add('hide');$('dashNote').classList.add('hide');$('dashS').classList.add('hide');$('kpis').innerHTML='';
  const dates=periodDates('month');const mon=new Date(S.date+'T00:00').toLocaleDateString('en-IN',{month:'long',year:'numeric'});
  const types=BERR_T.concat(['Driver not in uniform','Conductor not in uniform']);
  const ctl='<div class="row" style="margin-bottom:10px"><b>Bus Error Report – '+esc(mon)+'</b><select id="berrType"><option value="">All errors</option>'+types.map(t=>'<option'+(S.berrType===t?' selected':'')+'>'+esc(t)+'</option>').join('')+'</select><button class="btn ghost sm" id="berrCopy">Copy List (WhatsApp)</button><button class="btn sm" id="berrDayWa">Day-wise Message ('+esc(fmtD(S.date))+')</button></div>';
  loadRange(dates);if(RG.loading||!dates.every(d=>d===S.date||RG.data[d])){$('dashExtra').innerHTML=ctl+'<p class="muted">Loading '+dates.length+' days…</p>';return}
  const {rows,per}=busErrRows(list);const pv=Object.values(per).filter(p=>p.n).sort((a,b)=>b.n-a.n);
  const tot={n:0,du:0,cu:0,t:{}};pv.forEach(p=>{tot.n+=p.n;tot.du+=p.du;tot.cu+=p.cu;Object.entries(p.t).forEach(([k,n])=>tot.t[k]=(tot.t[k]||0)+n)});
  $('kpis').innerHTML=[['Total errors',tot.n,'var(--a)'],['Vehicles with errors',pv.length+'/'+list.length,'var(--late)'],['Driver not in uniform (days)',tot.du,'var(--a)'],['Conductor not in uniform (days)',tot.cu,'var(--a)']].map(k=>'<div class="kpi"><span>'+k[0]+'</span><b style="color:'+k[2]+'">'+k[1]+'</b></div>').join('');
  const sh=t=>({'Wrong marking':'Wrong marking','Child stayed back (marked going)':'Stayed back (marked going)','Child not staying back (marked SB)':'Not staying (marked SB)','Child missing at departure':'Missing at departure','Other':'Other'})[t]||t;
  let h=ctl+'<div class="secthead"><i></i><span>Vehicle-wise summary</span></div>'+(pv.length?'<div class="tw"><table class="grid"><tr><th>#</th><th class="l">Vehicle</th><th class="l">Duty</th><th>Total</th>'+BERR_T.map(t=>'<th>'+esc(sh(t))+'</th>').join('')+'<th>Driver uniform ✗</th><th>Conductor uniform ✗</th></tr>'+
    pv.map((p,i)=>'<tr class="click" data-veh="'+p.v.k+'"><td>'+(i+1)+'</td><td class="l"><b>'+esc(p.v.l)+'</b></td><td class="l">'+esc(staffOf(p.v.k))+'</td><td><b style="color:var(--a)">'+p.n+'</b></td>'+BERR_T.map(t=>'<td>'+(p.t[t]||'')+'</td>').join('')+'<td>'+(p.du||'')+'</td><td>'+(p.cu||'')+'</td></tr>').join('')+
    '<tr class="tot"><td></td><td class="l">Total</td><td></td><td>'+tot.n+'</td>'+BERR_T.map(t=>'<td>'+(tot.t[t]||'')+'</td>').join('')+'<td>'+(tot.du||'')+'</td><td>'+(tot.cu||'')+'</td></tr></table></div>':'<p class="muted">No bus errors recorded this month.</p>');
  if(rows.length){rows.sort((a,b)=>a.d<b.d?1:a.d>b.d?-1:a.v.l.localeCompare(b.v.l));
    BERR_ROWS=rows;h+='<div class="secthead" style="margin-top:16px"><i></i><span>Error details</span><small>'+rows.length+' entries</small></div><div class="row" style="margin-bottom:8px"><button class="btn ghost sm" id="berrDetCopy">Copy details (WhatsApp)</button><button class="btn ghost sm" id="berrDetWa">Send details to WhatsApp</button></div><div class="tw" style="max-height:none"><table><tr><th>Date</th><th class="l">Vehicle</th><th>Error</th><th class="l">Child</th><th class="l">Remark</th><th class="l">By / time</th><th>Share</th></tr>'+
    rows.map((r,ri)=>'<tr><td>'+esc(fmtD(r.d))+'</td><td class="l"><b>'+esc(r.v.l)+'</b></td><td><span class="tag t-A">'+esc(r.type)+'</span></td><td class="l">'+(r.kid&&KID[r.kid]?esc(KID[r.kid].name)+' <span class="muted">'+esc(shortCls(KID[r.kid].cls))+'</span>':'')+'</td><td class="l">'+esc(r.rem)+'</td><td class="l muted">'+esc(r.by)+'</td><td style="white-space:nowrap"><button class="btn ghost sm" data-berrcp="'+ri+'">Copy</button> <button class="btn ghost sm" data-berrwa="'+ri+'">WhatsApp</button></td></tr>').join('')+'</table></div>'}
  $('dashExtra').innerHTML=h;
}
function busErrDetText(){const mon=new Date(S.date+'T00:00').toLocaleDateString('en-IN',{month:'long',year:'numeric'});return '*Bus Error Details – '+mon+(S.berrType?' ('+S.berrType+')':'')+'*\n'+BERR_ROWS.map((r,i)=>{const k=r.kid&&KID[r.kid];return (i+1)+'. '+fmtD(r.d)+' – '+r.v.l+' – '+r.type+(k?' – '+k.name+' ('+shortCls(k.cls)+')':'')+(r.rem?' – '+r.rem:'')+(r.by?' [by '+r.by+']':'')}).join('\n')}
function busErrDayText(list,d){d=d||S.date;const dd=new Date(d+'T00:00').toLocaleDateString('en-IN',{day:'numeric',month:'long'});const rows=[];
  list.forEach(v=>{const vd=(d===S.date?S.veh:(RG.data[d]||{}).veh||{})[v.k]||{};const de=(d===S.date?S.derr:(RG.data[d]||{}).derr||{})[v.k]||{};const ch=de.checks||{};
    (de.items||[]).filter(it=>it.type!=='Driver uniform'&&it.type!=='Conductor uniform').forEach(it=>{const k=it.kid&&KID[it.kid];rows.push(v.l+' – '+it.type+(k?' – '+k.name+' ('+shortCls(k.cls)+')':'')+(it.rem?' – '+it.rem:''))});
    const dr=[];if(vd.driverU==='NOT')dr.push('morning');if(ch.driver==='NOT'||(de.items||[]).some(it=>it.type==='Driver uniform'))dr.push('departure');
    const cr=[];if(vd.condU==='NOT')cr.push('morning');if(ch.conductor==='NOT'||(de.items||[]).some(it=>it.type==='Conductor uniform'))cr.push('departure');
    if(dr.length)rows.push(v.l+' – Driver not in uniform – '+dr.join(' & '));if(cr.length)rows.push(v.l+' – Conductor not in uniform – '+cr.join(' & '))});
  return '*Bus Error Details – '+dd+'*\n'+(rows.length?rows.map((r,i)=>(i+1)+'. '+r).join('\n'):'No bus errors today ✅')}
function busErrText(list){const mon=new Date(S.date+'T00:00').toLocaleDateString('en-IN',{month:'long',year:'numeric'});const {rows,per}=busErrRows(list);
  const pv=Object.values(per).filter(p=>p.n).sort((a,b)=>b.n-a.n);
  return '*Bus Error Report – '+mon+(S.berrType?' ('+S.berrType+')':'')+'*\n'+(pv.length?pv.map((p,i)=>(i+1)+'. '+p.v.l+' ('+staffOf(p.v.k)+') - '+p.n+' error'+(p.n>1?'s':'')+': '+Object.entries(p.t).map(([k,n])=>k+(n>1?' ×'+n:'')).concat(p.du?['Driver uniform ×'+p.du]:[]).concat(p.cu?['Conductor uniform ×'+p.cu]:[]).join(', ')).join('\n'):'No errors this month.')}

/* LATE DEFAULTERS – MONTHLY */
const ORD={'P.G.':'PG','Nursery':'Nur','L.KG.':'LKG','U.KG.':'UKG',First:'1',Second:'2',Third:'3',Fourth:'4',Fifth:'5',Sixth:'6',Seventh:'7',Eighth:'8',Ninth:'9',Tenth:'10',Eleventh:'11',Twelfth:'12'};
function shortCls(c){const [g,s]=String(c||'').split(' - ');return (ORD[g]||g)+(s||'')}
function vehShort(k){const v=VBY[k.v];return v.t==='Walk'?(S.privVan[k.id]?'Private Van':'By Walk'):v.l.replace(' ','-')}
function lateMonthlyRows(){const dates=periodDates('month');const by={};collectEvents(dates).filter(e=>e.seg==='LATE').forEach(e=>{(by[e.id]=by[e.id]||[]).push(e)});
  const min=S.lateMin||1;return Object.entries(by).filter(([id,a])=>a.length>=min&&KID[id]).map(([id,a])=>({k:KID[id],a:a.sort((x,y)=>x.date.localeCompare(y.date))})).sort((x,y)=>y.a.length-x.a.length||CLASSES.indexOf(x.k.cls)-CLASSES.indexOf(y.k.cls)||x.k.name.localeCompare(y.k.name))}
function renderLateMonthly(){
  $('dashT').parentElement.classList.add('hide');$('dashNote').classList.add('hide');$('dashF').classList.add('hide');$('dashS').classList.add('hide');$('kpis').innerHTML='';
  const dates=periodDates('month');const mon=new Date(S.date+'T00:00').toLocaleDateString('en-IN',{month:'long',year:'numeric'});
  const ctl='<div class="row" style="margin-bottom:10px"><b>'+esc(mon)+'</b><select id="lateMin">'+[1,2,3,4,5].map(n=>'<option value="'+n+'"'+((S.lateMin||1)===n?' selected':'')+'>'+(n===1?'All late comers':n+'+ times late')+'</option>').join('')+'</select><button class="btn ghost sm" id="lateCopy">Copy List (WhatsApp)</button><span class="muted">Late = Late Arrival marked by Gate / Front Office (after '+hm12(S.lateAfter)+'). Date in the top bar sets the month.</span></div>';
  loadRange(dates);if(RG.loading||!dates.every(d=>RG.data[d])){$('dashExtra').innerHTML=ctl+'<p class="muted">Loading '+dates.length+' days…</p>';return}
  const rows=lateMonthlyRows();const tot=rows.reduce((s,r)=>s+r.a.length,0);
  $('kpis').innerHTML=[['Late defaulters',rows.length,'var(--late)'],['Late arrivals (month)',tot,'var(--late)'],['3+ times late',rows.filter(r=>r.a.length>=3).length,'var(--a)']].map(k=>'<div class="kpi"><span>'+k[0]+'</span><b style="color:'+k[2]+'">'+k[1]+'</b></div>').join('');
  $('dashExtra').innerHTML=ctl+(rows.length?'<div class="tw"><table class="grid"><tr><th>#</th><th class="l">Student</th><th>Class</th><th>Vehicle / Mode</th><th>Times late</th><th class="l">Dates (time)</th></tr>'+
    rows.map((r,i)=>'<tr><td>'+(i+1)+'</td><td class="l"><b>'+esc(r.k.name)+'</b></td><td>'+esc(shortCls(r.k.cls))+'</td><td>'+esc(vehShort(r.k))+'</td><td><b style="color:'+(r.a.length>=3?'var(--a)':'var(--late)')+'">'+r.a.length+'</b></td><td class="l">'+r.a.map(e=>esc(fmtD(e.date))+(e.time?' '+esc(e.time):'')).join(', ')+'</td></tr>').join('')+'</table></div>':'<p class="muted">No late arrivals recorded this month'+((S.lateMin||1)>1?' at this count':'')+'.</p>');
}
function lateMonthlyText(){const mon=new Date(S.date+'T00:00').toLocaleDateString('en-IN',{month:'long',year:'numeric'});
  return '*Late Defaulters – '+mon+'*\n'+lateMonthlyRows().map((r,i)=>(i+1)+'. '+r.k.name+' '+shortCls(r.k.cls)+' - '+vehShort(r.k)+' - '+r.a.length+' time'+(r.a.length>1?'s':'')+' late').join('\n')}

/* STUDENT RECORDS (Dashboard) */
const REC_SEGS=[['DOUBT','Stay Back Doubt'],['SB','Stay Back'],['MISS','Missed Bus'],['DRVU','Driver Uniform Defaulters'],['CONU','Conductor Uniform Defaulters'],['UNIF','Student Uniform Defaulters'],['ERR','Error in Data'],['MISSSB','Stay Back Defaulters'],['LATE','Late Comers'],['EARLY','Early Leavers'],['ABS','Absentees'],['SS','Smart Study'],['PARENT','Parent Pick-up']];
const RG={key:'',data:{},loading:false};
function vehOrd(k){const i=VEH.findIndex(v=>v.k===k.v);return i<0?999:i}
function ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function periodDates(p){
  if(p==='day')return [S.date];
  if(p==='week')return weekDates(S.date);
  const x=new Date(S.date+'T00:00');const out=[];const last=new Date(x.getFullYear(),x.getMonth()+1,0).getDate();const today=todayStr();
  for(let i=1;i<=last;i++){const d=new Date(x.getFullYear(),x.getMonth(),i);if(d.getDay()===0)continue;const s=ymd(d);if(s>today&&s>S.date)break;out.push(s)}
  return out;
}
async function loadRange(dates){const key=dates.join(',')+'#'+(S.recTick||0);if(RG.key===key||RG.loading)return;
  RG.loading=true;RG.key=key;const data={};
  await store.prefetch(dates);
  await Promise.all(dates.map(async d=>{data[d]={};for(const c of ['veh','gate','sb','ss','derr']){data[d][c]=await store.getCol('att/'+d+'/'+c)}}));
  RG.data=data;RG.loading=false;if(S.view==='dash')renderDash();}
function dayEvents(date){const ev=[];
  Object.values(KID).forEach(k=>{const id=k.id;const st=kidStatus(id);const g=st.g||{};
    if(g.in&&g.in.type==='LATE')ev.push({date,id,seg:'LATE',time:g.in.time,rem:g.rem,by:g.by,extra:outPlan(k,g).t});
    if(g.unif&&(g.unif.items||[]).length)ev.push({date,id,seg:'UNIF',extra:unifTxt(g.unif),rem:g.unif.rem,by:g.unif.by});
    if(st.IN==='A'){const fo=g.in&&g.in.type==='ABS';ev.push({date,id,seg:'ABS',extra:fo?'Marked absent by Front Office':k.walk?'':'Absent in '+VBY[k.v].l,rem:fo?g.rem:'',by:fo?g.by:((S.veh[k.v]||{}).by||'')})}
    if(sbDoubt(id)){const d=S.sb[seg(k.cls)]||{};ev.push({date,id,seg:'DOUBT',extra:'Stay back doubt',by:d.by})}
    {const sv=((S.ss||{})[seg(k.cls)]||{});const v=(sv.kids||{})[id];if(v)ev.push({date,id,seg:'SS',extra:{P:'Attended',N:'Not attended',A:'Absent'}[v],by:sv.by})}
    if(st.OUT==='EARLY')ev.push({date,id,seg:'EARLY',time:g.out&&g.out.time,rem:g.rem,by:g.by});
    if(st.OUT==='SB')ev.push({date,id,seg:'SB',rem:g.out&&g.out.type==='SB'?g.rem:'',by:g.out&&g.out.type==='SB'?g.by:(S.sbReg[id]?'Regular SB':'PL')});
    if(S.sbReg[id]&&st.present&&st.OUT!=='SB'){const why={EARLY:'Left early',GOWALK:'Went with parent / by walk',VEH:'Went by regular transport',HOME:'Went home'}[st.OUT]||'Not kept in stayback';
      const fo=g.out&&g.out.type&&g.out.type!=='SB';ev.push({date,id,seg:'MISSSB',time:fo?g.out.time:'',extra:why,rem:fo?g.rem:'',by:fo?g.by:'PL (day list)'});}
    if(!k.walk){const m=((S.veh[k.v]||{}).marks||{})[k.n];if(m==='A'&&st.present)ev.push({date,id,seg:'MISS',time:g.in&&g.in.time,rem:g.rem,by:g.by,extra:outPlan(k,g).t});}
    if(!k.walk&&st.OUT==='GOWALK')ev.push({date,id,seg:'PARENT',time:g.out&&g.out.time,rem:g.rem,by:g.out&&g.out.type==='GOWALK'?g.by:'Special by-walk list'});
  });return ev;}
function collectEvents(dates){
  if(dates.length===1&&dates[0]===S.date)return (Object.keys(S.veh).length||Object.keys(S.gate).length||Object.keys(S.sb).length||Object.keys(S.ss||{}).length)?dayEvents(S.date):[];
  const ev=[];dates.forEach(d=>{const dd=RG.data[d];if(!dd||!(Object.keys(dd.veh||{}).length||Object.keys(dd.gate||{}).length||Object.keys(dd.sb||{}).length||Object.keys(dd.ss||{}).length))return;withDate(Object.assign({out:{},derr:{},ss:{}},dd),()=>{ev.push(...dayEvents(d))})});return ev;}
function staffURows(dates){const rows=[];dates.forEach(d=>{const dd=d===S.date?{veh:S.veh,derr:S.derr}:(RG.data[d]||{});
  VEH.forEach(v=>{const vd=(dd.veh||{})[v.k]||{};const de=(dd.derr||{})[v.k]||{};const ch=de.checks||{};
    const dr=[];if(hasDrvU(v.k)){if(vd.driverU==='NOT')dr.push('Morning');if(ch.driver==='NOT'||(de.items||[]).some(it=>it.type==='Driver uniform'))dr.push('Departure')}
    const cr=[];if(hasConU(v.k)){if(vd.condU==='NOT')cr.push('Morning');if(ch.conductor==='NOT'||(de.items||[]).some(it=>it.type==='Conductor uniform'))cr.push('Departure')}
    if(dr.length)rows.push({d,v,role:'Driver',when:dr.join(' & ')});if(cr.length)rows.push({d,v,role:'Conductor',when:cr.join(' & ')})})});return rows}
function staffUHtml(rows,per,range,role){const by={};rows.forEach(r=>(by[r.v.k]=by[r.v.k]||[]).push(r));const vs=VEH.filter(v=>by[v.k]);
  let h=catHead(role+' Uniform Defaulters – '+range,rows.length,'A')+'<div class="sbcount"><span class="tag t-U">'+vs.length+' vehicles</span></div>';
  if(!vs.length)return h+'<p class="muted empty">No '+role.toLowerCase()+' uniform defaults in this period.</p>';
  return h+vs.map(v=>'<div class="cstrip"><span>'+esc(v.l)+'</span><small>'+by[v.k].length+'</small></div>'+by[v.k].map((r,i)=>'<div class="nrow"><span class="no">'+(i+1)+'</span>'+nrow(r.role+' not in uniform',dots([per!=='day'?'<b>'+esc(fmtD(r.d))+'</b>':'',esc(r.when)]),'<span class="tag t-A">'+esc(r.role)+'</span>')+'</div>').join('')).join('')}
const tmin=t=>{const m=/(\d{1,2}):(\d\d)\s*([ap]m)?/i.exec(t||'');if(!m)return 9999;let h=+m[1];if(m[3]){const pm=/p/i.test(m[3]);if(pm&&h<12)h+=12;if(!pm&&h===12)h=0}return h*60+(+m[2])};
function errRows(dates){const rows=[];dates.forEach(d=>{const dd=d===S.date?{gate:S.gate,derr:S.derr}:(RG.data[d]||{});
  Object.entries(dd.gate||{}).forEach(([id,g])=>{(g.errs||[]).forEach(e=>{if(KID[id]&&cpHas('rep',KID[id].cls))rows.push({d,k:KID[id],ph:e.ph,type:e.type,rem:e.rem,by:e.by,time:e.time,ts:e.ts||0,src:'FO Entry-Exit'})})});
  Object.entries(dd.derr||{}).forEach(([vk,de])=>{(de.items||[]).forEach(it=>{const k=KID[it.kid];if(k&&!cpHas('rep',k.cls))return;rows.push({d,k,v:VBY[vk],ph:'Departure',type:it.type,rem:it.rem,by:it.by,time:it.time,ts:it.ts||0,src:'Departure – '+((VBY[vk]||{}).l||vk)})})})});
  return rows.sort((a,b)=>a.d.localeCompare(b.d)||(tmin(a.time)-tmin(b.time))||(a.ts-b.ts))}
function errHtml(rows,per,range){const ph=x=>rows.filter(r=>r.ph===x).length;
  let h=catHead(range,rows.length,'A')+'<div class="sbcount"><span class="tag t-LATE">Arrival '+ph('Arrival')+'</span><span class="tag t-EARLY">Departure '+ph('Departure')+'</span></div>';
  if(!rows.length)return h+'<p class="muted empty">No errors reported in this period.</p>';
  let last='';return h+rows.map((r,i)=>{let s='';if(per!=='day'&&r.d!==last){last=r.d;s='<div class="cstrip"><span>'+esc(fmtDL(r.d))+'</span><small>'+rows.filter(x=>x.d===r.d).length+'</small></div>'}
    return s+'<div class="nrow"><span class="no">'+(i+1)+'</span>'+nrow(esc(r.type),(r.k?'<b>'+esc(r.k.name)+'</b> · '+esc(clsName(r.k.cls))+' · '+esc(modeLabel(r.k))+'<br>':'')+(r.rem?'Case: <b>'+esc(r.rem)+'</b><br>':'')+dots([esc(r.src),'Reported by '+esc(byShort(r.by||'—'))]),'<span class="tag t-'+(r.ph==='Arrival'?'LATE':'EARLY')+'">'+esc(r.ph)+'</span><span class="tag t-U">'+esc(r.time||'')+'</span>')+'</div>'}).join('')}
function renderDashRecords(){
  const per=S.recPer||'day';let sg=S.recSeg||'DOUBT';if(!REC_SEGS.some(x=>x[0]===sg))sg='DOUBT';
  const dates=periodDates(per);
  $('dashT').parentElement.classList.add('hide');$('dashNote').classList.add('hide');$('dashF').classList.add('hide');$('dashS').classList.add('hide');$('kpis').innerHTML='';
  const ae=document.activeElement;if(ae&&ae.classList&&ae.classList.contains('cpq')&&$('dashExtra').contains(ae)&&!RG.loading)return;
  if(!(dates.length===1&&dates[0]===S.date)){loadRange(dates);if(RG.loading||!dates.every(d=>RG.data[d])){$('dashExtra').innerHTML=recControls(per,sg,{})+'<p class="muted empty">Loading '+dates.length+' days…</p>';return}}
  const all=collectEvents(dates).filter(e=>KID[e.id]&&cpHas('rep',KID[e.id].cls));
  const cnt={};REC_SEGS.forEach(s=>cnt[s[0]]=all.filter(e=>e.seg===s[0]).length);
  const sur=staffURows(dates);cnt.DRVU=sur.filter(r=>r.role==='Driver').length;cnt.CONU=sur.filter(r=>r.role==='Conductor').length;const er=errRows(dates);cnt.ERR=er.length;
  if(sg==='ERR'){const range=dates.length===1?fmtDL(dates[0]):fmtD(dates[0])+' – '+fmtD(dates[dates.length-1]);$('dashExtra').innerHTML=recControls(per,sg,cnt)+errHtml(er,per,'Error in Data – '+range)+'<div class="row" style="margin-top:16px"><button class="btn ghost sm" id="recCopy">Copy List (WhatsApp)</button></div>';
    S.recLast={errs:er,range,per};return}
  if(sg==='DRVU'||sg==='CONU'){const role=sg==='DRVU'?'Driver':'Conductor';const rr=sur.filter(r=>r.role===role);const range=dates.length===1?fmtDL(dates[0]):fmtD(dates[0])+' – '+fmtD(dates[dates.length-1]);$('dashExtra').innerHTML=recControls(per,sg,cnt)+staffUHtml(rr,per,range,role)+'<div class="row" style="margin-top:16px"><button class="btn ghost sm" id="recCopy">Copy List (WhatsApp)</button></div>';
    S.recLast={staff:rr,label:role+' Uniform Defaulters',range,per};return}
  const rep2=per!=='day'&&S.recRep;
  let ev=all.filter(e=>e.seg===sg);
  const byKid={};ev.forEach(e=>{(byKid[e.id]=byKid[e.id]||[]).push(e)});
  if(rep2){Object.keys(byKid).forEach(id=>{if(byKid[id].length<2)delete byKid[id]});ev=ev.filter(e=>byKid[e.id]);}
  const byCls={};Object.keys(byKid).forEach(id=>{(byCls[KID[id].cls]=byCls[KID[id].cls]||[]).push(id)});
  const clsList=CLASSES.filter(c=>byCls[c]);
  const label=REC_SEGS.find(s=>s[0]===sg)[1];const tc=sg==='MISS'||sg==='MISSSB'||sg==='UNIF'||sg==='ABS'?'A':sg==='PARENT'?'GOWALK':sg==='DOUBT'?'LATE':sg==='SS'?'SB':sg;
  const range=dates.length===1?fmtDL(dates[0]):fmtD(dates[0])+' – '+fmtD(dates[dates.length-1]);
  const nK=Object.keys(byKid).length;
  let h=recControls(per,sg,cnt)+catHead(label+' – '+range,nK,tc)+(per!=='day'?'<div class="sbcount"><span class="tag t-U">'+ev.length+' entries</span><span class="tag t-U">'+dates.filter(d=>{const dd=RG.data[d];return dd&&(Object.keys(dd.veh||{}).length||Object.keys(dd.gate||{}).length)}).length+' school days with data</span></div>':'');
  if(sg==='MISS'&&ev.length){const evs=ev.slice().sort((a,b)=>vehOrd(KID[a.id])-vehOrd(KID[b.id])||a.date.localeCompare(b.date));h+='<h3>Missed bus – vehicle-wise</h3><div class="tw" style="max-height:none"><table class="cnum mbt"><tr><th>No.</th><th class="l">Bus / Van</th><th class="l">Child</th><th class="l">Class</th>'+(per!=='day'?'<th>Date</th>':'')+'<th class="l">Remark</th></tr>'+evs.map((e,i)=>{const k=KID[e.id];return '<tr><td>'+(i+1)+'</td><td class="l"><b>'+esc(VBY[k.v].l)+'</b></td><td class="l"><b>'+esc(k.name)+'</b></td><td class="l">'+esc(secLbl(k.cls))+'</td>'+(per!=='day'?'<td>'+esc(fmtD(e.date))+'</td>':'')+'<td class="l" style="white-space:normal">'+(e.rem?esc(e.rem):'<span class="muted">—</span>')+(e.time?' <span class="muted">(came '+esc(e.time)+')</span>':'')+'</td></tr>'}).join('')+'</table></div>'}
  // class-wise numbers: one row per class, sections across
  const secs=[...new Set(cpList('rep').map(c=>c.split(' - ')[1]||''))].sort();const gl=GRADES.filter(g=>cpList('rep').some(c=>c.split(' - ')[0]===g));
  const cell=(g,s)=>{const c=CLASSES.find(x=>x===g+' - '+s);if(!c||!cpHas('rep',c))return '<td class="muted">·</td>';const n=(byCls[c]||[]).length;return '<td>'+(n?'<b>'+n+'</b>':'<span class="muted">0</span>')+'</td>'};
  h+='<h3>Class-wise numbers</h3><div class="tw" style="max-height:none"><table class="cnum"><tr><th class="l">Class</th>'+secs.map(s=>'<th>'+esc(s)+'</th>').join('')+'<th>Total</th></tr>'+gl.map(g=>{const t=CLASSES.filter(c=>c.split(' - ')[0]===g).reduce((a,c)=>a+(byCls[c]||[]).length,0);
      return '<tr><td class="l"><b>'+esc(gradeName(g))+'</b></td>'+secs.map(s=>cell(g,s)).join('')+'<td class="tt">'+t+'</td></tr>'}).join('')+
    '<tr class="tot"><td class="l">Total</td>'+secs.map(s=>'<td>'+clsList.filter(c=>(c.split(' - ')[1]||'')===s).reduce((a,c)=>a+byCls[c].length,0)+'</td>').join('')+'<td class="tt">'+nK+'</td></tr></table></div>';
  // student details, class-wise
  h+='<h3>Student details</h3>'+strips(Object.keys(byKid).map(id=>({k:KID[id],es:byKid[id]})),r=>{const k=r.k,es=r.es;
      const line=e=>dots([per!=='day'?'<b>'+esc(fmtD(e.date))+'</b>':'',per!=='day'&&e.time?esc(e.time):'',e.extra?esc(e.extra):'',e.rem?esc(e.rem):'',e.by?'by '+esc(byShort(e.by)):'']);
      return nrow(esc(k.name),'<span class="goes">Goes by: <b>'+esc(modeLabel(k))+'</b></span>'+es.map(e=>{const l=line(e);return l?'<br>'+l:''}).join(''),per!=='day'?'<span class="tag t-'+tc+'">'+es.length+'×</span>':(es[0].time?'<span class="tag t-'+tc+'">'+esc(es[0].time)+'</span>':''))},
    {sort:(a,b)=>b.es.length-a.es.length||a.k.name.localeCompare(b.k.name),empty:'No '+label.toLowerCase()+' in this period.'});
  // datewise grid
  if(per!=='day'&&clsList.length){const ds=dates.filter(d=>{const dd=RG.data[d];return dd&&(Object.keys(dd.veh||{}).length||Object.keys(dd.gate||{}).length)});
    const wd=d=>['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(d+'T00:00').getDay()]+' '+d.slice(8);
    h+='<details class="allst"><summary>Date-wise chart</summary><div class="tw"><table class="grid"><tr><th class="l">Class</th><th class="l">Student</th>'+ds.map(d=>'<th>'+wd(d)+'</th>').join('')+'<th>Total</th></tr>'+
      clsList.map(c=>byCls[c].slice().sort((a,b)=>byKid[b].length-byKid[a].length||KID[a].name.localeCompare(KID[b].name)).map((id,i)=>{const m={};byKid[id].forEach(e=>m[e.date]=e);
        return '<tr><td class="l">'+(i?'':'<b>'+esc(secLbl(c))+'</b>')+'</td><td class="l">'+esc(KID[id].name)+'</td>'+ds.map(d=>{const e=m[d];return '<td>'+(e?'<span class="tag t-'+tc+'">'+esc(sg==='UNIF'?'✓':(e.time||'✓'))+'</span>':'')+'</td>'}).join('')+'<td><b>'+byKid[id].length+'</b></td></tr>'}).join('')).join('')+
      '<tr class="tot"><td>Total</td><td></td>'+ds.map(d=>'<td>'+ev.filter(e=>e.date===d).length+'</td>').join('')+'<td>'+ev.length+'</td></tr></table></div></details>';}
  h+='<div class="row" style="margin-top:16px"><button class="btn ghost sm" id="recCopy">Copy List (WhatsApp)</button>'+(per!=='day'?'<button class="btn ghost sm" id="recRefresh">Refresh</button>':'')+'</div>';
  $('dashExtra').innerHTML=h;
  S.recLast={label,range,clsList,byCls,byKid,per,sg};
}
function recControls(per,sg,cnt){
  return '<div class="row" style="justify-content:space-between"><h2 style="margin:0">School Report</h2><div class="row">'+
    [['day','Daily'],['week','Weekly'],['month','Monthly']].map(p=>'<button class="btn '+(per===p[0]?'':'ghost')+' sm" data-recper="'+p[0]+'">'+p[1]+'</button>').join('')+'</div></div>'+
    '<div class="recseg">'+REC_SEGS.map(s=>'<button class="'+(sg===s[0]?'on':'')+'" data-recseg="'+s[0]+'"><b>'+(cnt[s[0]]!==undefined?cnt[s[0]]:'–')+'</b>'+s[1]+'</button>').join('')+'</div>'+
    (sg==='DRVU'||sg==='CONU'?'':'<div style="margin-top:12px">'+cpHtml('rep')+'</div>')+(per!=='day'?'<div class="row" style="margin-top:10px"><label class="seck"><input type="checkbox" id="recRep"'+(S.recRep?' checked':'')+'> Repeat only (2+ times)</label></div>':'')+'<p class="muted" style="margin:10px 0 0">Whole school · the date in the top bar sets the day, week or month.</p>';
}
function recText(){const r=S.recLast;if(!r)return '';if(r.errs){let t='*FIS Error in Data – '+r.range+'*\n';r.errs.forEach((x,i)=>{t+='\n'+(i+1)+'. '+(r.per!=='day'?fmtD(x.d)+' ':'')+(x.time||'')+' – '+x.ph+' – *'+x.type+'*'+(x.k?'\n   *'+x.k.name+'* ('+secLbl(x.k.cls)+' · '+modeLabel(x.k)+')':'')+(x.rem?'\n   Remark: *'+x.rem+'*':'')+'\n   By: '+byShort(x.by||'')+' · '+x.src});return t+'\n\n*Total: '+r.errs.length+'*'}if(r.staff){let t='*FIS '+r.label+' – '+r.range+'*\n';r.staff.forEach((x,i)=>{t+=(i+1)+'. *'+x.v.l+'* – '+x.role+' not in uniform'+(r.per!=='day'?' – '+fmtD(x.d):'')+' ('+x.when+')\n'});return t+'\n*Total: '+r.staff.length+'*'}let t='*FIS '+r.label+' – '+r.range+'*\n';if(r.sg==='MISS'){const all=Object.values(r.byKid).flat().sort((a,b)=>vehOrd(KID[a.id])-vehOrd(KID[b.id])||a.date.localeCompare(b.date));all.forEach((e,i)=>{const k=KID[e.id];t+='\n'+(i+1)+'. *'+VBY[k.v].l+'* – *'+k.name+'* ('+secLbl(k.cls)+')'+(r.per!=='day'?' – '+fmtD(e.date):'')+'\n   Remark: '+(e.rem||'—')});return t+'\n\n*Total: '+all.length+'*'}
  r.clsList.forEach(c=>{t+='\n*'+clsName(c)+'* ('+r.byCls[c].length+')\n';r.byCls[c].forEach((id,i)=>{const e0=r.byKid[id][0];t+=(i+1)+'. *'+KID[id].name+'* ('+modeLabel(KID[id])+')'+(r.per!=='day'?' – *'+r.byKid[id].length+'×*':'')+(r.per==='day'&&e0.time?' – '+e0.time:'')+(r.per==='day'&&e0.extra&&r.sg!=='MISS'?' – '+e0.extra:'')+(r.per==='day'&&e0.rem?'\n   Remark: '+e0.rem:'')+'\n'})});
  return t+'\n*Total students: '+Object.keys(r.byKid).length+'*'}

/* ARRIVAL TIME & UNIFORM REPORT */
const hmMin=hm=>{const x=to24(hm)||hm;if(!x||!/^\d{1,2}:\d{2}$/.test(x))return null;const [h,m]=x.split(':').map(Number);return h*60+m};
const PP_VEH=/^(B[A-H]|VI)$/,PP_CLS=/^(P\.G\.|Nursery|L\.KG\.|U\.KG\.)/i;
function ppCut(){return S.lateAfterPP||'09:00'}
function vehCut(vk){return PP_VEH.test(vk)?ppCut():S.lateAfter}
function kidCut(id){const k=KID[id];return k&&(PP_VEH.test(k.v)||PP_CLS.test(k.cls||''))?ppCut():S.lateAfter}
function isPPveh(vk){return PP_VEH.test(vk)}
function uniOf(dd,vk){const v=(dd.veh||{})[vk]||{};const d=((dd.derr||{})[vk]||{}).checks||{};return {md:v.driverU,mc:v.condU,dd:d.driver,dc:d.conductor}}
function arrChart(list,vehDocs){
  const rows=list.map(v=>{const d=vehDocs[v.k]||{};return {v,m:hmMin(d.arr),arr:d.arr,c:hmMin(vehCut(v.k))}}).filter(r=>r.m!==null).sort((a,b)=>a.m-b.m);
  if(!rows.length)return '<p class="muted">No arrival times recorded.</p>';
  const cut=hmMin(S.lateAfter)||465;const lo=Math.min(...rows.map(r=>r.m),cut)-10,hi=Math.max(...rows.map(r=>Math.max(r.m,r.c)),cut)+5;const pct=m=>((m-lo)/(hi-lo)*100).toFixed(1);
  const late=rows.filter(r=>r.m>r.c).length;const anyPP=rows.some(r=>isPPveh(r.v.k));
  return '<div class="muted" style="margin-bottom:6px">Arrived after '+hm12(S.lateAfter)+(anyPP?' (Pre-Primary '+hm12(ppCut())+')':'')+': <b style="color:var(--a)">'+late+'</b> of '+rows.length+' · earliest '+hm12(rows[0].arr)+' · latest '+hm12(rows[rows.length-1].arr)+'</div>'+
    '<div class="achart">'+rows.map(r=>'<div class="arow"><span class="alab">'+esc(r.v.l)+'</span><div class="atrack"><div class="acut" style="left:'+pct(r.c)+'%"></div><div class="abar '+(r.m>r.c?'late':'')+'" style="width:'+pct(r.m)+'%"></div></div><span class="aval'+(r.m>r.c?' late':'')+'">'+hm12(r.arr)+'</span></div>').join('')+
    '<div class="arow"><span class="alab"></span><div class="atrack axis"><span style="left:0">'+hm12(String(Math.floor(lo/60)).padStart(2,'0')+':'+String(lo%60).padStart(2,'0'))+'</span><span style="left:'+pct(cut)+'%;color:var(--a)">'+hm12(S.lateAfter)+'</span><span style="right:0">'+hm12(String(Math.floor(hi/60)).padStart(2,'0')+':'+String(hi%60).padStart(2,'0'))+'</span></div><span class="aval"></span></div></div>';
}
function uniTag(x){return x==='OK'?'<span class="tag t-P">In Uniform</span>':x==='NOT'?'<span class="tag t-A">Not in Uniform</span>':'<span class="muted">–</span>'}
function renderDashArr(list){
  $('dashT').parentElement.classList.add('hide');$('dashNote').classList.add('hide');
  loadWeek();const dates=weekDates(S.date);const ready=!WK.loading&&WK.data[dates[0]];
  const today={veh:S.veh,derr:S.derr};
  // day non-uniform
  const nu=list.map(v=>({v,u:uniOf(today,v.k)})).filter(r=>[r.u.md,r.u.mc,r.u.dd,r.u.dc].includes('NOT'));
  const checked=list.filter(v=>{const u=uniOf(today,v.k);return u.md||u.mc||u.dd||u.dc}).length;
  let h='<div class="secthead"><i></i><span>Arrival Time – '+fmtD(S.date)+'</span><small>Bus / Van / Auto, earliest first · red = after '+hm12(S.lateAfter)+'</small></div>'+arrChart(list,S.veh);
  h+='<div class="secthead" style="margin-top:18px"><i></i><span>Non-Uniform – '+fmtD(S.date)+'</span><small>'+nu.length+' vehicle'+(nu.length===1?'':'s')+' · '+checked+' checked</small></div>'+
    (nu.length?'<div class="tw" style="max-height:none"><table><tr><th>Vehicle</th><th>In-charge</th><th>Morning – Driver</th><th>Morning – Conductor</th><th>Departure – Driver</th><th>Departure – Conductor</th></tr>'+nu.map(r=>'<tr><td><b>'+esc(r.v.l)+'</b></td><td class="l">'+esc(staffOf(r.v.k))+'</td><td>'+uniTag(r.u.md)+'</td><td>'+uniTag(r.u.mc)+'</td><td>'+uniTag(r.u.dd)+'</td><td>'+uniTag(r.u.dc)+'</td></tr>').join('')+'</table></div>':'<p class="muted">All checked staff in uniform.</p>');
  if(!ready){h+='<p class="muted" style="margin-top:14px">Loading week…</p>';$('dashExtra').innerHTML=h;$('kpis').innerHTML='';return}
  // weekly
  const cnt={};let tot={md:0,mc:0,dd:0,dc:0};
  dates.forEach(d=>list.forEach(v=>{const u=uniOf(WK.data[d],v.k);const c=(cnt[v.k]=cnt[v.k]||{md:0,mc:0,dd:0,dc:0,t:0});['md','mc','dd','dc'].forEach(x=>{if(u[x]==='NOT'){c[x]++;c.t++;tot[x]++}})}));
  const rank=list.filter(v=>cnt[v.k]&&cnt[v.k].t).sort((a,b)=>cnt[b.k].t-cnt[a.k].t);const mx=rank.length?cnt[rank[0].k].t:1;
  h+='<div class="secthead" style="margin-top:18px"><i></i><span>Non-Uniform Chart – Week</span><small>'+fmtD(dates[0])+' – '+fmtD(dates[5])+' · times found not in uniform</small></div>'+
    (rank.length?'<div class="achart">'+rank.map(v=>{const c=cnt[v.k];return '<div class="arow"><span class="alab">'+esc(v.l)+'</span><div class="atrack"><div class="sbar" style="width:'+(c.md/mx*100)+'%;background:#c8323c"></div><div class="sbar" style="width:'+(c.dd/mx*100)+'%;background:#e5737a"></div><div class="sbar" style="width:'+(c.mc/mx*100)+'%;background:#6a3a92"></div><div class="sbar" style="width:'+(c.dc/mx*100)+'%;background:#a88cc6"></div></div><span class="aval">'+c.t+'</span></div>'}).join('')+'</div>'+
      '<div class="row" style="margin-top:6px;font-size:12px"><span><i class="lg" style="background:#c8323c"></i>Driver – morning ('+tot.md+')</span><span><i class="lg" style="background:#e5737a"></i>Driver – departure ('+tot.dd+')</span><span><i class="lg" style="background:#6a3a92"></i>Conductor – morning ('+tot.mc+')</span><span><i class="lg" style="background:#a88cc6"></i>Conductor – departure ('+tot.dc+')</span></div>':'<p class="muted">No non-uniform records this week.</p>');
  // weekly arrival table
  h+='<div class="secthead" style="margin-top:18px"><i></i><span>Arrival Time – Week</span><small>red = after '+hm12(S.lateAfter)+'</small></div><div class="tw"><table><tr><th>Vehicle</th>'+dates.map(d=>'<th>'+fmtD(d)+'</th>').join('')+'<th>Late days</th></tr>'+
    list.map(v=>{let ld=0;const cut=hmMin(vehCut(v.k));return '<tr><td><b>'+esc(v.l)+'</b></td>'+dates.map(d=>{const a=((WK.data[d].veh||{})[v.k]||{}).arr;const m=hmMin(a);if(m===null)return '<td class="muted">–</td>';const late=m>cut;if(late)ld++;return '<td style="'+(late?'color:var(--a);font-weight:700':'')+'">'+hm12(a)+'</td>'}).join('')+'<td style="color:var(--a)"><b>'+(ld||'')+'</b></td></tr>'}).join('')+'</table></div>';
  $('kpis').innerHTML=[['Vehicles not in uniform (day)',nu.length,'var(--a)'],['Non-uniform this week',tot.md+tot.mc+tot.dd+tot.dc,'var(--a)'],['Arrived after '+hm12(S.lateAfter)+' (day)',list.filter(v=>{const m=hmMin((S.veh[v.k]||{}).arr);return m!==null&&m>hmMin(vehCut(v.k))}).length,'var(--late)']].map(k=>'<div class="kpi"><span>'+k[0]+'</span><b style="color:'+k[2]+'">'+k[1]+'</b></div>').join('');
  h+='<button class="btn ghost sm" id="wkRefresh" style="margin-top:10px">Refresh Week</button>';
  $('dashExtra').innerHTML=h;
}
function mchkHtml(vk){const c=mDraft||{};if(!hasDrvU(vk)&&!hasConU(vk))return '';const row=(key,lbl)=>'<div class="row" style="margin:4px 0"><span style="min-width:150px;font-weight:600">'+lbl+'</span>'+['OK','NOT'].map(val=>'<button class="tg '+(c[key]===val?(val==='OK'?'P':'A'):'U')+'" data-mchk="'+key+':'+val+'">'+(val==='OK'?'In Uniform':'Not in Uniform')+'</button>').join(' ')+'</div>';
  return '<div class="card" style="margin:10px 0;border:1px solid var(--line)"><h2 style="margin-bottom:6px">Vehicle Staff Check</h2>'+(hasDrvU(vk)?row('driverU','Driver uniform'):'')+(hasConU(vk)?row('condU','Conductor uniform'):'')+'</div>'}
let mDraft=null;

/* DEPARTURE */
let depDraft=null;
function depInfo(id){const st=kidStatus(id);const g=st.g||{};
  if(!st.present){return {go:false,tag:st.IN==='U'?'U':'A',txt:st.IN==='U'?'Pending (morning)':(g.in&&g.in.type==='ABS'?'Absent (Front Office)':'Absent'),rem:g.rem||''}}
  if(st.OUT==='VEH')return {go:true,tag:'VEH',txt:(st.IN==='LATE'?'Late Arrival · ':st.IN==='WALKIN'?'Came by walk · ':'')+'Going in vehicle',rem:g.rem||''};
  const t={EARLY:'Leaving Early'+(g.out&&g.out.time?' '+g.out.time:''),SB:sbDoubt(id)?'Stayback doubt – Front Office to confirm':'Stayback',GOWALK:'Parent Pick-up'}[st.OUT];
  return {go:false,tag:st.OUT,txt:t,rem:g.rem||''};
}
function depRows(v){const vd=S.veh[v.k]||{};const rows=v.kids.map(k=>{const id=v.k+'-'+k[0];return {k,id,i:depInfo(id)}});
  Object.entries(vd.extra||{}).forEach(([x,e])=>{const m=(vd.marks||{})[x];rows.push({k:[x,e.name+' (today only)',e.cls||''],id:null,i:m==='P'?{go:true,tag:'VEH',txt:'Going in vehicle'}:{go:false,tag:m==='A'?'A':'U',txt:m==='A'?'Absent':'Pending (morning)'}})});return rows}
function renderDep(){
  const who=$('depStaff').value;const mine=vehOf(who);
  if(S.depVeh&&!isMgr(who)&&staffOf(S.depVeh)!==who)S.depVeh=null;
  if(!S.depVeh){depDraft=null;
    $('depVeh').classList.add('hide');$('depList').classList.remove('hide');
    $('depList').innerHTML='<div class="secthead"><i></i><span>'+(isMgr(who)?'All Vehicles':'Assigned Vehicles')+'</span><small>Departure list</small></div><div class="grid">'+mine.map(v=>{const od=S.out[v.k]||{};const go=depRows(v).filter(r=>r.i.go).length;const b=Object.keys(od.marks||{}).length;
      return '<button class="vcard" data-depopen="'+v.k+'"><b>'+esc(v.l)+'</b>'+(isPPveh(v.k)?'<div class="st" style="color:var(--late);font-weight:700">Pre-Primary · 9:00 AM – 2:00 PM</div>':'')+(isMgr(who)?'<div class="st">'+esc(staffOf(v.k))+'</div>':'')+'<div class="st">Going '+go+' of '+v.kids.length+'</div>'+vcardInfo(v)+'<div style="margin-top:6px">'+(od.submitted?'<span class="pill done">Departed '+esc(od.time)+'</span>':'<span class="pill pend">Boarded '+b+'/'+go+'</span>')+'</div></button>'}).join('')+'</div>';
    return}
  $('depList').classList.add('hide');$('depVeh').classList.remove('hide');
  const v=VBY[S.depVeh];const od=S.out[v.k]||{};if(!depDraft)depDraft=Object.assign({},od.marks||{});
  const rows=depRows(v);
  const go=rows.filter(r=>r.i.go),no=rows.filter(r=>!r.i.go);
  const c=t=>no.filter(r=>r.i.tag===t).length;const boarded=go.filter(r=>depDraft[r.k[0]]).length;
  const line=r=>'<div class="kid"><div class="n">'+(/^x/.test(r.k[0])?'+':r.k[0])+'</div><div class="nm"><div>'+esc(r.k[1])+'</div><span>'+esc(r.k[2])+'</span>'+(r.id?foLine(r.id):'')+'</div>'+
    (r.i.go?'<button class="tg '+(depDraft[r.k[0]]?'P':'U')+'" data-dtg="'+r.k[0]+'">'+(depDraft[r.k[0]]?'Boarded ✓':'Board')+'</button>':'<span class="tag t-'+r.i.tag+'" style="min-width:84px;text-align:center;padding:8px 6px">'+esc(r.i.txt)+'</span>')+'</div>';
  $('depVeh').innerHTML='<div class="row" style="justify-content:space-between"><button class="btn ghost sm" id="depBack">← Back</button><b style="font-size:17px">'+esc(v.l)+' – Departure</b><span class="muted">'+esc(staffOf(v.k))+'</span></div>'+(isPPveh(v.k)?'<p class="muted" style="margin:4px 0 0;color:var(--late)"><b>Pre-Primary · Departure 2:00 PM</b></p>':'')+
    '<div class="counts"><div><b>'+v.kids.length+'</b>Total</div><div><b style="color:var(--brand)">'+go.length+'</b>Going in vehicle</div><div><b style="color:var(--p)">'+boarded+'</b>Boarded</div><div><b style="color:var(--a)">'+(c('A')+c('U'))+'</b>Absent</div><div><b style="color:var(--early)">'+c('EARLY')+'</b>Leaving Early</div><div><b style="color:var(--sb)">'+c('SB')+'</b>Stayback</div><div><b style="color:var(--walk)">'+c('GOWALK')+'</b>Parent Pick-up</div></div>'+
    '<h3>Going in vehicle ('+go.length+')</h3><div class="row" style="margin-bottom:4px"><button class="btn green sm" id="depAll">Mark All Boarded</button><button class="btn ghost sm" id="depClr">Clear</button></div>'+go.map(line).join('')+
    (no.length?'<h3>Not going in vehicle ('+no.length+')</h3>'+no.sort((a,b)=>a.i.tag.localeCompare(b.i.tag)).map(line).join(''):'')+
    depChecksHtml(v)+
    '<div class="stick"><button class="btn" id="depSave">'+(od.submitted?'Update Departure':'Submit Departure')+'</button><span class="muted">'+(od.submitted?'Departed '+esc(od.time)+' by '+esc(od.by):'')+'</span></div>';
}

/* SCHOOL LIST */
const GRADES=[...new Set(CLASSES.map(c=>c.split(' - ')[0]))];
function schRow(id){const k=KID[id];const st=kidStatus(id);const g=st.g||{};
  const pv=k.walk&&S.privVan[k.id];
  const inT=st.IN==='W'?(pv?'Private Van · In':'By Walk · In'):LBL[st.IN]||st.IN;
  const outT=!st.present?'—':st.OUT==='VEH'?'Going in '+VBY[k.v].l:st.OUT==='HOME'?(pv?'Home by private van':'Home by walk'):LBL[st.OUT];
  return {k,st,inT,outT,time:[g.in&&g.in.time,g.out&&g.out.time].filter(Boolean).join(' / '),rem:g.rem||'',by:g.by||''}}
function schMatch(r,f){if(!f)return true;const s=r.st;
  return f==='ABS'?s.IN==='A':f==='U'?s.IN==='U':f==='LATE'?(s.IN==='LATE'||s.IN==='WALKIN'):f==='EARLY'?s.OUT==='EARLY':f==='SB'?s.OUT==='SB':f==='GOWALK'?(s.OUT==='GOWALK'||s.OUT==='HOME'):f==='VEH'?s.OUT==='VEH':f==='FO'?s.fo:f==='SPW'?!!S.walkReg[r.k.id]:true}
function schoolRows(){const c=$('schCls').value,m=$('schMode').value,f=$('schSt').value,q=$('schQ').value.trim().toLowerCase();
  return Object.keys(KID).filter(id=>{const k=KID[id];return (!c||k.cls===c||k.cls.split(' - ')[0]===c)&&(!m||modeOf(k)===m)&&(!q||k.name.toLowerCase().includes(q))}).map(schRow).filter(r=>schMatch(r,f))}
/* month gate history (for late / uniform past record) */
const MG={key:'',data:{},loading:false};
async function loadMonthGate(){const dates=periodDates('month').filter(d=>d!==S.date);const key=dates.join(',')+'#'+(S.recTick||0);if(MG.key===key||MG.loading)return;
  MG.loading=true;MG.key=key;const data={};if(store.prefetch)await store.prefetch(dates);await Promise.all(dates.map(async d=>{data[d]=await store.getCol('att/'+d+'/gate')}));
  MG.data=data;MG.loading=false;if(['late','unif','early','day'].includes(S.view))render()}
function monthGate(){loadMonthGate();const out=Object.assign({},MG.data);out[S.date]=S.gate;return out}
function lateHist(id){const m=monthGate();return Object.keys(m).sort().filter(d=>{const g=(m[d]||{})[id];return g&&g.in&&g.in.type==='LATE'}).map(d=>({d,t:m[d][id].in.time}))}
function unifHist(id){const m=monthGate();return Object.keys(m).sort().filter(d=>{const g=(m[d]||{})[id];return g&&g.unif&&g.unif.items&&g.unif.items.length}).map(d=>({d,u:m[d][id].unif}))}
const UNIF=[['ID','ID Forget'],['UNIFORM','Wrong Uniform'],['SHOES','Wrong Shoes'],['SOCKS','Wrong Socks'],['BELT','Belt Forget'],['TIE','Tie Forget']];const UNIFL=Object.fromEntries(UNIF);
function histTag(n,word){return n?'<span class="tag '+(n>=3?'t-A':'t-LATE')+'">'+n+'× '+word+' this month</span>':''}
function gateRows(key,test){return Object.values(KID).filter(k=>cpHas(key,k.cls)&&test(S.gate[k.id]||{})).map(k=>({k,g:S.gate[k.id]}))}
function findRes(q,rowFn){if(q.length<2)return '';const r=Object.values(KID).filter(k=>k.name.toLowerCase().includes(q)).sort(byName).slice(0,25);return r.length?r.map(rowFn).join(''):'<p class="muted">No student found.</p>'}
function renderLate(){
  const cur=LS.get('lateBy',ALLBY);
  if(document.activeElement!==$('lateBy'))$('lateBy').innerHTML=byOpts(cur,[['Gate',LATE_NAMES],['Front Office',FO_NAMES],['Teacher (you – logged in)',meTeacher()?[meTeacher()]:[]],['PL – Classes 6 to 11',PL_NAMES],['PM – Classes 1 to 5',PM_NAMES],['CM – Class Managers',CM_NAMES],['Managers',mgrNames()]]);
  $('lateCut').textContent=hm12(S.lateAfter);
  const q=($('lateQ').value||'').trim().toLowerCase();
  $('lateRes').innerHTML=findRes(q,k=>{const st=kidStatus(k.id);const h=lateHist(k.id);return '<div class="kid" data-pick="'+k.id+'" data-foby="late" style="cursor:pointer"><div class="nm"><div>'+esc(k.name)+'</div><span>'+esc(clsName(k.cls))+' · '+esc(modeLabel(k))+'</span>'+(h.length?'<span style="font-size:12px;color:var(--late)">Late: '+h.map(x=>esc(fmtD(x.d).replace(/^\w+, /,''))+(x.t?' '+esc(x.t):'')).join(' · ')+'</span>':'')+'</div><div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end"><span class="tag t-'+(st.IN==='W'?'U':st.IN)+'">'+esc(LBL[st.IN]||st.IN)+'</span>'+histTag(h.length,'late')+'</div></div>'});
  cpRender('lateCp','late');
  const rows=gateRows('late',g=>g.in&&g.in.type==='LATE');
  $('lateToday').innerHTML=catHead('Late Comers – '+fmtDL(S.date),rows.length,'LATE')+strips(rows,r=>nrow(esc(r.k.name),dots([esc(modeLabel(r.k)),esc(r.g.rem),r.g.by?'by '+esc(byShort(r.g.by)):'']),'<span class="tag t-LATE">'+esc(r.g.in.time||'')+'</span>'+histTag(lateHist(r.k.id).length,'late')),{attr:r=>' data-pick="'+r.k.id+'" data-foby="late"',empty:'No late comers in the selected classes.'});
}
function renderEarly(){
  const cur=LS.get('earlyBy',ALLBY);
  if(document.activeElement!==$('earlyBy'))$('earlyBy').innerHTML=byOpts(cur,[['Front Office',FO_NAMES],['Gate',LATE_NAMES],['PL – Classes 6 to 11',PL_NAMES],['PM – Classes 1 to 5',PM_NAMES],['Managers',mgrNames()]]);
  const q=($('earlyQ').value||'').trim().toLowerCase();
  $('earlyRes').innerHTML=findRes(q,k=>{const st=kidStatus(k.id);return '<div class="kid" data-pick="'+k.id+'" data-foby="early" style="cursor:pointer"><div class="nm"><div>'+esc(k.name)+'</div><span>'+esc(clsName(k.cls))+' · '+esc(modeLabel(k))+'</span></div><span class="tag t-'+(st.OUT||'U')+'">'+esc(st.OUT?LBL[st.OUT]:(st.IN==='A'?'Absent':'—'))+'</span></div>'});
  cpRender('earlyCp','early');
  const rows=gateRows('early',g=>g.out&&g.out.type==='EARLY');
  $('earlyToday').innerHTML=catHead('Early Leavers – '+fmtDL(S.date),rows.length,'EARLY')+strips(rows,r=>nrow(esc(r.k.name),dots(['Regular: '+esc(modeLabel(r.k)),r.g.rem?'<b>'+esc(r.g.rem)+'</b>':'',r.g.by?'by '+esc(byShort(r.g.by)):'']),'<span class="tag t-EARLY">Left '+esc(r.g.out.time||'')+'</span>'),{attr:r=>' data-pick="'+r.k.id+'" data-foby="early"',empty:'No early leavers in the selected classes.'});
}
function unifTxt(u){return (u.items||[]).map(i=>UNIFL[i]||i).join(', ')}
function renderUnif(){
  const me=meTeacher();let cur=LS.get('unifBy',null);if(!cur)cur=me||ALLBY;
  if(document.activeElement!==$('unifBy'))$('unifBy').innerHTML=byOpts(cur,[['Teacher (you – logged in)',me?[me]:[]],['PL – Classes 6 to 11',PL_NAMES],['PM – Classes 1 to 5',PM_NAMES],['CM – Class Managers',CM_NAMES],['Gate',LATE_NAMES],['Front Office',FO_NAMES],['Managers',mgrNames()]]);
  const q=($('unifQ').value||'').trim().toLowerCase();
  const hl=h=>h.length?'<span class="hl">'+h.map(x=>esc(fmtD(x.d).replace(/^\w+, /,''))+': '+esc(unifTxt(x.u))).join(' · ')+'</span>':'';
  $('unifRes').innerHTML=findRes(q,k=>{const h=unifHist(k.id);return '<div class="kid" data-unif="'+k.id+'" style="cursor:pointer"><div class="nm"><div>'+esc(k.name)+'</div><span>'+esc(clsName(k.cls))+' · '+esc(modeLabel(k))+'</span>'+(h.length?'<span style="font-size:12px;color:var(--late)">'+h.map(x=>esc(fmtD(x.d).replace(/^\w+, /,''))+': '+esc(unifTxt(x.u))).join(' · ')+'</span>':'')+'</div><div>'+histTag(h.length,'defaulter')+'</div></div>'});
  cpRender('unifCp','unif');
  const rows=gateRows('unif',g=>g.unif&&(g.unif.items||[]).length);
  const cnt={};rows.forEach(r=>r.g.unif.items.forEach(i=>cnt[i]=(cnt[i]||0)+1));
  $('unifToday').innerHTML=catHead('Uniform Defaulters – '+fmtDL(S.date),rows.length,'A')+(rows.length?'<div class="sbcount">'+UNIF.filter(u=>cnt[u[0]]).map(u=>'<span class="tag t-LATE">'+u[1]+' '+cnt[u[0]]+'</span>').join('')+'</div>':'')+
    strips(rows,r=>{const u=r.g.unif;return nrow(esc(r.k.name),'<span class="tag t-A" style="white-space:normal">'+esc(unifTxt(u))+'</span><br>'+dots([esc(modeLabel(r.k)),esc(u.rem),u.by?(u.first?'<b>Logged by '+esc(u.first.by)+'</b> '+esc(u.first.time||'')+' · edited by <b>'+esc(u.by)+'</b>':'<b>Logged by '+esc(u.by)+'</b>')+(u.time?' '+esc(u.time):'')+(u.login&&u.by.indexOf(u.login)<0?' (login: '+esc(u.login)+')':''):'']),histTag(unifHist(r.k.id).length,'defaulter'))},{attr:r=>' data-unif="'+r.k.id+'"',empty:'No uniform defaulters in the selected classes.'});
}
let unifPick=null,unifDraft=null;
function renderUnifPop(){const k=KID[unifPick];const g=S.gate[unifPick]||{};const u=g.unif||{};if(!unifDraft)unifDraft=new Set(u.items||[]);const h=unifHist(unifPick).filter(x=>x.d!==S.date);
  $('modalRoot').innerHTML='<div class="modal"><div class="card" style="max-width:520px;width:100%"><div class="row" style="justify-content:space-between"><h2 style="margin:0">'+esc(k.name)+'</h2><button class="btn ghost sm" id="unifClose">Close</button></div><p class="muted" style="margin:4px 0 10px">'+esc(k.cls)+' · '+esc(modeLabel(k))+' · '+esc(fmtD(S.date))+'</p>'+
    '<label class="f">Uniform defects (tick all that apply)</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px">'+UNIF.map(x=>'<button class="tg '+(unifDraft.has(x[0])?'A':'U')+'" data-uitem="'+x[0]+'" style="width:100%">'+(unifDraft.has(x[0])?'✓ ':'')+x[1]+'</button>').join('')+'</div>'+
    '<label class="f" style="margin-top:10px">Remark</label><input type="text" id="unifRem" value="'+esc(u.rem||'')+'" style="width:100%" placeholder="Optional">'+
    (h.length?'<p style="margin:10px 0 0;color:var(--late);font-size:13px"><b>Earlier this month ('+h.length+'×):</b> '+h.map(x=>esc(fmtD(x.d))+' – '+esc(unifTxt(x.u))).join('; ')+'</p>':'<p class="muted" style="margin:10px 0 0">No uniform record earlier this month.</p>')+
    '<div class="row" style="margin-top:12px"><button class="btn" id="unifSave" style="flex:1">Save</button>'+(u.items&&u.items.length?'<button class="btn ghost" id="unifClear">Remove record</button>':'')+'</div>'+
    '<p class="muted" style="margin:8px 0 0">Saving as: <b>'+esc($('unifBy').value)+'</b>'+(u.by?' · last marked by '+esc(u.by)+' '+esc(u.time||''):'')+'</p></div></div>';}
async function saveUnif(items){const path='att/'+S.date+'/gate/'+unifPick;const g=Object.assign({},S.gate[unifPick]||{});
  if(items.length){const pu=g.unif||{};const by=$('unifBy').value;const first=pu.first||(pu.by&&pu.by!==by?{by:pu.by,time:pu.time||''}:null);g.unif={items,by,login:window.FIS_ME||'',time:nowT(),rem:($('unifRem')||{}).value||''};if(first)g.unif.first=first}else delete g.unif;g.ts=Date.now();
  if(!g.in&&!g.out&&!g.unif)await store.del(path);else await store.set(path,g);
  toast(KID[unifPick].name+(items.length?' – uniform defaulter saved':' – record removed'));unifPick=null;unifDraft=null;$('modalRoot').innerHTML='';render()}
function renderSchool(){
  const dk=Object.values(KID).filter(k=>sbDoubt(k.id)).sort((a,b)=>CLASSES.indexOf(a.cls)-CLASSES.indexOf(b.cls)||a.name.localeCompare(b.name));
  $('schDoubt').classList.toggle('hide',!dk.length);
  $('schDoubt').innerHTML=dk.length?'<div class="secthead"><i></i><span>Stay back doubt cases – confirm with parent</span><small>'+dk.length+'</small></div>'+dk.map(k=>{const d=S.sb[seg(k.cls)]||{};
    return '<div class="kid"><div class="nm"><div>'+esc(k.name)+'</div><span>'+esc(clsName(k.cls))+' · '+esc(modeLabel(k))+(d.by?' · marked by '+esc(d.by)+' '+esc(d.time||''):'')+'</span></div><div style="display:flex;gap:6px"><button class="tg SB" data-dclr="'+k.id+'|1">Staying</button><button class="tg noSB" data-dclr="'+k.id+'|0">Not Staying</button></div></div>'}).join(''):'';
  const rows=schoolRows();const by={};rows.forEach(r=>(by[r.k.cls]=by[r.k.cls]||[]).push(r));
  const cls=CLASSES.filter(c=>by[c]);const sum=$('gateBy').value===ALLBY&&!$('schSt').value&&!$('schQ').value.trim();
  const CATS=[['Absent','A',r=>r.st.IN==='A'],['Late arrival','LATE',r=>r.st.IN==='LATE',r=>r.st.g.in&&r.st.g.in.time],['Early leavers','EARLY',r=>r.st.OUT==='EARLY',r=>r.st.g.out&&r.st.g.out.time],['Stay back','SB',r=>r.st.OUT==='SB'],['Parent pick-up','GOWALK',r=>r.st.OUT==='GOWALK'],['Stay back doubt – confirm with parent','LATE',r=>sbDoubt(r.k.id)],['Smart Study – staying','SB',r=>ssDayVal(r.k.id)==='P'],['Errors reported','A',r=>((r.st.g||{}).errs||[]).length,r=>((r.st.g||{}).errs||[]).map(e=>e.type+(e.rem?' – '+e.rem:'')).join('; ')]];
  $('schList').innerHTML=cls.length?cls.map(c=>{const rs=by[c].sort((a,b)=>a.k.name.localeCompare(b.k.name));
    const cs=sum?CATS.map(ct=>{const a=rs.filter(ct[2]);return a.length?'<div class="sumline"><span class="tag t-'+ct[1]+'">'+ct[0]+' · '+a.length+'</span><ol>'+a.map(r=>'<li><b>'+esc(r.k.name)+'</b><i>'+dots([esc(modeLabel(r.k)),ct[3]?esc(ct[3](r)||''):'',esc(r.rem)])+'</i></li>').join('')+'</ol></div>':''}).join(''):'';
    return '<div class="cstrip"><span>'+esc(clsName(c))+'</span><small>'+rs.length+'</small></div>'+(sum?(cs||'<p class="muted" style="margin:6px">No absent, late, early or stay back entry.</p>')+'<details class="allst"><summary>All '+rs.length+' students</summary>':'')+
    rs.map((r,i)=>{const it=r.st.IN==='W'?'U':r.st.IN==='A'&&r.st.g.in&&r.st.g.in.type==='ABS'?'ABS':r.st.IN;
      return '<div class="nrow" data-pick="'+r.k.id+'" style="cursor:pointer"><span class="no">'+(i+1)+'</span>'+nrow(esc(r.k.name)+(S.walkReg[r.k.id]?' <span class="tag t-GOWALK">Special</span>':'')+(r.st.fo?' <span class="tag t-LATE">FO</span>':''),dots([esc(modeLabel(r.k)),esc(r.time),esc(r.rem),r.by?'by '+esc(byShort(r.by)):'']),
      '<span class="tag t-'+it+'">'+(r.st.IN==='W'?'':'IN: ')+esc(r.inT)+'</span>'+(r.st.OUT?'<span class="tag t-'+(r.st.OUT==='HOME'?'U':r.st.OUT)+'">OUT: '+esc(r.outT)+'</span>':'<span class="tag t-U">OUT: —</span>'))+'</div>'}).join('')+(sum?'</details>':'')}).join(''):'<p class="muted empty">No students match.</p>';
}
/* DAY SUMMARY */
function dayData(){const ks=Object.values(KID).filter(k=>cpHas('day',k.cls));const G=k=>S.gate[k.id]||{};
  return {late:ks.filter(k=>G(k).in&&G(k).in.type==='LATE').map(k=>({k,g:G(k)})),early:ks.filter(k=>G(k).out&&G(k).out.type==='EARLY').map(k=>({k,g:G(k)})),
    sb:ks.filter(k=>{const s=kidStatus(k.id);return s.present&&s.OUT==='SB'&&!sbDoubt(k.id)}).map(k=>({k,g:G(k)})),doubt:ks.filter(k=>sbDoubt(k.id)).map(k=>({k,g:G(k)})),ss:ks.filter(k=>ssDayVal(k.id)==='P').map(k=>({k,g:G(k)})),unif:ks.filter(k=>G(k).unif&&(G(k).unif.items||[]).length).map(k=>({k,g:G(k)}))}}
function sbSrc(k){const v=sbDay(k.id);const d=S.sb[seg(k.cls)]||{};if(((S.gate[k.id]||{}).out||{}).type==='SB')return 'Front Office';if(v===true)return 'Marked by '+byShort(d.by||'PL');if(v==='D')return 'Doubt – to confirm';return 'Regular list – not marked yet'}
function renderDay(){
  $('dayH').textContent='Day Summary – '+fmtDL(S.date);cpRender('dayCp','day');const D=dayData();
  const kp=[['Late Comers',D.late.length,'LATE'],['Early Leavers',D.early.length,'EARLY'],['Stay Back',D.sb.length,'SB'],['Stay Back Doubt',D.doubt.length,'LATE'],['Smart Study',D.ss.length,'SB'],['Errors',errRows([S.date]).length,'A'],['Uniform Defaulters',D.unif.length,'A']];
  $('dayBody').innerHTML='<div class="daykp">'+kp.map(x=>'<div class="c-'+x[2]+'"><b>'+x[1]+'</b><span>'+x[0]+'</span></div>').join('')+'</div>'+
    '<div class="card">'+catHead('Late Comers',D.late.length,'LATE')+strips(D.late,r=>nrow(esc(r.k.name),dots([esc(modeLabel(r.k)),esc(r.g.rem),r.g.by?'by '+esc(byShort(r.g.by)):'']),'<span class="tag t-LATE">'+esc(r.g.in.time||'')+'</span>'),{empty:'No late comers.'})+'</div>'+
    '<div class="card">'+catHead('Early Leavers',D.early.length,'EARLY')+strips(D.early,r=>nrow(esc(r.k.name),dots(['Regular: '+esc(modeLabel(r.k)),r.g.rem?'<b>'+esc(r.g.rem)+'</b>':'',r.g.by?'by '+esc(byShort(r.g.by)):'']),'<span class="tag t-EARLY">Left '+esc(r.g.out.time||'')+'</span>'),{empty:'No early leavers.'})+'</div>'+
    '<div class="card">'+catHead('Stay Back',D.sb.length,'SB')+strips(D.sb,r=>nrow(esc(r.k.name),dots([esc(modeLabel(r.k)),esc(sbSrc(r.k))]),''),{empty:'No stay back students.'})+'</div>'+
    '<div class="card">'+errHtml(errRows([S.date]).filter(r=>!r.k||cpHas('day',r.k.cls)),'day','Errors of the Day')+'</div>'+
    '<div class="card">'+catHead('Stay Back Doubt – confirm with parent',D.doubt.length,'LATE')+strips(D.doubt,r=>nrow(esc(r.k.name),dots([esc(modeLabel(r.k)),'Marked by '+esc(byShort((S.sb[seg(r.k.cls)]||{}).by||''))]),''),{empty:'No doubt cases.'})+'</div>'+
    '<div class="card">'+catHead('Smart Study Session',D.ss.length,'SB')+strips(D.ss,r=>nrow(esc(r.k.name),dots([esc(modeLabel(r.k)),'Marked by '+esc(byShort((S.ss[seg(r.k.cls)]||{}).by||''))]),''),{empty:'No Smart Study attendance marked.'})+'</div>'+
    '<div class="card">'+catHead('Uniform Defaulters',D.unif.length,'A')+strips(D.unif,r=>nrow(esc(r.k.name),'<span class="tag t-A" style="white-space:normal">'+esc(unifTxt(r.g.unif))+'</span><br>'+dots([esc(modeLabel(r.k)),esc(r.g.unif.rem),r.g.unif.by?'Logged by '+esc(r.g.unif.by)+(r.g.unif.time?' '+esc(r.g.unif.time):''):'']),''),{empty:'No uniform defaulters.'})+'</div>';
}
function dayText(){const D=dayData();const a=cpGet('day');let t='*FIS Day Summary – '+fmtDL(S.date)+'*'+(a.length?'\nClasses: '+a.map(secLbl).join(', '):'')+'\n';
  const blk=(title,rows,fn)=>{t+='\n*'+title+' ('+rows.length+')*\n';if(!rows.length){t+='None\n';return}const by={};rows.forEach(r=>(by[r.k.cls]=by[r.k.cls]||[]).push(r));
    CLASSES.filter(c=>by[c]).forEach(c=>{t+='_'+clsName(c)+'_\n';by[c].sort((x,y)=>x.k.name.localeCompare(y.k.name)).forEach((r,i)=>{t+=(i+1)+'. '+r.k.name+fn(r)+'\n'})})};
  blk('Late Comers',D.late,r=>' – '+(r.g.in.time||'')+' ('+modeLabel(r.k)+')');
  blk('Early Leavers',D.early,r=>' – '+(r.g.out.time||'')+(r.g.rem?' – '+r.g.rem:'')+' ('+modeLabel(r.k)+')');
  blk('Stay Back',D.sb,r=>' ('+modeLabel(r.k)+')');
  blk('Stay Back Doubt',D.doubt,r=>' ('+modeLabel(r.k)+')');
  blk('Smart Study Session',D.ss,r=>' ('+modeLabel(r.k)+')');
  blk('Uniform Defaulters',D.unif,r=>' – '+unifTxt(r.g.unif));
  return t}
function schoolText(){const rows=schoolRows();const d=new Date(S.date+'T00:00');
  let t='*FIS Student List – '+d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})+'*\n';let cur='';
  rows.sort((a,b)=>CLASSES.indexOf(a.k.cls)-CLASSES.indexOf(b.k.cls)||a.k.name.localeCompare(b.k.name)).forEach(r=>{if(r.k.cls!==cur){cur=r.k.cls;t+='\n*'+cur+'*\n'}
    t+='• '+r.k.name+' ('+modeLabel(r.k)+') – IN: '+r.inT+' | OUT: '+r.outT+(r.time?' | '+r.time:'')+(r.rem?' | '+r.rem:'')+'\n'});
  return t}

/* ALLOC */
function renderAlloc(){
  const ids=Object.keys(LEFT);
  $('leftList').innerHTML=ids.length?ids.map(id=>{const x=LEFT[id];const a=ALLKIDS[id];return '<div class="kid"><div class="nm"><div>'+esc(x.name||(a&&a.kid[1])||id)+'</div><span>'+esc(x.cls||'')+' · '+esc((a&&a.l)||'')+(x.note?' · '+esc(x.note):'')+'</span></div><button class="btn ghost sm" data-leftdel="'+id+'">↺ Restore</button></div>'}).join(''):'<span class="muted">None</span>';
  if(document.activeElement!==$('leftAdd'))$('leftAdd').innerHTML='<option value="">Remove a student (left / TC)…</option>'+Object.values(KID).sort((a,b)=>a.name.localeCompare(b.name)).map(k=>'<option value="'+k.id+'">'+esc(k.name)+' – '+esc(k.cls)+' ('+esc(VBY[k.v].l)+')</option>').join('');
  if(document.activeElement!==$('lateAfter'))$('lateAfter').value=S.lateAfter;
  if($('lateAfterPP')&&document.activeElement!==$('lateAfterPP'))$('lateAfterPP').value=ppCut();
  $('mgrList').innerHTML=S.managers.length?S.managers.map((m,i)=>'<span class="tag t-VEH" style="font-size:13px;padding:6px 10px">'+esc(m)+' <button class="x" style="float:none;font-size:16px;padding:0 0 0 6px;color:var(--brand)" data-mgrdel="'+i+'">×</button></span>').join(''):'<span class="muted">No managers added yet.</span>';
  $('allocT').innerHTML='<tr><th>Vehicle</th><th>Students</th><th>Default In-charge</th><th>Assigned In-charge</th></tr>'+VEH.map(v=>'<tr><td><b>'+esc(v.l)+'</b></td><td>'+v.kids.length+'</td><td class="l muted">'+esc(defaultStaff(v))+'</td><td class="l"><select data-alloc="'+v.k+'" style="min-width:170px">'+STAFF.map(s=>'<option'+(s===staffOf(v.k)?' selected':'')+'>'+esc(s)+'</option>').join('')+'</select></td></tr>').join('');
}

/* ---------- events ---------- */
document.addEventListener('click',async e=>{
  const t=e.target.closest('button,[data-pick],[data-unif],[data-veh],#mbg,#fobg');if(!t)return;
  if(t.dataset.v){setView(t.dataset.v);return}
  if(t.dataset.pvan){const id=t.dataset.pvan;const kids=Object.assign({},S.privVan);if(kids[id])delete kids[id];else kids[id]=true;await store.set('config/privateVan',{kids,ts:Date.now()});toast(KID[id].name+' → '+(kids[id]?'Private Van':'By Walk'));renderFO();return}
  if(t.id==='mgrAdd'){const n=$('mgrName').value.trim();if(!n)return;if(S.managers.includes(n)||STAFF.includes(n)){toast('Already in the list');return}
    await store.set('config/managers',{names:S.managers.concat([n]),ts:Date.now()});$('mgrName').value='';toast(n+' added as manager');return}
  if(t.dataset.mgrdel!==undefined){const i=+t.dataset.mgrdel;const n=S.managers[i];const names=S.managers.filter((_,j)=>j!==i);await store.set('config/managers',{names,ts:Date.now()});toast(n+' removed');return}
  if(t.dataset.chk){const [key,val]=t.dataset.chk.split(':');const cur=S.derr[S.depVeh]||{};const checks=Object.assign({},cur.checks||{});checks[key]=checks[key]===val?null:val;checks[key+'By']=markBy('depStaff',S.depVeh);await saveDerr(S.depVeh,{checks});return}
  if(t.id==='derrAdd'){const cur=S.derr[S.depVeh]||{};const it={type:$('derrType').value,kid:$('derrKid').value,rem:$('derrRem').value.trim(),by:markBy('depStaff',S.depVeh),time:nowT(),ts:Date.now()};
    await saveDerr(S.depVeh,{items:(cur.items||[]).concat([it])});toast('Error added');return}
  if(t.dataset.derrdel!==undefined){const cur=S.derr[S.depVeh]||{};const items=(cur.items||[]).filter((_,i)=>i!==+t.dataset.derrdel);await saveDerr(S.depVeh,{items});return}
  if(t.id==='wkRefresh'){S.weekTick=(S.weekTick||0)+1;WK.key='';renderDash();return}
  if(t.dataset.recper){S.recPer=t.dataset.recper;renderDash();return}
  if(t.dataset.recseg){S.recSeg=t.dataset.recseg;renderDash();return}
  if(t.id==='recRefresh'){S.recTick=(S.recTick||0)+1;RG.key='';renderDash();return}
  if(t.dataset.derrcp!==undefined||t.dataset.derrwa!==undefined){const v=VEH.find(x=>x.k===S.depVeh);const it=((S.derr[S.depVeh]||{}).items||[])[+(t.dataset.derrcp??t.dataset.derrwa)];if(!it)return;const m=errMsg(S.date,v,it);if(t.dataset.derrwa!==undefined)await waSend(m);else await copyTxt(m);return}
  if(t.dataset.derrall){const v=VEH.find(x=>x.k===S.depVeh);const its=(S.derr[S.depVeh]||{}).items||[];const m='*Bus Errors – '+v.l+' – '+fmtD(S.date)+'*\nDuty: '+staffOf(v.k)+'\n'+its.map((it,i)=>{const k=it.kid&&KID[it.kid];return (i+1)+'. '+it.type+(k?' – '+k.name+' ('+shortCls(k.cls)+')':'')+(it.rem?' – '+it.rem:'')+(it.by?' [by '+it.by+(it.time?' '+it.time:'')+']':'')}).join('\n');if(t.dataset.derrall==='wa')await waSend(m);else await copyTxt(m);return}
  if(t.dataset.berrcp!==undefined||t.dataset.berrwa!==undefined){const r=BERR_ROWS[+(t.dataset.berrcp??t.dataset.berrwa)];if(!r)return;const m=errMsg(r.d,r.v,{type:r.type,kid:r.kid,rem:r.rem,by:r.by});if(t.dataset.berrwa!==undefined)await waSend(m);else await copyTxt(m);return}
  if(t.id==='berrDetCopy'){await copyTxt(busErrDetText());return}
  if(t.id==='berrDetWa'){await waSend(busErrDetText());return}
  if(t.id==='berrDayWa'||t.id==='berrDayCp'){const f=$('dashF').value;const m=busErrDayText(VEH.filter(v=>!f||v.t===f));if(t.id==='berrDayWa')await waSend(m);else await copyTxt(m);return}
  if(t.id==='berrCopy'){const f=$('dashF').value;const txt=busErrText(VEH.filter(v=>!f||v.t===f));try{await navigator.clipboard.writeText(txt);toast('Copied')}catch(err){showText(txt)}return}
  if(t.id==='unifCopy'){const txt=unifMonthlyText();try{await navigator.clipboard.writeText(txt);toast('Copied')}catch(err){showText(txt)}return}
  if(t.id==='vwCopy'){const txt=vehWiseText();try{await navigator.clipboard.writeText(txt);toast('Copied')}catch(err){showText(txt)}return}
  if(t.id==='lateCopy'){const txt=lateMonthlyText();try{await navigator.clipboard.writeText(txt);toast('Copied')}catch(err){showText(txt)}return}
  if(t.id==='recCopy'){const txt=recText();try{await navigator.clipboard.writeText(txt);toast('Copied')}catch(err){showText(txt)}return}
  if(t.dataset.mchk){const [k,v]=t.dataset.mchk.split(':');mDraft[k]=mDraft[k]===v?null:v;renderDutyVeh();return}
  if(t.dataset.chip){const c=t.dataset.chip;const s=new Set(selClasses());s.has(c)?s.delete(c):s.add(c);setClasses(CLASSES.filter(x=>s.has(x)));return}
  if(t.dataset.chipgrade){const g=t.dataset.chipgrade;const secs=CLASSES.filter(c=>c.split(' - ')[0]===g);const s=new Set(selClasses());const all=secs.every(c=>s.has(c));secs.forEach(c=>all?s.delete(c):s.add(c));setClasses(CLASSES.filter(x=>s.has(x)));return}
  if(t.dataset.chipall!==undefined){setClasses(t.dataset.chipall==='1'?CLASSES.slice():[]);return}
  if(t.dataset.seg){S.sbSeg=t.dataset.seg;LS.set('sbSeg',S.sbSeg);render();return}
  if(t.dataset.depopen){S.depVeh=t.dataset.depopen;depDraft=null;render();window.scrollTo(0,0);return}
  if(t.id==='depBack'){S.depVeh=null;depDraft=null;render();return}
  if(t.dataset.dtg){const n=t.dataset.dtg;if(depDraft[n])delete depDraft[n];else depDraft[n]=true;renderDep();return}
  if(t.id==='depAll'){depRows(VBY[S.depVeh]).forEach(r=>{if(r.i.go)depDraft[r.k[0]]=true});renderDep();return}
  if(t.id==='depClr'){depDraft={};renderDep();return}
  if(t.id==='depSave'){const v=VBY[S.depVeh];const go=v.kids.filter(k=>depInfo(v.k+'-'+k[0]).go).length;
    await store.set('att/'+S.date+'/out/'+v.k,{marks:sortObj(depDraft),going:go,by:markBy('depStaff',v.k),time:nowT(),submitted:true,ts:Date.now()});toast(v.l+' departure saved');S.depVeh=null;depDraft=null;render();return}
  if(t.dataset.open){S.openVeh=t.dataset.open;draft=null;mDraft=null;render();window.scrollTo(0,0);return}
  if(t.id==='backV'){S.openVeh=null;draft=null;mDraft=null;render();return}
  if(t.dataset.unif){if(needBy('unifBy'))return;unifPick=t.dataset.unif;unifDraft=null;renderUnifPop();return}
  if(t.dataset.uitem){unifDraft.has(t.dataset.uitem)?unifDraft.delete(t.dataset.uitem):unifDraft.add(t.dataset.uitem);const r=$('unifRem').value;renderUnifPop();$('unifRem').value=r;return}
  if(t.id==='unifClose'){unifPick=null;unifDraft=null;$('modalRoot').innerHTML='';return}
  if(t.id==='unifSave'){if(!unifDraft.size){toast('Tick at least one defect');return}await saveUnif(UNIF.map(x=>x[0]).filter(i=>unifDraft.has(i)));return}
  if(t.id==='unifClear'){await saveUnif([]);return}
  if(t.dataset.leftdel){const nl=Object.assign({},LEFT);delete nl[t.dataset.leftdel];await store.set('config/settings',Object.assign({},S.settings||{},{lateAfter:S.lateAfter,left:nl,ts:Date.now()}));return}
  if(t.dataset.tg){const n=t.dataset.tg;const auto=VBY[S.openVeh].t==='Auto'&&!/^x/.test(n);draft[n]=draft[n]==='P'?'A':(draft[n]==='A'&&auto)?'PD':'P';if(draft[n]!=='PD'&&mDraft.depBy)delete mDraft.depBy[n];renderDutyVeh();return}
  if(t.dataset.depby){const [n,w]=t.dataset.depby.split(':');mDraft.depBy=mDraft.depBy||{};if(w==='PARENT')mDraft.depBy[n]='PARENT';else delete mDraft.depBy[n];renderDutyVeh();return}
  if(t.dataset.exdel){delete mDraft.extra[t.dataset.exdel];delete draft[t.dataset.exdel];renderDutyVeh();return}
  if(t.id==='exAdd'){const nm=$('exName').value.trim();if(!nm){toast('Type the student name');return}const x='x'+Date.now().toString(36);mDraft.extra[x]={name:nm,cls:$('exCls').value||''};draft[x]='P';renderDutyVeh();return}
  if(t.id==='allP'){VBY[S.openVeh].kids.forEach(k=>{if(!draft[k[0]])draft[k[0]]='P'});Object.keys(mDraft.extra||{}).forEach(x=>{if(!draft[x])draft[x]='P'});renderDutyVeh();return}
  if(t.id==='clrV'){draft={};if(mDraft)mDraft.depBy={};renderDutyVeh();return}
  if(t.id==='saveV'){const v=VBY[S.openVeh];const un=v.kids.filter(k=>!draft[k[0]]).length;
    if(un&&!t.dataset.confirm){t.dataset.confirm=1;t.textContent=un+' not marked – tap again to save';return}
    await store.set('att/'+S.date+'/veh/'+v.k,{marks:sortObj(draft),by:markBy('dutyStaff',v.k),time:nowT(),arr:$('arrT').value||'',driverU:(mDraft||{}).driverU||null,condU:(mDraft||{}).condU||null,depBy:(mDraft||{}).depBy||{},extra:(mDraft||{}).extra||{},submitted:true,ts:Date.now()});
    toast(v.l+' saved');S.openVeh=null;draft=null;mDraft=null;render();return}
  if(t.dataset.pick){const fb=t.dataset.foby;if(needBy(fb==='late'?'lateBy':fb==='early'?'earlyBy':'gateBy'))return;gatePick=t.dataset.pick;gDraft=null;foBy=fb==='late'?$('lateBy').value:fb==='early'?$('earlyBy').value:null;
    if(fb==='early'){const g=S.gate[gatePick]||{};gDraft={in:g.in&&g.in.type||null,out:'EARLY'}}
    if(t.dataset.foby==='late'){const g=S.gate[gatePick]||{};gDraft={in:g.in&&g.in.type?g.in.type:(nowHM()>kidCut(gatePick)?'LATE':'PRES'),out:g.out&&g.out.type||null}}
    renderFO();return}
  if(t.id==='gx'||(t.id==='fobg'&&e.target.id==='fobg')){gatePick=null;gDraft=null;$('modalRoot').innerHTML='';return}
  if(t.dataset.gopt){const [side,type]=t.dataset.gopt.split(':');const g=S.gate[gatePick]||{};
    if(!gDraft)gDraft={in:g.in&&g.in.type||null,out:g.out&&g.out.type||null};
    gDraft.rem=$('gRem').value;gDraft.inT=$('gInT').value;gDraft.outT=$('gOutT').value;gDraft[side]=gDraft[side]===type?null:type;renderFO();return}
  if(t.id==='gErrAdd'){const by=foBy||$('gateBy').value;if(by===ALLBY){toast('Choose your name in "Marked by" first');return}const rem=$('gErrRem').value.trim();if($('gErrT').value==='Other'&&!rem){toast('Write what happened');return}
    const g=S.gate[gatePick]||{};const errs=(g.errs||[]).concat([{ph:$('gErrPh').value,type:$('gErrT').value,rem,by,time:nowT(),ts:Date.now()}]);
    await store.set('att/'+S.date+'/gate/'+gatePick,Object.assign({},g,{errs,ts:Date.now()}));toast('Error recorded');renderFO();return}
  if(t.dataset.gerrdel!==undefined){const g=S.gate[gatePick]||{};const errs=(g.errs||[]).slice();errs.splice(+t.dataset.gerrdel,1);await store.set('att/'+S.date+'/gate/'+gatePick,Object.assign({},g,{errs,ts:Date.now()}));toast('Error removed');renderFO();return}
  if(t.id==='gSave'){const g=S.gate[gatePick]||{};const d=gDraft||{in:g.in&&g.in.type||null,out:g.out&&g.out.type||null};
    const path='att/'+S.date+'/gate/'+gatePick;
    if(!d.in&&!d.out){if(g.unif)await store.set(path,{unif:g.unif,ts:Date.now()});else await store.del(path)}
    else{const body={by:foBy||$('gateBy').value,rem:$('gRem').value.trim(),ts:Date.now()};if(g.unif)body.unif=g.unif;
      if(d.in)body.in={type:d.in,time:hm12($('gInT').value||nowHM())};
      if(d.out)body.out={type:d.out,time:hm12($('gOutT').value||nowHM())};
      await store.set(path,body)}
    toast(KID[gatePick].name+' saved');gatePick=null;gDraft=null;foBy=null;$('modalRoot').innerHTML='';render();return}
  if(t.dataset.sb){const id=t.dataset.sb,sg=seg(KID[id].cls);S.sbDraft=S.sbDraft||{};const d=S.sbDraft[sg]=S.sbDraft[sg]||{};const cur=sbState(id);const v=id in d?d[id]:cur;const nx=v===true?false:v===false?'D':true;
    if(nx===cur)delete d[id];else d[id]=nx;if(!Object.keys(d).length)delete S.sbDraft[sg];render();return}
  if(t.dataset.cpall!==undefined){cpSet(t.dataset.cpall,[]);return}
  if(t.dataset.cpg){const [key,g]=t.dataset.cpg.split('|');const secs=CLASSES.filter(c=>c.split(' - ')[0]===g);const a=new Set(cpGet(key));const all=secs.every(c=>a.has(c));secs.forEach(c=>all?a.delete(c):a.add(c));cpSet(key,[...a]);return}
  if(t.dataset.cps){const [key,c]=t.dataset.cps.split('|');const a=new Set(cpGet(key));a.has(c)?a.delete(c):a.add(c);cpSet(key,[...a]);return}
  if(t.dataset.sbv){if(needBy('sbBy'))return;const [id,code]=t.dataset.sbv.split('|');const v=code==='S'?true:code==='N'?false:code==='D'?'D':'A';const sg=seg(KID[id].cls);S.sbDraft=S.sbDraft||{};const d=S.sbDraft[sg]=S.sbDraft[sg]||{};
    if(d[id]===v||(!(id in d)&&sbDay(id)===v))delete d[id];else if(sbDay(id)===v)delete d[id];else d[id]=v;if(!Object.keys(d).length)delete S.sbDraft[sg];render();return}
  if(t.dataset.sball){if(needBy('sbBy'))return;const c=t.dataset.sball,sg=seg(c);S.sbDraft=S.sbDraft||{};const d=S.sbDraft[sg]=S.sbDraft[sg]||{};sbCands(c).forEach(k=>{if(sbVal(k.id)===undefined)d[k.id]=true});if(!Object.keys(d).length)delete S.sbDraft[sg];render();return}
  if(t.id==='ssPullBtn'){await ssPull();return}
  if(t.dataset.ssdate){const d=t.dataset.ssdate;$('date').value=d;$('date').dispatchEvent(new Event('change',{bubbles:true}));window.scrollTo({top:0,behavior:'smooth'});return}
  if(t.dataset.ssv){if(needBy('ssBy'))return;const [id,v]=t.dataset.ssv.split('|');const sg=seg(KID[id].cls);S.ssDraft=S.ssDraft||{};const d=S.ssDraft[sg]=S.ssDraft[sg]||{};
    if(d[id]===v||ssDayVal(id)===v)delete d[id];else d[id]=v;if(!Object.keys(d).length)delete S.ssDraft[sg];render();return}
  if(t.dataset.ssall){if(needBy('ssBy'))return;const c=t.dataset.ssall,sg=seg(c);S.ssDraft=S.ssDraft||{};const d=S.ssDraft[sg]=S.ssDraft[sg]||{};ssMembers(c).filter(m=>!m.frz&&ssVal(m.k.id)===undefined).forEach(m=>d[m.k.id]='P');if(!Object.keys(d).length)delete S.ssDraft[sg];render();return}
  if(t.dataset.sssave){if(needBy('ssBy'))return;await ssSave(t.dataset.sssave);return}
  if(t.dataset.sscancel){delete S.ssDraft[t.dataset.sscancel];render();return}
  if(t.dataset.ssfrz){if(needBy('ssBy'))return;const id=t.dataset.ssfrz;const e=ssEntry(id)||{};let why='';
    if(!e.frz){why=prompt('Reason for freezing '+KID[id].name+' (optional)','Parents not allowing');if(why===null)return}
    await ssWriteList(KID[id].cls,kids=>{const x=kids[id]=kids[id]||{src:'add'};if(x.frz){delete x.frz;delete x.why}else{x.frz=true;x.why=why||'Parents not allowing'}});toast(KID[id].name+(e.frz?' unfrozen':' frozen – not staying'));return}
  if(t.dataset.ssrm){if(needBy('ssBy'))return;const id=t.dataset.ssrm;await ssWriteList(KID[id].cls,kids=>{kids[id]=Object.assign(kids[id]||{src:'add'},{rm:true})});toast(KID[id].name+' removed from Smart Study');return}
  if(t.dataset.ssback){if(needBy('ssBy'))return;const id=t.dataset.ssback;await ssWriteList(KID[id].cls,kids=>{if(kids[id])delete kids[id].rm});toast(KID[id].name+' added back');return}
  if(t.id==='dayCopy'){await copyTxt(dayText());return}
  if(t.dataset.sbsave){if(needBy('sbBy'))return;await saveSBClass(t.dataset.sbsave);render();return}
  if(t.dataset.sbcancel){delete (S.sbDraft||{})[t.dataset.sbcancel];render();return}
  if(t.dataset.dclr){if(needBy('gateBy'))return;const [id,v]=t.dataset.dclr.split('|');await setDaySB(id,v==='1',$('gateBy').value);toast(KID[id].name+(v==='1'?' – staying (confirmed)':' – not staying (confirmed)'));return}
  if(t.dataset.sbreg){if(needBy('sbBy'))return;const id=t.dataset.sbreg;const kids=Object.assign({},S.sbReg);if(kids[id])delete kids[id];else kids[id]=true;await store.set('config/sbRegular',{kids,by:$('sbBy').value,ts:Date.now()});return}
  if(t.dataset.wreg){const id=t.dataset.wreg;const kids=Object.assign({},S.walkReg);if(kids[id])delete kids[id];else kids[id]=true;await store.set('config/walkRegular',{kids,ts:Date.now()});toast(KID[id].name+(kids[id]?' added to':' removed from')+' special list');renderFO();return}
  if(t.dataset.veh){modalVeh=t.dataset.veh;renderModal();return}
  if(t.id==='mx'||t.id==='mbg'&&e.target.id==='mbg'){modalVeh=null;$('modalRoot').innerHTML='';return}
  if(t.id==='copySch'){const txt=schoolText();try{await navigator.clipboard.writeText(txt);toast('Summary copied')}catch(err){showText(txt)}return}
  if(t.id==='copyRep'){const txt=reportText();try{await navigator.clipboard.writeText(txt);toast('Report copied')}catch(err){showText(txt)}return}
});
function showText(txt){$('modalRoot').innerHTML='<div class="modal" id="mbg"><div class="card"><button class="x" id="mx">×</button><h2>Report – select &amp; copy</h2><textarea readonly>'+esc(txt)+'</textarea></div></div>'}
document.addEventListener('change',async e=>{
  const t=e.target;
  if(t.id==='gInT'&&gatePick){const g=S.gate[gatePick]||{};if(!gDraft)gDraft={in:g.in&&g.in.type||null,out:g.out&&g.out.type||null};gDraft.rem=$('gRem').value;gDraft.inT=t.value;gDraft.outT=$('gOutT').value;if(gDraft.in!=='ABS')gDraft.in=t.value>kidCut(gatePick)?'LATE':'PRES';renderFO();return}
  if(t.id==='gOutT'&&gatePick){const g=S.gate[gatePick]||{};if(!gDraft)gDraft={in:g.in&&g.in.type||null,out:g.out&&g.out.type||null};gDraft.rem=$('gRem').value;gDraft.inT=$('gInT').value;gDraft.outT=t.value;gDraft.out='EARLY';renderFO();return}
  if(t.id==='lateAfterPP'){await store.set('config/settings',Object.assign({},S.settings||{},{lateAfter:S.lateAfter,lateAfterPP:t.value||'09:00',left:LEFT,ts:Date.now()}));toast('Pre-Primary late after '+hm12(t.value));return}
  if(t.id==='signOut'){if(confirm('Sign out of this phone?'))window.FIS_LOGOUT();return}
  if(t.id==='lateAfter'){await store.set('config/settings',Object.assign({},S.settings||{},{lateAfter:t.value||'07:45',left:LEFT,ts:Date.now()}));toast('Late after '+hm12(t.value));return}
  if(t.id==='leftAdd'&&t.value){const id=t.value,a=ALLKIDS[id];const nl=Object.assign({},LEFT);nl[id]={name:a.kid[1],cls:a.kid[2],v:a.k,note:'TC',on:S.date};
    await store.set('config/settings',Object.assign({},S.settings||{},{lateAfter:S.lateAfter,left:nl,ts:Date.now()}));toast(a.kid[1]+' removed (left school)');return}
  if(t.id==='depStaff'){LS.set('depStaff',t.value);S.depVeh=null;render()}
  if(['schCls','schMode','schSt'].includes(t.id))render();
  if(t.id==='dutyStaff'){LS.set('staff',t.value);S.openVeh=null;draft=null;render()}
  if(t.id==='date'){mDraft=null;WK.key='';RG.key='';S.date=t.value||todayStr();S.openVeh=null;draft=null;S.sbDraft={};subscribeDate()}
  if(t.id==='sbMode'){render()}
  if(t.id==='exPick'&&t.value){const k=KID[t.value];const x='x'+Date.now().toString(36);mDraft.extra[x]={name:k.name,cls:k.cls,from:VBY[k.v].l,id:k.id};draft[x]='P';renderDutyVeh();return}
  if(t.id==='sbAdd'&&t.value){if(needBy('sbBy')){t.value='';return}const id=t.value,sg=seg(KID[id].cls);S.sbDraft=S.sbDraft||{};(S.sbDraft[sg]=S.sbDraft[sg]||{})[id]=true;toast(KID[id].name+' added – press Save for the class');render()}
  if(t.id==='sbAddReg'&&t.value){const id=t.value;const kids=Object.assign({},S.sbReg);kids[id]=true;await store.set('config/sbRegular',{kids,by:$('sbBy').value,ts:Date.now()});toast(KID[id].name+' added to the regular stayback list')}
  if(t.id==='sbBy'){LS.set('sbBy',t.value);render()}
  if(t.id==='lateBy'){LS.set('lateBy',t.value)}
  if(t.id==='earlyBy'){LS.set('earlyBy',t.value)}
  if(t.id==='ssBy'){LS.set('ssBy',t.value);render()}
  if(t.id==='ssMode'){render()}
  if(t.id==='ssFromIn'){LS.set('ssFrom',t.value||'');SSH.key='';render()}
  if(t.dataset&&t.dataset.ssadd&&t.value){if(needBy('ssBy')){t.value='';return}const id=t.value;await ssWriteList(t.dataset.ssadd,kids=>{kids[id]={src:'add',by:$('ssBy').value,since:S.date}});toast(KID[id].name+' added to Smart Study');return}
  if(t.id==='unifBy'){LS.set('unifBy',t.value)}
  if(t.id==='unifItem'){S.unifItem=t.value;renderDash();return}
  if(t.id==='berrType'){S.berrType=t.value;renderDash();return}
  if(t.id==='unifMin'){S.unifMin=+t.value;renderDash();return}
  if(t.id==='lateMin'){S.lateMin=+t.value;renderDash();return}
  if(t.dataset.addfo&&t.value){const g=S.gate[t.value]||{};gatePick=t.value;foBy=$('sbBy').value;gDraft={in:g.in&&g.in.type||null,out:g.out&&g.out.type||null};if(t.dataset.addfo==='LATE')gDraft.in='LATE';else gDraft.out='EARLY';t.value='';renderFO();return}
  if(t.id==='sbGrade'){setGrade(t.value);return}
  if(t.dataset.sec){const s=new Set(selClasses());t.checked?s.add(t.dataset.sec):s.delete(t.dataset.sec);setClasses(CLASSES.filter(x=>s.has(x)));return}
  if(t.id==='gateBy'){LS.set('gateBy',t.value);render()}
  if(t.id==='dashF'||t.id==='dashS'||t.id==='dashV')render();
  if(t.id==='recCls'){S.recCls=t.value;renderDash();return}
  if(t.id==='recRep'){S.recRep=t.checked;renderDash();return}
  if(t.dataset.alloc){const map=Object.assign({},S.alloc);const v=VBY[t.dataset.alloc];if(t.value===defaultStaff(v))delete map[v.k];else map[v.k]=t.value;await store.set('config/alloc',{map,ts:Date.now()});toast(v.l+' → '+t.value)}
});
$('unifQ').addEventListener('input',()=>{clearTimeout(window._uq);window._uq=setTimeout(renderUnif,200)});
$('earlyQ').addEventListener('input',()=>{clearTimeout(window._eq);window._eq=setTimeout(renderEarly,200)});
document.addEventListener('input',e=>{const t=e.target;if(t.dataset&&t.dataset.cpq){S.cpQ=S.cpQ||{};S.cpQ[t.dataset.cpq]=t.value;const b=t.parentElement.querySelector('[data-cpbox]');if(b)b.innerHTML=cpSecs(t.dataset.cpq)}});
document.addEventListener('toggle',e=>{const t=e.target;if(t.dataset&&t.dataset.cpd){S.cpOpen=S.cpOpen||{};S.cpOpen[t.dataset.cpd]=t.open}},true);
$('lateQ').addEventListener('input',()=>{clearTimeout(window._lq);window._lq=setTimeout(renderLate,200)});
$('schQ').addEventListener('input',()=>{clearTimeout(window._sq);window._sq=setTimeout(renderSchool,250)});

/* ---------- init ---------- */
$('date').value=S.date;
fillStaffSelects();
$('schCls').innerHTML='<option value="">All classes</option>'+GRADES.map(g=>'<optgroup label="'+esc(g)+'"><option value="'+esc(g)+'">'+esc(g)+' – all sections</option>'+CLASSES.filter(c=>c.split(' - ')[0]===g).map(c=>'<option>'+esc(c)+'</option>').join('')+'</optgroup>').join('');
S.sbClasses=LS.get('sbClasses',[]);S.sbGrade=LS.get('sbGrade','');if(S.sbGrade)S.sbClasses=S.sbClasses.filter(c=>c.split(' - ')[0]===S.sbGrade);else S.sbClasses=[];
fillSbBy();
function start(){subscribeConfig();subscribeDate();setView(S.view)}
let started=false;
DB=GAS;$('whoName').textContent=window.FIS_ME||'';start();
setView(S.view);
