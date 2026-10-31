/* ===== Lost and Found Desk — server logic (runs inside Google Apps Script) =====
   Rules are enforced here, on Google's side, not in the browser:
   - passwords are stored only as salted hashes in the Users sheet
   - roles: staff (log, match, floor round, hand over), incharge (also: restricted handover, disposal, remove a restricted mark),
     admin (also: approve logins, load/delete demo records)
   - the first admin is approved automatically; every other login needs one approval from an admin
   - every time and every staff name in the records is stamped by the server, so nobody can back-date or sign as someone else
   - photos and signatures are kept in the Photos sheet and are sent only to a logged-in person who asks for them
*/
const ROLES=["staff","incharge","admin"];
const TOKEN_DAYS=120;
const TZ="Asia/Kolkata";
const HIST_LIMIT=800;
const CHUNK=40000;          // a sheet cell holds at most 50,000 characters
const MAX_PHOTO=330000;     // characters of one photo (data URL)
const DATA_URL=/^data:image\/(jpeg|png);base64,[A-Za-z0-9+\/=]+$/;
const PHOTO_ID=/^p_[a-z0-9]{6,40}$/;
const COLS_ALLOWED=["found","complaints","history","handovers"];
const SHEET_OF={found:"Found",complaints:"Complaints",history:"History",handovers:"Handovers"};
const PROTECTED=["code","at","loggedBy","loggedById","createdAt","demo","id","reportedDate","reportedTime"];

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
function docs_(sheetKey){return readAll_(SHEET_OF[sheetKey]).map(r=>Object.assign(parse_(r.json),{id:r.id}))}

function publicState(ctx,me){
  if(!me)return {today:ctx.today,me:null,users:[],found:[],comps:[],hist:[]};
  const hist=docs_("history").sort((a,b)=>(b.at||0)-(a.at||0)).slice(0,HIST_LIMIT);
  return {
    today:ctx.today,me:{name:me.name,role:me.role},
    users:me.role==="admin"?ctx.DB.Users.map(u=>({name:u.name,role:u.role,status:u.status,requestedAt:u.requestedAt||"",approvedAt:u.approvedAt||""})):[],
    found:docs_("found"),comps:docs_("complaints"),hist
  };
}

/* photos: a data URL goes into the Photos sheet in chunks and the record keeps only its id */
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
function packPhotos_(ctx,col,data){
  if(col==="found"&&data.photos!==undefined){
    const list=Array.isArray(data.photos)?data.photos:[];
    if(list.length>3)fail("Add at most 3 photos.");
    data.photos=list.map(p=>storePhoto_(ctx,p)).filter(Boolean);
  }
  if(col==="handovers"){
    if(data.proof!==undefined)data.proof=storePhoto_(ctx,data.proof);
    if(data.signature!==undefined)data.signature=storePhoto_(ctx,data.signature);
  }
}

function cleanText_(o,keys,max){keys.forEach(k=>{if(o[k]!==undefined)o[k]=str(o[k],max)})}
const TEXT_KEYS=["title","category","location","foundDate","foundTime","foundBy","keptAt","nameOnItem","classOnItem","desc","channel","reporterType","reporterName","reporterClass","contact","lastSeenPlace","lastSeenDate","lastSeenTime","status","closeReason","closeNote","lastRemark","shownOn","shownBy","returnedBy","closedBy","matchedComplaintId","matchedItemId","collectedBy","collectedClass"];

function stampTimes_(ctx,me,data){
  ["returnedAt","closedAt","shownAt"].forEach(k=>{if(data[k])data[k]=ctx.now});
  ["returnedBy","closedBy","shownBy"].forEach(k=>{if(data[k])data[k]=me.name});
  if(data.disposal&&typeof data.disposal==="object"){
    const d=data.disposal;
    data.disposal={kind:d.kind==="donate"?"donate":"dispose",reason:str(d.reason,200),by:me.name,at:ctx.now};
  }
}

