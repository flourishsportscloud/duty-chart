
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
const S={date:todayStr(),view:(v=>['duty','sb','dep','dash','school','alloc'].includes(v)?v:'school')(LS.get('view','duty')),veh:{},gate:{},sb:{},alloc:{},sbReg:{},walkReg:{},out:{},derr:{},sbSeg:LS.get('sbSeg','sb'),managers:[],privVan:{},lateAfter:'07:45',openVeh:null,depVeh:null};
let unsubs=[];
function subscribeDate(){
  unsubs.forEach(u=>u&&u());unsubs=[];
  const d=S.date;
  unsubs.push(store.subCol('att/'+d+'/veh',o=>{S.veh=o;render()}));
  unsubs.push(store.subCol('att/'+d+'/gate',o=>{S.gate=o;render()}));
  unsubs.push(store.subCol('att/'+d+'/sb',o=>{S.sb=o;render()}));
  unsubs.push(store.subCol('att/'+d+'/out',o=>{S.out=o;render()}));
  unsubs.push(store.subCol('att/'+d+'/derr',o=>{S.derr=o;render()}));
}
function subscribeConfig(){
  store.subDoc('config/alloc',o=>{S.alloc=(o&&o.map)||{};render()});
  store.subDoc('config/sbRegular',o=>{S.sbReg=(o&&o.kids)||{};render()});
  store.subDoc('config/walkRegular',o=>{S.walkReg=(o&&o.kids)||{};render()});
  store.subDoc('config/settings',o=>{S.settings=o||{};S.lateAfter=(o&&o.lateAfter)||'08:00';
    const nl=(o&&o.left)?o.left:LEFT_DEFAULT;const back=Object.keys(LEFT).some(id=>!nl[id]);LEFT=Object.assign({},nl);applyLeft(LEFT);
    if(back)toast('A student was restored – close and reopen the app to see them');render()});
  store.subDoc('config/privateVan',o=>{S.privVan=(o&&o.kids)||{};render()});
  store.subDoc('config/managers',o=>{S.managers=(o&&o.names)||[];fillStaffSelects();fillSbBy();render()});
}
const staffOf=k=>S.alloc[k]||defaultStaff(VBY[k]);
const ALL_V='All Vehicles';
const ALL_B='All';
const selBy=v=>v===ALL_B?((window.FIS_ME||'')?window.FIS_ME+' (All)':'All'):v;
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
function fillSbBy(){const cur=LS.get('sbBy',PL_NAMES[0]);const grp=(l,arr)=>arr.length?'<optgroup label="'+l+'">'+arr.map(s=>'<option'+(s===cur?' selected':'')+'>'+esc(s)+'</option>').join('')+'</optgroup>':'';
  $('sbBy').innerHTML='<option value="'+ALL_B+'"'+(cur===ALL_B?' selected':'')+'>All</option>'+grp('PL – Classes 6 to 11',PL_NAMES)+grp('PM – Classes 1 to 5',PM_NAMES)+grp('Front Office',FO_NAMES)+grp('Managers',S.managers.map(m=>m+' (Manager)'));}
function fillStaffSelects(){
  const opts=(cur)=>'<option'+(cur===ALL_V?' selected':'')+'>'+ALL_V+'</option><optgroup label="Vehicle duty staff">'+STAFF.map(s=>'<option'+(s===cur?' selected':'')+'>'+esc(s)+'</option>').join('')+'</optgroup>'+
    (S.managers.length?'<optgroup label="Managers – all vehicles">'+S.managers.map(s=>'<option'+(s===cur?' selected':'')+'>'+esc(s)+'</option>').join('')+'</optgroup>':'');
  $('dutyStaff').innerHTML=opts(LS.get('staff',STAFF[0]));
  $('depStaff').innerHTML=opts(LS.get('depStaff',LS.get('staff',STAFF[0])));
  const g=LS.get('gateBy',FO_NAMES[0]);
  $('gateBy').innerHTML='<optgroup label="Front Office">'+FO_NAMES.map(s=>'<option'+(s===g?' selected':'')+'>'+esc(s)+'</option>').join('')+'</optgroup>'+
    (S.managers.length?'<optgroup label="Managers">'+S.managers.map(s=>'<option'+(s+' (Manager)'===g?' selected':'')+' value="'+esc(s)+' (Manager)">'+esc(s)+'</option>').join('')+'</optgroup>':'');
}

/* ---------- per-kid computation ---------- */
function sbOf(id){const fo=((S.gate[id]||{}).out||{}).type;if(fo==='SB')return true;if(fo==='VEH'||fo==='EARLY'||fo==='GOWALK'||fo==='HOME')return false;const c=KID[id].cls;const day=S.sb[seg(c)];const ov=day&&day.kids?day.kids[id]:undefined;return ov===undefined?!!S.sbReg[id]:!!ov}
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
  ['duty','late','sb','dep','dash','school','alloc'].forEach(x=>$('v-'+x).classList.toggle('hide',x!==v));
render()}

function render(){
  if(S.view==='duty')renderDuty();
  if(S.view==='sb')renderSB();
  if(S.view==='late')renderLate();
  if(S.view==='dash')renderDash();
  if(S.view==='school')renderSchool();
  if(S.view==='dep')renderDep();
  if(S.view==='alloc')renderAlloc();
  if(modalVeh)renderModal();
  if(gatePick)renderFO();
}

