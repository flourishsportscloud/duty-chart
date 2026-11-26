/* ===== PM Plan – Live (Classes 1–5) — server logic (runs inside Google Apps Script) =====
   Bound to the "PM Plan Data" Google Sheet. Tabs: PM Plan, Users, Config, Log.
   Rules enforced here, not in the browser:
   - every request needs a login token (passwords stored only as salted hashes in Users)
   - a PM sees and updates only their own plan; the Dean of Academics and the Director–Admin see all
   - Day Plan / Day End can be updated only today (India time); the weekly Observation Update only this week
   - tick times are stamped by the server; only the Dean and the Director–Admin change due times
*/
const TZ="Asia/Kolkata";
const COLS={"PM Plan":["id","pl","mode","date","wk","json","updated"],Users:["id","name","role","salt","hash","ver"],Config:["key","json","by","at"],Photos:["id","doc","key","by","at","data"],Log:["time","who","doc","what"]};

function fail(m){throw new Error(m)}
function isoDate(v){return /^\d{4}-\d\d-\d\d$/.test(String(v||""))}
function today_(){return Utilities.formatDate(new Date(),TZ,"yyyy-MM-dd")}
function sheet_(name){
  const ss=SpreadsheetApp.getActiveSpreadsheet();let sh=ss.getSheetByName(name);
  if(!sh){sh=ss.insertSheet(name);sh.getRange(1,1,1,COLS[name].length).setValues([COLS[name]]).setFontWeight("bold");sh.setFrozenRows(1)}
  return sh;
}
function rows_(name){const sh=sheet_(name);const n=sh.getLastRow();if(n<2)return [];return sh.getRange(2,1,n-1,COLS[name].length).getValues()}
function parse_(s){try{return JSON.parse(s)||{}}catch(e){return {}}}
function wkOf_(date){const d=new Date(date+"T00:00:00Z");d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10)}
/* ---------- Logins ---------- */
const PL_USERS=[["shally","Sanjana","pm"],["neetu","Neetu","pm"],["divyanshi","Divyanshi","pm"],["diksha","Diksha","pm"],
  ["dean","Dean of Academics","senior"],["director","Director–Admin","admin"]];
const TOKEN_DAYS=120;
const H_={
  sha:s=>Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8)),
  hmac:(s,k)=>Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s,k,Utilities.Charset.UTF_8)).replace(/=+$/,""),
  b64:s=>Utilities.base64EncodeWebSafe(s,Utilities.Charset.UTF_8).replace(/=+$/,""),
  unb64:s=>Utilities.newBlob(Utilities.base64DecodeWebSafe(s+"===".slice((s.length+3)%4))).getDataAsString("UTF-8"),
  salt:()=>Utilities.getUuid().replace(/-/g,"")
};
function secret_(){const p=PropertiesService.getScriptProperties();let s=p.getProperty("TOKEN_SECRET");if(!s){s=Utilities.getUuid()+Utilities.getUuid();p.setProperty("TOKEN_SECRET",s)}return s}
function hashPw_(salt,pw){let h=salt+"|"+pw;for(let i=0;i<300;i++)h=H_.sha(h+"|"+salt);return h}
function users_(){
  const sh=sheet_("Users");const rows=rows_("Users");
  return PL_USERS.map(u=>{const i=rows.findIndex(r=>r[0]===u[0]);const r=i>=0?rows[i]:null;
    return {id:u[0],name:u[1],role:u[2],salt:r?String(r[3]):"",hash:r?String(r[4]):"",ver:r?Number(r[5])||1:1,row:i>=0?i+2:0}});
}
function writeUser_(u){const sh=sheet_("Users");const row=[u.id,u.name,u.role,u.salt,u.hash,u.ver];
  if(u.row)sh.getRange(u.row,1,1,6).setValues([row]);else sh.appendRow(row)}
