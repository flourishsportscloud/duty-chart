/* ===== Checking Desk — server (Google Apps Script) =====
   Staff log in with the SAME name and password as the Diary app: this script asks the Diary API to check them,
   then hands back its own signed token (valid 120 days). Nothing is stored about passwords here.
   Sheet tabs (made by setupCheckingDesk): Docs (path | date | json) and Photos (id | chunks...).
*/
const DIARY_API="https://script.google.com/macros/s/AKfycbyvWTDOKOQ8F0vD-oy9vchmq04GdhfZfgtpomgWg73rIa13gmkrFkpZsvQl9ISZKrSFQw/exec";
const TOKEN_DAYS=120, CHUNK=40000, MAX_PHOTO=600000, PHOTO_ID=/^p_[a-z0-9]{6,24}$/, DATA_URL=/^data:image\/(jpeg|png);base64,[A-Za-z0-9+\/=]+$/;

function SS(){
  const sp=PropertiesService.getScriptProperties();let id=sp.getProperty("SSID");
  if(id)return SpreadsheetApp.openById(id);
  const ss=SpreadsheetApp.create("Checking Desk Data");sp.setProperty("SSID",ss.getId());return ss;
}
function setupCheckingDesk(){
  const ss=SS();
  if(!ss.getSheetByName("Docs"))ss.insertSheet("Docs").appendRow(["path","date","json"]);
  if(!ss.getSheetByName("Photos"))ss.insertSheet("Photos").appendRow(["id","chunks"]);
  const sp=PropertiesService.getScriptProperties();
  if(!sp.getProperty("SECRET"))sp.setProperty("SECRET",Utilities.getUuid()+Utilities.getUuid());
  if(!sp.getProperty("VER"))sp.setProperty("VER","1");
}
function out(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON)}
function doGet(){return ContentService.createTextOutput("Checking Desk API is running.")}
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
function merge(a,b){
  if(b===null||typeof b!=="object"||Array.isArray(b))return b;
  const o=(a&&typeof a==="object"&&!Array.isArray(a))?a:{};
  Object.keys(b).forEach(k=>{o[k]=merge(o[k],b[k])});return o;
}
function sheet(n){return SS().getSheetByName(n)}
function findRow(sh,key){
  if(sh.getLastRow()<2)return 0;
  const f=sh.getRange(2,1,sh.getLastRow()-1,1).createTextFinder(key).matchEntireCell(true).findNext();
  return f?f.getRow():0;
}
function dateOf(path){const m=/^days\/(\d{4}-\d{2}-\d{2})__/.exec(path);return m?m[1]:""}
function okPath(p){return /^days\/\d{4}-\d{2}-\d{2}__[A-Za-z0-9]{1,6}$/.test(p)||p==="config/roster"||p==="config/theme"||p==="config/staff"}

function doPost(e){
  try{
    const req=JSON.parse(e.postData.contents), a=req.args||[];
    if(req.fn==="login")return out({ok:true,data:login(a[0],a[1])});
    const who=readToken(req.code);
    if(!who)return out({ok:false,auth:true,error:"Please log in again."});
    let data=null;
    switch(req.fn){
      case "ping":data=true;break;
      case "sync":data=sync(a[0],a[1]);break;
      case "set":case "update":data=write(req.fn,a[0],a[1]);break;
      case "putPhoto":data=putPhoto(a[0],a[1]);break;
      case "getPhoto":data=getPhoto(a[0]);break;
      default:throw new Error("unknown call");
    }
    return out({ok:true,data:data});
  }catch(err){
    const m=String(err.message||err);
    return out({ok:false,error:m,auth:/password|name|login|approv/i.test(m)});
  }
}
function sync(ver,dates){
  const sp=PropertiesService.getScriptProperties(), cur=Number(sp.getProperty("VER")||1);
  if(Number(ver)===cur)return{same:true};
  const sh=sheet("Docs"), n=sh.getLastRow()-1, res={ver:cur,days:{},docs:{}};
  if(n<1)return res;
  const head=sh.getRange(2,1,n,2).getValues(), set={};
  (dates||[]).forEach(d=>{set[String(d)]=1});
  head.forEach((r,i)=>{
    const p=String(r[0]);
    if(p.indexOf("config/")===0||set[String(r[1])]){
      let v=null;try{v=JSON.parse(sh.getRange(i+2,3).getValue())}catch(x){}
      if(v){if(p.indexOf("days/")===0)res.days[p.slice(5)]=v;else res.docs[p]=v}
    }
  });
  return res;
}
function write(op,path,obj){
  if(!okPath(path))throw new Error("bad path");
  if(obj===null||typeof obj!=="object"||Array.isArray(obj))throw new Error("bad data");
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const sh=sheet("Docs"), row=findRow(sh,path);
    let next=obj;
    if(row&&op==="update"){let cur={};try{cur=JSON.parse(sh.getRange(row,3).getValue())||{}}catch(x){}next=merge(cur,obj)}
    const j=JSON.stringify(next);if(j.length>48000)throw new Error("too large");
    if(row)sh.getRange(row,3).setValue(j);else sh.appendRow([path,dateOf(path),j]);
    const sp=PropertiesService.getScriptProperties();
    sp.setProperty("VER",String(Number(sp.getProperty("VER")||1)+1));
  }finally{lock.releaseLock()}
  return true;
}
function putPhoto(id,url){
  if(!PHOTO_ID.test(String(id))||!DATA_URL.test(String(url))||url.length>MAX_PHOTO)throw new Error("bad photo");
  const sh=sheet("Photos");
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    if(findRow(sh,id))return true;
    const parts=[id];for(let i=0;i<url.length;i+=CHUNK)parts.push(url.slice(i,i+CHUNK));
    sh.appendRow(parts);
  }finally{lock.releaseLock()}
  return true;
}
function getPhoto(id){
  if(!PHOTO_ID.test(String(id)))throw new Error("bad photo");
  const sh=sheet("Photos"), row=findRow(sh,id);
  if(!row)throw new Error("not found");
  return sh.getRange(row,2,1,sh.getLastColumn()-1).getValues()[0].join("");
}