/* DUTY */
function renderDuty(){
  const who=$('dutyStaff').value;
  const mine=vehOf(who);
  $('dutyHint').textContent=isMgr(who)?(who===ALL_V?'All ':'Manager – all ')+mine.length+' vehicles':mine.length?mine.map(v=>v.l).join(', '):'No vehicles allocated';
  if(S.openVeh&&!isMgr(who)&&staffOf(S.openVeh)!==who)S.openVeh=null;
  if(S.openVeh){$('dutyList').classList.add('hide');$('dutyVeh').classList.remove('hide');renderDutyVeh();return}
  $('dutyList').classList.remove('hide');$('dutyVeh').classList.add('hide');
  $('dutyList').innerHTML='<div class="secthead"><i></i><span>'+(isMgr(who)?'All Vehicles':'Assigned Vehicles')+'</span><small>Tap a vehicle to mark attendance</small></div><div class="grid">'+mine.map(v=>{const s=vehStats(v);const marked=s.roll-s.un;
    const pill=s.submitted?'<span class="pill done">Submitted '+esc(s.time)+'</span>':marked?'<span class="pill part">'+marked+'/'+s.roll+' marked</span>':'<span class="pill pend">Pending</span>';
    return '<button class="vcard" data-open="'+v.k+'"><b>'+esc(v.l)+'</b>'+(isMgr(who)?'<div class="st">'+esc(staffOf(v.k))+'</div>':'')+(foCountVeh(v)?'<div class="st" style="color:var(--mag);font-weight:600">Front Office updates: '+foCountVeh(v)+'</div>':'')+'<div class="st">'+s.roll+' students · Present '+s.bus+' · Abs '+s.abs+'</div><div style="margin-top:6px">'+pill+'</div></button>'}).join('')+'</div>';
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
  $('dutyVeh').innerHTML='<div class="row" style="justify-content:space-between"><button class="btn ghost sm" id="backV">← Back</button><b style="font-size:17px">'+esc(v.l)+'</b><span class="muted">'+esc(staffOf(v.k))+'</span></div>'+
   '<div class="counts"><div><b>'+v.kids.length+'</b>Total</div><div><b style="color:var(--p)">'+c.P+'</b>Present</div><div><b style="color:var(--a)">'+c.A+'</b>Absent</div><div><b style="color:var(--un)">'+c.U+'</b>Pending</div>'+(vd.submitted?'<div><b style="font-size:14px">'+esc(vd.time)+'</b>Submitted by '+esc(vd.by)+'</div>':'')+'</div>'+
   (foCountVeh(v)?'<div class="banner" style="background:var(--brand2);color:var(--brand)"><b>Front Office updates ('+foCountVeh(v)+')</b> – late arrivals / early pickups for this vehicle are shown under each child. Front Office marks override this list.</div>':'')+
   mchkHtml()+
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
function renderFO(){
  if(!gatePick){return}
  const k=KID[gatePick];const st=kidStatus(k.id);const g=S.gate[k.id]||{};
  $('modalRoot').innerHTML='<div class="modal" id="fobg"><div class="card"><button class="x" id="gx">×</button><h2>'+esc(k.name)+'</h2><div class="muted">'+esc(k.cls)+' · '+esc(modeLabel(k))+'</div>'+
    '<div class="muted" style="margin-top:6px">Now: <span class="tag t-'+st.IN+'">IN: '+esc(LBL[st.IN]||st.IN)+'</span> <span class="tag t-'+(st.OUT||'U')+'">OUT: '+esc(st.OUT?LBL[st.OUT]:'—')+'</span>'+(k.walk?'':' · Vehicle duty: '+esc(LBL[st.m||'U']))+(S.sbReg[k.id]?' · Regular SB':'')+'</div>'+
    '<h3>IN – Arrival</h3><div class="row" style="margin-bottom:8px"><label class="f" style="margin:0">IN time</label><input type="time" id="gInT" value="'+esc(fv('inT',to24(g.in&&g.in.time)||nowHM()))+'"><span class="muted">Late after '+hm12(S.lateAfter)+'</span></div><div class="opts">'+
      opt('in','PRES','Present – on time','Arrived before '+hm12(S.lateAfter),g)+opt('in','LATE','Late Arrival','Arrived after '+hm12(S.lateAfter),g)+opt('in','ABS','Absent','Not in school today',g)+'</div>'+
    '<h3>OUT – Departure</h3><div class="row" style="margin-bottom:8px"><label class="f" style="margin:0">OUT time</label><input type="time" id="gOutT" value="'+esc(fv('outT',to24(g.out&&g.out.time)||nowHM()))+'"><span class="muted">used for Leaving Early</span></div><div class="opts">'+
      opt('out','EARLY','Leaving Early','Leaves before dispersal (time above)',g)+
      (k.walk?opt('out','HOME',modeOf(k),'Regular mode of going home',g):opt('out','VEH','By '+(VBY[k.v].t==='Auto'?'':VBY[k.v].t==='Van'||k.v==='VI'?'School ':'School ')+VBY[k.v].l,'Regular mode of transport',g)+opt('out','GOWALK','Parent Pick-up','Parent collects the student today',g))+
      opt('out','SB','Stayback','Staying after school today',g)+'</div>'+
    (k.walk?'<div class="row" style="margin-top:10px"><span class="muted">Entry-Exit Mode: <b>'+modeOf(k)+'</b></span><button class="btn ghost sm" data-pvan="'+k.id+'">'+(S.privVan[k.id]?'Change to By Walk':'Change to Private Van')+'</button></div>':'')+
    (k.walk?'':'<div class="row" style="margin-top:10px"><span class="muted">'+(S.walkReg[k.id]?'Special list – arrives by vehicle, parent pick-up daily':'Not on the special list')+'</span><button class="btn ghost sm" data-wreg="'+k.id+'">'+(S.walkReg[k.id]?'Remove from Special List':'Add to Special List')+'</button></div>')+
    '<div class="row" style="margin-top:10px"><input type="text" id="gRem" placeholder="Remark (optional)" value="'+esc(gDraft&&gDraft.rem!==undefined?gDraft.rem:(g.rem||''))+'" style="flex:1"><button class="btn" id="gSave">Save</button></div>'+
    '<p class="muted" style="margin:8px 0 0">Saving as: <b>'+esc(foBy||$('gateBy').value)+'</b>'+(g.by?' · last marked by '+esc(g.by):'')+'</p></div></div>';
}
let gDraft=null;let foBy=null;
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
function selClasses(){return (S.sbClasses&&S.sbClasses.length)?S.sbClasses:[]}
function renderChips(){
  const sel=selClasses();const g=S.sbGrade||'';
  const secs=g?CLASSES.filter(c=>c.split(' - ')[0]===g):[];
  $('sbChips').innerHTML='<div class="row"><div><label class="f">Class</label><select id="sbGrade" style="min-width:160px"><option value="">Select class…</option>'+GRADES.map(x=>'<option'+(x===g?' selected':'')+'>'+esc(x)+'</option>').join('')+'</select></div>'+
    (g?'<div><label class="f">Sections</label><div class="row" style="gap:6px">'+secs.map(c=>'<label class="seck"><input type="checkbox" data-sec="'+esc(c)+'"'+(sel.includes(c)?' checked':'')+'> '+esc(c.split(' - ')[1]||'All')+'</label>').join('')+'</div></div>':'')+'</div>';
}
function setClasses(arr){S.sbClasses=arr;LS.set('sbClasses',arr);render()}
function setGrade(g){S.sbGrade=g;LS.set('sbGrade',g);setClasses(g?CLASSES.filter(c=>c.split(' - ')[0]===g):[])}
const SBL={true:'Staying',false:'Not Staying',D:'Doubt'};
function sbDraftOf(id){const d=(S.sbDraft||{})[seg(KID[id].cls)]||{};return id in d?d[id]:undefined}
function stayRow(k,mode){if(mode!=='reg'){const dv=sbDraftOf(k.id),v=dv===undefined?sbState(k.id):dv;const st=k.walk?null:kidStatus(k.id);const g=S.gate[k.id]||{};
    const fo=g.out&&g.out.type==='SB'?' <span class="tag t-LATE">Front Office</span>':'';
    return '<div class="kid'+(dv!==undefined?' drf':'')+'"><div class="nm"><div>'+esc(k.name)+(!S.sbReg[k.id]?' <span class="tag t-LATE">Today only</span>':'')+fo+'</div><span>'+sbTag(k)+(st?' · <span class="tag t-'+st.IN+'">'+LBL[st.IN]+'</span>':'')+(dv!==undefined?' · <b style="color:var(--late)">not saved</b>':'')+'</span></div><button class="tg '+(v==='D'?'SBD':v?'SB':'noSB')+'" data-sb="'+k.id+'">'+SBL[v]+'</button></div>'}
  const on=!!S.sbReg[k.id];const st=k.walk?null:kidStatus(k.id);const g=S.gate[k.id]||{};
  const fo=g.out&&g.out.type==='SB'?' <span class="tag t-LATE">Front Office</span>':'';
  return '<div class="kid"><div class="nm"><div>'+esc(k.name)+(mode!=='reg'&&!S.sbReg[k.id]?' <span class="tag t-LATE">Today only</span>':'')+fo+'</div><span>'+sbTag(k)+(st?' · <span class="tag t-'+st.IN+'">'+LBL[st.IN]+'</span>':'')+'</span></div><button class="tg '+(on?'SB':'noSB')+'" '+(mode==='reg'?'data-sbreg':'data-sb')+'="'+k.id+'">'+(mode==='reg'?(on?'Regular SB':'—'):(on?'Staying':'Not Staying'))+'</button></div>'}
function renderSB(){
  renderChips();
  const cls=selClasses();const mode=$('sbMode').value;
  if(!cls.length){$('sbHint').textContent='Select a class, then tick the sections.';$('sbList').innerHTML='<p class="muted">Select a class to see Stayback, Early Leavers and Late Comers together.</p>';renderSBSum(cls);return}
  $('sbHint').textContent=mode==='reg'?'Editing the regular stayback list (applies to all dates). Tap to add or remove.':'Stayback for '+fmtD(S.date)+' – tap to switch Staying / Not Staying. Early Leavers and Late Comers are updated by Front Office.';
  const inC=k=>cls.includes(k.cls);
  // 1. Stayback
  const day=k=>((S.sb[seg(k.cls)]||{}).kids||{})[k.id];
  const sbList=Object.values(KID).filter(k=>inC(k)&&(mode==='reg'?true:(S.sbReg[k.id]||day(k)!==undefined||sbDraftOf(k.id)!==undefined||((S.gate[k.id]||{}).out||{}).type==='SB')));
  const eff=k=>{const dv=sbDraftOf(k.id);return dv===undefined?sbState(k.id):dv};
  const staying=sbList.filter(k=>mode==='reg'?S.sbReg[k.id]:eff(k)===true);const doubts=mode==='reg'?[]:sbList.filter(k=>eff(k)==='D');
  let h1='<div class="secthead"><i></i><span>1. Stayback Details</span><small>'+staying.length+(mode==='reg'?' on regular list':' staying · '+staying.filter(k=>!k.walk).length+' transport, '+staying.filter(k=>k.walk).length+' walkers'+(doubts.length?' · '+doubts.length+' doubt':''))+'</small></div>'+(mode==='reg'?'':'<p class="muted" style="margin:0 0 6px">Tap a student to change: Staying → Not Staying → Doubt. Then press <b>Save</b> once for the class. Doubt cases are kept off the vehicle until Front Office confirms with the parent.</p>');
  cls.forEach(c=>{const ks=sbList.filter(k=>k.cls===c).sort((a,b)=>a.name.localeCompare(b.name));if(!ks.length&&mode!=='reg')return;
    const dn=Object.keys((S.sbDraft||{})[seg(c)]||{}).length;
    h1+='<h3 style="color:var(--brand)">'+esc(c)+' · '+ks.filter(k=>mode==='reg'?S.sbReg[k.id]:eff(k)===true).length+'</h3>'+ks.map(k=>stayRow(k,mode)).join('')+
      (mode!=='reg'&&dn?'<div class="row" style="margin:8px 0 14px;gap:8px"><button class="btn" data-sbsave="'+esc(seg(c))+'" style="flex:1">Save '+esc(c)+' ('+dn+' change'+(dn>1?'s':'')+')</button><button class="btn ghost" data-sbcancel="'+esc(seg(c))+'">Cancel</button></div>':'')});
  if(mode!=='reg'){const others=Object.values(KID).filter(k=>inC(k)&&!sbList.includes(k)).sort((a,b)=>CLASSES.indexOf(a.cls)-CLASSES.indexOf(b.cls)||a.name.localeCompare(b.name));
    const opts=arr=>arr.map(k=>'<option value="'+k.id+'">'+esc(k.cls)+' – '+esc(k.name)+' ('+esc(modeLabel(k))+')</option>').join('');
    h1+='<div class="row" style="margin-top:10px"><select id="sbAdd" style="flex:1"><option value="">Add a student staying today only…</option>'+opts(others)+'</select></div>'+
      '<div class="row" style="margin-top:8px"><select id="sbAddReg" style="flex:1"><option value="">Add a student joining stayback (regular list)…</option>'+opts(Object.values(KID).filter(k=>inC(k)&&!S.sbReg[k.id]).sort((a,b)=>CLASSES.indexOf(a.cls)-CLASSES.indexOf(b.cls)||a.name.localeCompare(b.name)))+'</select></div>';}
  if(!sbList.length&&mode!=='reg')h1+='<p class="muted">No stayback students in the selected classes.</p>';
  // 2 & 3
  const lst=(type)=>{const rows=Object.values(KID).filter(k=>inC(k)).map(k=>({k,g:S.gate[k.id]||{}})).filter(r=>type==='EARLY'?(r.g.out&&r.g.out.type==='EARLY'):(r.g.in&&r.g.in.type==='LATE')).sort((a,b)=>CLASSES.indexOf(a.k.cls)-CLASSES.indexOf(b.k.cls)||a.k.name.localeCompare(b.k.name));
    return {rows,html:rows.length?rows.map(r=>{const k=r.k,g=r.g,op=outPlan(k,g);return '<div class="kid" data-pick="'+k.id+'" data-foby="sb" style="cursor:pointer"><div class="nm"><div>'+esc(k.name)+'</div><span>'+esc(k.cls)+' · '+esc(modeLabel(k))+(g.rem?' · '+esc(g.rem):'')+(g.by?' ('+esc(g.by.replace(' (Front Office)',''))+')':'')+'</span></div><div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">'+(type==='EARLY'?'<span class="tag t-EARLY">Leaving '+esc(g.out.time||'')+'</span>':'<span class="tag t-LATE">IN '+esc(g.in.time||'')+'</span><span class="tag t-'+op.c+'">'+esc(op.t)+'</span>')+'</div></div>'}).join(''):'<p class="muted">None today.</p>'}};
  const E=lst('EARLY'),L=lst('LATE');
  const addSel=(type,lbl)=>'<div class="row" style="margin-top:10px"><select data-addfo="'+type+'" style="flex:1"><option value="">'+lbl+'</option>'+Object.values(KID).filter(k=>inC(k)).sort((a,b)=>CLASSES.indexOf(a.cls)-CLASSES.indexOf(b.cls)||a.name.localeCompare(b.name)).map(k=>'<option value="'+k.id+'">'+esc(k.cls)+' – '+esc(k.name)+'</option>').join('')+'</select></div>';
  $('sbList').innerHTML='<div class="sbcols"><div class="sbcol">'+h1+'</div><div class="sbcol"><div class="secthead"><i></i><span>2. Early Leavers</span><small>'+E.rows.length+'</small></div>'+E.html+addSel('EARLY','Add Early Leaver…')+'</div><div class="sbcol"><div class="secthead"><i></i><span>3. Late Comers</span><small>'+L.rows.length+'</small></div>'+L.html+addSel('LATE','Add Late Comer…')+'</div></div>';
  renderSBSum(cls);
}
function renderSBSum(cls){
  const list=cls&&cls.length?cls:CLASSES;
  const rows=list.map(cl=>{const ks=Object.values(KID).filter(k=>k.cls===cl);const st=ks.filter(k=>sbOf(k.id)&&kidStatus(k.id).OUT==='SB');const e=ks.filter(k=>kidStatus(k.id).OUT==='EARLY').length;const l=ks.filter(k=>(S.gate[k.id]||{}).in&&S.gate[k.id].in.type==='LATE').length;const d=S.sb[seg(cl)];
    return st.length||e||l?'<tr><td class="l"><b>'+esc(cl)+'</b></td><td><b>'+st.length+'</b></td><td>'+st.filter(k=>!k.walk).length+'</td><td>'+st.filter(k=>k.walk).length+'</td><td>'+(e||'')+'</td><td>'+(l||'')+'</td><td class="l" style="white-space:normal;min-width:220px">'+st.map(k=>esc(k.name)).join(', ')+'</td><td>'+(d?esc(d.by||'')+' '+esc(d.time||''):'<span class="muted">regular list</span>')+'</td></tr>':''}).join('');
  $('sbSumH').textContent='Class-wise Summary – Stayback, Early Leavers, Late Comers';
  $('sbSum').innerHTML=rows?'<div class="tw" style="max-height:none"><table><tr><th>Class</th><th>Stayback</th><th>Transport</th><th>Walkers</th><th>Early</th><th>Late</th><th>Stayback names</th><th>Marked by</th></tr>'+rows+'</table></div>':'<span class="muted">Nothing to show.</span>';
}

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
  ids.forEach(id=>{const val=dr[id];if(val===!!S.sbReg[id])delete kids[id];else kids[id]=val});
  await store.set('att/'+S.date+'/sb/'+sg,{cls:c,kids,by:by||selBy($('sbBy').value)||'PL',time:nowT(),ts:Date.now()});delete S.sbDraft[sg];toast(c+' stayback saved')}