function applyOp_(ctx,me,op){
  const col=op&&op.col,id=str(op&&op.id,60),kind=op&&op.op;
  if(!COLS_ALLOWED.includes(col))fail("Unknown record type.");
  if(!/^[A-Za-z0-9_-]{2,60}$/.test(id))fail("Unknown record.");
  const sheet=SHEET_OF[col],row=findRow_(sheet,id),cur=row?parse_(row.json):null;
  let data=op.data&&typeof op.data==="object"?JSON.parse(JSON.stringify(op.data)):{};
  const nowIso=new Date(ctx.now).toISOString();

  if(col==="history"){
    if(kind!=="set"||row)fail("History cannot be changed.");
    const h={caseType:data.caseType==="found"?"found":"complaint",caseId:str(data.caseId,60),code:str(data.code,30),title:str(data.title,120),action:str(data.action,60),detail:str(data.detail,300),at:ctx.now,by:me.name,demo:false};
    if(!h.caseId||!h.action)fail("Incomplete history entry.");
    appendRows_("History",[[id,h.at,h.caseId,JSON.stringify(h)]]);
    return;
  }
  if(kind==="delete")fail("Records are not deleted. Close them instead.");

  if(col==="handovers"){
    if(kind!=="set"||row)fail("This item already has a handover record.");
    const item=findRow_("Found",id);if(!item)fail("Item not found.");
    const f=parse_(item.json);
    if(f.status!=="ready"&&f.status!=="in_stock")fail("This item is not waiting for handover.");
    if(f.restricted&&!isMgr(me))fail("Only an incharge can hand over a restricted item.");
    cleanText_(data,["collectedBy","collectedClass","relation","notes","complaintId"],120);
    if(!data.collectedBy)fail("Add who collected the item.");
    if(!data.proof)fail("The photo of the child with the item is required.");
    if(data.verified!==true)fail("Confirm that the owner is verified.");
    packPhotos_(ctx,col,data);
    Object.assign(data,{itemId:id,at:ctx.now,by:me.name,demo:!!f.demo});
    upsert_("Handovers",{id,json:JSON.stringify(data),updated:nowIso});
    return;
  }

  // found items and complaints
  packPhotos_(ctx,col,data);
  cleanText_(data,TEXT_KEYS,col==="found"&&data.desc!==undefined?400:300);
  stampTimes_(ctx,me,data);
  if(kind==="set"){
    if(row)fail("This record already exists.");
    if(col==="found"){
      if(!data.title||!data.location||!data.foundDate||!data.foundBy||!data.keptAt)fail("Fill in what, where, when, who found it and where it is kept.");
      if(!data.photos||!data.photos.length)fail("Add at least one photo.");
      Object.assign(data,{status:"in_stock",restricted:!!data.restricted,matchedComplaintId:""});
    }else{
      if(!data.title||!data.reporterName||!data.reporterClass||!data.desc)fail("Fill in what was lost, who is complaining, their class and a description.");
      Object.assign(data,{status:"open",matchedItemId:"",reportedDate:ctx.today,reportedTime:Utilities.formatDate(new Date(ctx.now),TZ,"HH:mm")});
    }
    const code=(col==="found"?"F-":"C-")+id.replace(/^[fc]-/,"").toUpperCase();
    Object.assign(data,{code,at:ctx.now,createdAt:ctx.now,updatedAt:ctx.now,loggedBy:me.name,demo:false});
    upsert_(sheet,{id,json:JSON.stringify(data),updated:nowIso});
    return;
  }
  if(kind!=="update"||!cur)fail("Record not found.");
  PROTECTED.forEach(k=>delete data[k]);
  if(col==="found"){
    if(data.status==="disposed"){
      needMgr(me,"confirm disposal or donation");
      if(cur.status!=="in_stock")fail("Only an item in stock can be disposed.");
      if(!data.disposal||data.disposal.reason.length<5)fail("Give a reason for the disposal.");
    }
    if(data.restricted===false&&cur.restricted)needMgr(me,"remove the restricted mark");
    if(data.status==="returned"){
      if(cur.restricted)needMgr(me,"hand over a restricted item");
      if(cur.status!=="ready"&&cur.status!=="in_stock")fail("This item cannot be handed over now.");
    }
    if(cur.status==="returned"||cur.status==="disposed"){
      if(data.status||data.restricted!==undefined||data.photos)fail("This case is closed.");
    }
  }else if(cur.status==="closed"&&data.status&&data.status!=="open")fail("This case is closed.");
  Object.assign(cur,data,{updatedAt:ctx.now});
  upsert_(sheet,{id,json:JSON.stringify(cur),updated:nowIso});
}

