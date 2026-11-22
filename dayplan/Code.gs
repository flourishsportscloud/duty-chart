/* ===== Day Plan — server (Google Apps Script) =====
   Staff log in with the SAME name and password as the Diary app: this script asks the Diary API to check them,
   reads their Diary role, then hands back its own signed token (valid 120 days). No passwords are stored here.
   Who may do what (enforced here, not in the page):
   - every logged-in staff member can view plans, acknowledge plans and see the free-staff chart
   - editors (Diary admin, plus the names the admin adds in Settings) share plans, edit staff and timetable, mark leave and cover
   - acknowledgement times are stamped by this server (India time) from the logged-in name, so nobody can back-date or sign for someone else
   Sheet tabs (made by setupDayPlan): Docs (path | date | json) and Photos (id | chunks...).
   Documents: every class, plus A15/A611 (Adjustments), F15/F611 (Free Teachers) and CO (Co-curricular Schedule), is one slot.
   Paths: plan/<date>/<class>, ack/<date>/<class>, leave/<date>, cover/<date>, config/staff, config/settings.
*/
const DIARY_API="https://script.google.com/macros/s/AKfycbyvWTDOKOQ8F0vD-oy9vchmq04GdhfZfgtpomgWg73rIa13gmkrFkpZsvQl9ISZKrSFQw/exec";
const TZ="Asia/Kolkata", TOKEN_DAYS=120, CHUNK=40000, MAX_PHOTO=1000000;
const PHOTO_ID=/^p_[a-z0-9]{6,24}$/, DATA_URL=/^data:image\/(jpeg|png);base64,[A-Za-z0-9+\/=]+$/;
const CLASSES=["N","LKG","UKG","1","2","3","4","5","6","7","8","9","10","11","CO","A15","A611","F15","F611"];
const DEFAULTS={ackBy:"08:00",slotStart:7,slotCount:9,editors:[]};

function setupDayPlan(){
  const ss=SpreadsheetApp.getActive();
  if(!ss.getSheetByName("Docs"))ss.insertSheet("Docs").appendRow(["path","date","json"]);
  if(!ss.getSheetByName("Photos"))ss.insertSheet("Photos").appendRow(["id","chunks"]);
  const sp=PropertiesService.getScriptProperties();
  if(!sp.getProperty("SECRET"))sp.setProperty("SECRET",Utilities.getUuid()+Utilities.getUuid());
  if(!sp.getProperty("VER"))sp.setProperty("VER","1");
}
function out(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON)}
function doGet(){return ContentService.createTextOutput("Day Plan API is running.")}
function fail(m){throw new Error(m)}
function b64(s){return Utilities.base64EncodeWebSafe(s)}
function sign(body){return b64(Utilities.computeHmacSha256Signature(body,PropertiesService.getScriptProperties().getProperty("SECRET")))}
function makeToken(name,role){const body=name+"|"+(Date.now()+TOKEN_DAYS*864e5)+"|"+role;return b64(body)+"."+sign(body)}
function readToken(t){
  const p=String(t||"").split(".");if(p.length!==2)return null;
  let body;try{body=Utilities.newBlob(Utilities.base64DecodeWebSafe(p[0])).getDataAsString()}catch(e){return null}
  if(sign(body)!==p[1])return null;
  const q=body.split("|");if(Number(q[1])<Date.now())return null;
  return {name:q[0],role:q[2]||""};
}
function login(name,pw){
  name=String(name||"").trim().slice(0,60);
  if(!name||!pw)fail("Type your name and password.");
  const r=UrlFetchApp.fetch(DIARY_API,{method:"post",contentType:"text/plain;charset=utf-8",payload:JSON.stringify({fn:"login",args:[name,String(pw)]}),muteHttpExceptions:true,followRedirects:true});
  let j;try{j=JSON.parse(r.getContentText())}catch(e){fail("The Diary login could not be reached. Try again.")}
  if(!j||j.ok===false||j.error||j.err){fail(String((j&&(j.err||j.error))||"Wrong name or password."))}
  const v=j.v||j.data||j.value||{};
  const me=(v.state&&v.state.me)||v.me||{};
  const nm=String(me.name||name).trim().slice(0,60), role=String(me.role||"");
  return {token:makeToken(nm,role),name:nm,role:role};
}
function sheet(n){return SpreadsheetApp.getActive().getSheetByName(n)}
function findRow(sh,key){
  if(sh.getLastRow()<2)return 0;
  const f=sh.getRange(2,1,sh.getLastRow()-1,1).createTextFinder(key).matchEntireCell(true).findNext();
  return f?f.getRow():0;
}
function readDoc(path){
  const sh=sheet("Docs"), row=findRow(sh,path);if(!row)return null;
  try{return JSON.parse(sh.getRange(row,3).getValue())}catch(e){return null}
}
function writeDoc(path,date,obj){
  const j=JSON.stringify(obj);if(j.length>48000)fail("That is too large to save.");
  const sh=sheet("Docs"), row=findRow(sh,path);
  if(row){sh.getRange(row,2,1,2).setValues([[date||"",j]])}else sh.appendRow([path,date||"",j]);
}
function bump(){const sp=PropertiesService.getScriptProperties();sp.setProperty("VER",String(Number(sp.getProperty("VER")||1)+1))}
function todayIso(){return Utilities.formatDate(new Date(),TZ,"yyyy-MM-dd")}
function addDays(iso,n){const d=new Date(iso+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function isoOk(d){return /^\d{4}-\d\d-\d\d$/.test(String(d||""))&&!isNaN(Date.parse(d))}
function clsOk(c){return CLASSES.indexOf(String(c))>=0}
function hhmm(v,dflt){return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v||""))?String(v):dflt}
function dueMs(date,t){return Date.parse(date+"T"+t+":00+05:30")}
function key(n){return String(n||"").trim().toLowerCase()}
function settings(){const s=readDoc("config/settings")||{};return Object.assign({},DEFAULTS,s,{editors:Array.isArray(s.editors)?s.editors:[]})}
function isEditor(me,st){return me.role==="admin"||st.editors.some(n=>key(n)===key(me.name))}
function needEditor(me,st){if(!isEditor(me,st))fail("Only the Director or an editor can do this.")}
function lock(fn){const l=LockService.getScriptLock();l.waitLock(20000);try{return fn()}finally{l.releaseLock()}}