function pub_(u){return {id:u.id,name:u.name,role:u.role,senior:u.role==="senior"||u.role==="admin",admin:u.role==="admin"}}
function token_(u){const exp=Date.now()+TOKEN_DAYS*864e5;const body=u.id+"|"+exp+"|"+u.ver;return H_.b64(body)+"."+H_.hmac(body,secret_())}
function me_(token){
  const t=String(token||"").split(".");if(t.length!==2)fail("Please log in again.");
  let body;try{body=H_.unb64(t[0])}catch(e){fail("Please log in again.")}
  if(H_.hmac(body,secret_())!==t[1])fail("Please log in again.");
  const b=body.split("|");if(Number(b[1])<Date.now())fail("Please log in again.");
  const u=users_().find(x=>x.id===b[0]);if(!u||!u.hash||String(u.ver)!==b[2])fail("Please log in again.");
  return u;
}
function login_(id,pw){
  const u=users_().find(x=>x.id===id);
  if(!u||!u.hash)fail("This login is not set up yet. Ask the Director–Admin.");
  Utilities.sleep(300);
  if(hashPw_(u.salt,String(pw||""))!==u.hash)fail("Wrong password.");
  return {token:token_(u),me:pub_(u)};
}
function setPw_(u,pw){pw=String(pw||"");if(pw.length<6)fail("Password must be at least 6 characters.");u.salt=H_.salt();u.hash=hashPw_(u.salt,pw);u.ver=(u.ver||1)+1;writeUser_(u)}
function changePw_(token,target,pw){
  const me=me_(token);const u=users_().find(x=>x.id===target);if(!u)fail("Unknown login.");
  if(u.id!==me.id&&me.role!=="admin")fail("Only the Director–Admin can reset another login.");
  setPw_(u,pw);sheet_("Log").appendRow([Utilities.formatDate(new Date(),TZ,"yyyy-MM-dd HH:mm"),me.name,"password",u.id===me.id?"changed own":"reset "+u.name]);
  return u.id===me.id?{token:token_(u),me:pub_(u)}:{ok:1};
}
function listUsers_(token){const me=me_(token);if(me.role!=="admin")fail("Only the Director–Admin can see logins.");return users_().map(u=>({id:u.id,name:u.name,role:u.role,set:!!u.hash}))}

const PM_IDS=["shally","neetu","divyanshi","diksha"];
const PM_SENIOR_IDS=["dean","director"];
const PM_BLOCKS=["att","morn","admin","welfare","reports","comm","audit","next","campus","de1","de2","de3","de4","de5"];
function pmMe_(token){
  const me=me_(token);
    return me;
}
/* ---------- Fast lookups (TextFinder on column A — never reads the whole sheet, so saves stay quick as the sheets grow) ---------- */
function findRowNo_(sh,id){
  if(sh.getLastRow()<2)return 0;
  const c=sh.getRange(2,1,sh.getLastRow()-1,1).createTextFinder(String(id)).matchEntireCell(true).matchCase(true).findNext();
  return c?c.getRow():0;
}
function readDoc_(id){
  const sh=sheet_("PM Plan");const rn=findRowNo_(sh,id);
  const j=rn?parse_(sh.getRange(rn,6).getValue()):{};j.cells=j.cells||{};j.rem=j.rem||{};j.med=j.med||[];
  return {sh,rn,j};
}
function writeDoc_(d,c0,now){
  const wk=c0.mode==="wk"?c0.date:wkOf_(c0.date);
  const row=[c0.id,c0.pl,c0.mode,"'"+c0.date,"'"+wk,JSON.stringify(d.j),new Date(now)];
  if(d.rn)d.sh.getRange(d.rn,1,1,row.length).setValues([row]);else d.sh.appendRow(row);
  return wk;
}
const out_=(c0,wk,j)=>({pl:c0.pl,mode:c0.mode,date:c0.date,wk,cells:j.cells,rem:j.rem,med:j.med});
function log_(name,id,what){sheet_("Log").appendRow([Utilities.formatDate(new Date(),TZ,"yyyy-MM-dd HH:mm"),name,"PM "+id,what])}

