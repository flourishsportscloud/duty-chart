/* ===== Parent Connect — server (Google Apps Script) =====
   Staff log in with the SAME name and password as the Diary app (checked against the Diary API); this script then
   hands back its own signed token (120 days). No passwords are stored here.
   READ ONLY on "Feedback 2026" and "Diary Report Data": this script never writes to either sheet.
   It keeps its own working data (follow-ups, calls made, remarks, acknowledgements, added feedback, request tags,
   profiles) in its own Sheet "Parent Connect Data" (tab Docs).
*/
const DIARY_API="https://script.google.com/macros/s/AKfycbyvWTDOKOQ8F0vD-oy9vchmq04GdhfZfgtpomgWg73rIa13gmkrFkpZsvQl9ISZKrSFQw/exec";
const FB_ID="1DAx096q0BtPAEsBI2AAtxYtGyEmHEXqFaLpghy_rhSA", DR_ID="1S7VX3L-TYGNfi5_dd3HyktdH1u7o-9gb_uXTMV8mpwI";
const INSIGHT_FOLDER="18E5lzm0RMhPP5hTqMBzmDHr8gEHATiZV";
const TOKEN_DAYS=120, CHUNK=40000, DATA_TTL=600, ID_RE=/^[\w\-.: ]{1,100}$/;
const COLS={followups:1,calls:1,remarks:1,added:1,acks:1,callreq:1,retag:1,profiles:1};

function SS(){
  const sp=PropertiesService.getScriptProperties();let id=sp.getProperty("SSID");
  if(id)return SpreadsheetApp.openById(id);
  const ss=SpreadsheetApp.create("Parent Connect Data");sp.setProperty("SSID",ss.getId());return ss;
}
function setupParentConnect(){
  const ss=SS();
  if(!ss.getSheetByName("Docs"))ss.insertSheet("Docs").appendRow(["key","date","rowver","json"]);
  const sp=PropertiesService.getScriptProperties();
  if(!sp.getProperty("SECRET"))sp.setProperty("SECRET",Utilities.getUuid()+Utilities.getUuid());
  if(!sp.getProperty("VER"))sp.setProperty("VER","1");
  // touch both source sheets once so Google asks for permission now (read only)
  SpreadsheetApp.openById(FB_ID).getName();SpreadsheetApp.openById(DR_ID).getName();
  DriveApp.getFolderById(INSIGHT_FOLDER).getName();
}
function out(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON)}
function doGet(){return ContentService.createTextOutput("Parent Connect API is running.")}
function b64(s){return Utilities.base64EncodeWebSafe(s)}
function sign(body){return b64(Utilities.computeHmacSha256Signature(body,PropertiesService.getScriptProperties().getProperty("SECRET")))}
function makeToken(name,role){const body=name+"|"+(Date.now()+TOKEN_DAYS*864e5)+"|"+role;return b64(body)+"."+sign(body)}
function readToken(t){
  const p=String(t||"").split(".");if(p.length!==2)return null;
  let body;try{body=Utilities.newBlob(Utilities.base64DecodeWebSafe(p[0])).getDataAsString()}catch(e){return null}
  if(sign(body)!==p[1])return null;
  const q=body.split("|");if(Number(q[1])<Date.now())return null;
  return{name:q[0],role:q[2]||""};
}
function login(name,pw){
  name=String(name||"").trim().slice(0,60);
  if(!name||!pw)throw new Error("Type your name and password.");
  const r=UrlFetchApp.fetch(DIARY_API,{method:"post",contentType:"text/plain;charset=utf-8",payload:JSON.stringify({fn:"login",args:[name,String(pw)]}),muteHttpExceptions:true,followRedirects:true});
  let j;try{j=JSON.parse(r.getContentText())}catch(e){throw new Error("The Diary login could not be reached. Try again.")}
  if(!j||j.ok===false||j.error){const m=String((j&&j.error)||"");throw new Error(m||"Wrong name or password.")}
  const me=(j.data&&j.data.state&&j.data.state.me)||{};
  const nm=String(me.name||name),role=String(me.role||"");
  return{token:makeToken(nm,role),name:nm,role:role};
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
      case "ping":data={name:who.name,role:who.role};break;
      case "data":data=getData(!!a[0]);break;
      case "insightIndex":data=insightIndex();break;
      case "insight":data=insightFile(a[0]);break;
      case "sync":data=sync(a[0]);break;
      case "get":data=getDoc(a[0],a[1]);break;
      case "set":data=setDoc(a[0],a[1],a[2],who);break;
      case "del":data=delDoc(a[0],a[1],who);break;
      default:throw new Error("unknown call");
    }
    return out({ok:true,data:data});
  }catch(err){
    const m=String(err.message||err);
    return out({ok:false,error:m,auth:/password|login|approv|wrong name/i.test(m)});
  }
}

