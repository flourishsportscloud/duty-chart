/* ===== Checking Tracker 6–8 — server logic (runs inside Google Apps Script) =====
   All rules are enforced here, on Google's side, not in the browser:
   - passwords are stored only as salted hashes in the Users sheet
   - a teacher can report only the sections they teach; managers can report anything
   - a teacher can change a report only on the day it was entered (India time)
   - only managers can add/edit/remove tasks, approve logins and reset passwords
*/
const BYL={ENG:{A:"Swati",B:"Yavnika",C:"Jyotsna"},SCI:{A:"Pallavi",B:"Shreya",C:"Ritika"},SST:{A:"Shailesh",B:"Ishita",C:"Monika"},HIN:{A:"Tripti",B:"Ajita",C:"Bharti"}};
BYL.SKT=BYL.HIN;
const MATHS={"6A":"Amit","6B":"Madhu","6C":"Neha","7A":"Vipul","7B":"Madhu","7C":"Neha","8A":"Vipul","8B":"Amit","8C":"Neha"};
const SUBJECTS=["ENG","SCI","SST","MATH","HIN","SKT","GK","GEN","COMP"];
const KINDS=["test","nb","asg","book","mat","task","prep","cls","sch"];
function defTeacher(s,sec){
  if(s==="GEN")return "Unassigned";
  if(s==="COMP")return ({"6C":"Richa","7C":"Richa"})[sec]||"Himanshu";
  if(s==="MATH")return MATHS[sec];
  if(s==="GK")return (sec[0]==="8"?BYL.SCI:BYL.SST)[sec[1]];
  return BYL[s]?BYL[s][sec[1]]:"";
}
const TOKEN_DAYS=120;
const DEFAULT_MENTORS={"6A":"Shailesh","6B":"Ishita","6C":"Monika","7A":"Swati","7B":"Yavnika","7C":"Jyotsna","8A":"Pallavi","8B":"Shreya","8C":"Ritika"};
function mentorOf(DB,sec){return (DB.Config.mentors||{})[sec]||DEFAULT_MENTORS[sec]||""}
const PREP_TOOLS=["booklet","anskey","video","ppt","epl","rvContent","rvAsg"];
const MENTOR_ITEMS={att:"daily",rec:"weekly",route:"weekly",coc:"weekly",disp:"monthly",wall:"monthly"};
function cleanList(a){return (Array.isArray(a)?a:[]).map(x=>str(x,12)).filter(Boolean).slice(0,80)}
function cleanMarks(m){const o={};if(m&&typeof m==="object")Object.keys(m).slice(0,80).forEach(k=>{const v=str(m[k],6).toUpperCase();if(/^(\d{1,3}(\.\d)?|A|NG)$/.test(v))o[str(k,12)]=v});return o}

function fail(m){throw new Error(m)}
function str(v,max){return String(v==null?"":v).trim().slice(0,max)}
function n60(v){v=parseInt(v,10);return isNaN(v)?0:Math.max(0,Math.min(60,v))}

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
function needManager(ctx,token){const u=needUser(ctx,token);if(u.role!=="manager")fail("Only a manager can do this.");return u}

// which job a report belongs to, worked out on the server (never trusted from the browser)
function resolveJob(DB,c){
  const sec=str(c.sec,3);if(!/^[678][ABC]$/.test(sec))fail("Unknown section.");
  if(c.taskId){
    const t=DB.Tasks[c.taskId];if(!t)fail("This task no longer exists.");
    if(t.c!=="all"&&t.c!==sec[0])fail("This task is not for "+sec+".");
    if(Array.isArray(t.secs)&&t.secs.length&&!t.secs.includes(sec[1]))fail("This task is not for "+sec+".");
    return {sec,s:t.s,k:t.k,id:sec+"_x-"+c.taskId+"_"+t.k,teacher:t.assignee||defTeacher(t.s,sec),lesson:t.title||""};
  }
  const parts=str(c.jobKey,300).split("_");if(parts.length!==4)fail("Unknown job.");
  const [cl,s,lid,k]=parts;
  if(cl!==sec[0]||!SUBJECTS.includes(s)||!KINDS.includes(k)||!/^[a-z0-9-]+$/.test(lid))fail("Unknown job.");
  const o=DB.Overrides[c.jobKey]||{};
  if(o.removed)fail("This job was removed by a manager.");
  if(Array.isArray(o.secs)&&o.secs.length&&!o.secs.includes(sec[1]))fail("This job is not for "+sec+".");
  return {sec,s,k,id:sec+"_"+lid+"_"+k,teacher:o.assignee||defTeacher(s,sec),lesson:o.lesson||""};
}