async function setDaySB(id,val,by){const c=KID[id].cls;const p='att/'+S.date+'/sb/'+seg(c);const cur=S.sb[seg(c)]||{};const kids=Object.assign({},cur.kids||{});
  if(val===!!S.sbReg[id])delete kids[id];else kids[id]=val;
  await store.set(p,{cls:c,kids,by:by||selBy($('sbBy').value)||'PL',time:nowT(),ts:Date.now()});}

/* DASHBOARD */
function renderDash(){
  const f=$('dashF').value, sf=$('dashS').value;
  const sel=$('dashS');const cur=sel.value;const staffs=[...new Set(VEH.map(v=>staffOf(v.k)))];
  sel.innerHTML='<option value="">All staff</option>'+staffs.map(s=>'<option'+(s===cur?' selected':'')+'>'+esc(s)+'</option>').join('');
  const list=VEH.filter(v=>(!f||v.t===f)&&(!sf||staffOf(v.k)===sf));
  const dv=$('dashV').value;$('copyRep').classList.toggle('hide',!!dv);$('dashExtra').classList.toggle('hide',!dv);$('dashT').parentElement.classList.remove('hide');$('dashNote').classList.remove('hide');$('dashF').classList.remove('hide');$('dashS').classList.remove('hide');
  if(dv==='rec'){renderDashRecords();return}
  if(dv==='latem'){renderLateMonthly();return}
  if(dv==='vehw'){renderVehWise(list);return}
  if(dv==='arr'){renderDashArr(list);return}
  if(dv==='dep'){renderDashDep(list);return}
  if(dv==='derr'){renderDashDerr(list);S.lastDerr=list;return}
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
  let t='*FIS Student Entry Exit Report – '+d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})+'*\n';
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
  return '<div class="card" style="margin:12px 0 0;border:1px solid var(--line)"><h2>Departure Checks</h2>'+chk('driver','Driver uniform')+chk('conductor','Conductor uniform')+
    '<h3>Report an Error</h3><div class="row"><select id="derrType" style="min-width:200px">'+DERR_TYPES.map(t=>'<option>'+esc(t)+'</option>').join('')+'</select>'+
    '<select id="derrKid" style="min-width:180px"><option value="">Child (optional)</option>'+v.kids.map(k=>'<option value="'+v.k+'-'+k[0]+'">'+k[0]+'. '+esc(k[1])+'</option>').join('')+'</select></div>'+
    '<div class="row" style="margin-top:8px"><input type="text" id="derrRem" placeholder="What happened? (remark)" style="flex:1"><button class="btn" id="derrAdd">Add Error</button></div>'+
    (items.length?'<div style="margin-top:10px">'+items.map((it,i)=>'<div class="kid"><div class="nm"><div><span class="tag t-A">'+esc(it.type)+'</span> '+(it.kid&&KID[it.kid]?esc(KID[it.kid].name):'')+'</div><span>'+esc(it.time||'')+' · '+esc(it.by||'')+(it.rem?' · '+esc(it.rem):'')+'</span></div><button class="btn ghost sm" data-derrdel="'+i+'">Remove</button></div>').join('')+'</div>':'<p class="muted" style="margin:8px 0 0">No errors reported.</p>')+'</div>';
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
function withDate(dd,fn){const keep={veh:S.veh,gate:S.gate,sb:S.sb,out:S.out,derr:S.derr};Object.assign(S,dd);try{return fn()}finally{Object.assign(S,keep)}}
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
  $('dashExtra').innerHTML=derrBlock(list);
}
function derrList(list){const errs=[];list.forEach(v=>((S.derr[v.k]||{}).items||[]).forEach(it=>errs.push([v,it])));return errs}
function derrBlock(list){const errs=derrList(list);
  return '<div class="row" style="justify-content:space-between;margin-bottom:8px"><h2 style="margin:0">Departure errors – '+fmtD(S.date)+'</h2>'+(errs.length?'<button class="btn ghost sm" id="derrCopy">Copy Errors (WhatsApp)</button>':'')+'</div>'+(errs.length?'<div class="tw" style="max-height:none"><table><tr><th>Vehicle</th><th>Error</th><th>Child</th><th>Remark</th><th>By / time</th></tr>'+errs.map(([v,it])=>'<tr><td><b>'+esc(v.l)+'</b></td><td><span class="tag t-A">'+esc(it.type)+'</span></td><td class="l">'+(it.kid&&KID[it.kid]?esc(KID[it.kid].name)+' <span class="muted">'+esc(KID[it.kid].cls)+'</span>':'')+'</td><td class="l">'+esc(it.rem||'')+'</td><td>'+esc(it.by||'')+' '+esc(it.time||'')+'</td></tr>').join('')+'</table></div>':'<p class="muted">No departure errors.</p>');}