/* ---------- Feedback 2026 and Diary Report Data (read only) ---------- */
function cellV(v,tz){
  if(v instanceof Date){
    const y=Number(Utilities.formatDate(v,tz,"yyyy"));
    if(y<1950){const p=Utilities.formatDate(v,tz,"HH:mm:ss").split(":");return(Number(p[0])*3600+Number(p[1])*60+Number(p[2]))/86400}
    const q=Utilities.formatDate(v,tz,"yyyy-MM-dd").split("-");
    return Math.round(Date.UTC(Number(q[0]),Number(q[1])-1,Number(q[2]))/864e5)+25569;
  }
  return(v===""||v===undefined)?null:v;
}
function readTabs(id,match){
  const ss=SpreadsheetApp.openById(id),tz=ss.getSpreadsheetTimeZone(),o={};
  ss.getSheets().forEach(sh=>{
    const n=sh.getName();if(!match.some(w=>n.trim().toLowerCase().indexOf(w)===0))return;
    const vals=sh.getDataRange().getValues();
    o[n]=vals.map(r=>{const a=[];for(let i=0;i<r.length;i++)a[i]=cellV(r[i],tz);return a});
  });
  return o;
}
function buildData(){
  const a=readTabs(FB_ID,["feedback updated","hradm","others","in house","changes"]);
  const b=readTabs(DR_ID,["roster","marks"]);
  const d=LV.diff(a,b,{fb:[],calls:[],changes:[],diary:[]});
  return{at:Date.now(),fb:d.fb,calls:d.calls,changes:d.changes,diary:d.diary};
}
function cachePut(key,str){
  const c=CacheService.getScriptCache(),n=Math.ceil(str.length/30000),o={};
  for(let i=0;i<n;i++)o[key+"_"+i]=str.slice(i*30000,(i+1)*30000);
  o[key+"_n"]=String(n);c.putAll(o,DATA_TTL);
}
function cacheGet(key){
  const c=CacheService.getScriptCache(),n=Number(c.get(key+"_n")||0);if(!n)return null;
  const ks=[];for(let i=0;i<n;i++)ks.push(key+"_"+i);
  const m=c.getAll(ks);let s="";for(let i=0;i<n;i++){if(m[key+"_"+i]==null)return null;s+=m[key+"_"+i]}
  return s;
}
function getData(force){
  const c=CacheService.getScriptCache();let s=cacheGet("pcdata");
  if(s&&force){const at=Number(c.get("pcdata_at")||0);if(Date.now()-at<60000)force=false}
  if(s&&!force)return JSON.parse(s);
  const lock=LockService.getScriptLock();lock.waitLock(60000);
  try{
    s=cacheGet("pcdata");if(s&&!force)return JSON.parse(s);
    const d=buildData();cachePut("pcdata",JSON.stringify(d));c.put("pcdata_at",String(Date.now()),DATA_TTL);return d;
  }finally{lock.releaseLock()}
}

/* ---------- Parent Insight charts (PDF files in the Drive folder) ---------- */
function insightIndex(){
  const c=CacheService.getScriptCache(),h=c.get("insidx");if(h)return JSON.parse(h);
  const it=DriveApp.getFolderById(INSIGHT_FOLDER).getFiles(),m={};
  while(it.hasNext()){const f=it.next(),n=/^Class_(.+?)_Parent_Insight_Chart\.pdf$/.exec(f.getName());if(n)m[n[1]]=f.getId()}
  c.put("insidx",JSON.stringify(m),3600);return m;
}
function insightFile(id){
  const idx=insightIndex(),ok=Object.keys(idx).some(k=>idx[k]===id);if(!ok)throw new Error("not an insight chart");
  const f=DriveApp.getFileById(id);return{b64:Utilities.base64Encode(f.getBlob().getBytes()),at:f.getLastUpdated().getTime()};
}

