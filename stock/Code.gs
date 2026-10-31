/* ===== Stock and Purchase Desk — server logic (runs inside Google Apps Script) =====
   Rules are enforced here, on Google's side, not in the browser:
   - passwords are stored only as salted hashes in the Users sheet
   - roles: staff (log requests, buy, hand over, remarks), incharge (same, plus delete a wrong request),
     admin (also: approve logins, reset and remove logins, delete requests)
   - the first admin is approved automatically; every other login needs one approval from an admin
   - every time and name in the history of a request (the "log") is stamped by the server,
     so nobody can back-date or sign as someone else
   - photos are kept in the Photos sheet and are sent only to a logged-in person
*/
const ROLES=["staff","incharge","admin"];
const TOKEN_DAYS=120;
const TZ="Asia/Kolkata";
const CHUNK=40000;          // a sheet cell holds at most 50,000 characters
const MAX_PHOTO=330000;     // characters of one photo (data URL)
const MAX_DOC=45000;        // characters of one request record
const DATA_URL=/^data:image\/(jpeg|png);base64,[A-Za-z0-9+\/=]+$/;
const PHOTO_ID=/^p_[a-z0-9]{6,40}$/;
const PHOTO_KEYS=["refImg","billImg","handImg","arrImg","refundImg"];

function fail(m){throw new Error(m)}
function str(v,max){return String(v==null?"":v).trim().slice(0,max)}
function isMgr(u){return u.role==="incharge"||u.role==="admin"}
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
function needMgr(u,what){if(!isMgr(u))fail("Only an incharge can "+what+".")}

function parse_(json){try{return JSON.parse(json)}catch(e){return {}}}
function requests_(){return readAll_("Requests").map(r=>Object.assign(parse_(r.json),{id:r.id}))}
function rev_(){return PropertiesService.getScriptProperties().getProperty("REV")||"0"}
function bump_(){const p=PropertiesService.getScriptProperties();const v=String(Number(p.getProperty("REV")||"0")+1);p.setProperty("REV",v);return v}

function publicState(ctx,me,since){
  if(!me)return {me:null,users:[],items:[],rev:"0"};
  const rev=rev_()+"/"+ctx.DB.Users.length+"/"+ctx.DB.Users.filter(u=>u.status==="pending").length;
  const base={me:{name:me.name,role:me.role},rev};
  if(since&&since===rev)return Object.assign(base,{same:true});
  return Object.assign(base,{
    users:me.role==="admin"?ctx.DB.Users.map(u=>({name:u.name,role:u.role,status:u.status,requestedAt:u.requestedAt||"",approvedAt:u.approvedAt||""})):[],
    items:requests_()
  });
}

/* a photo data URL goes into the Photos sheet in chunks; the record keeps only its id */
function storePhoto_(ctx,v){
  if(typeof v!=="string"||!v)return "";
  if(PHOTO_ID.test(v))return v;
  if(!DATA_URL.test(v)||v.length>MAX_PHOTO)fail("That photo is not valid or is too large. Take it again.");
  const id="p_"+ctx.H.salt().slice(0,16);
  const rows=[];
  for(let i=0,n=0;i<v.length;i+=CHUNK,n++)rows.push([id,n,v.slice(i,i+CHUNK)]);
  appendRows_("Photos",rows);
  return id;
}
function loadPhoto_(id){
  if(!PHOTO_ID.test(id))return "";
  const rows=findRows_("Photos",id).sort((a,b)=>Number(a.n)-Number(b.n));
  return rows.map(r=>r.chunk).join("");
}