function derrText(list){const errs=derrList(list);const d=new Date(S.date+'T00:00');
  let t='*FIS Departure Errors – '+d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})+'*\n';
  if(!errs.length)return t+'\nNo departure errors reported.';
  let cur='';errs.forEach(([v,it])=>{if(v.k!==cur){cur=v.k;t+='\n*'+v.l+'* ('+staffOf(v.k)+')\n'}
    const kid=it.kid&&KID[it.kid]?KID[it.kid].name+' ('+KID[it.kid].cls+') – ':'';
    t+='• '+it.type+' – '+kid+(it.rem?it.rem+' – ':'')+(it.by||'').replace(/ \((Front Office|Gate|Manager|All Vehicles)\)/,'')+' '+(it.time||'')+'\n'});
  return t+'\nTotal errors: '+errs.length}
function renderDashDerr(list){
  const errs=derrList(list);$('dashT').parentElement.classList.add('hide');
  $('kpis').innerHTML=[['Departure errors',errs.length,'var(--a)'],['Vehicles with errors',new Set(errs.map(e=>e[0].k)).size]].map(k=>'<div class="kpi"><span>'+k[0]+'</span><b style="color:'+(k[2]||'var(--ink)')+'">'+k[1]+'</b></div>').join('');
  $('dashExtra').innerHTML=derrBlock(list);

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
const REC_SEGS=[['LATE','Late Comers'],['EARLY','Early Leavers'],['SB','Stayback'],['MISSSB','Missed Stayback / Academy'],['MISS','Missed Bus'],['PARENT','Going with Parent']];
const RG={key:'',data:{},loading:false};
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
  await Promise.all(dates.map(async d=>{data[d]={};for(const c of ['veh','gate','sb']){data[d][c]=await store.getCol('att/'+d+'/'+c)}}));
  RG.data=data;RG.loading=false;if(S.view==='dash')renderDash();}
function dayEvents(date){const ev=[];
  Object.values(KID).forEach(k=>{const id=k.id;const st=kidStatus(id);const g=st.g||{};
    if(g.in&&g.in.type==='LATE')ev.push({date,id,seg:'LATE',time:g.in.time,rem:g.rem,by:g.by,extra:outPlan(k,g).t});
    if(st.OUT==='EARLY')ev.push({date,id,seg:'EARLY',time:g.out&&g.out.time,rem:g.rem,by:g.by});
    if(st.OUT==='SB')ev.push({date,id,seg:'SB',rem:g.out&&g.out.type==='SB'?g.rem:'',by:g.out&&g.out.type==='SB'?g.by:(S.sbReg[id]?'Regular SB':'PL')});
    if(S.sbReg[id]&&st.present&&st.OUT!=='SB'){const why={EARLY:'Left early',GOWALK:'Went with parent / by walk',VEH:'Went by regular transport',HOME:'Went home'}[st.OUT]||'Not kept in stayback';
      const fo=g.out&&g.out.type&&g.out.type!=='SB';ev.push({date,id,seg:'MISSSB',time:fo?g.out.time:'',extra:why,rem:fo?g.rem:'',by:fo?g.by:'PL (day list)'});}
    if(!k.walk){const m=((S.veh[k.v]||{}).marks||{})[k.n];if(m==='A'&&st.present)ev.push({date,id,seg:'MISS',time:g.in&&g.in.time,rem:g.rem,by:g.by,extra:outPlan(k,g).t});}
    if(!k.walk&&st.OUT==='GOWALK')ev.push({date,id,seg:'PARENT',time:g.out&&g.out.time,rem:g.rem,by:g.out&&g.out.type==='GOWALK'?g.by:'Special by-walk list'});
  });return ev;}