/* ---------- shared working data (own sheet) ---------- */
function rowsOf(sh,r,n){return sh.getRange(r,1,n,3).getValues()}
function readDoc(sh,r){
  const w=sh.getLastColumn();if(w<4)return null;
  const parts=sh.getRange(r,4,1,w-3).getValues()[0].join("");
  try{return JSON.parse(parts)}catch(e){return null}
}
function sync(ver){
  ver=Number(ver)||0;const cur=Number(PropertiesService.getScriptProperties().getProperty("VER")||1);
  if(ver===cur)return{same:true};
  const sh=sheet("Docs"), n=sh.getLastRow()-1, res={ver:cur,rows:{}};
  if(n<1)return res;
  const head=rowsOf(sh,2,n);
  head.forEach((h,i)=>{if(Number(h[2])<=ver)return;res.rows[String(h[0])]=readDoc(sh,i+2)});
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
    sh.getRange(r,1,1,3).setValues([[key,"",v]]);
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

/* ---------- sheet readers and mappers (same rules as the app's own tests) ---------- */
const LV={};
/* ---------- helpers ---------- */
const pad=n=>String(n).padStart(2,'0');
const isoD=v=>{if(v==null||v==='')return'';if(typeof v==='number'){const d=new Date(Math.round((v-25569)*864e5));return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate())}
  const s=String(v).trim(),m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s);if(m)return m[1]+'-'+m[2]+'-'+m[3];const m2=/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/.exec(s);return m2?m2[3]+'-'+pad(m2[2])+'-'+pad(m2[1]):''};
const hm=v=>{if(v==null||v==='')return'';if(typeof v==='number'){const t=Math.round((v%1)*1440);return pad(Math.floor(t/60)%24)+':'+pad(t%60)}return String(v).trim()};
const S=v=>v==null?'':String(v).replace(/\s+/g,' ').trim();
const T=v=>v==null?'':String(v).trim();
const cbase=c=>{const m=(c||'').match(/^(PG|Nur|LKG|UKG|\d+)/);return m?m[1]:'—'};
function grpOf(c){const b=cbase(c);if(['PG','Nur','LKG','UKG'].includes(b))return'Pre-Primary';const n=+b;return!n?'':n<=2?'Class 1-2':n<=5?'Class 3-5':n<=7?'Class 6-7':n<=9?'Class 8-9':n<=11?'Class 10-11':''}
function normClass(v){
  if(v==null||v==='')return'—';if(typeof v==='number')return String(v)+'A';
  let s=String(v).replace(/\./g,'').replace(/\s+/g,'').toUpperCase();if(!s)return'—';
  let m=/^(NUR|PG|LKG|UKG)([A-C]?)$/.exec(s);if(m)return(m[1]==='NUR'?'Nur':m[1])+(m[2]?(m[1]==='PG'?' ':' ')+m[2]:'');
  m=/^(\d{1,2})([A-E]?)$/.exec(s);if(m)return m[1]+m[2];
  return String(v).trim();
}
const canon=(v,list,dflt)=>{const s=S(v).toLowerCase();if(!s)return dflt;for(const k of list)if(k.toLowerCase()===s)return k;return null};
const TYPES=['Informative Update','Request','Concern','Complain','Query','Enquiry','Call Arrange','Unmarked'];
function normType(v){const s=S(v);if(!s)return'Unmarked';const l=s.toLowerCase();const c=canon(s,TYPES);if(c)return c;
  if(/^inf/.test(l))return'Informative Update';if(/^req/.test(l))return'Request';if(/^conc/.test(l))return'Concern';if(/^compl/.test(l))return'Complain';if(/^que/.test(l))return'Query';if(/^enq/.test(l))return'Enquiry';if(/^call/.test(l))return'Call Arrange';return s}