function doPost(e){
  try{
    const req=JSON.parse(e.postData.contents), a=req.args||[];
    if(req.fn==="login")return out({ok:true,data:login(a[0],a[1])});
    const me=readToken(req.code);
    if(!me)return out({ok:false,auth:true,error:"Please log in again."});
    let data=null;
    switch(req.fn){
      case "state":data=state(me,a[0],a[1]);break;
      case "ack":data=ack(me,a[0],a[1]);break;
      case "savePlan":data=savePlan(me,a[0],a[1],a[2]);break;
      case "clearPlan":data=clearPlan(me,a[0],a[1]);break;
      case "saveStaff":data=saveStaff(me,a[0]);break;
      case "saveSettings":data=saveSettings(me,a[0]);break;
      case "saveLeave":data=saveLeave(me,a[0],a[1]);break;
      case "saveCover":data=saveCover(me,a[0],a[1]);break;
      case "putPhoto":data=putPhoto(me,a[0],a[1]);break;
      case "getPhoto":data=getPhoto(a[0]);break;
      default:fail("unknown call");
    }
    return out({ok:true,data:data});
  }catch(err){
    const m=String(err.message||err);
    return out({ok:false,error:m,auth:/log in again/i.test(m)});
  }
}

/* Everything the page needs for one date. Sends {same:true} when nothing changed since the page's last copy. */
function state(me,date,ver){
  const today=todayIso();
  if(!isoOk(date))date=today;
  const sp=PropertiesService.getScriptProperties(), cur=Number(sp.getProperty("VER")||1);
  const base={today:today,nowMs:Date.now(),ver:cur};
  if(Number(ver)===cur&&ver)return Object.assign({same:true},base);
  const st=settings(), editor=isEditor(me,st);
  const res=Object.assign(base,{date:date,me:{name:me.name,role:me.role,admin:me.role==="admin",editor:editor},settings:st,staff:readDoc("config/staff")||{list:[]},plan:{},ack:{},leave:(readDoc("leave/"+date)||{}).names||[],cover:(readDoc("cover/"+date)||{}).slots||{}});
  CLASSES.forEach(c=>{
    const p=readDoc("plan/"+date+"/"+c);if(p)res.plan[c]=p;
    const k=readDoc("ack/"+date+"/"+c);if(k)res.ack[c]=k.by||{};
  });
  return res;
}

/* A staff member confirms they have seen a plan. Name and time come from the server, never from the page. */
function ack(me,date,cls){
  if(!isoOk(date)||!clsOk(cls))fail("bad request");
  const today=todayIso();
  if(date<today)fail("This plan is from an earlier day.");
  if(date>addDays(today,1))fail("This plan is not open yet.");
  return lock(()=>{
    const plan=readDoc("plan/"+date+"/"+cls);
    if(!plan||!plan.imgs||!plan.imgs.length)fail("No plan has been shared for this class yet.");
    const path="ack/"+date+"/"+cls, doc=readDoc(path)||{by:{}};
    const k=key(me.name), prev=doc.by[k], now=Date.now();
    if(prev&&prev.rev===plan.rev)return {t:prev.t,late:prev.late,rev:prev.rev};
    const late=now>dueMs(date,plan.ackBy||settings().ackBy);
    doc.by[k]={n:me.name,t:now,rev:plan.rev,late:late};
    writeDoc(path,date,doc);bump();
    return {t:now,late:late,rev:plan.rev};
  });
}