function collectEvents(dates){
  if(dates.length===1&&dates[0]===S.date)return (Object.keys(S.veh).length||Object.keys(S.gate).length)?dayEvents(S.date):[];
  const ev=[];dates.forEach(d=>{const dd=RG.data[d];if(!dd||!(Object.keys(dd.veh||{}).length||Object.keys(dd.gate||{}).length))return;withDate(Object.assign({out:{},derr:{}},dd),()=>{ev.push(...dayEvents(d))})});return ev;}
function renderDashRecords(){
  const per=S.recPer||'day',sg=S.recSeg||'LATE',cls=S.recCls||'';
  const dates=periodDates(per);
  $('dashT').parentElement.classList.add('hide');$('dashNote').classList.add('hide');$('dashF').classList.add('hide');$('dashS').classList.add('hide');$('kpis').innerHTML='';
  if(!(dates.length===1&&dates[0]===S.date)){loadRange(dates);if(RG.loading||!dates.every(d=>RG.data[d])){$('dashExtra').innerHTML=recControls(per,sg,cls,{})+'<p class="muted">Loading '+dates.length+' days…</p>';return}}
  const all=collectEvents(dates).filter(e=>!cls||KID[e.id].cls===cls||KID[e.id].cls.split(' - ')[0]===cls);
  const cnt={};REC_SEGS.forEach(s=>cnt[s[0]]=all.filter(e=>e.seg===s[0]).length);
  const rep2=per!=='day'&&S.recRep;
  let ev=all.filter(e=>e.seg===sg);
  const byKid={};ev.forEach(e=>{(byKid[e.id]=byKid[e.id]||[]).push(e)});
  if(rep2){Object.keys(byKid).forEach(id=>{if(byKid[id].length<2)delete byKid[id]});ev=ev.filter(e=>byKid[e.id]);}
  const byCls={};Object.keys(byKid).forEach(id=>{(byCls[KID[id].cls]=byCls[KID[id].cls]||[]).push(id)});
  const clsList=CLASSES.filter(c=>byCls[c]);
  const label=REC_SEGS.find(s=>s[0]===sg)[1];
  const range=dates.length===1?fmtD(dates[0]):fmtD(dates[0])+' – '+fmtD(dates[dates.length-1]);
  let h=recControls(per,sg,cls,cnt)+
    '<div class="kpis" style="margin-top:12px"><div class="kpi"><span>'+esc(label)+' – '+esc(range)+'</span><b>'+ev.length+'</b></div><div class="kpi"><span>Students</span><b>'+Object.keys(byKid).length+'</b></div>'+(per!=='day'?'<div class="kpi"><span>School days with data</span><b>'+dates.filter(d=>{const dd=RG.data[d];return dd&&(Object.keys(dd.veh||{}).length||Object.keys(dd.gate||{}).length)}).length+' / '+dates.length+'</b></div>':'')+'</div>';
  // class-wise counts
  h+='<h3>Class-wise numbers</h3>'+(clsList.length?'<div class="tw" style="max-height:none"><table><tr><th>Class</th><th>Students</th>'+(per!=='day'?'<th>Times</th>':'')+'<th>Names</th></tr>'+clsList.map(c=>{const ids=byCls[c];const times=ids.reduce((a,id)=>a+byKid[id].length,0);
      return '<tr><td class="l"><b>'+esc(c)+'</b></td><td><b>'+ids.length+'</b></td>'+(per!=='day'?'<td>'+times+'</td>':'')+'<td class="l" style="white-space:normal">'+ids.map(id=>esc(KID[id].name)+(byKid[id].length>1?' ('+byKid[id].length+')':'')).join(', ')+'</td></tr>'}).join('')+
      '<tr class="tot"><td>Total</td><td>'+Object.keys(byKid).length+'</td>'+(per!=='day'?'<td>'+ev.length+'</td>':'')+'<td></td></tr></table></div>':'<p class="muted">No '+esc(label.toLowerCase())+' in this period.</p>');
  // datewise grid
  if(per!=='day'&&clsList.length){const ds=dates.filter(d=>{const dd=RG.data[d];return dd&&(Object.keys(dd.veh||{}).length||Object.keys(dd.gate||{}).length)});
    const wd=d=>['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(d+'T00:00').getDay()]+' '+d.slice(8);
    h+='<h3>Date-wise chart (class-wise)</h3><div class="tw"><table class="grid"><tr><th class="l">Class</th><th class="l">Student</th>'+ds.map(d=>'<th>'+wd(d)+'</th>').join('')+'<th>Total</th></tr>'+
      clsList.map(c=>byCls[c].slice().sort((a,b)=>byKid[b].length-byKid[a].length||KID[a].name.localeCompare(KID[b].name)).map((id,i)=>{const m={};byKid[id].forEach(e=>m[e.date]=e);
        return '<tr><td class="l">'+(i?'':'<b>'+esc(c)+'</b>')+'</td><td class="l">'+esc(KID[id].name)+'</td>'+ds.map(d=>{const e=m[d];return '<td>'+(e?'<span class="tag t-'+(sg==='MISS'?'A':sg==='PARENT'?'GOWALK':sg==='MISSSB'?'A':sg)+'">'+esc(e.time||'✓')+'</span>':'')+'</td>'}).join('')+'<td><b>'+byKid[id].length+'</b></td></tr>'}).join('')).join('')+
      '<tr class="tot"><td>Total</td><td></td>'+ds.map(d=>'<td>'+ev.filter(e=>e.date===d).length+'</td>').join('')+'<td>'+ev.length+'</td></tr></table></div>';}
  // name-wise detail
  if(clsList.length){
    h+='<h3>Name-wise record'+(per!=='day'?' (most frequent first)':'')+'</h3>'+clsList.map(c=>'<h3 style="color:var(--brand)">'+esc(c)+'</h3>'+byCls[c].sort((a,b)=>byKid[b].length-byKid[a].length||KID[a].name.localeCompare(KID[b].name)).map(id=>{const k=KID[id];const es=byKid[id];
      return '<div class="kid"><div class="nm"><div>'+esc(k.name)+' <span class="muted" style="font-weight:400">· '+esc(modeLabel(k))+'</span></div><span>'+es.map(e=>(per!=='day'?'<b>'+fmtD(e.date)+'</b> ':'')+(e.time?esc(e.time)+' ':'')+(e.extra?'→ '+esc(e.extra)+' ':'')+(e.rem?'· '+esc(e.rem)+' ':'')+(e.by?'<span class="muted">('+esc(String(e.by).replace(' (Front Office)',''))+')</span>':'')).join('<br>')+'</span></div>'+(per!=='day'?'<span class="tag t-'+(sg==='MISS'?'A':sg==='PARENT'?'GOWALK':sg)+'">'+es.length+'×</span>':'')+'</div>'}).join('')).join('');
  }
  h+='<div class="row" style="margin-top:12px"><button class="btn ghost sm" id="recCopy">Copy List (WhatsApp)</button>'+(per!=='day'?'<button class="btn ghost sm" id="recRefresh">Refresh</button>':'')+'</div>';
  $('dashExtra').innerHTML=h;
  S.recLast={label,range,clsList,byCls,byKid,per};
}
function recControls(per,sg,cls,cnt){
  return '<div class="row" style="justify-content:space-between"><h2 style="margin:0">Student Records</h2><div class="row">'+
    [['day','Daily'],['week','Weekly'],['month','Monthly']].map(p=>'<button class="btn '+(per===p[0]?'':'ghost')+' sm" data-recper="'+p[0]+'">'+p[1]+'</button>').join('')+'</div></div>'+
    '<div class="row" style="margin-top:10px">'+REC_SEGS.map(s=>'<button class="btn '+(sg===s[0]?'':'ghost')+' sm" data-recseg="'+s[0]+'">'+s[1]+(cnt[s[0]]!==undefined?' ('+cnt[s[0]]+')':'')+'</button>').join('')+'</div>'+
    '<div class="row" style="margin-top:10px"><select id="recCls"><option value="">All classes</option>'+GRADES.map(g=>'<optgroup label="'+esc(g)+'"><option value="'+esc(g)+'"'+(cls===g?' selected':'')+'>'+esc(g)+' – all sections</option>'+CLASSES.filter(c=>c.split(' - ')[0]===g).map(c=>'<option'+(c===cls?' selected':'')+'>'+esc(c)+'</option>').join('')+'</optgroup>').join('')+'</select>'+(per!=='day'?'<label class="seck"><input type="checkbox" id="recRep"'+(S.recRep?' checked':'')+'> Repeat only (2+ times)</label>':'')+'<span class="muted">Date in the top bar sets the day / week / month.</span></div>';
}
function recText(){const r=S.recLast;if(!r)return '';let t='*FIS '+r.label+' – '+r.range+'*\n';
  r.clsList.forEach(c=>{t+='\n*'+c+'* ('+r.byCls[c].length+')\n';r.byCls[c].forEach(id=>{t+='• '+KID[id].name+(r.per!=='day'?' – '+r.byKid[id].length+'×':'')+(r.per==='day'&&r.byKid[id][0].time?' – '+r.byKid[id][0].time:'')+'\n'})});
  return t+'\nTotal students: '+Object.keys(r.byKid).length}

/* ARRIVAL TIME & UNIFORM REPORT */
const hmMin=hm=>{const x=to24(hm)||hm;if(!x||!/^\d{1,2}:\d{2}$/.test(x))return null;const [h,m]=x.split(':').map(Number);return h*60+m};
function uniOf(dd,vk){const v=(dd.veh||{})[vk]||{};const d=((dd.derr||{})[vk]||{}).checks||{};return {md:v.driverU,mc:v.condU,dd:d.driver,dc:d.conductor}}
function arrChart(list,vehDocs){
  const rows=list.map(v=>{const d=vehDocs[v.k]||{};return {v,m:hmMin(d.arr),arr:d.arr}}).filter(r=>r.m!==null).sort((a,b)=>a.m-b.m);
  if(!rows.length)return '<p class="muted">No arrival times recorded.</p>';
  const cut=hmMin(S.lateAfter)||465;const lo=Math.min(...rows.map(r=>r.m),cut)-10,hi=Math.max(...rows.map(r=>r.m),cut)+5;const pct=m=>((m-lo)/(hi-lo)*100).toFixed(1);
  const late=rows.filter(r=>r.m>cut).length;
  return '<div class="muted" style="margin-bottom:6px">Arrived after '+hm12(S.lateAfter)+': <b style="color:var(--a)">'+late+'</b> of '+rows.length+' · earliest '+hm12(rows[0].arr)+' · latest '+hm12(rows[rows.length-1].arr)+'</div>'+
    '<div class="achart">'+rows.map(r=>'<div class="arow"><span class="alab">'+esc(r.v.l)+'</span><div class="atrack"><div class="acut" style="left:'+pct(cut)+'%"></div><div class="abar '+(r.m>cut?'late':'')+'" style="width:'+pct(r.m)+'%"></div></div><span class="aval'+(r.m>cut?' late':'')+'">'+hm12(r.arr)+'</span></div>').join('')+
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
    list.map(v=>{let ld=0;const cut=hmMin(S.lateAfter);return '<tr><td><b>'+esc(v.l)+'</b></td>'+dates.map(d=>{const a=((WK.data[d].veh||{})[v.k]||{}).arr;const m=hmMin(a);if(m===null)return '<td class="muted">–</td>';const late=m>cut;if(late)ld++;return '<td style="'+(late?'color:var(--a);font-weight:700':'')+'">'+hm12(a)+'</td>'}).join('')+'<td style="color:var(--a)"><b>'+(ld||'')+'</b></td></tr>'}).join('')+'</table></div>';
  $('kpis').innerHTML=[['Vehicles not in uniform (day)',nu.length,'var(--a)'],['Non-uniform this week',tot.md+tot.mc+tot.dd+tot.dc,'var(--a)'],['Arrived after '+hm12(S.lateAfter)+' (day)',list.filter(v=>{const m=hmMin((S.veh[v.k]||{}).arr);return m!==null&&m>hmMin(S.lateAfter)}).length,'var(--late)']].map(k=>'<div class="kpi"><span>'+k[0]+'</span><b style="color:'+k[2]+'">'+k[1]+'</b></div>').join('');
  h+='<button class="btn ghost sm" id="wkRefresh" style="margin-top:10px">Refresh Week</button>';
  $('dashExtra').innerHTML=h;
}
function mchkHtml(){const c=mDraft||{};const row=(key,lbl)=>'<div class="row" style="margin:4px 0"><span style="min-width:150px;font-weight:600">'+lbl+'</span>'+['OK','NOT'].map(val=>'<button class="tg '+(c[key]===val?(val==='OK'?'P':'A'):'U')+'" data-mchk="'+key+':'+val+'">'+(val==='OK'?'In Uniform':'Not in Uniform')+'</button>').join(' ')+'</div>';
  return '<div class="card" style="margin:10px 0;border:1px solid var(--line)"><h2 style="margin-bottom:6px">Vehicle Staff Check</h2>'+row('driverU','Driver uniform')+row('condU','Conductor uniform')+'</div>'}
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
      return '<button class="vcard" data-depopen="'+v.k+'"><b>'+esc(v.l)+'</b>'+(isMgr(who)?'<div class="st">'+esc(staffOf(v.k))+'</div>':'')+'<div class="st">Going '+go+' of '+v.kids.length+'</div><div style="margin-top:6px">'+(od.submitted?'<span class="pill done">Departed '+esc(od.time)+'</span>':'<span class="pill pend">Boarded '+b+'/'+go+'</span>')+'</div></button>'}).join('')+'</div>';
    return}
  $('depList').classList.add('hide');$('depVeh').classList.remove('hide');
  const v=VBY[S.depVeh];const od=S.out[v.k]||{};if(!depDraft)depDraft=Object.assign({},od.marks||{});
  const rows=depRows(v);
  const go=rows.filter(r=>r.i.go),no=rows.filter(r=>!r.i.go);
  const c=t=>no.filter(r=>r.i.tag===t).length;const boarded=go.filter(r=>depDraft[r.k[0]]).length;
  const line=r=>'<div class="kid"><div class="n">'+(/^x/.test(r.k[0])?'+':r.k[0])+'</div><div class="nm"><div>'+esc(r.k[1])+'</div><span>'+esc(r.k[2])+'</span>'+(r.id?foLine(r.id):'')+'</div>'+
    (r.i.go?'<button class="tg '+(depDraft[r.k[0]]?'P':'U')+'" data-dtg="'+r.k[0]+'">'+(depDraft[r.k[0]]?'Boarded ✓':'Board')+'</button>':'<span class="tag t-'+r.i.tag+'" style="min-width:84px;text-align:center;padding:8px 6px">'+esc(r.i.txt)+'</span>')+'</div>';
  $('depVeh').innerHTML='<div class="row" style="justify-content:space-between"><button class="btn ghost sm" id="depBack">← Back</button><b style="font-size:17px">'+esc(v.l)+' – Departure</b><span class="muted">'+esc(staffOf(v.k))+'</span></div>'+
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
  const inT=st.IN==='W'?(pv?'Present (private van)':'Present (walk)'):LBL[st.IN]||st.IN;
  const outT=!st.present?'—':st.OUT==='VEH'?'Going in '+VBY[k.v].l:st.OUT==='HOME'?(pv?'Home by private van':'Home by walk'):LBL[st.OUT];
  return {k,st,inT,outT,time:[g.in&&g.in.time,g.out&&g.out.time].filter(Boolean).join(' / '),rem:g.rem||'',by:g.by||''}}
