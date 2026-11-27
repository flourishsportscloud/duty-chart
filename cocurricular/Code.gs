/* ===== FIS Co-Curricular Desk: server (Google Apps Script) =====
   Staff sign in with the SAME name and password as the Diary app. This script asks the Diary API to check them,
   reads their Diary role, then returns its own signed token (valid 120 days). No passwords are stored here.
   The whole app state is one JSON document kept in the "State" tab, split into 40,000-character rows.
   Who may do what (enforced here):
   - the Diary admin (Director) loads the first data and can read and write everything
   - every other staff member reads and writes the shared data BUT private observations are never sent to them
     and cannot be created, changed or deleted by them. Once the Director conveys an observation to a coach it is sent.
   Other permissions inside the app (who can approve, who marks uniform) are enforced in the page only.
   Saving uses a version number: if two people save at the same moment the later one is told to reload.
*/
const DIARY_API="https://script.google.com/macros/s/AKfycbyvWTDOKOQ8F0vD-oy9vchmq04GdhfZfgtpomgWg73rIa13gmkrFkpZsvQl9ISZKrSFQw/exec";
const FULL_NAMES=["harsh","vaishali","nahida","saurabh","jay","anoop","megha","priyanka","chandan","rahul","nishant","sanjana","diksha","neetu","divyanshi","karishma","poonam","sharda","asha","sarita","saba"]; /* these people see and do everything, like the Director */
const TOKEN_DAYS=120, CHUNK=40000, MAX_LEN=6000000;

function setupCoCurricular(){
  const ss=SpreadsheetApp.getActive();
  if(!ss.getSheetByName("State"))ss.insertSheet("State").appendRow(["row","chunk"]);
  const sp=PropertiesService.getScriptProperties();
  if(!sp.getProperty("SECRET"))sp.setProperty("SECRET",Utilities.getUuid()+Utilities.getUuid());
  if(!sp.getProperty("VER"))sp.setProperty("VER","0");
}
function out(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON)}
function doGet(){return ContentService.createTextOutput("Co-Curricular Desk API is running.")}
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
function ver(){return Number(PropertiesService.getScriptProperties().getProperty("VER")||0)}
function readState(){
  const sh=SpreadsheetApp.getActive().getSheetByName("State");
  if(!sh||sh.getLastRow()<2)return null;
  return sh.getRange(2,2,sh.getLastRow()-1,1).getValues().map(r=>r[0]).join("");
}
function writeState(json){
  const sh=SpreadsheetApp.getActive().getSheetByName("State");
  if(sh.getLastRow()>1)sh.getRange(2,1,sh.getLastRow()-1,2).clearContent();
  const rows=[];for(let i=0,n=0;i<json.length;i+=CHUNK,n++)rows.push([n,json.slice(i,i+CHUNK)]);
  sh.getRange(2,1,rows.length,2).setValues(rows);
}
/* pure helpers: no private observation reaches a non-admin, and a non-admin can never change one */
function scrub(json){
  const o=JSON.parse(json);
  Object.keys(o.sessions||{}).forEach(k=>{const s=o.sessions[k];s.obs=(s.obs||[]).filter(x=>x.conv)});
  return JSON.stringify(o);
}
function mergePriv(inJson,storedJson){
  const a=JSON.parse(inJson), b=JSON.parse(storedJson);
  Object.keys(a.sessions||{}).forEach(k=>{
    const s=a.sessions[k], old=(b.sessions&&b.sessions[k])?b.sessions[k].obs||[]:[];
    const oldConv={};old.filter(x=>x.conv).forEach(x=>oldConv[x.id]=1);
    s.obs=(s.obs||[]).filter(x=>x.conv&&oldConv[x.id]).concat(old.filter(x=>!x.conv));
  });
  /* sessions a non-admin removed keep their private observations out of reach but are not lost */
  Object.keys(b.sessions||{}).forEach(k=>{if(!a.sessions[k]&&(b.sessions[k].obs||[]).some(x=>!x.conv)){a.sessions[k]=b.sessions[k]}});
  return JSON.stringify(a);
}
function lock(fn){const l=LockService.getScriptLock();l.waitLock(20000);try{return fn()}finally{l.releaseLock()}}

function doPost(e){
  try{
    const req=JSON.parse(e.postData.contents), a=req.args||[];
    if(req.fn==="login")return out({ok:true,data:login(a[0],a[1])});
    const me=readToken(req.code);
    if(!me)return out({ok:false,auth:true,error:"Please log in again."});
    const admin=me.role==="admin"||FULL_NAMES.indexOf(String(me.name||"").trim().toLowerCase().split(/\s+/)[0])>=0;
    let data=null;
    if(req.fn==="getState"){
      const cur=ver();
      if(cur>0&&Number(a[0])===cur)data={same:true,ver:cur,role:me.role,name:me.name};
      else{const j=readState();data={ver:cur,json:j?(admin?j:scrub(j)):null,role:me.role,name:me.name}}
    }else if(req.fn==="putState"){
      const incoming=String(a[1]||"");
      if(incoming.length<2||incoming.length>MAX_LEN)fail("That is too large to save.");
      data=lock(()=>{
        const cur=ver();
        if(cur>0&&Number(a[0])!==cur)return {conflict:true,ver:cur};
        if(cur===0&&!admin)fail("Only the Director can load the first data.");
        let json=incoming;
        if(!admin&&cur>0){const st=readState();if(st)json=mergePriv(incoming,st)}
        JSON.parse(json);
        writeState(json);
        const nv=cur+1;PropertiesService.getScriptProperties().setProperty("VER",String(nv));
        return {ver:nv};
      });
    }else if(req.fn==="logError"){
      /* friendly error log from the app: one line per error in the "Errors" sheet (no student data) */
      const sh=SpreadsheetApp.getActive().getSheetByName("Errors")||SpreadsheetApp.getActive().insertSheet("Errors");
      sh.appendRow([new Date(),me.name,String(a[0]||"").slice(0,300),String(a[1]||"").slice(0,80),String(a[2]||"").slice(0,200)]);
      if(sh.getLastRow()>2000)sh.deleteRows(2,500);
      data=1;
    }else fail("unknown call");
    return out({ok:true,data:data});
  }catch(err){
    const m=String(err.message||err);
    return out({ok:false,error:m,auth:/log in again/i.test(m)});
  }
}