/* Editors share a plan (photos + note + acknowledge-by time). Changing photos or note makes everyone acknowledge again. */
function savePlan(me,date,cls,p){
  const st=settings();needEditor(me,st);
  if(!isoOk(date)||!clsOk(cls))fail("bad request");
  if(date<todayIso())fail("Plans can be shared only for today or later.");
  p=p||{};
  const imgs=(Array.isArray(p.imgs)?p.imgs:[]).filter(x=>PHOTO_ID.test(String(x))).slice(0,8);
  if(!imgs.length)fail("Add at least one photograph.");
  return lock(()=>{
    const path="plan/"+date+"/"+cls, old=readDoc(path);
    const note=String(p.note||"").trim().slice(0,600), ackBy=hhmm(p.ackBy,st.ackBy);
    const changed=!old||JSON.stringify(old.imgs)!==JSON.stringify(imgs)||String(old.note||"")!==note;
    const doc={imgs:imgs,note:note,ackBy:ackBy,by:changed?me.name:old.by,at:changed?Date.now():old.at,rev:old?(changed?(old.rev||1)+1:old.rev||1):1};
    writeDoc(path,date,doc);bump();return doc;
  });
}
function clearPlan(me,date,cls){
  const st=settings();needEditor(me,st);
  if(!isoOk(date)||!clsOk(cls))fail("bad request");
  if(date<todayIso())fail("Past plans cannot be removed.");
  return lock(()=>{
    const sh=sheet("Docs");
    ["plan/"+date+"/"+cls,"ack/"+date+"/"+cls].forEach(p=>{const r=findRow(sh,p);if(r)sh.deleteRow(r)});
    bump();return true;
  });
}

/* Staff list: [{id,name,grp:'A'|'P'|'C'|'O',cls:[...],tt:{"1":[slot numbers],...,"6":[...]}|null}] */
function saveStaff(me,list){
  const st=settings();needEditor(me,st);
  if(!Array.isArray(list))fail("bad data");
  const seen={},clean=[];
  list.slice(0,300).forEach((s,i)=>{
    const name=String((s&&s.name)||"").trim().slice(0,60);if(!name||seen[key(name)])return;seen[key(name)]=1;
    const grp=["A","P","C","O"].indexOf(s.grp)>=0?s.grp:"A";
    const cls=(Array.isArray(s.cls)?s.cls:[]).map(String).filter(clsOk).filter((c,j,a)=>a.indexOf(c)===j);
    let tt=null;
    if(s.tt&&typeof s.tt==="object"){tt={};for(let d=1;d<=6;d++){const v=s.tt[d];tt[d]=(Array.isArray(v)?v:[]).map(Number).filter(n=>n>=1&&n<=24).filter((n,j,a)=>a.indexOf(n)===j).sort((a,b)=>a-b)}}
    clean.push({name:name,grp:grp,cls:cls,tt:tt});
  });
  return lock(()=>{writeDoc("config/staff","",{list:clean});bump();return {n:clean.length}});
}
function saveSettings(me,s){
  const st=settings();needEditor(me,st);
  s=s||{};
  const next={ackBy:hhmm(s.ackBy,st.ackBy),slotStart:Math.max(5,Math.min(12,Number(s.slotStart)||st.slotStart)),slotCount:Math.max(4,Math.min(12,Number(s.slotCount)||st.slotCount)),editors:st.editors};
  if(me.role==="admin"&&Array.isArray(s.editors))next.editors=s.editors.map(n=>String(n).trim().slice(0,60)).filter(Boolean).slice(0,30);
  return lock(()=>{writeDoc("config/settings","",next);bump();return next});
}
function saveLeave(me,date,names){
  const st=settings();needEditor(me,st);
  if(!isoOk(date))fail("bad request");
  const list=(Array.isArray(names)?names:[]).map(n=>String(n).trim().slice(0,60)).filter(Boolean).slice(0,300);
  return lock(()=>{writeDoc("leave/"+date,date,{names:list});bump();return true});
}
/* cover: {"<slot number>":[{name,note}]} — a free teacher given a duty in that hour */
function saveCover(me,date,slots){
  const st=settings();needEditor(me,st);
  if(!isoOk(date))fail("bad request");
  const clean={};
  Object.keys(slots||{}).slice(0,24).forEach(k=>{
    const arr=(Array.isArray(slots[k])?slots[k]:[]).slice(0,60).map(x=>({name:String(x.name||"").trim().slice(0,60),note:String(x.note||"").trim().slice(0,120)})).filter(x=>x.name);
    if(arr.length&&/^\d+$/.test(k))clean[k]=arr;
  });
  return lock(()=>{writeDoc("cover/"+date,date,{slots:clean});bump();return true});
}
function putPhoto(me,id,url){
  needEditor(me,settings());
  if(!PHOTO_ID.test(String(id))||!DATA_URL.test(String(url))||url.length>MAX_PHOTO)fail("bad photo");
  const sh=sheet("Photos");
  return lock(()=>{
    if(findRow(sh,id))return true;
    const parts=[id];for(let i=0;i<url.length;i+=CHUNK)parts.push(url.slice(i,i+CHUNK));
    sh.appendRow(parts);return true;
  });
}
function getPhoto(id){
  if(!PHOTO_ID.test(String(id)))fail("bad photo");
  const sh=sheet("Photos"), row=findRow(sh,id);
  if(!row)fail("not found");
  return sh.getRange(row,2,1,sh.getLastColumn()-1).getValues()[0].join("");
}
