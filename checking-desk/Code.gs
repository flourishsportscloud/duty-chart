/* ===== Checking Desk — server (Google Apps Script) =====
   One Sheet holds everything. Tabs (created by setupCheckingDesk): Docs, Photos.
   Docs: path | date | json   (path e.g. days/2026-11-20__S6, config/roster, config/theme)
   Photos: id | chunk1 | chunk2 ...   (error photos, as JPEG data URLs)
   Every call must carry the staff code, which is kept in Script Properties (STAFF_CODE).
*/
const CHUNK=40000, MAX_PHOTO=600000, PHOTO_ID=/^p_[a-z0-9]{6,24}$/, DATA_URL=/^data:image\/(jpeg|png);base64,[A-Za-z0-9+\/=]+$/;
const CODE_TO_SET="CHANGE-ME";   // edit this, run setupCheckingDesk once, then change it back to "CHANGE-ME" (the code lives in Script Properties)

function setupCheckingDesk(){
  const ss=SpreadsheetApp.getActive();
  if(!ss.getSheetByName("Docs"))ss.insertSheet("Docs").appendRow(["path","date","json"]);
  if(!ss.getSheetByName("Photos"))ss.insertSheet("Photos").appendRow(["id","chunks"]);
  const sp=PropertiesService.getScriptProperties();
  if(CODE_TO_SET&&CODE_TO_SET!=="CHANGE-ME")sp.setProperty("STAFF_CODE",CODE_TO_SET);
  if(!sp.getProperty("VER"))sp.setProperty("VER","1");
}
function out(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON)}
function doGet(){return ContentService.createTextOutput("Checking Desk API is running.")}
function same(a,b){a=String(a);b=String(b);if(a.length!==b.length)return false;let r=0;for(let i=0;i<a.length;i++)r|=a.charCodeAt(i)^b.charCodeAt(i);return r===0}
function merge(a,b){
  if(b===null||typeof b!=="object"||Array.isArray(b))return b;
  const o=(a&&typeof a==="object"&&!Array.isArray(a))?a:{};
  Object.keys(b).forEach(k=>{o[k]=merge(o[k],b[k])});return o;
}
function sheet(n){return SpreadsheetApp.getActive().getSheetByName(n)}
function findRow(sh,path){
  const f=sh.getRange(2,1,Math.max(sh.getLastRow()-1,1),1).createTextFinder(path).matchEntireCell(true).findNext();
  return f?f.getRow():0;
}
function dateOf(path){const m=/^days\/(\d{4}-\d{2}-\d{2})__/.exec(path);return m?m[1]:""}
function okPath(p){return /^days\/\d{4}-\d{2}-\d{2}__[A-Za-z0-9]{1,6}$/.test(p)||p==="config/roster"||p==="config/theme"}

function doPost(e){
  try{
    const req=JSON.parse(e.postData.contents), sp=PropertiesService.getScriptProperties();
    const want=sp.getProperty("STAFF_CODE");
    if(!want||!same(req.code||"",want))return out({ok:false,auth:true,error:"code"});
    const a=req.args||[];
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
  }catch(err){return out({ok:false,error:String(err.message||err)})}
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
      const j=sh.getRange(i+2,3).getValue();
      let v=null;try{v=JSON.parse(j)}catch(x){}
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
    if(row){
      if(op==="update"){let cur={};try{cur=JSON.parse(sh.getRange(row,3).getValue())||{}}catch(x){}next=merge(cur,obj)}
      const j=JSON.stringify(next);if(j.length>48000)throw new Error("too large");
      sh.getRange(row,3).setValue(j);
    }else{
      const j=JSON.stringify(next);if(j.length>48000)throw new Error("too large");
      sh.appendRow([path,dateOf(path),j]);
    }
    const sp=PropertiesService.getScriptProperties();
    sp.setProperty("VER",String(Number(sp.getProperty("VER")||1)+1));
  }finally{lock.releaseLock()}
  return true;
}
function putPhoto(id,url){
  if(!PHOTO_ID.test(String(id))||!DATA_URL.test(String(url))||url.length>MAX_PHOTO)throw new Error("bad photo");
  const sh=sheet("Photos");
  if(findRow(sh,id))return true;
  const parts=[id];for(let i=0;i<url.length;i+=CHUNK)parts.push(url.slice(i,i+CHUNK));
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{sh.appendRow(parts)}finally{lock.releaseLock()}
  return true;
}
function getPhoto(id){
  if(!PHOTO_ID.test(String(id)))throw new Error("bad photo");
  const sh=sheet("Photos"), row=findRow(sh,id);
  if(!row)throw new Error("not found");
  return sh.getRange(row,2,1,sh.getLastColumn()-1).getValues()[0].join("");
}