function publicState(ctx,me){
  const DB=ctx.DB,mgr=me&&me.role==="manager";
  return {
    today:ctx.today,
    me:me?{name:me.name,role:me.role}:null,
    users:DB.Users.filter(u=>u.status==="active"||mgr).map(u=>({name:u.name,role:u.role,status:u.status,requestedAt:u.requestedAt||"",approvedAt:u.approvedAt||""})),
    reports:DB.Reports,tasks:DB.Tasks,overrides:DB.Overrides,prep:DB.Prep,mentor:DB.Mentor,
    config:{mentors:Object.assign({},DEFAULT_MENTORS,DB.Config.mentors||{}),prepLessons:DB.Config.prepLessons||[],students:me?(DB.Config.students||[]):[]}
  };
}

const API={
  state(ctx,token){return publicState(ctx,readToken(ctx.H,ctx.secret,ctx.DB,token,ctx.now))},

  // first-time setup: the person chooses their name and sets their own password
  setup(ctx,name,pw,wantManager){
    const DB=ctx.DB;name=str(name,40);pw=String(pw||"");
    if(!name)fail("Choose your name.");
    if(pw.length<6)fail("Password must be at least 6 characters.");
    const existing=DB.Users.find(x=>x.name.toLowerCase()===name.toLowerCase());
    if(existing&&existing.status==="active")fail(name+" already has a login. Use Log in, or ask a manager to reset the password.");
    const noManager=!DB.Users.some(u=>u.role==="manager"&&u.status==="active");
    const salt=ctx.H.salt();
    const u=existing||{name,ver:1};
    Object.assign(u,{salt,hash:hashPw(ctx.H,salt,pw),role:wantManager?"manager":"teacher",requestedAt:new Date(ctx.now).toISOString()});
    if(wantManager&&noManager){u.status="active";u.approvedAt=u.requestedAt;u.approvedBy="(first manager)"}
    else u.status="pending";
    if(!existing)DB.Users.push(u);
    ctx.dirty.Users=true;
    if(u.status==="active")return {token:makeToken(ctx.H,ctx.secret,u,ctx.now),state:publicState(ctx,u)};
    return {pending:true,state:publicState(ctx,null)};
  },

  login(ctx,name,pw){
    const u=ctx.DB.Users.find(x=>x.name.toLowerCase()===str(name,40).toLowerCase());
    if(!u||!u.hash)fail("No login for this name yet. Use “First time? Set password”.");
    if(hashPw(ctx.H,u.salt,String(pw||""))!==u.hash)fail("Wrong password.");
    if(u.status!=="active")fail("Your login is waiting for a manager to approve it.");
    return {token:makeToken(ctx.H,ctx.secret,u,ctx.now),state:publicState(ctx,u)};
  },

  changePassword(ctx,token,oldPw,newPw){
    const u=needUser(ctx,token);
    if(hashPw(ctx.H,u.salt,String(oldPw||""))!==u.hash)fail("Current password is wrong.");
    if(String(newPw||"").length<6)fail("New password must be at least 6 characters.");
    u.salt=ctx.H.salt();u.hash=hashPw(ctx.H,u.salt,String(newPw));u.ver=Number(u.ver||1)+1;ctx.dirty.Users=true;
    return {token:makeToken(ctx.H,ctx.secret,u,ctx.now),state:publicState(ctx,u)};
  },

  saveReport(ctx,token,c){
    const me=needUser(ctx,token),DB=ctx.DB,j=resolveJob(DB,c||{});
    const mgr=me.role==="manager";
    if(!mgr&&me.name!==j.teacher)fail("Only "+j.teacher+" or a manager can report this.");
    const prev=DB.Reports[j.id];
    const nowIso=new Date(ctx.now).toISOString();
    if(prev&&!mgr){
      if(prev.by!==me.name)fail("This was reported by "+prev.by+". Ask a manager to correct it.");
      if(ctx.dateOf(prev.at)!==ctx.today)fail("Locked: reports can be changed only on the day they are entered. Ask a manager.");
    }
    const r={sec:j.sec,subject:j.s,kind:j.k,lesson:str(c.lesson||j.lesson,120),due:str(c.due,10),
      note:str(c.note,400),at:prev?prev.at:nowIso,by:prev?prev.by:me.name};
    if(c.da){r.def=n60(c.def);r.abs=n60(c.abs)}
    const dl=cleanList(c.defList),al=cleanList(c.absList),mk=cleanMarks(c.marks);
    if(dl.length||al.length||Object.keys(mk).length){r.data={defList:dl,absList:al};if(Object.keys(mk).length){r.data.marks=mk;r.data.max=Math.max(1,Math.min(500,parseInt(c.max,10)||0))}
      if(c.da){r.def=Math.max(r.def,dl.length);r.abs=Math.max(r.abs,al.length)}}
    if(prev&&prev.by!==me.name){r.editedBy=me.name;r.editedAt=nowIso}
    else if(prev){r.updatedAt=nowIso}
    DB.Reports[j.id]=r;ctx.dirty.Reports=true;
    ctx.log(me.name,prev?"edit report":"report",j.id,(r.def!=null?"D "+r.def+" A "+r.abs:"done"));
    return publicState(ctx,me);
  },

  deleteReport(ctx,token,c){
    const me=needUser(ctx,token),DB=ctx.DB,j=resolveJob(DB,c||{});
    const prev=DB.Reports[j.id];if(!prev)return publicState(ctx,me);
    if(me.role!=="manager"){
      if(prev.by!==me.name)fail("Only "+prev.by+" or a manager can undo this.");
      if(ctx.dateOf(prev.at)!==ctx.today)fail("Locked: ask a manager to undo it.");
    }
    delete DB.Reports[j.id];ctx.dirty.Reports=true;ctx.log(me.name,"undo report",j.id,"");
    return publicState(ctx,me);
  },

  saveTask(ctx,token,id,t){
    const me=needManager(ctx,token);t=t||{};
    id=str(id,40);if(!/^[a-z0-9]+$/.test(id))fail("Bad task id.");
    if(!SUBJECTS.includes(t.s)||!KINDS.includes(t.k))fail("Choose subject and type.");
    if(!["6","7","8","all"].includes(t.c))fail("Choose the class.");
    const secs=(Array.isArray(t.secs)?t.secs:[]).filter(x=>["A","B","C"].includes(x));if(!secs.length)fail("Tick at least one section.");
    if(!/^\d{4}-\d\d-\d\d$/.test(t.recv||""))fail("Pick the received date.");
    const prev=ctx.DB.Tasks[id];
    ctx.DB.Tasks[id]={s:t.s,k:t.k,c:t.c,secs,title:str(t.title,120),recv:t.recv,due:/^\d{4}-\d\d-\d\d$/.test(t.due||"")?t.due:null,
      da:!!t.da,assignee:str(t.assignee,40),note:str(t.note,160),by:prev?prev.by:me.name,at:prev?prev.at:new Date(ctx.now).toISOString()};
    ctx.dirty.Tasks=true;ctx.log(me.name,prev?"edit task":"add task",id,str(t.title,60));
    return publicState(ctx,me);
  },
  deleteTask(ctx,token,id){const me=needManager(ctx,token);delete ctx.DB.Tasks[id];ctx.dirty.Tasks=true;ctx.log(me.name,"remove task",id,"");return publicState(ctx,me)},

  saveOverride(ctx,token,key,o){
    const me=needManager(ctx,token);o=o||{};key=str(key,300);
    if(key.split("_").length!==4)fail("Unknown job.");
    const v=o.removed?{removed:true}:{lesson:str(o.lesson,120),recv:/^\d{4}-\d\d-\d\d$/.test(o.recv||"")?o.recv:"",due:/^\d{4}-\d\d-\d\d$/.test(o.due||"")?o.due:null,
      da:!!o.da,secs:(Array.isArray(o.secs)?o.secs:[]).filter(x=>["A","B","C"].includes(x)),assignee:str(o.assignee,40),note:str(o.note,160)};
    v.by=me.name;v.at=new Date(ctx.now).toISOString();
    ctx.DB.Overrides[key]=v;ctx.dirty.Overrides=true;ctx.log(me.name,o.removed?"remove job":"edit job",key,"");
    return publicState(ctx,me);
  },
  deleteOverride(ctx,token,key){const me=needManager(ctx,token);delete ctx.DB.Overrides[key];ctx.dirty.Overrides=true;ctx.log(me.name,"restore job",key,"");return publicState(ctx,me)},

  savePrep(ctx,token,key,tool,val){
    const me=needUser(ctx,token);key=str(key,300);
    const parts=key.split("|");if(parts.length!==4||!/^[678]$/.test(parts[1])||!SUBJECTS.includes(parts[2]))fail("Unknown lesson.");
    if(me.role!=="manager"&&parts[0]!==me.name)fail("Only "+parts[0]+" or a manager can update this.");
    if(!PREP_TOOLS.includes(tool))fail("Unknown item.");
    if(!["done","due","na"].includes(val))fail("Unknown status.");
    const p=ctx.DB.Prep[key]||{};if(val==="due")delete p[tool];else p[tool]=val;
    p.at=new Date(ctx.now).toISOString();p.by=me.name;ctx.DB.Prep[key]=p;ctx.dirty.Prep=true;
    ctx.log(me.name,"prep "+tool,key,val);return publicState(ctx,me);
  },
  saveMentor(ctx,token,key,val){
    const me=needUser(ctx,token);key=str(key,60);
    const [sec,item,period]=key.split("|");
    if(!/^[678][ABC]$/.test(sec||"")||!MENTOR_ITEMS[item]||!/^\d{4}-\d\d(-\d\d)?$/.test(period||""))fail("Unknown mentor task.");
    const mentor=mentorOf(ctx.DB,sec);
    if(me.role!=="manager"&&mentor!==me.name)fail(mentor?"Only "+mentor+" (mentor of "+sec+") or a manager can update this.":"No mentor set for "+sec+" yet. Ask a manager.");
    if(val==="due"||val===""||val==null)delete ctx.DB.Mentor[key];
    else{
      let v=String(val);if(item==="wall"){v=String(Math.max(0,Math.min(999,parseInt(v,10)||0)))}else if(!["done","na"].includes(v))fail("Unknown status.");
      ctx.DB.Mentor[key]={v,at:new Date(ctx.now).toISOString(),by:me.name};
    }
    ctx.dirty.Mentor=true;ctx.log(me.name,"mentor "+item,key,String(val));return publicState(ctx,me);
  },
  saveConfig(ctx,token,name,value){
    const me=needManager(ctx,token);
    if(name==="students"){
      const list=(Array.isArray(value)?value:[]).map(x=>({sec:str(x.sec,3).toUpperCase(),roll:str(x.roll,12),name:str(x.name,60)})).filter(x=>/^[678][ABC]$/.test(x.sec)&&x.roll&&x.name);
      if(list.length>3000)fail("Too many students.");
      ctx.DB.Config.students=list;
    }else if(name==="mentors"){
      const m={};Object.keys(value||{}).forEach(k=>{if(/^[678][ABC]$/.test(k)&&str(value[k],40))m[k]=str(value[k],40)});ctx.DB.Config.mentors=m;
    }else if(name==="prepLessons"){
      ctx.DB.Config.prepLessons=(Array.isArray(value)?value:[]).slice(0,500).map(x=>({c:str(x.c,1),s:str(x.s,5),lesson:str(x.lesson,80),start:/^\d{4}-\d\d-\d\d$/.test(x.start||"")?x.start:""})).filter(x=>/^[678]$/.test(x.c)&&SUBJECTS.includes(x.s)&&x.lesson);
    }else fail("Unknown setting.");
    ctx.dirty.Config=true;ctx.log(me.name,"settings",name,"");return publicState(ctx,me);
  },

  approve(ctx,token,name,role){
    const me=needManager(ctx,token);const u=ctx.DB.Users.find(x=>x.name===name);if(!u)fail("Request not found.");
    u.status="active";u.role=role==="manager"?"manager":"teacher";u.approvedAt=new Date(ctx.now).toISOString();u.approvedBy=me.name;
    ctx.dirty.Users=true;ctx.log(me.name,"approve login",name,u.role);return publicState(ctx,me);
  },
  removeUser(ctx,token,name){
    const me=needManager(ctx,token);if(name===me.name)fail("You can't remove your own login.");
    ctx.DB.Users=ctx.DB.Users.filter(x=>x.name!==name);ctx.dirty.Users=true;ctx.log(me.name,"remove login",name,"");return publicState(ctx,me);
  },
};
function runApi(ctx,fn,args){
  if(!Object.prototype.hasOwnProperty.call(API,fn))fail("Unknown action.");
  return API[fn].apply(null,[ctx].concat(args||[]));
}