// The browser sends the fields it wants to change. The server keeps the rest, checks the photos and stamps the log.
function applyOp_(ctx,me,op){
  const id=str(op&&op.id,60),kind=op&&op.op;
  if(!/^[A-Za-z0-9_-]{2,60}$/.test(id))fail("Unknown request.");
  const row=findRow_("Requests",id),cur=row?parse_(row.json):null;
  const nowIso=new Date(ctx.now).toISOString();
  if(kind==="delete"){
    if(me.role==="staff")fail("Only an incharge or the admin can delete a request.");
    if(row){deleteRow_("Requests",id);ctx.log(me.name,"delete request",id,String(cur.item||""))}
    return;
  }
  let data=op.data&&typeof op.data==="object"?JSON.parse(JSON.stringify(op.data)):{};
  if(kind==="set"&&row)fail("This request already exists.");
  if(kind==="update"&&!row)fail("Request not found.");
  if(kind!=="set"&&kind!=="update")fail("Unknown action.");
  const doc=kind==="set"?{}:cur;
  // remove fields the page asked to delete
  Object.keys(data).forEach(k=>{if(data[k]&&typeof data[k]==="object"&&!Array.isArray(data[k])&&data[k].__delete__){delete doc[k];delete data[k]}});
  // photos: refImg, billImg, ... and one image per item
  PHOTO_KEYS.forEach(k=>{if(data[k]!==undefined)data[k]=storePhoto_(ctx,data[k])||null});
  if(Array.isArray(data.items))data.items.forEach(it=>{if(it&&it.img!==undefined)it.img=storePhoto_(ctx,it.img)||null});
  // the log is append-only and stamped here
  if(data.log!==undefined){
    const old=Array.isArray(doc.log)?doc.log:[],sent=Array.isArray(data.log)?data.log:[];
    if(sent.length<old.length)fail("The history of a request cannot be shortened.");
    data.log=old.concat(sent.slice(old.length).map(e=>({at:new Date(ctx.now).toISOString(),by:me.name,kind:e&&e.kind==="remark"?"remark":"event",text:str(e&&e.text,400)})));
  }
  if(kind==="set"){
    if(!data.item||!data.kind)fail("Fill in the item.");
    data.createdAt=nowIso;
    data.loggedBy=me.name;
  }
  ["createdAt","loggedBy"].forEach(k=>{if(kind==="update")delete data[k]});
  Object.assign(doc,data);
  const json=JSON.stringify(doc);
  if(json.length>MAX_DOC)fail("This request has become too long to save.");
  upsert_("Requests",{id,json,updated:nowIso});
  if(kind==="set")ctx.log(me.name,"new request",id,String(doc.item||""));
}

