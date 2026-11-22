/* ===== DCR Desk (Distribution & Collection Register) — server (Google Apps Script) =====
   Staff log in with the SAME name and password as the Diary app; this script asks the Diary API to check them,
   then hands back its own signed token (valid 120 days). No passwords are stored here.
   Sheet tabs: Docs (key | date | rowver | json chunks...), Roster (section | roll | name),
   Staff (name | role | dept), ClassTeachers (section | type ct/as | name).
   The student and staff lists live ONLY in the Sheet — never in the public page.
*/
const DIARY_API="https://script.google.com/macros/s/AKfycbyvWTDOKOQ8F0vD-oy9vchmq04GdhfZfgtpomgWg73rIa13gmkrFkpZsvQl9ISZKrSFQw/exec";
const TOKEN_DAYS=120, CHUNK=40000, COLS={dcr_rounds:1,dcr_ledger:1,dcr_config:1}, ID_RE=/^[A-Za-z0-9_\-]{1,80}$/;

function SS(){
  const sp=PropertiesService.getScriptProperties();let id=sp.getProperty("SSID");
  if(id)return SpreadsheetApp.openById(id);
  const ss=SpreadsheetApp.create("DCR Desk Data");sp.setProperty("SSID",ss.getId());return ss;
}
function setupDcr(){
  const ss=SS();
  const mk=(n,h)=>{if(!ss.getSheetByName(n))ss.insertSheet(n).appendRow(h)};
  mk("Docs",["key","date","rowver","json"]);mk("Roster",["section","roll","name"]);mk("Staff",["name","role","dept"]);mk("ClassTeachers",["section","type","name"]);
  const sp=PropertiesService.getScriptProperties();
  if(!sp.getProperty("SECRET"))sp.setProperty("SECRET",Utilities.getUuid()+Utilities.getUuid());
  if(!sp.getProperty("VER"))sp.setProperty("VER","1");
}
function out(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON)}
function doGet(){return ContentService.createTextOutput("DCR Desk API is running.")}
function b64(s){return Utilities.base64EncodeWebSafe(s)}
function sign(body){return b64(Utilities.computeHmacSha256Signature(body,PropertiesService.getScriptProperties().getProperty("SECRET")))}
function makeToken(name){const body=name+"|"+(Date.now()+TOKEN_DAYS*864e5);return b64(body)+"."+sign(body)}
function readToken(t){
  const p=String(t||"").split(".");if(p.length!==2)return null;
  let body;try{body=Utilities.newBlob(Utilities.base64DecodeWebSafe(p[0])).getDataAsString()}catch(e){return null}
  if(sign(body)!==p[1])return null;
  const q=body.split("|");if(Number(q[1])<Date.now())return null;
  return q[0];
}
function login(name,pw){
  name=String(name||"").trim().slice(0,60);
  if(!name||!pw)throw new Error("Type your name and password.");
  const r=UrlFetchApp.fetch(DIARY_API,{method:"post",contentType:"text/plain;charset=utf-8",payload:JSON.stringify({fn:"login",args:[name,String(pw)]}),muteHttpExceptions:true,followRedirects:true});
  let j;try{j=JSON.parse(r.getContentText())}catch(e){throw new Error("The Diary login could not be reached. Try again.")}
  if(!j||j.ok===false||j.error){const m=String((j&&j.error)||"");throw new Error(m||"Wrong name or password.")}
  return{token:makeToken(name),name:name};
}
function sheet(n){return SS().getSheetByName(n)}
function findRow(sh,key){
  if(sh.getLastRow()<2)return 0;
  const f=sh.getRange(2,1,sh.getLastRow()-1,1).createTextFinder(key).matchEntireCell(true).findNext();
  return f?f.getRow():0;
}
function bump(){const sp=PropertiesService.getScriptProperties();const v=Number(sp.getProperty("VER")||1)+1;sp.setProperty("VER",String(v));return v}
function okKey(col,id){return COLS[col]&&ID_RE.test(String(id))}

