/* ===== Daily Maintenance Record — server logic (runs inside Google Apps Script) =====
   All rules are enforced here, on Google's side, not in the browser:
   - passwords are stored only as salted hashes in the Users sheet
   - staff and the maintenance manager can log complaints; the director can only view
   - only the maintenance manager can change status, remark, repair time, vendor, or delete any record
   - staff can edit or delete their own complaint only on the day they entered it (India time)
   - photos are kept in a private Drive folder and are sent only to logged-in users
*/
const FLOORS=["LGF","GF","1F","2F","3F","OUTDOOR","CAMPUS"];
const CATS=["CCTV","Computer lab","Digital board","Electric","Machinery","Wifi","Vendors","Others"];
const KINDS=["complaint","task"];
const PRIOS=["urgent","normal","low"];
const STATUSES=["open","working","done"];
const ROLES=["staff","manager","director"];
const DEFAULT_VENDORS=["Raju ji (carpenter)","Rahul ji (AC)","CCTV","Intercom"];
const TOKEN_DAYS=120;
const WINDOW_DAYS=45;        // state() sends open items plus everything from the last 45 days
const BACKDATE_DAYS=60;      // a complaint can be dated at most 60 days back
const MAX_PHOTO=900000;      // characters of base64 JPEG
const ETA_DAYS={"1 hour":0,"half day":0,"1 day":1,"2–3 days":3,"1 week":7};