function schMatch(r,f){if(!f)return true;const s=r.st;
  return f==='ABS'?!s.present&&s.IN!=='U':f==='U'?s.IN==='U':f==='LATE'?(s.IN==='LATE'||s.IN==='WALKIN'):f==='EARLY'?s.OUT==='EARLY':f==='SB'?s.OUT==='SB':f==='GOWALK'?s.OUT==='GOWALK':f==='VEH'?s.OUT==='VEH':f==='FO'?s.fo:f==='SPW'?!!S.walkReg[r.k.id]:true}
function schoolRows(){const c=$('schCls').value,m=$('schMode').value,f=$('schSt').value,q=$('schQ').value.trim().toLowerCase();
  return Object.keys(KID).filter(id=>{const k=KID[id];return (!c||k.cls===c||k.cls.split(' - ')[0]===c)&&(!m||modeOf(k)===m)&&(!q||k.name.toLowerCase().includes(q))}).map(schRow).filter(r=>schMatch(r,f))}
function renderLate(){
  const cur=LS.get('lateBy',LATE_NAMES[0]);const grp=(l,a)=>a.length?'<optgroup label="'+l+'">'+a.map(s=>'<option'+(s===cur?' selected':'')+'>'+esc(s)+'</option>').join('')+'</optgroup>':'';
  if(document.activeElement!==$('lateBy'))$('lateBy').innerHTML='<option value="'+ALL_B+'"'+(cur===ALL_B?' selected':'')+'>All</option>'+grp('Late Comers – Gate',LATE_NAMES)+grp('Front Office',FO_NAMES)+grp('Managers',S.managers.map(m=>m+' (Manager)'));
  $('lateCut').textContent=hm12(S.lateAfter);
  const q=($('lateQ').value||'').trim().toLowerCase();
  $('lateRes').innerHTML=q.length<2?'':(()=>{const r=Object.values(KID).filter(k=>k.name.toLowerCase().includes(q)).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,25);
    return r.length?r.map(k=>{const st=kidStatus(k.id);return '<div class="kid" data-pick="'+k.id+'" data-foby="late" style="cursor:pointer"><div class="nm"><div>'+esc(k.name)+'</div><span>'+esc(k.cls)+' · '+esc(modeLabel(k))+'</span></div><span class="tag t-'+st.IN+'">'+esc(LBL[st.IN]||st.IN)+'</span></div>'}).join(''):'<p class="muted">No student found.</p>'})();
  const late=Object.values(KID).filter(k=>{const g=S.gate[k.id];return g&&g.in&&g.in.type==='LATE'}).map(k=>({k,g:S.gate[k.id]})).sort((a,b)=>(hmMin(to24(b.g.in.time))||0)-(hmMin(to24(a.g.in.time))||0));
  $('lateToday').innerHTML='<div class="secthead"><i></i><span>Late Comers – '+fmtD(S.date)+'</span><small>'+late.length+'</small></div>'+(late.length?late.map(({k,g})=>'<div class="kid" data-pick="'+k.id+'" data-foby="late" style="cursor:pointer"><div class="nm"><div>'+esc(k.name)+'</div><span>'+esc(k.cls)+' · '+esc(modeLabel(k))+(g.rem?' · '+esc(g.rem):'')+' · '+esc((g.by||'').replace(/ \((Front Office|Gate)\)/,''))+'</span></div><span class="tag t-LATE">'+esc(g.in.time)+'</span></div>').join(''):'<p class="muted">No late comers yet.</p>');
}
function renderSchool(){
  const dk=Object.values(KID).filter(k=>sbDoubt(k.id)).sort((a,b)=>CLASSES.indexOf(a.cls)-CLASSES.indexOf(b.cls)||a.name.localeCompare(b.name));
  $('schDoubt').classList.toggle('hide',!dk.length);
  $('schDoubt').innerHTML=dk.length?'<div class="secthead"><i></i><span>Stayback doubt cases – confirm with parent</span><small>'+dk.length+'</small></div>'+dk.map(k=>{const d=S.sb[seg(k.cls)]||{};
    return '<div class="kid"><div class="nm"><div>'+esc(k.name)+'</div><span>'+esc(k.cls)+' · '+esc(modeLabel(k))+(d.by?' · marked by '+esc(d.by)+' '+esc(d.time||''):'')+'</span></div><div style="display:flex;gap:6px"><button class="tg SB" data-dclr="'+k.id+'|1">Staying</button><button class="tg noSB" data-dclr="'+k.id+'|0">Not Staying</button></div></div>'}).join(''):'';
  const rows=schoolRows();const by={};rows.forEach(r=>(by[r.k.cls]=by[r.k.cls]||[]).push(r));
  const cls=CLASSES.filter(c=>by[c]);
  $('schList').innerHTML=cls.length?cls.map(c=>'<h3 style="color:var(--brand)">'+esc(c)+' · '+by[c].length+(by[c].length===1?' student':' students')+'</h3>'+
    by[c].sort((a,b)=>a.k.name.localeCompare(b.k.name)).map((r,i)=>{const it=r.st.IN==='A'&&r.st.g.in&&r.st.g.in.type==='ABS'?'ABS':r.st.IN;
      return '<div class="kid" data-pick="'+r.k.id+'" style="cursor:pointer"><div class="n">'+(i+1)+'</div><div class="nm"><div>'+esc(r.k.name)+(S.walkReg[r.k.id]?' <span class="tag t-GOWALK">Special</span>':'')+(r.st.fo?' <span class="tag t-LATE">FO</span>':'')+'</div><span>'+esc(modeLabel(r.k))+(r.time?' · '+esc(r.time):'')+(r.rem?' · '+esc(r.rem):'')+(r.by?' ('+esc(r.by.replace(' (Front Office)',''))+')':'')+'</span></div>'+
      '<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end"><span class="tag t-'+it+'">IN: '+esc(r.inT)+'</span>'+(r.st.OUT?'<span class="tag t-'+r.st.OUT+'">OUT: '+esc(r.outT)+'</span>':'<span class="tag t-U">OUT: —</span>')+'</div></div>'}).join('')).join(''):'<p class="muted">No students match.</p>';
}
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
  $('mgrList').innerHTML=S.managers.length?S.managers.map((m,i)=>'<span class="tag t-VEH" style="font-size:13px;padding:6px 10px">'+esc(m)+' <button class="x" style="float:none;font-size:16px;padding:0 0 0 6px;color:var(--brand)" data-mgrdel="'+i+'">×</button></span>').join(''):'<span class="muted">No managers added yet.</span>';
  $('allocT').innerHTML='<tr><th>Vehicle</th><th>Students</th><th>Default In-charge</th><th>Assigned In-charge</th></tr>'+VEH.map(v=>'<tr><td><b>'+esc(v.l)+'</b></td><td>'+v.kids.length+'</td><td class="l muted">'+esc(defaultStaff(v))+'</td><td class="l"><select data-alloc="'+v.k+'" style="min-width:170px">'+STAFF.map(s=>'<option'+(s===staffOf(v.k)?' selected':'')+'>'+esc(s)+'</option>').join('')+'</select></td></tr>').join('');
}