function pmState_(token,wk){
  const me=pmMe_(token);
  if(!isoDate(wk))fail("Bad week.");
  const docs={};const sh=sheet_("PM Plan");const n=sh.getLastRow();
  if(n>=2){
    const keys=sh.getRange(2,1,n-1,5).getValues();           // small columns only
    const hit=[];keys.forEach((r,i)=>{const p=String(r[0]).split("_");
      if(p.length===3&&isoDate(p[2])&&String(r[4]).replace(/^'/,"")===wk&&(me.role!=="pm"||p[0]===me.id))hit.push(i)});
    if(hit.length){
      const lo=hit[0],hi=hit[hit.length-1];const js=sh.getRange(lo+2,6,hi-lo+1,1).getValues();
      hit.forEach(i=>{const r=keys[i];const p=String(r[0]).split("_");const j=parse_(js[i-lo][0]);
        docs[r[0]]={pl:p[0],mode:p[1],date:p[2],wk:wk,cells:j.cells||{},rem:j.rem||{},med:j.med||[]}});
    }
  }
  const c=rows_("Config").find(x=>x[0]==="pmtimes");
  return {today:today_(),docs,times:c?parse_(c[1]):{},me:pub_(me)};
}
function pmCheck_(me,id){
  const p=String(id||"").split("_");const pl=p[0],mode=p[1],date=p[2];
  if(PM_IDS.indexOf(pl)<0||["dp","de","wk"].indexOf(mode)<0||!isoDate(date))fail("Bad record.");
  if(mode!=="wk"&&date!==today_())fail("Only today's plan can be updated.");
  if(mode==="wk"&&date!==wkOf_(today_()))fail("Only this week's items can be changed.");
  if(me.role==="pm"&&me.id!==pl)fail("You can update only your own plan.");
  return {id:String(id),pl,mode,date};
}
const str_=(v,n)=>String(v==null?"":v).slice(0,n);
function pmSave_(token,id,patch){
  const me=pmMe_(token);const name=me.name;
  const c0=pmCheck_(me,id);const d=readDoc_(id);const j=d.j;
  const now=Date.now();let n=0;
  const pid=str_(patch&&patch.pid,40);j.pids=Array.isArray(j.pids)?j.pids:[];
  if(pid&&j.pids.indexOf(pid)>=0)return out_(c0,c0.mode==="wk"?c0.date:wkOf_(c0.date),j);   // same save sent twice (lost reply): apply once
  Object.keys((patch&&patch.cells)||{}).forEach(k=>{
    const c=patch.cells[k]||{};const key=str_(k,80);
    if(Array.isArray(c.ops)){                        // timed checks: the server stamps each one; "na" toggles NA
      const old=j.cells[key]||{};const obs=(old.obs||[]).slice();let na=!!old.na;
      c.ops.slice(0,20).forEach(o=>{if(o==="add"&&obs.length<10){na=false;obs.push(now)}else if(o==="pop")obs.pop();else if(o==="na"){na=!na;if(na)obs.length=0}});
      j.cells[key]={s:na?"A":(obs.length?"D":""),by:name,at:now,l:0,obs:obs};if(na)j.cells[key].na=1;n++;return;
    }
    const s=["","D","N","A"].indexOf(c.s)>=0?c.s:"";
    const old_=j.cells[key];if(old_&&Array.isArray(old_.obs)&&old_.obs.length&&c.s!=="A"){n++;return}   // never wipe observation times with a plain tick
    const o={s:s,by:name,at:now,l:c.l?1:0};
    if(c.n!==undefined){o.n=(c.n===""||c.n==null||isNaN(Number(c.n)))?"":String(Number(c.n))}
    j.cells[key]=o;n++;
  });
  Object.keys((patch&&patch.rem)||{}).forEach(k=>{
    const e=patch.rem[k]||{};
    const key=str_(k,80);const old=j.rem[key]||{};
    const o={x:str_(e.x,500),by:name,at:now};
    if(e.a!==undefined)o.a=str_(e.a,120);           // activity name (Class Timeline)
    if(e.n!==undefined)o.n=(e.n===""||e.n==null||isNaN(Number(e.n)))?"":Number(e.n);
    if(old.ph)o.ph=old.ph;
    j.rem[key]=o;n++;
  });
  (Array.isArray(patch&&patch.med)?patch.med:[]).slice(0,30).forEach(m=>{   // medical cases, one entry per child
    const mid=str_(m&&m.id,20);if(!/^[a-z0-9]{4,20}$/.test(mid))return;
    const e=j.med.find(x=>x.id===mid);
    if(m.op==="add"&&!e&&j.med.length<60){j.med.push({id:mid,name:str_(m.name,60),sec:str_(m.sec,4),x:str_(m.x,300),ack:{at:now,by:name},fu:[]});n++}
    else if(!e)return;
    else if(m.op==="fu"&&e.fu.length<10){e.fu.push({at:now,by:name});n++}
    else if(m.op==="unfu"){e.fu.pop();n++}
    else if(m.op==="note"){e.x=str_(m.x,300);n++}
    else if(m.op==="del"){j.medDel=(j.medDel||[]).concat([Object.assign({},e,{delBy:name,delAt:now})]).slice(-60);j.med=j.med.filter(x=>x.id!==mid);n++}   // soft delete: kept in medDel
  });
  if(pid){j.pids.push(pid);if(j.pids.length>80)j.pids=j.pids.slice(-80)}
  const wk=writeDoc_(d,c0,now);
  log_(name,id,n+" change(s) "+str_(JSON.stringify({cells:patch&&patch.cells,rem:patch&&patch.rem,med:patch&&patch.med}),1500));   // audit: who, when, what
  return out_(c0,wk,j);
}
function pmSetTime_(token,b,v){
  const me=pmMe_(token);
  if(me.role==="pm")fail("Only the Dean and the Director–Admin can change due times.");
  if(PM_BLOCKS.indexOf(String(b))<0)fail("Bad block.");
  if(!(v==="none"||v==="def"||/^\d\d:\d\d$/.test(String(v))))fail("Bad time.");
  const sh=sheet_("Config");const all=rows_("Config");const idx=all.findIndex(r=>r[0]==="pmtimes");
  const t=idx>=0?parse_(all[idx][1]):{};t[b]=v;
  const row=["pmtimes",JSON.stringify(t),me.name,new Date()];
  if(idx>=0)sh.getRange(idx+2,1,1,4).setValues([row]);else sh.appendRow(row);
  return t;
}
/* Image log: a small JPEG (resized in the browser) is kept in the Photos tab; the record keeps its id.
   The photo row is written before the lock is taken, so uploads never wait behind other saves. */
function pmPhotoCheck_(token,id,key,data){
  const me=pmMe_(token);const c0=pmCheck_(me,id);
  key=str_(key,80);data=String(data||"");
  if(!/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(data))fail("Bad photo.");
  if(data.length>48000)fail("Photo is too large.");
  return {me,c0,key,data};
}
function pmPhotoStore_(p,cid){
  const pid=/^[a-z0-9]{8,20}$/.test(String(cid||""))?String(cid):Utilities.getUuid().replace(/-/g,"").slice(0,16);
  const sh=sheet_("Photos");
  if(!findRowNo_(sh,pid))sh.appendRow([pid,p.c0.id,p.key,p.me.name,new Date(),p.data]);
  return pid;
}
function pmPhotoLink_(p,pid){
  const d=readDoc_(p.c0.id);const j=d.j;const now=Date.now();
  const e=j.rem[p.key]||{x:""};e.ph=e.ph||[];
  if(!e.ph.some(x=>x.id===pid)){if(e.ph.length>=5)fail("Up to 5 photos per section.");e.ph.push({id:pid,at:now,by:p.me.name})}
  j.rem[p.key]=e;
  if(!/^med-/.test(p.key))j.cells[p.key]={s:"D",by:p.me.name,at:now,l:0};
  const wk=writeDoc_(d,p.c0,now);
  log_(p.me.name,p.c0.id,"photo "+p.key);
  return out_(p.c0,wk,j);
}
function pmPhotoGet_(token,pid){const v=pmPhotos_(token,[pid]);if(!v.length)fail("Photo not found.");return v[0]}
function pmPhotos_(token,ids){
  const me=pmMe_(token);const sh=sheet_("Photos");const out=[];
  (Array.isArray(ids)?ids:[]).slice(0,12).forEach(pid=>{
    const rn=findRowNo_(sh,str_(pid,20));if(!rn)return;
    const r=sh.getRange(rn,1,1,6).getValues()[0];
    if(me.role==="pm"&&String(r[1]).split("_")[0]!==me.id)return;
    out.push({id:r[0],by:r[3],data:r[5]});
  });
  return out;
}
/* Run from the Apps Script editor only: gives EVERY login a new password (logs everyone out) and prints them in the Execution log. */
function resetAllLogins(){
  Object.keys(COLS).forEach(sheet_);
  const out=[];
  users_().forEach(u=>{const pw=u.name.replace(/[^A-Za-z]/g,"").slice(0,4)+"@"+(1000+Math.floor(Math.random()*9000));setPw_(u,pw);out.push(u.name+" : "+pw)});
  sheet_("Log").appendRow([Utilities.formatDate(new Date(),TZ,"yyyy-MM-dd HH:mm"),"Editor","password","reset all"]);
  Logger.log(out.join("\n"));
  return out;
}
/* Run once from the Apps Script editor (not reachable from the web): gives every login that has no
   password yet a starting password and prints them in the Execution log. Logins already set are left alone. */
function setupPmLogins(){
  Object.keys(COLS).forEach(sheet_);
  const out=[];
  users_().forEach(u=>{if(!u.hash){const pw=u.id.slice(0,1).toUpperCase()+u.id.slice(1,4)+"@"+(1000+Math.floor(Math.random()*9000));setPw_(u,pw);out.push(u.name+" : "+pw)}});
  Logger.log(out.length?out.join("\n"):"All PM logins already have passwords.");
  return out;
}

/* Run once from the Apps Script editor (not reachable from the web): sets EVERY login to FirstName#1111
   (e.g. Poonam#1111, Dean#1111, Director#1111) and logs everyone out. Change them afterwards from the Logins screen. */
function setNamePasswords(){
  Object.keys(COLS).forEach(sheet_);
  const out=[];
  users_().forEach(u=>{const pw=u.name.split(/[^A-Za-z]+/)[0]+"#1111";setPw_(u,pw);out.push(u.name+" : "+pw)});
  sheet_("Log").appendRow([Utilities.formatDate(new Date(),TZ,"yyyy-MM-dd HH:mm"),"Editor","password","set FirstName#1111"]);
  Logger.log(out.join("\n"));
  return out;
}

function doPost(e){
  let out;const lock=LockService.getScriptLock();
  try{
    const req=JSON.parse(e.postData.contents||"{}");const a=req.args||[];const tk=req.token;
    let v;
    if(req.fn==="login")v=login_(a[0],a[1]);
    else if(req.fn==="pmState")v=pmState_(tk,a[0]);
    else if(req.fn==="pmPhotoGet")v=pmPhotoGet_(tk,a[0]);
    else if(req.fn==="pmPhotos")v=pmPhotos_(tk,a[0]);
    else if(req.fn==="pmPhoto"){
      const p=pmPhotoCheck_(tk,a[0],a[1],a[2]);const pid=pmPhotoStore_(p,a[3]);  // heavy write, no lock needed
      lock.waitLock(25000);v=pmPhotoLink_(p,pid);
    }
    else{
      lock.waitLock(25000);
      if(req.fn==="pmSave")v=pmSave_(tk,a[0],a[1]);
      else if(req.fn==="pmSetTime")v=pmSetTime_(tk,a[0],a[1]);
      else if(req.fn==="changePw")v=changePw_(tk,a[0],a[1]);
      else if(req.fn==="listUsers")v=listUsers_(tk);
      else fail("Unknown request.");
    }
    out={ok:true,v};
  }catch(err){out={ok:false,err:String(err&&err.message||err)}}
  finally{try{lock.releaseLock()}catch(x){}}
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function doGet(){return ContentService.createTextOutput("PM Plan – Live API is running.")}