function doPost(e){
  try{
    const req=JSON.parse(e.postData.contents), a=req.args||[];
    if(req.fn==="login")return out({ok:true,data:login(a[0],a[1])});
    const who=readToken(req.code);
    if(!who)return out({ok:false,auth:true,error:"Please log in again."});
    let data=null;
    switch(req.fn){
      case "ping":data=true;break;
      case "directory":data=directory(who);break;
      case "sync":data=sync(a[0],a[1]);break;
      case "get":data=getDoc(a[0],a[1]);break;
      case "set":data=setDoc(a[0],a[1],a[2],who);break;
      case "del":data=delDoc(a[0],a[1],who);break;
      default:throw new Error("unknown call");
    }
    return out({ok:true,data:data});
  }catch(err){
    const m=String(err.message||err);
    return out({ok:false,error:m,auth:/password|name|login|approv/i.test(m)});
  }
}
function rows(n,cols){const sh=sheet(n);const k=sh.getLastRow()-1;return k<1?[]:sh.getRange(2,1,k,cols).getValues()}
function directory(who){
  const stu={};rows("Roster",3).forEach(r=>{const k=String(r[0]).trim();if(!k||!r[2])return;(stu[k]=stu[k]||[]).push([Number(r[1]),String(r[2])])});
  Object.keys(stu).forEach(k=>stu[k].sort((x,y)=>x[0]-y[0]));
  const staff=rows("Staff",3).filter(r=>r[0]).map(r=>[String(r[0]),String(r[1]||""),String(r[2]||"")]);
  const ct={};rows("ClassTeachers",3).forEach(r=>{const k=String(r[0]).trim();if(!k||!r[2])return;const o=ct[k]=ct[k]||{ct:[],as:[]};(String(r[1])==="as"?o.as:o.ct).push(String(r[2]))});
  const low=who.toLowerCase();const me=staff.find(s=>s[0].toLowerCase()===low)||staff.find(s=>s[0].toLowerCase().indexOf(low)===0);
  return{stu:stu,staff:staff,ct:ct,me:{name:me?me[0]:who,role:me?me[1]:""}};
}
function readDoc(sh,r){
  const w=sh.getLastColumn();if(w<4)return null;
  const parts=sh.getRange(r,4,1,w-3).getValues()[0].join("");
  try{return JSON.parse(parts)}catch(e){return null}
}
/* rows changed since version `ver`; rounds older than `cutoff` are skipped on a first load. Deleted docs come back as null. */
function sync(ver,cutoff){
  ver=Number(ver)||0;const cur=Number(PropertiesService.getScriptProperties().getProperty("VER")||1);
  if(ver===cur)return{same:true};
  const sh=sheet("Docs"), n=sh.getLastRow()-1, res={ver:cur,rows:{}};
  if(n<1)return res;
  const head=sh.getRange(2,1,n,3).getValues();
  head.forEach((h,i)=>{
    const key=String(h[0]);if(Number(h[2])<=ver)return;
    if(ver===0&&key.indexOf("dcr_rounds/")===0&&cutoff&&String(h[1])&&String(h[1])<String(cutoff))return;
    res.rows[key]=readDoc(sh,i+2);
  });
  return res;
}
function getDoc(col,id){
  if(!okKey(col,id))throw new Error("bad key");
  const sh=sheet("Docs"), r=findRow(sh,col+"/"+id);return r?readDoc(sh,r):null;
}
function setDoc(col,id,obj,who){
  if(!okKey(col,id))throw new Error("bad key");
  if(obj===null||typeof obj!=="object"||Array.isArray(obj))throw new Error("bad data");
  const j=JSON.stringify(obj);if(j.length>CHUNK*20)throw new Error("too large");
  const chunks=[];for(let i=0;i<j.length;i+=CHUNK)chunks.push(j.slice(i,i+CHUNK));
  const lock=LockService.getScriptLock();lock.waitLock(25000);
  try{
    const sh=sheet("Docs"), key=col+"/"+id, v=bump();let r=findRow(sh,key);
    const need=3+chunks.length;if(sh.getMaxColumns()<need)sh.insertColumnsAfter(sh.getMaxColumns(),need-sh.getMaxColumns());
    if(!r){r=sh.getLastRow()+1}else sh.getRange(r,4,1,Math.max(1,sh.getMaxColumns()-3)).clearContent();
    sh.getRange(r,1,1,3).setValues([[key,String(obj.date||""),v]]);
    sh.getRange(r,4,1,chunks.length).setValues([chunks]);
  }finally{lock.releaseLock()}
  return true;
}
function delDoc(col,id,who){
  if(!okKey(col,id))throw new Error("bad key");
  const lock=LockService.getScriptLock();lock.waitLock(25000);
  try{
    const sh=sheet("Docs"), r=findRow(sh,col+"/"+id);if(!r)return true;
    sh.getRange(r,4,1,Math.max(1,sh.getMaxColumns()-3)).clearContent();
    sh.getRange(r,2,1,2).setValues([["",bump()]]);sh.getRange(r,4).setValue("null");
  }finally{lock.releaseLock()}
  return true;
}