function fail(m){throw new Error(m)}
function str(v,max){return String(v==null?"":v).trim().slice(0,max)}
function isoDate(v){return /^\d{4}-\d\d-\d\d$/.test(String(v||""))}
function addDays(iso,n){const d=new Date(iso+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function pick(v,list,label){v=String(v==null?"":v);if(!list.includes(v))fail("Choose "+label+".");return v}

// "2 days", "1 week", "2-3 days" -> number of days; "Needs parts" or blank -> null (no due date)
function etaDaysOf(t){
  t=String(t||"").trim().toLowerCase().replace(/\s+/g," ");
  if(!t)return null;
  if(Object.prototype.hasOwnProperty.call(ETA_DAYS,t))return ETA_DAYS[t];
  let m=/^(\d+)\s*(hour|hr|day|week)s?$/.exec(t);
  if(m){const n=+m[1];return m[2]==="week"?n*7:(m[2]==="day"?n:0)}
  m=/^(\d+)\s*[-–]\s*(\d+)\s*days?$/.exec(t);
  if(m)return +m[2];
  return null;
}

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
function needManager(ctx,token){const u=needUser(ctx,token);if(u.role!=="manager")fail("Only the maintenance manager can do this.");return u}
function needWriter(ctx,token){const u=needUser(ctx,token);if(u.role==="director")fail("The director has view-only access.");return u}

function vendorsOf(DB){
  const set=new Set(Array.isArray(DB.Config.vendors)?DB.Config.vendors:DEFAULT_VENDORS);
  Object.values(DB.Complaints).forEach(c=>{if(c.vendor)set.add(c.vendor)});
  return Array.from(set).sort((a,b)=>a.localeCompare(b));
}
function pubComplaint(c){
  return {id:c.id,floor:c.floor,area:c.area,text:c.text,category:c.category,kind:c.kind,priority:c.priority,vendor:c.vendor,date:c.date,
    hasPhoto:!!c.photo,hasDonePhoto:!!c.donePhoto,by:c.by,at:c.at,status:c.status,remark:c.remark,eta:c.eta,etaDays:c.etaDays,etaSet:c.etaSet,doneDate:c.doneDate,doneAt:c.doneAt};
}
function publicState(ctx,me){
  const DB=ctx.DB,cutoff=addDays(ctx.today,-WINDOW_DAYS),complaints={};
  if(me)Object.values(DB.Complaints).forEach(c=>{
    if(c.status!=="done"||c.date>=cutoff||(c.doneDate&&c.doneDate>=cutoff))complaints[c.id]=pubComplaint(c);
  });
  return {
    today:ctx.today,cutoff,
    me:me?{name:me.name,role:me.role}:null,
    users:me&&me.role==="manager"?DB.Users.map(u=>({name:u.name,role:u.role,status:u.status,requestedAt:u.requestedAt||"",approvedAt:u.approvedAt||""})):[],
    vendors:me?vendorsOf(DB):[],
    complaints
  };
}

// fields anyone who logs a complaint may set
function applyLogged(rec,P){
  if("floor" in P)rec.floor=pick(P.floor,FLOORS,"the location");
  if("area" in P)rec.area=str(P.area,80);
  if("text" in P){const t=str(P.text,400);if(!t)fail("Describe what needs fixing.");rec.text=t}
  if("category" in P)rec.category=pick(P.category,CATS,"a category");
  if("kind" in P)rec.kind=pick(P.kind,KINDS,"the type");
  if("priority" in P)rec.priority=pick(P.priority,PRIOS,"the priority");
}
// fields only the maintenance manager may set
function applyManager(ctx,rec,P){
  if("vendor" in P)rec.vendor=str(P.vendor,60);
  if("remark" in P)rec.remark=str(P.remark,300);
  if("date" in P){if(!isoDate(P.date)||P.date>ctx.today)fail("Pick a valid date, not in the future.");rec.date=P.date}
  if("eta" in P){
    const e=str(P.eta,40);
    if(e!==rec.eta){rec.eta=e;const d=etaDaysOf(e);rec.etaDays=d;rec.etaSet=d==null?"":ctx.today}
  }
  if("status" in P){
    const s=pick(P.status,STATUSES,"a status");
    if(s!==rec.status){rec.status=s;rec.doneDate=s==="done"?ctx.today:"";rec.doneAt=s==="done"?new Date(ctx.now).toISOString():""}
  }
}
const LOGGED_KEYS=["floor","area","text","category","kind","priority"];
const MANAGER_KEYS=["vendor","remark","date","eta","status"];

const API={
  state(ctx,token){return publicState(ctx,readToken(ctx.H,ctx.secret,ctx.DB,token,ctx.now))},

  // first-time setup: the person types their name, picks a role and sets their own password
  setup(ctx,name,pw,wantRole){
    const DB=ctx.DB;name=str(name,40);pw=String(pw||"");
    if(!name)fail("Type your name.");
    if(pw.length<6)fail("Password must be at least 6 characters.");
    const role=ROLES.includes(wantRole)?wantRole:"staff";
    const existing=DB.Users.find(x=>x.name.toLowerCase()===name.toLowerCase());
    if(existing&&existing.status==="active")fail(name+" already has a login. Use Log in, or ask the maintenance manager to reset the password.");
    const noManager=!DB.Users.some(u=>u.role==="manager"&&u.status==="active");
    const salt=ctx.H.salt();
    const u=existing||{name,ver:1};
    Object.assign(u,{salt,hash:hashPw(ctx.H,salt,pw),role,requestedAt:new Date(ctx.now).toISOString()});
    if(role==="manager"&&noManager){u.status="active";u.approvedAt=u.requestedAt;u.approvedBy="(first manager)"}
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
    if(u.status!=="active")fail("Your login is waiting for the maintenance manager to approve it.");
    return {token:makeToken(ctx.H,ctx.secret,u,ctx.now),state:publicState(ctx,u)};
  },

  changePassword(ctx,token,oldPw,newPw){
    const u=needUser(ctx,token);
    if(hashPw(ctx.H,u.salt,String(oldPw||""))!==u.hash)fail("Current password is wrong.");
    if(String(newPw||"").length<6)fail("New password must be at least 6 characters.");
    u.salt=ctx.H.salt();u.hash=hashPw(ctx.H,u.salt,String(newPw));u.ver=Number(u.ver||1)+1;ctx.dirty.Users=true;
    return {token:makeToken(ctx.H,ctx.secret,u,ctx.now),state:publicState(ctx,u)};
  },

  addComplaint(ctx,token,c){
    const me=needWriter(ctx,token);c=c||{};
    const rec={id:ctx.H.uid(),floor:"",area:"",text:"",category:"Others",kind:"complaint",priority:"normal",vendor:"",date:ctx.today,photo:"",
      by:me.name,at:new Date(ctx.now).toISOString(),status:"open",remark:"",eta:"",etaDays:null,etaSet:"",doneDate:"",updatedBy:"",updatedAt:""};
    LOGGED_KEYS.forEach(k=>{if(c[k]!=null&&c[k]!=="")rec[k]=c[k]});
    // reuse the validation by passing only the keys that were sent
    const P={};LOGGED_KEYS.forEach(k=>{P[k]=rec[k]});
    if(!rec.floor)fail("Choose the location: a floor, Outdoor or Campus-wide.");
    applyLogged(rec,P);
    if(c.date){
      if(!isoDate(c.date)||c.date>ctx.today)fail("The date cannot be in the future.");
      if(c.date<addDays(ctx.today,-BACKDATE_DAYS))fail("Pick a date within the last "+BACKDATE_DAYS+" days.");
      rec.date=c.date;
    }
    if(c.photo){
      const p=String(c.photo);
      if(p.length>MAX_PHOTO||!/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(p))fail("The photo could not be saved. Try a smaller photo.");
      rec.photo=ctx.photos.save(p);
    }
    ctx.DB.Complaints[rec.id]=rec;ctx.dirty.Complaints=true;
    ctx.log(me.name,"add",rec.id,rec.floor+" · "+rec.text.slice(0,60));
    return publicState(ctx,me);
  },

  // staff: only their own complaint, only on the day they entered it; manager: any field of any complaint
  editComplaint(ctx,token,id,patch){
    const me=needWriter(ctx,token),mgr=me.role==="manager";
    const rec=ctx.DB.Complaints[str(id,40)];if(!rec)fail("This complaint no longer exists.");
    const P=patch||{},keys=Object.keys(P);
    if(!keys.length)return publicState(ctx,me);
    if(!mgr){
      if(rec.by!==me.name)fail("This was logged by "+rec.by+". Only "+rec.by+" or the maintenance manager can change it.");
      if(ctx.dateOf(rec.at)!==ctx.today)fail("Locked: you can change a complaint only on the day you logged it. Ask the maintenance manager.");
    }
    keys.forEach(k=>{
      if(MANAGER_KEYS.includes(k)){if(!mgr)fail("Only the maintenance manager can change "+k+".")}
      else if(!LOGGED_KEYS.includes(k))fail("Unknown field.");
    });
    const before=JSON.stringify(rec);
    applyLogged(rec,P);
    if(mgr)applyManager(ctx,rec,P);
    if(JSON.stringify(rec)!==before){
      rec.updatedBy=me.name;rec.updatedAt=new Date(ctx.now).toISOString();
      ctx.dirty.Complaints=true;
      ctx.log(me.name,"edit",rec.id,keys.map(k=>k+"="+String(P[k]).slice(0,30)).join("; "));
    }
    return publicState(ctx,me);
  },

  deleteComplaint(ctx,token,id){
    const me=needWriter(ctx,token),mgr=me.role==="manager";
    id=str(id,40);const rec=ctx.DB.Complaints[id];if(!rec)return publicState(ctx,me);
    if(!mgr){
      if(rec.by!==me.name)fail("Only "+rec.by+" or the maintenance manager can delete this.");
      if(ctx.dateOf(rec.at)!==ctx.today)fail("Locked: ask the maintenance manager to delete it.");
    }
    if(rec.photo)ctx.photos.trash(rec.photo);
    if(rec.donePhoto)ctx.photos.trash(rec.donePhoto);
    delete ctx.DB.Complaints[id];ctx.dirty.Complaints=true;
    ctx.log(me.name,"delete",id,rec.floor+" · "+rec.text.slice(0,60));
    return publicState(ctx,me);
  },

  // the photo is looked up through a complaint the user can already see, never by a raw Drive id
  // kind "done" returns the completion photo, anything else the photo logged with the complaint
  photo(ctx,token,id,kind){
    needUser(ctx,token);
    const rec=ctx.DB.Complaints[str(id,40)],f=kind==="done"?"donePhoto":"photo";
    if(!rec||!rec[f])fail("There is no photo for this complaint.");
    return {data:ctx.photos.get(rec[f])};
  },

  // maintenance manager only: the photo of the finished work, allowed once the complaint is Done; "" removes it
  setDonePhoto(ctx,token,id,photo){
    const me=needUser(ctx,token);if(me.role!=="manager")fail("Only the maintenance manager can add the completion photo.");
    const rec=ctx.DB.Complaints[str(id,40)];if(!rec)fail("This complaint no longer exists.");
    if(photo===""||photo==null){
      if(rec.donePhoto){ctx.photos.trash(rec.donePhoto);rec.donePhoto="";ctx.dirty.Complaints=true;ctx.log(me.name,"done-photo-removed",rec.id,"")}
      return publicState(ctx,me);
    }
    if(rec.status!=="done")fail("Mark the complaint Done first, then add the completion photo.");
    const p=String(photo);
    if(p.length>MAX_PHOTO||!/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(p))fail("The photo could not be saved. Try a smaller photo.");
    const old=rec.donePhoto;
    rec.donePhoto=ctx.photos.save(p);
    if(old)ctx.photos.trash(old);
    rec.updatedBy=me.name;rec.updatedAt=new Date(ctx.now).toISOString();
    ctx.dirty.Complaints=true;ctx.log(me.name,"done-photo",rec.id,rec.floor+" · "+rec.text.slice(0,60));
    return publicState(ctx,me);
  },

  // complaints of one day older than the window sent by state()
  day(ctx,token,date){
    const me=needUser(ctx,token);
    if(!isoDate(date))fail("Pick a valid date.");
    const out={};
    Object.values(ctx.DB.Complaints).forEach(c=>{if(c.date===date)out[c.id]=pubComplaint(c)});
    return {date,complaints:out};
  },

  saveVendors(ctx,token,list){
    const me=needManager(ctx,token);
    const seen=new Set(),out=[];
    (Array.isArray(list)?list:[]).forEach(v=>{v=str(v,60);if(v&&!seen.has(v.toLowerCase())){seen.add(v.toLowerCase());out.push(v)}});
    ctx.DB.Config.vendors=out.slice(0,60);ctx.dirty.Config=true;ctx.log(me.name,"vendors","",out.length+" names");
    return publicState(ctx,me);
  },

  approve(ctx,token,name,role){
    const me=needManager(ctx,token);const u=ctx.DB.Users.find(x=>x.name===name);if(!u)fail("Request not found.");
    u.status="active";u.role=ROLES.includes(role)?role:"staff";u.approvedAt=new Date(ctx.now).toISOString();u.approvedBy=me.name;
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
  Complaints:["id","date","floor","area","text","category","kind","priority","status","vendor","remark","eta","by","at","photo","doneDate","etaDays","etaSet","updatedBy","updatedAt","donePhoto","doneAt"],
  Config:["name","json"],
  Log:["time","who","action","item","detail"],
};
function sheet_(name){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  let sh=ss.getSheetByName(name);
  if(!sh){sh=ss.insertSheet(name);sh.getRange(1,1,1,COLS[name].length).setValues([COLS[name]]).setFontWeight("bold");sh.setFrozenRows(1)}
  else{const n=COLS[name].length;if(sh.getRange(1,n,1,1).getDisplayValues()[0][0]!==COLS[name][n-1])sh.getRange(1,1,1,n).setValues([COLS[name]]).setFontWeight("bold")} // adds new columns to a sheet made by an older version
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
  const DB={Users:rows_("Users").map(u=>({...u,ver:Number(u.ver||1)})),Complaints:{},Config:{}};
  rows_("Config").forEach(r=>{try{DB.Config[r.name]=JSON.parse(r.json)}catch(e){}});
  rows_("Complaints").forEach(r=>{
    r.etaDays=r.etaDays===""?null:Number(r.etaDays);
    DB.Complaints[r.id]=r;
  });
  return DB;
}
function saveDB_(DB,dirty){
  if(dirty.Users)write_("Users",DB.Users);
  if(dirty.Complaints)write_("Complaints",Object.values(DB.Complaints).sort((a,b)=>(a.date+a.at)<(b.date+b.at)?-1:1));
  if(dirty.Config)write_("Config",Object.entries(DB.Config).map(([name,v])=>({name,json:JSON.stringify(v)})));
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
  uid:()=>Utilities.getUuid().replace(/-/g,"").slice(0,12),
};
// Photos live in a private Drive folder owned by whoever deployed the script. Nothing is shared by link.
function photoFolder_(){
  const p=PropertiesService.getScriptProperties(),id=p.getProperty("PHOTO_FOLDER");
  if(id){try{return DriveApp.getFolderById(id)}catch(e){}}
  const f=DriveApp.createFolder("DMR Photos (private)");p.setProperty("PHOTO_FOLDER",f.getId());return f;
}
const PHOTOS_={
  save:dataUrl=>{
    const b64=dataUrl.slice(dataUrl.indexOf(",")+1);
    const blob=Utilities.newBlob(Utilities.base64Decode(b64),"image/jpeg","dmr-"+Date.now()+".jpg");
    return photoFolder_().createFile(blob).getId();
  },
  get:id=>"data:image/jpeg;base64,"+Utilities.base64Encode(DriveApp.getFileById(id).getBlob().getBytes()),
  trash:id=>{try{DriveApp.getFileById(id).setTrashed(true)}catch(e){}},
};
function doPost(e){
  let out;
  const lock=LockService.getScriptLock();
  try{
    const req=JSON.parse(e.postData.contents||"{}");
    const readOnly=req.fn==="state"||req.fn==="photo"||req.fn==="day";
    if(!readOnly)lock.waitLock(20000);
    const DB=loadDB_(),dirty={},logs=[];
    const now=Date.now();
    const ctx={DB,dirty,H:H_,photos:PHOTOS_,secret:secret_(),now,today:Utilities.formatDate(new Date(now),TZ,"yyyy-MM-dd"),
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
function doGet(){return ContentService.createTextOutput("Daily Maintenance Record API is running.")}
// Run once from the editor (▶ setupSheets) to create the tabs, the private photo folder and authorise the script.
function setupSheets(){Object.keys(COLS).forEach(sheet_);secret_();photoFolder_()}