/* ===== Google Sheet storage + web app entry point ===== */
const TZ="Asia/Kolkata";
const COLS={
  Users:["name","role","status","salt","hash","ver","requestedAt","approvedAt","approvedBy"],
  Reports:["id","sec","subject","kind","lesson","due","def","abs","note","at","by","updatedAt","editedBy","editedAt","data"],
  Prep:["key","json"],
  Mentor:["key","v","at","by"],
  Config:["name","json"],
  Tasks:["id","json"],
  Overrides:["key","json"],
  Log:["time","who","action","item","detail"],
};
function sheet_(name){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  let sh=ss.getSheetByName(name);
  if(!sh){sh=ss.insertSheet(name);sh.getRange(1,1,1,COLS[name].length).setValues([COLS[name]]).setFontWeight("bold");sh.setFrozenRows(1)}
  return sh;
}
function rows_(name){
  const sh=sheet_(name),n=sh.getLastRow()-1;if(n<1)return [];
  const cols=COLS[name];
  return sh.getRange(2,1,n,cols.length).getDisplayValues().filter(r=>r[0]!=="").map(r=>Object.fromEntries(cols.map((c,i)=>[c,r[i]])));
}
function write_(name,objs){
  const sh=sheet_(name),cols=COLS[name],old=sh.getLastRow()-1;
  if(old>0)sh.getRange(2,1,old,cols.length).clearContent();
  if(objs.length){
    const data=objs.map(o=>cols.map(c=>o[c]==null?"":o[c]));
    sh.getRange(2,1,data.length,cols.length).setNumberFormat("@").setValues(data);
  }
}
function loadDB_(){
  const DB={Users:rows_("Users").map(u=>({...u,ver:Number(u.ver||1)})),Reports:{},Tasks:{},Overrides:{},Prep:{},Mentor:{},Config:{}};
  rows_("Prep").forEach(r=>{try{DB.Prep[r.key]=JSON.parse(r.json)}catch(e){}});
  rows_("Mentor").forEach(r=>{DB.Mentor[r.key]={v:r.v,at:r.at,by:r.by}});
  rows_("Config").forEach(r=>{try{DB.Config[r.name]=JSON.parse(r.json)}catch(e){}});
  rows_("Reports").forEach(r=>{const id=r.id;delete r.id;if(r.data){try{r.data=JSON.parse(r.data)}catch(e){delete r.data}}["def","abs"].forEach(k=>{if(r[k]==="")delete r[k];else r[k]=Number(r[k])});Object.keys(r).forEach(k=>{if(r[k]==="")delete r[k]});DB.Reports[id]=r});
  rows_("Tasks").forEach(r=>{try{DB.Tasks[r.id]=JSON.parse(r.json)}catch(e){}});
  rows_("Overrides").forEach(r=>{try{DB.Overrides[r.key]=JSON.parse(r.json)}catch(e){}});
  return DB;
}
function saveDB_(DB,dirty){
  if(dirty.Users)write_("Users",DB.Users);
  if(dirty.Reports)write_("Reports",Object.entries(DB.Reports).sort((a,b)=>a[0]<b[0]?-1:1).map(([id,r])=>({id,...r,data:r.data?JSON.stringify(r.data):""})));
  if(dirty.Prep)write_("Prep",Object.entries(DB.Prep).map(([key,p])=>({key,json:JSON.stringify(p)})));
  if(dirty.Mentor)write_("Mentor",Object.entries(DB.Mentor).sort((a,b)=>a[0]<b[0]?-1:1).map(([key,m])=>({key,...m})));
  if(dirty.Config)write_("Config",Object.entries(DB.Config).map(([name,v])=>({name,json:JSON.stringify(v)})));
  if(dirty.Tasks)write_("Tasks",Object.entries(DB.Tasks).map(([id,t])=>({id,json:JSON.stringify(t)})));
  if(dirty.Overrides)write_("Overrides",Object.entries(DB.Overrides).map(([key,o])=>({key,json:JSON.stringify(o)})));
}
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
      dateOf:iso=>iso?Utilities.formatDate(new Date(iso),TZ,"yyyy-MM-dd"):"",
      log:(who,action,item,detail)=>logs.push([Utilities.formatDate(new Date(now),TZ,"yyyy-MM-dd HH:mm"),who,action,item,detail])};
    const v=runApi(ctx,req.fn,req.args);
    saveDB_(DB,dirty);
    if(logs.length){const sh=sheet_("Log");sh.getRange(sh.getLastRow()+1,1,logs.length,5).setValues(logs)}
    out={ok:true,v};
  }catch(err){out={ok:false,err:String(err&&err.message||err)}}
  finally{try{lock.releaseLock()}catch(x){}}
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function doGet(){return ContentService.createTextOutput("Checking Tracker API is running.")}
// Run once from the editor (▶ setupSheets) to create the tabs and authorise the script.
function setupSheets(){Object.keys(COLS).forEach(sheet_);secret_()}
