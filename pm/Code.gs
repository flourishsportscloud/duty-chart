/* ===== PM Plan – Live (Classes 1–5) — server logic (runs inside Google Apps Script) =====
   Bound to the "PM Plan Data" Google Sheet. Tabs: PM Plan, Users, Config, Log.
   Rules enforced here, not in the browser:
   - every request needs a login token (passwords stored only as salted hashes in Users)
   - a PM sees and updates only their own plan; the Dean of Academics and the Director–Admin see all
   - Day Plan / Day End can be updated only today (India time); the weekly Observation Update only this week
   - tick times are stamped by the server; only the Dean and the Director–Admin change due times
*/
const TZ="Asia/Kolkata";
const COLS={"PM Plan":["id","pl","mode","date","wk","json","updated"],Users:["id","name","role","salt","hash","ver"],Config:["key","json","by","at"],Log:["time","who","doc","what"]};

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
const PL_USERS=[["shally","Shally","pm"],["neetu","Neetu","pm"],["divyanshi","Divyanshi","pm"],["diksha","Diksha","pm"],
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
const PM_BLOCKS=["att","morn","admin","welfare","reports","comm","audit","next","campus","de1","de2","de3"];
function pmMe_(token){
  const me=me_(token);
    return me;
}
function pmState_(token,wk){
  const me=pmMe_(token);
  if(!isoDate(wk))fail("Bad week.");
  const docs={};
  rows_("PM Plan").forEach(r=>{const p=String(r[0]).split("_");
    if(p.length===3&&isoDate(p[2])&&String(r[4]).replace(/^'/,"")===wk&&(me.role!=="pm"||p[0]===me.id)){const j=parse_(r[5]);docs[r[0]]={pl:p[0],mode:p[1],date:p[2],wk:wk,cells:j.cells||{},rem:j.rem||{}}}});
  const c=rows_("Config").find(x=>x[0]==="pmtimes");
  return {today:today_(),docs,times:c?parse_(c[1]):{},me:pub_(me)};
}
function pmSave_(token,id,patch){
  const me=pmMe_(token);const name=me.name;
  const p=String(id||"").split("_");const pl=p[0],mode=p[1],date=p[2];
  if(PM_IDS.indexOf(pl)<0||["dp","de","wk"].indexOf(mode)<0||!isoDate(date))fail("Bad record.");
  if(mode!=="wk"&&date!==today_())fail("Only today's plan can be updated.");
  if(mode==="wk"&&date!==wkOf_(today_()))fail("Only this week's observation update can be changed.");
  if(me.role==="pm"&&me.id!==pl)fail("You can update only your own plan.");
  const wk=mode==="wk"?date:wkOf_(date);
  const sh=sheet_("PM Plan");const all=rows_("PM Plan");
  const idx=all.findIndex(r=>r[0]===id);
  const j=idx>=0?parse_(all[idx][5]):{};j.cells=j.cells||{};j.rem=j.rem||{};
  const now=Date.now();let n=0;
  Object.keys((patch&&patch.cells)||{}).forEach(k=>{
    const c=patch.cells[k]||{};const s=["","D","N","A"].indexOf(c.s)>=0?c.s:"";
    const o={s:s,by:name,at:now,l:c.l?1:0};
    if(c.n!==undefined){o.n=(c.n===""||c.n==null||isNaN(Number(c.n)))?"":String(Number(c.n))}
    j.cells[String(k).slice(0,80)]=o;n++;
  });
  Object.keys((patch&&patch.rem)||{}).forEach(k=>{
    const e=patch.rem[k]||{};
    j.rem[String(k).slice(0,80)]={x:String(e.x||"").slice(0,500),by:name,at:now};n++;
  });
  const row=[id,pl,mode,"'"+date,"'"+wk,JSON.stringify(j),new Date(now)];
  if(idx>=0)sh.getRange(idx+2,1,1,row.length).setValues([row]);else sh.appendRow(row);
  sheet_("Log").appendRow([Utilities.formatDate(new Date(now),TZ,"yyyy-MM-dd HH:mm"),name,"PM "+id,n+" change(s)"]);
  return {pl,mode,date,wk,cells:j.cells,rem:j.rem};
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
/* Run once from the Apps Script editor (not reachable from the web): gives every login that has no
   password yet a starting password and prints them in the Execution log. Logins already set are left alone. */
function setupPmLogins(){
  Object.keys(COLS).forEach(sheet_);
  const out=[];
  users_().forEach(u=>{if(!u.hash){const pw=u.id.slice(0,1).toUpperCase()+u.id.slice(1,4)+"@"+(1000+Math.floor(Math.random()*9000));setPw_(u,pw);out.push(u.name+" : "+pw)}});
  Logger.log(out.length?out.join("\n"):"All PM logins already have passwords.");
  return out;
}

function doPost(e){
  let out;const lock=LockService.getScriptLock();
  try{
    const req=JSON.parse(e.postData.contents||"{}");const a=req.args||[];const tk=req.token;
    let v;
    if(req.fn==="login")v=login_(a[0],a[1]);
    else if(req.fn==="pmState")v=pmState_(tk,a[0]);
    else{
      lock.waitLock(20000);
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
