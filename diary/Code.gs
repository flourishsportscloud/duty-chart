/* ===== Diary Report — server logic (runs inside Google Apps Script) =====
   Rules are enforced here, on Google's side, not in the browser:
   - passwords are stored only as salted hashes in the Users sheet
   - Class Managers (cm) mark diaries; Class incharges (pl) log actions; Admin does everything and sends SMS
   - the first admin is approved automatically; every other login needs one approval from an admin
   - action and SMS times are stamped by the server, so nobody can back-date them
*/
const ROLES=["cm","pl","admin"];
const CATS=["rem","def","eng","sig","beh"];
const TOKEN_DAYS=120;
const WINDOW_DAYS=35;       // state() sends this many days back from the date being viewed
const BACKDATE_DAYS=30;     // marks can be entered or corrected up to 30 days back
const TZ="Asia/Kolkata";

function fail(m){throw new Error(m)}
function str(v,max){return String(v==null?"":v).trim().slice(0,max)}
function isoDate(v){return /^\d{4}-\d\d-\d\d$/.test(String(v||""))}
function addDays(iso,n){const d=new Date(iso+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}

function hashPw(H,salt,pw){let h=salt+"|"+pw;for(let i=0;i<500;i++)h=H.sha(h+"|"+salt);return h}
function makeToken(H,secret,u,now){const exp=now+TOKEN_DAYS*864e5;const body=u.name+"|"+exp+"|"+u.ver;return H.b64(body)+"."+H.hmac(body,secret)}
function readToken(H,secret,DB,token,now){
  if(!token)return null;
  const [b,sig]=String(token).split(".");if(!b||!sig)return null;
  let body;try{body=H.unb64(b)}catch(e){return null}
  if(H.hmac(body,secret)!==sig)return null;
  const [name,exp,ver]=body.split("|");
  if(Number(exp)<now)return null;
  const u=DB.Users.find(x=>x.name===name);
  if(!u||u.status!=="active"||String(u.ver)!==ver)return null;
  return u;
}
function needUser(ctx,token){const u=readToken(ctx.H,ctx.secret,ctx.DB,token,ctx.now);if(!u)fail("Please log in again.");return u}
function needAdmin(ctx,token){const u=needUser(ctx,token);if(u.role!=="admin")fail("Only the admin can do this.");return u}
function needMarker(ctx,token){const u=needUser(ctx,token);if(u.role!=="cm"&&u.role!=="admin")fail("Only a Class Manager or the admin can mark the diary.");return u}
function needPL(ctx,token){const u=needUser(ctx,token);if(u.role!=="pl"&&u.role!=="admin")fail("Only a class incharge (PL) or the admin can log an action.");return u}

function cleanMark(x,me){
  if(!x||typeof x!=="object")return null;
  const o={};
  ["a","d"].forEach(f=>{if(x[f])o[f]=1});
  ["e","s","b"].forEach(f=>{const v=Number(x[f]);if(v===1||v===2)o[f]=v});
  if(typeof x.r==="string"&&x.r.trim())o.r=x.r.trim().slice(0,500);
  if(!Object.keys(o).length)return null;
  if(x.t&&typeof x.t==="object"){
    const t={};["a","d","e","s","b","r"].forEach(f=>{const v=Number(x.t[f]);if(v>0&&isFinite(v)&&o[f])t[f]=v});
    if(Object.keys(t).length)o.t=t;
  }
  return o;
}

function publicState(ctx,me,to,have){
  const today=ctx.today;
  if(!me)return {today,me:null,users:[],docs:{},acts:{},sms:{},roster:null,rosterVer:""};
  to=isoDate(to)&&to<=today?to:today;
  const from=addDays(to,-WINDOW_DAYS),docs={},acts={},sms={};
  readAll_("Marks").forEach(r=>{
    if(r.date<from||r.date>to)return;
    let m={};try{m=JSON.parse(r.json)}catch(e){}
    docs[r.id]={date:r.date,cls:Number(r.cls),m};
  });
  readAll_("Actions").forEach(r=>{
    if(r.date<from||r.date>to)return;
    let log=[];try{log=JSON.parse(r.json)}catch(e){}
    acts[r.id]={date:r.date,cls:Number(r.cls),sec:r.sec,name:r.name,log};
  });
  const smsFrom=addDays(to,-90);
  readAll_("Sms").forEach(r=>{
    let v={};try{v=JSON.parse(r.json)}catch(e){}
    if(v.sentOn&&v.sentOn>=smsFrom)sms[r.id]=v;
  });
  // class lists live in the sheet, never in the public page; sent only when they changed
  let rosterVer="",roster={};
  readAll_("Roster").forEach(r=>{
    if(r.updated>rosterVer)rosterVer=r.updated;
    try{roster[r.id]=JSON.parse(r.json)}catch(e){}
  });
  return {
    today,me:{name:me.name,role:me.role},rosterVer,roster:have===rosterVer?null:roster,
    users:me.role==="admin"?ctx.DB.Users.map(u=>({name:u.name,role:u.role,status:u.status,requestedAt:u.requestedAt||"",approvedAt:u.approvedAt||""})):[],
    docs,acts,sms
  };
}

const API={
  state(ctx,token,to,have){return publicState(ctx,readToken(ctx.H,ctx.secret,ctx.DB,token,ctx.now),to,have)},

  // first-time setup: the person types their name, picks a role and sets their own password
  setup(ctx,name,pw,wantRole){
    const DB=ctx.DB;name=str(name,40);pw=String(pw||"");
    if(!name)fail("Type your name.");
    if(pw.length<6)fail("Password must be at least 6 characters.");
    const role=ROLES.includes(wantRole)?wantRole:"cm";
    const existing=DB.Users.find(x=>x.name.toLowerCase()===name.toLowerCase());
    if(existing&&existing.status==="active")fail(name+" already has a login. Use Log in, or ask the admin to reset the password.");
    const noAdmin=!DB.Users.some(u=>u.role==="admin"&&u.status==="active");
    const wasReset=!!existing&&existing.status==="reset";
    const salt=ctx.H.salt();
    const u=existing||{name,ver:1};
    Object.assign(u,{salt,hash:hashPw(ctx.H,salt,pw),requestedAt:new Date(ctx.now).toISOString()});
    if(wasReset){u.status="active";u.ver=Number(u.ver||1)+1}
    else{
      u.role=role;
      if(role==="admin"&&noAdmin){u.status="active";u.approvedAt=u.requestedAt;u.approvedBy="(first admin)"}
      else u.status="pending";
    }
    if(!existing)DB.Users.push(u);
    ctx.dirty.Users=true;
    if(u.status==="active")return {token:makeToken(ctx.H,ctx.secret,u,ctx.now),state:publicState(ctx,u,ctx.today,"")};
    return {pending:true,state:publicState(ctx,null)};
  },

  login(ctx,name,pw){
    const u=ctx.DB.Users.find(x=>x.name.toLowerCase()===str(name,40).toLowerCase());
    if(u&&u.status==="reset")fail("Your password was reset. Use “First time? Set password” to choose a new one.");
    if(!u||!u.hash)fail("No login for this name yet. Use “First time? Set password”.");
    if(hashPw(ctx.H,u.salt,String(pw||""))!==u.hash)fail("Wrong password.");
    if(u.status!=="active")fail("Your login is waiting for the admin to approve it.");
    return {token:makeToken(ctx.H,ctx.secret,u,ctx.now),state:publicState(ctx,u,ctx.today,"")};
  },

  // marks: only the children that changed are sent: set = {"A-12": mark}, del = ["A-3"]
  saveMarks(ctx,token,date,cls,set,del){
    const me=needMarker(ctx,token);
    if(!isoDate(date)||date>ctx.today)fail("Pick a valid date, not in the future.");
    if(date<addDays(ctx.today,-BACKDATE_DAYS))fail("Marks can be changed only for the last "+BACKDATE_DAYS+" days.");
    cls=Number(cls);if(!(cls>=1&&cls<=11))fail("Unknown class.");
    const id=date+"_"+cls,row=findRow_("Marks",id);
    let m={};if(row){try{m=JSON.parse(row.json)}catch(e){}}
    Object.keys(set||{}).forEach(k=>{
      if(!/^[A-Z]-\d{1,3}$/.test(k))fail("Unknown student.");
      const c=cleanMark(set[k]);
      if(!c){delete m[k];return}
      const prev=m[k]||null,pu=prev&&prev.u;
      if(prev){const p2=Object.assign({},prev);delete p2.u;c.u=JSON.stringify(p2)===JSON.stringify(c)?pu:me.name}
      else c.u=me.name;
      if(!c.u)delete c.u;
      m[k]=c;
    });
    (Array.isArray(del)?del:[]).forEach(k=>{delete m[String(k)]});
    const json=JSON.stringify(m);
    if(json.length>45000)fail("Too much text in one class. Shorten some remarks.");
    upsert_("Marks",{id,date,cls,json,updated:new Date(ctx.now).toISOString()});
    return {ok:true};
  },

  // an action on a child's remark or defaulter flag; the time and the name are stamped here
  addLog(ctx,token,date,cls,sec,roll,name,text,cats,by){
    const me=needPL(ctx,token);
    if(!isoDate(date)||date>ctx.today)fail("Pick a valid date.");
    if(date<addDays(ctx.today,-BACKDATE_DAYS))fail("Actions can be logged only for the last "+BACKDATE_DAYS+" days.");
    cls=Number(cls);if(!(cls>=1&&cls<=11))fail("Unknown class.");
    sec=str(sec,2);if(!/^[A-Z]$/.test(sec))fail("Unknown section.");
    roll=Number(roll);if(!(roll>=1&&roll<=99))fail("Unknown student.");
    text=str(text,300);if(!text)fail("Type the action taken.");
    cats=(Array.isArray(cats)?cats:[]).filter(c=>CATS.includes(c));if(!cats.length)fail("Unknown remark type.");
    by=me.role==="admin"&&by==="admin"?"admin":"pl";
    const id=date+"_"+cls+sec+roll,row=findRow_("Actions",id);
    let log=[];if(row){try{log=JSON.parse(row.json)}catch(e){}}
    log.push({a:text,cats,at:ctx.now,by,who:me.name});
    if(log.length>60)log=log.slice(-60);
    upsert_("Actions",{id,date,cls,sec,name:str(name,60),json:JSON.stringify(log),updated:new Date(ctx.now).toISOString()});
    ctx.log(me.name,"action",id,by+" · "+text.slice(0,60));
    return {log};
  },

  // admin: SMS sent / undone for a child and category
  markSms(ctx,token,id,sent,info){
    const me=needAdmin(ctx,token);
    id=str(id,20);if(!/^\d{1,2}[A-Z]\d{1,3}_(def|eng|sig|beh)$/.test(id))fail("Unknown SMS item.");
    if(!sent){deleteRow_("Sms",id);ctx.log(me.name,"sms undone",id,"");return {}}
    info=info||{};
    const sentOn=isoDate(info.sentOn)&&info.sentOn<=ctx.today?info.sentOn:ctx.today;
    const rec={cls:Number(info.cls)||0,sec:str(info.sec,2),name:str(info.name,60),cat:str(info.cat,4),sentOn,sentAt:ctx.now,remark:str(info.remark,200),by:me.name};
    upsert_("Sms",{id,json:JSON.stringify(rec),updated:new Date(ctx.now).toISOString()});
    ctx.log(me.name,"sms sent",id,rec.remark);
    return rec;
  },

  // admin: replace the class lists. roster = {"1":{"A":["Name",...],"B":[...]}, ...}; only the classes sent are replaced
  saveRoster(ctx,token,roster){
    const me=needAdmin(ctx,token);
    if(!roster||typeof roster!=="object")fail("No class lists received.");
    let n=0;
    Object.keys(roster).forEach(c=>{
      const cls=Number(c);if(!(cls>=1&&cls<=11))fail("Unknown class: "+c);
      const secs={};
      Object.keys(roster[c]||{}).sort().forEach(sec=>{
        if(!/^[A-Z]$/.test(sec))fail("Class "+c+": section must be a single letter.");
        const list=(Array.isArray(roster[c][sec])?roster[c][sec]:[]).map(x=>str(x,60)).filter(Boolean);
        if(list.length>90)fail("Class "+c+sec+" has more than 90 students.");
        if(list.length){secs[sec]=list;n+=list.length}
      });
      if(!Object.keys(secs).length)fail("Class "+c+" has no students.");
      const json=JSON.stringify(secs);if(json.length>45000)fail("Class "+c+" list is too long.");
      upsert_("Roster",{id:String(cls),json,updated:new Date(ctx.now).toISOString()});
    });
    ctx.log(me.name,"class lists",Object.keys(roster).join(","),n+" students");
    return publicState(ctx,me,ctx.today,"");
  },

  approve(ctx,token,name,role){
    const me=needAdmin(ctx,token);const u=ctx.DB.Users.find(x=>x.name===name);if(!u)fail("Request not found.");
    if(u.name===me.name&&role!=="admin")fail("You can't change your own role.");
    u.role=ROLES.includes(role)?role:u.role;
    if(u.status==="pending"){u.status="active";u.approvedAt=new Date(ctx.now).toISOString();u.approvedBy=me.name}
    else u.ver=Number(u.ver||1)+1;   // role change: the person logs in again
    ctx.dirty.Users=true;ctx.log(me.name,"approve login",name,u.role);
    return publicState(ctx,me,ctx.today,"");
  },
  resetUser(ctx,token,name){
    const me=needAdmin(ctx,token);const u=ctx.DB.Users.find(x=>x.name===name);if(!u)fail("Login not found.");
    if(u.name===me.name)fail("You can't reset your own login.");
    u.status="reset";u.hash="";u.salt="";u.ver=Number(u.ver||1)+1;ctx.dirty.Users=true;ctx.log(me.name,"reset login",name,"");
    return publicState(ctx,me,ctx.today,"");
  },
  removeUser(ctx,token,name){
    const me=needAdmin(ctx,token);if(name===me.name)fail("You can't remove your own login.");
    ctx.DB.Users=ctx.DB.Users.filter(x=>x.name!==name);ctx.dirty.Users=true;ctx.log(me.name,"remove login",name,"");
    return publicState(ctx,me,ctx.today,"");
  },
};
function runApi(ctx,fn,args){
  if(!Object.prototype.hasOwnProperty.call(API,fn))fail("Unknown action.");
  return API[fn].apply(null,[ctx].concat(args||[]));
}


/* ===== Google Sheet storage + web app entry point ===== */
const COLS={
  Users:["name","role","status","salt","hash","ver","requestedAt","approvedAt","approvedBy"],
  Marks:["id","date","cls","json","updated"],
  Actions:["id","date","cls","sec","name","json","updated"],
  Sms:["id","json","updated"],
  Roster:["id","json","updated"],
  Log:["time","who","action","item","detail"],
};
function sheet_(name){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  let sh=ss.getSheetByName(name);
  if(!sh){sh=ss.insertSheet(name);sh.getRange(1,1,1,COLS[name].length).setValues([COLS[name]]).setFontWeight("bold");sh.setFrozenRows(1)}
  return sh;
}
function readAll_(name){
  const sh=sheet_(name),n=sh.getLastRow()-1;if(n<1)return [];
  const cols=COLS[name];
  return sh.getRange(2,1,n,cols.length).getDisplayValues().filter(r=>r[0]!=="").map(r=>Object.fromEntries(cols.map((c,i)=>[c,r[i]])));
}
function rowIndex_(sh,id){
  const n=sh.getLastRow()-1;if(n<1)return 0;
  const ids=sh.getRange(2,1,n,1).getDisplayValues();
  for(let i=0;i<n;i++)if(ids[i][0]===id)return i+2;
  return 0;
}
function findRow_(name,id){
  const sh=sheet_(name),r=rowIndex_(sh,id);if(!r)return null;
  const cols=COLS[name],v=sh.getRange(r,1,1,cols.length).getDisplayValues()[0];
  return Object.fromEntries(cols.map((c,i)=>[c,v[i]]));
}
function upsert_(name,obj){
  const sh=sheet_(name),cols=COLS[name];
  const row=rowIndex_(sh,String(obj.id))||Math.max(sh.getLastRow(),1)+1;
  sh.getRange(row,1,1,cols.length).setNumberFormat("@").setValues([cols.map(c=>obj[c]==null?"":obj[c])]);
}
function deleteRow_(name,id){const sh=sheet_(name),r=rowIndex_(sh,id);if(r)sh.deleteRow(r)}
function write_(name,objs){
  const sh=sheet_(name),cols=COLS[name],old=sh.getLastRow()-1;
  if(old>0)sh.getRange(2,1,old,cols.length).clearContent();
  if(objs.length){
    const data=objs.map(o=>cols.map(c=>o[c]==null?"":o[c]));
    sh.getRange(2,1,data.length,cols.length).setNumberFormat("@").setValues(data);
  }
}
function loadDB_(){return {Users:readAll_("Users").map(u=>Object.assign({},u,{ver:Number(u.ver||1)}))}}
function saveDB_(DB,dirty){if(dirty.Users)write_("Users",DB.Users)}
function secret_(){
  const p=PropertiesService.getScriptProperties();let s=p.getProperty("TOKEN_SECRET");
  if(!s){s=Utilities.getUuid()+Utilities.getUuid();p.setProperty("TOKEN_SECRET",s)}
  return s;
}
const H_={
  sha:s=>Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8)),
  hmac:(s,k)=>Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s,k,Utilities.Charset.UTF_8)).replace(/=+$/,""),
  b64:s=>Utilities.base64EncodeWebSafe(s,Utilities.Charset.UTF_8).replace(/=+$/,""),
  unb64:s=>Utilities.newBlob(Utilities.base64DecodeWebSafe(s+"===".slice((s.length+3)%4))).getDataAsString("UTF-8"),
  salt:()=>Utilities.getUuid().replace(/-/g,""),
};
function doPost(e){
  let out;
  const lock=LockService.getScriptLock();
  try{
    const req=JSON.parse(e.postData.contents||"{}");
    const readOnly=req.fn==="state";
    if(!readOnly)lock.waitLock(20000);
    const DB=loadDB_(),dirty={},logs=[];
    const now=Date.now();
    const ctx={DB,dirty,H:H_,secret:secret_(),now,today:Utilities.formatDate(new Date(now),TZ,"yyyy-MM-dd"),
      log:(who,action,item,detail)=>logs.push([Utilities.formatDate(new Date(now),TZ,"yyyy-MM-dd HH:mm"),who,action,item,detail])};
    const v=runApi(ctx,req.fn,req.args);
    saveDB_(DB,dirty);
    if(logs.length){const sh=sheet_("Log");sh.getRange(sh.getLastRow()+1,1,logs.length,5).setValues(logs)}
    out={ok:true,v};
  }catch(err){out={ok:false,err:String(err&&err.message||err)}}
  finally{try{lock.releaseLock()}catch(x){}}
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function doGet(){return ContentService.createTextOutput("Diary Report API is running.")}
// Run once from the editor (▶ setupSheets) to create the tabs and authorise the script.
function setupSheets(){Object.keys(COLS).forEach(sheet_);secret_()}