const DEPT={activity:'Co Curricular','co curricular':'Co Curricular','co-curricular':'Co Curricular',behaviour:'Behavioural',behavioural:'Behavioural',exams:'Exam',exam:'Exam'};
function normDept(v){const s=S(v);if(!s)return'Unassigned';const l=s.toLowerCase();return DEPT[l]||s.replace(/\b([a-z])/g,(m,a)=>a.toUpperCase()).replace(/^Lost & found$/i,'Lost & Found')}
function normMode(v){const l=S(v).toLowerCase();if(/^st/.test(l))return'Studybase';if(/^di|^dia/.test(l))return'Diary';if(/^de/.test(l))return'Desk';if(/^ca|^cal/.test(l))return'Call';return S(v)||'Other'}
function normPrio(v){const l=S(v).toLowerCase();if(!l)return'';if(/med/.test(l))return'Medium';if(/hi/.test(l))return'High';if(/lo/.test(l))return'Low';return''}
const SUBJ=[['Maths',/\bmaths?\b|mathematics/i],['Hindi',/\bhindi\b/i],['English',/\benglish\b|\beng\b/i],['SST',/\bsst\b|social science|\bs\.?st\b/i],['Science',/\bscience\b|physics|chemistry|biology/i],['Computer',/\bcomputer\b/i],['Sanskrit',/\bsanskrit\b/i],['French/German',/\bfrench\b|\bgerman\b/i]];
function subs(dept,text){const a=[];for(const[k,re]of SUBJ)if(re.test(text))a.push(k);if(!a.length&&dept==='Academics')a.push('Academics');return a}
/* ---------- mappers ---------- */
LV.mapFeedback=function(rows){
  const out=[];
  for(let i=1;i<rows.length;i++){const r=rows[i]||[];if(![r[1],r[2],r[3],r[4],r[5],r[6],r[7],r[8]].some(x=>x!=null&&x!==''))continue;
    const sn=typeof r[0]==='number'?Math.round(r[0]):null;if(sn==null)continue;
    const c=normClass(r[3]),dp=normDept(r[5]),text=T(r[8]);
    out.push(['F'+sn,isoD(r[1]),S(r[2]),c,grpOf(c),dp,normType(r[6]),normMode(r[7]),text,normPrio(r[9]),0,0,T(r[12]),subs(dp,text),0,0]);
    out[out.length-1][10]=/^yes/i.test(T(r[11]))?1:0;
  }
  return out;
};
LV.mapHR=function(rows){
  const out=[];for(let i=1;i<rows.length;i++){const r=rows[i]||[];if(!r[1]&&!r[4])continue;let dp=normDept(r[2]);if(!/^(Admission|HR)$/i.test(dp))dp='Admission';
    out.push(['A'+(i-1),isoD(r[1]),'Enquiry','—','',dp,'Enquiry',normMode(r[3]),T(r[4]),normPrio(r[5]),0,0,T(r[8]),[],0,0])}
  return out;
};
LV.mapOthers=function(rows){
  const out=[];for(let i=1;i<rows.length;i++){const r=rows[i]||[];if(!r[1]&&!r[8])continue;
    out.push(['O'+(i-1),isoD(r[1]),S(r[2])||'Others','—','',normDept(r[5])==='Unassigned'?'Others':normDept(r[5]),'Unmarked',S(r[7])?normMode(r[7]):'Other',T(r[8]),normPrio(r[9]),0,0,T(r[12]),[],0,0])}
  return out;
};
LV.mapCalls=function(rows){
  const out=[];let ld='';for(let i=1;i<rows.length;i++){const r=rows[i]||[];if(!r[2]&&!r[5])continue;const c=normClass(r[3]);if(r[1])ld=isoD(r[1]);
    out.push(['C'+(i-1),ld,S(r[2]),c,grpOf(c),normDept(r[4]),T(r[5]),hm(r[6]),hm(r[7]),S(r[8]),S(r[9]),T(r[10])])}
  return out;
};
LV.mapChanges=function(rows){
  const out=[];for(let i=2;i<rows.length;i++){const r=rows[i]||[];if(!r[1])continue;const c=normClass(r[2]);
    out.push(['H'+(i-2),isoD(r[0]),S(r[1]),c,grpOf(c),S(r[3]),S(r[4]),S(r[5]),S(r[6]),S(r[7])])}
  return out;
};
/* diary app */
const DHEALTH=/fever|\bill\b|illness|health|medicine|tablet|pain|\bsick|doctor|eye drop|cough|cold|vomit|injur|infection|allerg|rash|stomach|headache|unwell|not well|hospital/i;
const DUNI=/uniform|shoe|\btie\b|belt|sock|id card|i'?d card|sweater|blazer|\bcap\b|jacket|holder|strap|cardigan|\bpt\b|dress/i;
const DSTAY=/stay ?back|staying back|stay back|will not stay|not stay|leave|absent|holiday|will not come|not come|won'?t come/i;
const DTRANS=/\bbus\b|\bvan\b|pick(ing)? ?up|\bdrop|by walk|\bauto\b|vehicle|transport|walk(ing)? home|send (him|her) home/i;
const DACAD=/homework|home work|assignment|book review|syllabus|lesson|maths|hindi|english|science|\bsst\b|\btest\b|exam|register|notebook|copy|submit|study|marks|project|worksheet|chapter|grammar|abacus/i;
const DREQ=/please|plz|kindly|request|permission|allow|can you|could you|want to|wants to|needs? to|\?|arrange|inform|send/i;
function diaryClass(t){const dp=DHEALTH.test(t)?'Health':DUNI.test(t)?'Uniform':DSTAY.test(t)?'Leave':DTRANS.test(t)?'Transport':DACAD.test(t)?'Academics':'General';return[dp,DREQ.test(t)?'Request':'Informative Update']}
LV.mapDiary=function(sheets){
  const ro={};for(const r of (sheets.Roster||[]).slice(1)){if(!r||r[0]==null)continue;try{ro[String(parseInt(r[0]))]=JSON.parse(r[1])}catch(e){}}
  const out=[];
  for(const r of (sheets.Marks||[]).slice(1)){if(!r||!r[1])continue;let j;try{j=JSON.parse(r[3])}catch(e){continue}
    const date=isoD(r[1]),cls=String(parseInt(r[2]));
    for(const k of Object.keys(j)){const m=/^([A-Z])-(\d+)$/.exec(k);if(!m)continue;const v=j[k];if(!v||!v.r||!String(v.r).trim())continue;
      const sec=m[1],roll=+m[2],nm=((ro[cls]||{})[sec]||[])[roll-1]||('Roll '+roll),c=cls+sec,t=String(v.r).trim(),[dp,ty]=diaryClass(t);
      out.push(['DK'+date+'_'+c+'_'+roll,date,nm,c,grpOf(c),dp,ty,'Diary',t,'Low',0,0,'',[],0,0,v.u||'']);}
  }
  out.sort((a,b)=>a[1]<b[1]?-1:a[1]>b[1]?1:0);
  return out;
};
/* ---------- compare with snapshot: return only new rows ---------- */
const num=(id)=>+String(id).replace(/\D/g,'');
function maxOf(rows,p){let m=-1;for(const r of rows)if(r[0][0]===p){const n=num(r[0]);if(n>m)m=n}return m}
const nk=t=>String(t||'').toLowerCase().replace(/\s+/g,' ').trim().slice(0,80);
LV.diff=function(feedbackSheets,diarySheets,snap){
  const find=(o,p)=>{const k=Object.keys(o).find(n=>n.trim().toLowerCase().startsWith(p));return k?o[k]:null};
  const out={fb:[],calls:[],changes:[],diary:[]};
  const L=r=>r.slice();
  if(feedbackSheets){
    const fk=new Set(snap.fb.map(r=>r[1]+'|'+nk(r[2])+'|'+nk(r[8])));
    const f=find(feedbackSheets,'feedback updated'),h=find(feedbackSheets,'hradm'),o=find(feedbackSheets,'others'),c=find(feedbackSheets,'in house'),g=find(feedbackSheets,'changes');
    [f&&LV.mapFeedback(f),h&&LV.mapHR(h),o&&LV.mapOthers(o)].forEach(a=>(a||[]).forEach(r=>{const k=r[1]+'|'+nk(r[2])+'|'+nk(r[8]);if(r[1]&&!fk.has(k)){fk.add(k);out.fb.push(L(r))}}));
    const ck=new Set(snap.calls.map(r=>r[1]+'|'+nk(r[2])+'|'+nk(r[6])));
    if(c)LV.mapCalls(c).forEach(r=>{const k=r[1]+'|'+nk(r[2])+'|'+nk(r[6]);if(r[1]&&!ck.has(k)){ck.add(k);out.calls.push(L(r))}});
    const hk=new Set(snap.changes.map(r=>r[1]+'|'+nk(r[2])+'|'+nk(r[7])+'|'+nk(r[8])));
    if(g)LV.mapChanges(g).forEach(r=>{const k=r[1]+'|'+nk(r[2])+'|'+nk(r[7])+'|'+nk(r[8]);if(r[1]&&!hk.has(k)){hk.add(k);out.changes.push(L(r))}});
  }
  if(diarySheets){
    const keys=new Set(snap.diary.map(r=>r[1]+'|'+r[3]+'|'+String(r[2]).toLowerCase()));
    LV.mapDiary(diarySheets).forEach(r=>{if(!keys.has(r[1]+'|'+r[3]+'|'+String(r[2]).toLowerCase()))out.diary.push(r)});
  }
  return out;
};