/* ---------- events ---------- */
document.addEventListener('click',async e=>{
  const t=e.target.closest('button,[data-pick],[data-veh],#mbg,#fobg');if(!t)return;
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
  if(t.dataset.pick){gatePick=t.dataset.pick;gDraft=null;foBy=t.dataset.foby==='sb'?selBy($('sbBy').value):t.dataset.foby==='late'?selBy($('lateBy').value):null;
    if(t.dataset.foby==='late'){const g=S.gate[gatePick]||{};gDraft={in:g.in&&g.in.type?g.in.type:(nowHM()>S.lateAfter?'LATE':'PRES'),out:g.out&&g.out.type||null}}
    renderFO();return}
  if(t.id==='gx'||(t.id==='fobg'&&e.target.id==='fobg')){gatePick=null;gDraft=null;$('modalRoot').innerHTML='';return}
  if(t.dataset.gopt){const [side,type]=t.dataset.gopt.split(':');const g=S.gate[gatePick]||{};
    if(!gDraft)gDraft={in:g.in&&g.in.type||null,out:g.out&&g.out.type||null};
    gDraft.rem=$('gRem').value;gDraft.inT=$('gInT').value;gDraft.outT=$('gOutT').value;gDraft[side]=gDraft[side]===type?null:type;renderFO();return}
  if(t.id==='gSave'){const g=S.gate[gatePick]||{};const d=gDraft||{in:g.in&&g.in.type||null,out:g.out&&g.out.type||null};
    const path='att/'+S.date+'/gate/'+gatePick;
    if(!d.in&&!d.out){await store.del(path)}
    else{const body={by:foBy||$('gateBy').value,rem:$('gRem').value.trim(),ts:Date.now()};
      if(d.in)body.in={type:d.in,time:hm12($('gInT').value||nowHM())};
      if(d.out)body.out={type:d.out,time:hm12($('gOutT').value||nowHM())};
      await store.set(path,body)}
    toast(KID[gatePick].name+' saved');gatePick=null;gDraft=null;foBy=null;$('modalRoot').innerHTML='';render();return}
  if(t.dataset.sb){const id=t.dataset.sb,sg=seg(KID[id].cls);S.sbDraft=S.sbDraft||{};const d=S.sbDraft[sg]=S.sbDraft[sg]||{};const cur=sbState(id);const v=id in d?d[id]:cur;const nx=v===true?false:v===false?'D':true;
    if(nx===cur)delete d[id];else d[id]=nx;if(!Object.keys(d).length)delete S.sbDraft[sg];render();return}
  if(t.dataset.sbsave){await saveSBClass(t.dataset.sbsave);render();return}
  if(t.dataset.sbcancel){delete (S.sbDraft||{})[t.dataset.sbcancel];render();return}
  if(t.dataset.dclr){const [id,v]=t.dataset.dclr.split('|');await setDaySB(id,v==='1',$('gateBy').value);toast(KID[id].name+(v==='1'?' – staying (confirmed)':' – not staying (confirmed)'));return}
  if(t.dataset.sbreg){const id=t.dataset.sbreg;const kids=Object.assign({},S.sbReg);if(kids[id])delete kids[id];else kids[id]=true;await store.set('config/sbRegular',{kids,by:selBy($('sbBy').value),ts:Date.now()});return}
  if(t.dataset.wreg){const id=t.dataset.wreg;const kids=Object.assign({},S.walkReg);if(kids[id])delete kids[id];else kids[id]=true;await store.set('config/walkRegular',{kids,ts:Date.now()});toast(KID[id].name+(kids[id]?' added to':' removed from')+' special list');renderFO();return}
  if(t.dataset.veh){modalVeh=t.dataset.veh;renderModal();return}
  if(t.id==='mx'||t.id==='mbg'&&e.target.id==='mbg'){modalVeh=null;$('modalRoot').innerHTML='';return}
  if(t.id==='copySch'){const txt=schoolText();try{await navigator.clipboard.writeText(txt);toast('Summary copied')}catch(err){showText(txt)}return}
  if(t.id==='derrCopy'){const f=$('dashF').value,sf=$('dashS').value;const txt=derrText(VEH.filter(v=>(!f||v.t===f)&&(!sf||staffOf(v.k)===sf)));try{await navigator.clipboard.writeText(txt);toast('Errors copied – paste in WhatsApp')}catch(err){showText(txt)}return}
  if(t.id==='copyRep'){const txt=reportText();try{await navigator.clipboard.writeText(txt);toast('Report copied')}catch(err){showText(txt)}return}
});
function showText(txt){$('modalRoot').innerHTML='<div class="modal" id="mbg"><div class="card"><button class="x" id="mx">×</button><h2>Report – select &amp; copy</h2><textarea readonly>'+esc(txt)+'</textarea></div></div>'}
document.addEventListener('change',async e=>{
  const t=e.target;
  if(t.id==='gInT'&&gatePick){const g=S.gate[gatePick]||{};if(!gDraft)gDraft={in:g.in&&g.in.type||null,out:g.out&&g.out.type||null};gDraft.rem=$('gRem').value;gDraft.inT=t.value;gDraft.outT=$('gOutT').value;if(gDraft.in!=='ABS')gDraft.in=t.value>S.lateAfter?'LATE':'PRES';renderFO();return}
  if(t.id==='gOutT'&&gatePick){const g=S.gate[gatePick]||{};if(!gDraft)gDraft={in:g.in&&g.in.type||null,out:g.out&&g.out.type||null};gDraft.rem=$('gRem').value;gDraft.inT=$('gInT').value;gDraft.outT=t.value;gDraft.out='EARLY';renderFO();return}
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
  if(t.id==='sbAdd'&&t.value){const id=t.value,sg=seg(KID[id].cls);S.sbDraft=S.sbDraft||{};(S.sbDraft[sg]=S.sbDraft[sg]||{})[id]=true;toast(KID[id].name+' added – press Save for the class');render()}
  if(t.id==='sbAddReg'&&t.value){const id=t.value;const kids=Object.assign({},S.sbReg);kids[id]=true;await store.set('config/sbRegular',{kids,by:selBy($('sbBy').value),ts:Date.now()});toast(KID[id].name+' added to the regular stayback list')}
  if(t.id==='sbBy'){LS.set('sbBy',t.value)}
  if(t.id==='lateBy'){LS.set('lateBy',t.value)}
  if(t.id==='lateMin'){S.lateMin=+t.value;renderDash();return}
  if(t.dataset.addfo&&t.value){const g=S.gate[t.value]||{};gatePick=t.value;foBy=selBy($('sbBy').value);gDraft={in:g.in&&g.in.type||null,out:g.out&&g.out.type||null};if(t.dataset.addfo==='LATE')gDraft.in='LATE';else gDraft.out='EARLY';t.value='';renderFO();return}
  if(t.id==='sbGrade'){setGrade(t.value);return}
  if(t.dataset.sec){const s=new Set(selClasses());t.checked?s.add(t.dataset.sec):s.delete(t.dataset.sec);setClasses(CLASSES.filter(x=>s.has(x)));return}
  if(t.id==='gateBy'){LS.set('gateBy',t.value)}
  if(t.id==='dashF'||t.id==='dashS'||t.id==='dashV')render();
  if(t.id==='recCls'){S.recCls=t.value;renderDash();return}
  if(t.id==='recRep'){S.recRep=t.checked;renderDash();return}
  if(t.dataset.alloc){const map=Object.assign({},S.alloc);const v=VBY[t.dataset.alloc];if(t.value===defaultStaff(v))delete map[v.k];else map[v.k]=t.value;await store.set('config/alloc',{map,ts:Date.now()});toast(v.l+' → '+t.value)}
});
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