const API={
  state(ctx,token,since){return publicState(ctx,readToken(ctx.H,ctx.secret,ctx.DB,token,ctx.now),since)},

  setup(ctx,name,pw,wantRole){
    const DB=ctx.DB;name=str(name,40);pw=String(pw||"");
    if(!name)fail("Type your name.");
    if(pw.length<6)fail("Password must be at least 6 characters.");
    const role=ROLES.includes(wantRole)?wantRole:"staff";
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
    if(u.status==="active")return {token:makeToken(ctx.H,ctx.secret,u,ctx.now),state:publicState(ctx,u)};
    return {pending:true,state:publicState(ctx,null)};
  },

  login(ctx,name,pw){
    const u=ctx.DB.Users.find(x=>x.name.toLowerCase()===str(name,40).toLowerCase());
    if(u&&u.status==="reset")fail("Your password was reset. Use “First time? Set password” to choose a new one.");
    if(!u||!u.hash)fail("No login for this name yet. Use “First time? Set password”.");
    if(hashPw(ctx.H,u.salt,String(pw||""))!==u.hash)fail("Wrong password.");
    if(u.status!=="active")fail("Your login is waiting for the admin to approve it.");
    return {token:makeToken(ctx.H,ctx.secret,u,ctx.now),state:publicState(ctx,u)};
  },

  // ops = [{op:"set"|"update"|"delete", id, data}]
  write(ctx,token,ops){
    const me=needUser(ctx,token);
    if(!Array.isArray(ops)||!ops.length||ops.length>60)fail("Nothing to save.");
    ops.forEach(op=>applyOp_(ctx,me,op));
    bump_();
    return publicState(ctx,me);
  },

  // photos on request: ids -> data URLs
  photo(ctx,token,ids){
    needUser(ctx,token);
    const out={};
    (Array.isArray(ids)?ids:[]).slice(0,10).forEach(id=>{const v=loadPhoto_(String(id));if(v)out[id]=v});
    return out;
  },

  // store one photo and return its id (used before the record that points to it is saved)
  putPhoto(ctx,token,dataUrl){
    needUser(ctx,token);
    return storePhoto_(ctx,dataUrl);
  },

  approve(ctx,token,name,role){
    const me=needAdmin(ctx,token);const u=ctx.DB.Users.find(x=>x.name===name);if(!u)fail("Request not found.");
    if(u.name===me.name&&role!=="admin")fail("You can't change your own role.");
    u.role=ROLES.includes(role)?role:u.role;
    if(u.status==="pending"){u.status="active";u.approvedAt=new Date(ctx.now).toISOString();u.approvedBy=me.name}
    else u.ver=Number(u.ver||1)+1;
    ctx.dirty.Users=true;ctx.log(me.name,"approve login",name,u.role);
    return publicState(ctx,me);
  },
  resetUser(ctx,token,name){
    const me=needAdmin(ctx,token);const u=ctx.DB.Users.find(x=>x.name===name);if(!u)fail("Login not found.");
    if(u.name===me.name)fail("You can't reset your own login.");
    u.status="reset";u.hash="";u.salt="";u.ver=Number(u.ver||1)+1;ctx.dirty.Users=true;ctx.log(me.name,"reset login",name,"");
    return publicState(ctx,me);
  },
  removeUser(ctx,token,name){
    const me=needAdmin(ctx,token);if(name===me.name)fail("You can't remove your own login.");
    ctx.DB.Users=ctx.DB.Users.filter(x=>x.name!==name);ctx.dirty.Users=true;ctx.log(me.name,"remove login",name,"");
    return publicState(ctx,me);
  },
};
function runApi(ctx,fn,args){
  if(!Object.prototype.hasOwnProperty.call(API,fn))fail("Unknown action.");
  return API[fn].apply(null,[ctx].concat(args||[]));
}


/* ===== Google Sheet storage + web app entry point ===== */
const COLS={
  Users:["name","role","status","salt","hash","ver","requestedAt","approvedAt","approvedBy"],
  Requests:["id","json","updated"],
  Photos:["id","n","chunk"],
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
function findRows_(name,id){
  const sh=sheet_(name),n=sh.getLastRow()-1;if(n<1)return [];
  const cols=COLS[name],all=sh.getRange(2,1,n,cols.length).getDisplayValues();
  return all.filter(r=>r[0]===id).map(r=>Object.fromEntries(cols.map((c,i)=>[c,r[i]])));
}
function upsert_(name,obj){
  const sh=sheet_(name),cols=COLS[name];
  const row=rowIndex_(sh,String(obj.id))||Math.max(sh.getLastRow(),1)+1;
  sh.getRange(row,1,1,cols.length).setNumberFormat("@").setValues([cols.map(c=>obj[c]==null?"":obj[c])]);
}
function appendRows_(name,rows){
  if(!rows.length)return;
  const sh=sheet_(name),cols=COLS[name],start=Math.max(sh.getLastRow(),1)+1;
  sh.getRange(start,1,rows.length,cols.length).setNumberFormat("@").setValues(rows);
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
    const readOnly=req.fn==="state"||req.fn==="photo";
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
function doGet(){return ContentService.createTextOutput("Stock and Purchase Desk API is running.")}
// Run once from the editor (▶ setupSheets) to create the tabs and authorise the script.
function setupSheets(){Object.keys(COLS).forEach(sheet_);secret_()}