const API={
  state(ctx,token){return publicState(ctx,readToken(ctx.H,ctx.secret,ctx.DB,token,ctx.now))},

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

  // ops = [{op:"set"|"update", col:"found"|"complaints"|"history"|"handovers", id, data}]
  write(ctx,token,ops){
    const me=needUser(ctx,token);
    if(!Array.isArray(ops)||!ops.length||ops.length>6)fail("Nothing to save.");
    ops.forEach(op=>applyOp_(ctx,me,op));
    return publicState(ctx,me);
  },

  // every history entry of one case (the History screen shows only the latest ones)
  caseHistory(ctx,token,id){
    needUser(ctx,token);id=str(id,60);
    return readAll_("History").filter(r=>r.caseId===id).map(r=>Object.assign(parse_(r.json),{id:r.id}));
  },

  // photos on request: ids -> data URLs
  photo(ctx,token,ids){
    needUser(ctx,token);
    const out={};
    (Array.isArray(ids)?ids:[]).slice(0,10).forEach(id=>{const v=loadPhoto_(String(id));if(v)out[id]=v});
    return out;
  },

  // the handover record with its photo and signature, only for a logged-in person who opens the case
  handover(ctx,token,id){
    needUser(ctx,token);
    const row=findRow_("Handovers",str(id,60));if(!row)return null;
    const h=parse_(row.json);
    h.proof=loadPhoto_(h.proof);h.signature=loadPhoto_(h.signature);
    return h;
  },

  seedDemo(ctx,token){
    const me=needAdmin(ctx,token);
    if(docs_("found").some(f=>f.demo))fail("Demo records are already loaded.");
    const t=ctx.today,D=n=>addDays(t,-n),ms=(n,h)=>Date.parse(D(n)+"T"+(h<10?"0":"")+h+":00:00+05:30");
    const F=[
      ["f-d1","Grey sports water bottle","Water bottle","1st floor",1,"in_stock","Grey steel bottle, black lid","Riya","6B"],
      ["f-d2","Spider-Man bottle","Water bottle","Ground floor",2,"ready","Red cap, Spider-Man picture","",""],
      ["f-d3","Black insulated lunch bag","Lunch box / tiffin","Canteen",3,"in_stock","Black bag with two zips","",""],
      ["f-d4","White steel bottle with strap","Water bottle","2nd floor",5,"returned","White bottle, black strap","",""],
      ["f-d5","Scientific calculator","Electronics","Library",12,"in_stock","Casio calculator","",""],
      ["f-d6","Blue school jacket","Uniform & clothing","Playground",41,"in_stock","Navy jacket, size 30","",""],
      ["f-d7","Old sports shoe (single)","Sports gear","Sports room",55,"disposed","Single left shoe","",""],
      ["f-d8","Mobile phone (restricted)","Electronics","3rd floor",1,"in_stock","Black phone, cracked cover","",""],
      ["f-d9","Maths notebook","Books & stationery","1st floor",0,"in_stock","Class 7 maths notebook","Arjun Mehta","7A"]
    ];
    const C=[
      ["c-d1","Grey sports bottle lost","Water bottle","door","parent","Mrs Shah","6B","Grey steel bottle, name Riya","1st floor",1,"open"],
      ["c-d2","Spider-Man water bottle","Water bottle","call","parent","Mr Kapoor","3A","Red cap, Spider-Man picture","Ground floor",3,"matched"],
      ["c-d3","White bottle with strap","Water bottle","desk","student","Aman Verma","8C","White steel bottle, black strap","2nd floor",6,"closed_returned"],
      ["c-d4","Blue geometry box","Books & stationery","diary","teacher","Ms Nair","5B","Blue metal box with compass","Library",20,"closed_nf"],
      ["c-d5","Black lunch bag","Lunch box / tiffin","app","student","Diya Rao","4A","Black bag with a pink tag","Canteen",2,"open"]
    ];
    const rowsH=[];let k=1;
    const hist=(type,id,code,title,action,detail,days,h,by)=>{const at=ms(days,h);rowsH.push(["h-d"+k,at,id,JSON.stringify({caseType:type,caseId:id,code,title,action,detail,at,by,demo:true})]);k++};
    F.forEach(a=>{
      const o={code:"F-D"+a[0].slice(3),title:a[1]+" (demo)",category:a[2],location:a[3],foundDate:D(a[4]),foundTime:"10:20",foundBy:"Mansi",keptAt:a[3]==="Canteen"?"Canteen store":"Front office cupboard",status:a[5],photos:[],desc:a[6],nameOnItem:a[7],classOnItem:a[8],at:ms(a[4],10),createdAt:ms(a[4],10),updatedAt:ms(a[4],10),loggedBy:"Mansi",demo:true,restricted:a[0]==="f-d8",matchedComplaintId:""};
      if(a[0]==="f-d2")o.matchedComplaintId="c-d2";
      if(a[0]==="f-d4"){o.matchedComplaintId="c-d3";o.returnedAt=ms(4,11);o.returnedBy="Mansi";o.collectedBy="Aman Verma";o.collectedClass="8C"}
      if(a[0]==="f-d7")o.disposal={kind:"donate",reason:"Unclaimed for 55 days. Donated to the charity drive.",by:"Mansi (incharge)",at:ms(20,12)};
      upsert_("Found",{id:a[0],json:JSON.stringify(o),updated:new Date(ctx.now).toISOString()});
      hist("found",a[0],o.code,o.title,"Logged found item",a[3],a[4],10,"Mansi");
    });
    C.forEach(a=>{
      const st=a[10]==="open"?"open":a[10]==="matched"?"matched":"closed";
      const o={code:"C-D"+a[0].slice(3),title:a[1]+" (demo)",category:a[2],channel:a[3],reporterType:a[4],reporterName:a[5],reporterClass:a[6],contact:"",desc:a[7],lastSeenPlace:a[8],lastSeenDate:D(a[9]+1),lastSeenTime:"",reportedDate:D(a[9]),reportedTime:"09:40",at:ms(a[9],9),createdAt:ms(a[9],9),updatedAt:ms(a[9],9),status:st,loggedBy:"Mansi",matchedItemId:"",demo:true};
      if(a[0]==="c-d2")o.matchedItemId="f-d2";
      if(a[0]==="c-d3"){o.closeReason="returned";o.closedAt=ms(4,11);o.closedBy="Mansi";o.matchedItemId="f-d4"}
      if(a[0]==="c-d4"){o.closeReason="not_found";o.closedAt=ms(8,10);o.closedBy="Pooja";o.closeNote="Checked all floors, library and bus. Not found."}
      upsert_("Complaints",{id:a[0],json:JSON.stringify(o),updated:new Date(ctx.now).toISOString()});
      hist("complaint",a[0],o.code,o.title,"Logged complaint",a[5]+", "+a[6],a[9],9,"Mansi");
    });
    hist("complaint","c-d2","C-D2","Spider-Man water bottle (demo)","Match confirmed","Item F-D2",2,11,"Pooja");
    hist("found","f-d4","F-D4","White steel bottle with strap (demo)","Handed over","Collected by Aman Verma, 8C, owner verified, photo saved",4,11,"Mansi");
    hist("found","f-d7","F-D7","Old sports shoe (single) (demo)","Donated","Unclaimed for 55 days. Donated to the charity drive.",20,12,"Mansi (incharge)");
    appendRows_("History",rowsH);
    upsert_("Handovers",{id:"f-d4",json:JSON.stringify({itemId:"f-d4",complaintId:"c-d3",collectedBy:"Aman Verma",collectedClass:"8C",relation:"self",verified:true,proof:"",signature:"",notes:"",at:ms(4,11),by:"Mansi",demo:true}),updated:new Date(ctx.now).toISOString()});
    ctx.log(me.name,"load demo","","");
    return publicState(ctx,me);
  },

  deleteDemo(ctx,token){
    const me=needAdmin(ctx,token);
    ["Found","Complaints"].forEach(s=>{
      readAll_(s).filter(r=>parse_(r.json).demo).forEach(r=>{deleteRow_(s,r.id);if(s==="Found")deleteRow_("Handovers",r.id)});
    });
    readAll_("History").filter(r=>parse_(r.json).demo).forEach(r=>deleteRow_("History",r.id));
    ctx.log(me.name,"delete demo","","");
    return publicState(ctx,me);
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
  Found:["id","json","updated"],
  Complaints:["id","json","updated"],
  History:["id","at","caseId","json"],
  Handovers:["id","json","updated"],
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
    const readOnly=req.fn==="state"||req.fn==="photo"||req.fn==="handover"||req.fn==="caseHistory";
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
function doGet(){return ContentService.createTextOutput("Lost and Found Desk API is running.")}
// Run once from the editor (▶ setupSheets) to create the tabs and authorise the script.
function setupSheets(){Object.keys(COLS).forEach(sheet_);secret_()}
