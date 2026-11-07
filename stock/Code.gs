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
const OPEN=true;   // no passwords: staff just type their name. Set to false to go back to logins.
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
  if(OPEN){
    const n=typeof token==="string"&&token.indexOf("open:")===0?token.slice(5).replace(/[\u0000-\u001f]/g,"").trim().slice(0,40):"";
    return n.length>=2?{name:n,role:"incharge",status:"active",ver:"1"}:null;
  }
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


  // admin only: loads stock orders and purchases that cover every case (pending, bought, handed over, refund, not available, ...)
  seedDemo(ctx,token){
    const me=OPEN?needUser(ctx,token):needAdmin(ctx,token);
    if(requests_().some(r=>r.sample))fail("Sample data is already loaded.");
    const days=Math.round((Date.parse(ctx.today+"T00:00:00Z")-Date.parse(DEMO_BASE+"T00:00:00Z"))/864e5);
    const nowIso=new Date(ctx.now).toISOString();
    DEMO.forEach(d=>{
      const doc=shiftDemo_(d,days),id=doc.id;delete doc.id;
      upsert_("Requests",{id,json:JSON.stringify(doc),updated:nowIso});
    });
    bump_();ctx.log(me.name,"load sample data","",String(DEMO.length));
    return publicState(ctx,me);
  },

  deleteDemo(ctx,token){
    const me=OPEN?needUser(ctx,token):needAdmin(ctx,token);
    readAll_("Requests").filter(r=>parse_(r.json).sample).forEach(r=>deleteRow_("Requests",r.id));
    bump_();ctx.log(me.name,"delete sample data","","");
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
/* ===== sample data: stock orders and purchases covering every case; times are shifted so the newest are today ===== */
const DEMO_BASE="2026-10-28";
const DEMO=[{"id":"demo-01","kind":"stock","origKind":"stock","createdAt":"2026-10-28T03:10:00.000Z","staff":"Teacher A","item":"Whiteboard markers (black)","qty":24,"unit":"pcs","deadline":"2026-10-29","refImg":null,"approvedBy":"Principal","approvedAt":"2026-10-28T03:35:00.000Z","estPrice":null,"status":"pending","log":[{"at":"2026-10-28T03:10:00.000Z","by":"Teacher A","kind":"event","text":"Stock order logged"},{"at":"2026-10-28T03:35:00.000Z","by":"Principal","kind":"event","text":"Approved by Principal"},{"at":"2026-10-28T04:45:00.000Z","by":"Store Manager","kind":"remark","text":"Only 10 in stock. The remaining 14 will come with the next purchase."}],"sample":true,"items":[{"item":"Whiteboard markers (black)","qty":24,"unit":"pcs","est":null,"price":null}],"department":"Academics"},{"id":"demo-02","kind":"stock","origKind":"stock","createdAt":"2026-10-28T03:50:00.000Z","staff":"Teacher B","item":"Chart paper (assorted colours)","qty":40,"unit":"sheets","deadline":"2026-11-02","refImg":null,"approvedBy":"","approvedAt":null,"estPrice":null,"status":"pending","log":[{"at":"2026-10-28T03:50:00.000Z","by":"Teacher B","kind":"event","text":"Stock order logged"},{"at":"2026-10-28T04:10:00.000Z","by":"Teacher B","kind":"remark","text":"Needed for Class 4 project week. Waiting for approval."}],"sample":true,"items":[{"item":"Chart paper (assorted colours)","qty":40,"unit":"sheets","est":null,"price":null}],"department":"Primary Wing"},{"id":"demo-03","kind":"stock","origKind":"stock","createdAt":"2026-10-23T04:30:00.000Z","staff":"Teacher C","item":"Duster (board)","qty":6,"unit":"pcs","deadline":"2026-10-25","refImg":null,"approvedBy":"Principal","approvedAt":"2026-10-23T05:30:00.000Z","estPrice":null,"status":"pending","log":[{"at":"2026-10-23T04:30:00.000Z","by":"Teacher C","kind":"event","text":"Stock order logged"},{"at":"2026-10-23T05:30:00.000Z","by":"Principal","kind":"event","text":"Approved by Principal"},{"at":"2026-10-26T04:00:00.000Z","by":"Teacher C","kind":"remark","text":"Class 6B still has no duster."},{"at":"2026-10-27T04:30:00.000Z","by":"Store Manager","kind":"remark","text":"Will issue once the stock is received."}],"sample":true,"items":[{"item":"Duster (board)","qty":6,"unit":"pcs","est":null,"price":null}],"department":"Academics"},{"id":"demo-04","kind":"stock","origKind":"stock","createdAt":"2026-10-26T03:30:00.000Z","staff":"Office Staff","item":"A4 paper ream","qty":5,"unit":"reams","deadline":"2026-10-28","refImg":null,"approvedBy":"Principal","approvedAt":"2026-10-26T04:00:00.000Z","estPrice":null,"status":"handed","log":[{"at":"2026-10-26T03:30:00.000Z","by":"Office Staff","kind":"event","text":"Stock order logged"},{"at":"2026-10-26T04:00:00.000Z","by":"Principal","kind":"event","text":"Approved by Principal"},{"at":"2026-10-27T06:40:00.000Z","by":"Store Manager","kind":"event","text":"Handed over to Office Staff by Store Manager"}],"sample":true,"handedTo":"Office Staff","handedBy":"Store Manager","handedAt":"2026-10-27T06:40:00.000Z","handImg":null,"handNote":"Issued from shelf 2","items":[{"item":"A4 paper ream","qty":5,"unit":"reams","est":null,"price":null}],"department":"Administration","accepted":"yes"},{"id":"demo-05","kind":"stock","origKind":"stock","createdAt":"2026-10-22T05:00:00.000Z","staff":"Teacher D","item":"Stapler pins (box)","qty":10,"unit":"boxes","deadline":"2026-10-26","refImg":null,"approvedBy":"Principal","approvedAt":"2026-10-22T05:30:00.000Z","estPrice":null,"status":"handed","log":[{"at":"2026-10-22T05:00:00.000Z","by":"Teacher D","kind":"event","text":"Stock order logged"},{"at":"2026-10-22T05:30:00.000Z","by":"Principal","kind":"event","text":"Approved by Principal"},{"at":"2026-10-25T04:30:00.000Z","by":"Store Manager","kind":"remark","text":"Out of stock. Waiting for the vendor to deliver."},{"at":"2026-10-28T06:00:00.000Z","by":"Store Manager","kind":"event","text":"Handed over to Teacher D by Store Manager"}],"sample":true,"handedTo":"Teacher D","handedBy":"Store Manager","handedAt":"2026-10-28T06:00:00.000Z","handImg":null,"handNote":"Delayed. Stock refilled today.","items":[{"item":"Stapler pins (box)","qty":10,"unit":"boxes","est":null,"price":null}],"department":"Academics","accepted":"yes"},{"id":"demo-06","kind":"stock","origKind":"stock","createdAt":"2026-10-24T05:30:00.000Z","staff":"Teacher E","item":"Decorative lights for stage","qty":20,"unit":"pcs","deadline":"2026-10-30","refImg":null,"approvedBy":"","approvedAt":null,"estPrice":null,"status":"unapproved","log":[{"at":"2026-10-24T05:30:00.000Z","by":"Teacher E","kind":"event","text":"Stock order logged"},{"at":"2026-10-24T09:30:00.000Z","by":"Teacher E","kind":"remark","text":"Needed for the Annual Day rehearsal."},{"at":"2026-10-25T04:30:00.000Z","by":"Director","kind":"event","text":"Not approved: Not in this term's budget. Use the existing stage lights."}],"sample":true,"unapprovedBy":"Director","unapprovedAt":"2026-10-25T04:30:00.000Z","unapprovedWhy":"Not in this term's budget. Use the existing stage lights.","items":[{"item":"Decorative lights for stage","qty":20,"unit":"pcs","est":null,"price":null}],"department":"Events"},{"id":"demo-07","kind":"stock","origKind":"stock","createdAt":"2026-10-21T04:00:00.000Z","staff":"PE Teacher","item":"Football (size 5)","qty":4,"unit":"pcs","deadline":"2026-10-27","refImg":null,"approvedBy":"Principal","approvedAt":"2026-10-21T04:30:00.000Z","estPrice":null,"status":"cancelled","log":[{"at":"2026-10-21T04:00:00.000Z","by":"PE Teacher","kind":"event","text":"Stock order logged"},{"at":"2026-10-21T04:30:00.000Z","by":"Principal","kind":"event","text":"Approved by Principal"},{"at":"2026-10-22T08:30:00.000Z","by":"PE Teacher","kind":"event","text":"Cancelled: Found 4 balls in the sports room."}],"sample":true,"cancelledBy":"PE Teacher","cancelledAt":"2026-10-22T08:30:00.000Z","cancelledWhy":"Found 4 balls in the sports room.","items":[{"item":"Football (size 5)","qty":4,"unit":"pcs","est":null,"price":null}],"department":"Sports"},{"id":"demo-08","kind":"stock","origKind":"purchase","createdAt":"2026-10-25T04:30:00.000Z","staff":"Science Teacher","item":"Lab beakers (250 ml)","qty":12,"unit":"pcs","deadline":"2026-10-29","refImg":null,"approvedBy":"Principal","approvedAt":"2026-10-25T05:30:00.000Z","estPrice":140,"status":"pending","log":[{"at":"2026-10-25T04:30:00.000Z","by":"Science Teacher","kind":"event","text":"Purchase request logged"},{"at":"2026-10-25T05:30:00.000Z","by":"Principal","kind":"event","text":"Approved by Principal"},{"at":"2026-10-26T10:30:00.000Z","by":"Buyer","kind":"event","text":"Sent to store: The store already has beakers in the old lab cupboard"},{"at":"2026-10-28T04:15:00.000Z","by":"Store Manager","kind":"remark","text":"Checking the old lab cupboard. Will confirm tomorrow."}],"sample":true,"routedFrom":"purchase","routedAt":"2026-10-26T10:30:00.000Z","items":[{"item":"Lab beakers (250 ml)","qty":12,"unit":"pcs","est":140,"price":null}],"department":"Science Lab"},{"id":"demo-09","kind":"purchase","origKind":"purchase","createdAt":"2026-10-28T02:45:00.000Z","staff":"Office Staff","item":"Printer toner (HP 12A)","qty":2,"unit":"pcs","deadline":"2026-10-31","refImg":null,"approvedBy":"Director","approvedAt":"2026-10-28T03:30:00.000Z","estPrice":3200,"status":"pending","log":[{"at":"2026-10-28T02:45:00.000Z","by":"Office Staff","kind":"event","text":"Purchase request logged"},{"at":"2026-10-28T03:30:00.000Z","by":"Director","kind":"event","text":"Approved by Director"},{"at":"2026-10-28T05:00:00.000Z","by":"Buyer","kind":"remark","text":"Getting quotes from two vendors."}],"sample":true,"items":[{"item":"Printer toner (HP 12A)","qty":2,"unit":"pcs","est":3200,"price":null}],"department":"Administration"},{"id":"demo-10","kind":"purchase","origKind":"purchase","createdAt":"2026-10-22T06:30:00.000Z","staff":"PE Teacher","item":"Sports day trophies","qty":12,"unit":"pcs","deadline":"2026-10-27","refImg":null,"approvedBy":"","approvedAt":null,"estPrice":450,"status":"pending","log":[{"at":"2026-10-22T06:30:00.000Z","by":"PE Teacher","kind":"event","text":"Purchase request logged"},{"at":"2026-10-26T04:30:00.000Z","by":"PE Teacher","kind":"remark","text":"The event is on 2 Nov. Need approval urgently."},{"at":"2026-10-27T06:00:00.000Z","by":"Office Staff","kind":"remark","text":"Sent to the Director for approval."}],"sample":true,"items":[{"item":"Sports day trophies","qty":12,"unit":"pcs","est":450,"price":null}],"department":"Sports"},{"id":"demo-11","kind":"purchase","origKind":"purchase","createdAt":"2026-10-26T05:00:00.000Z","staff":"Art Teacher","item":"Poster colours (set of 12)","qty":30,"unit":"sets","deadline":"2026-10-29","refImg":null,"approvedBy":"Principal","approvedAt":"2026-10-26T05:30:00.000Z","estPrice":85,"status":"bought","log":[{"at":"2026-10-26T05:00:00.000Z","by":"Art Teacher","kind":"event","text":"Purchase request logged"},{"at":"2026-10-26T05:30:00.000Z","by":"Principal","kind":"event","text":"Approved by Principal"},{"at":"2026-10-27T09:30:00.000Z","by":"Buyer","kind":"event","text":"Bought by Buyer at Rs 80 per unit, total Rs 2,400"},{"at":"2026-10-27T09:50:00.000Z","by":"Buyer","kind":"remark","text":"The shop will deliver tomorrow morning."}],"sample":true,"buyer":"Buyer","price":80,"total":2400,"boughtAt":"2026-10-27T09:30:00.000Z","billImg":null,"buyNote":"Gupta Stationers, bill no. 4471","items":[{"item":"Poster colours (set of 12)","qty":30,"unit":"sets","est":85,"price":80,"lineTotal":2400,"bought":true,"shop":"Gupta Stationers","bill":"yes"}],"department":"Art and Craft","shop":"Gupta Stationers"},{"id":"demo-12","kind":"purchase","origKind":"purchase","createdAt":"2026-10-24T04:00:00.000Z","staff":"Housekeeping Head","item":"Dustbin bags (large)","qty":20,"unit":"packs","deadline":"2026-10-27","refImg":null,"approvedBy":"Principal","approvedAt":"2026-10-24T04:30:00.000Z","estPrice":120,"status":"handed","log":[{"at":"2026-10-24T04:00:00.000Z","by":"Housekeeping Head","kind":"event","text":"Purchase request logged"},{"at":"2026-10-24T04:30:00.000Z","by":"Principal","kind":"event","text":"Approved by Principal"},{"at":"2026-10-25T08:30:00.000Z","by":"Buyer","kind":"event","text":"Bought by Buyer at Rs 115 per unit, total Rs 2,300"},{"at":"2026-10-26T05:00:00.000Z","by":"Store Manager","kind":"event","text":"Handed over to Housekeeping Head by Store Manager, kept at Store room, shelf 4"}],"sample":true,"buyer":"Buyer","price":115,"total":2300,"boughtAt":"2026-10-25T08:30:00.000Z","handedTo":"Housekeeping Head","handedBy":"Store Manager","handedAt":"2026-10-26T05:00:00.000Z","keptAt":"Store room, shelf 4","handNote":"All 20 packs counted","items":[{"item":"Dustbin bags (large)","qty":20,"unit":"packs","est":120,"price":115,"lineTotal":2300,"bought":true,"shop":"Kumar General Store","bill":"yes"}],"department":"Housekeeping","shop":"Kumar General Store","accepted":"yes"},{"id":"demo-13","kind":"purchase","origKind":"purchase","createdAt":"2026-10-23T05:30:00.000Z","staff":"Teacher F","item":"Economics reference book, 2026 edition","qty":3,"unit":"pcs","deadline":"2026-10-30","refImg":null,"approvedBy":"Principal","approvedAt":"2026-10-23T06:30:00.000Z","estPrice":650,"status":"unavailable","log":[{"at":"2026-10-23T05:30:00.000Z","by":"Teacher F","kind":"event","text":"Purchase request logged"},{"at":"2026-10-23T06:30:00.000Z","by":"Principal","kind":"event","text":"Approved by Principal"},{"at":"2026-10-25T11:30:00.000Z","by":"Buyer","kind":"event","text":"Not available in market: Visited 3 shops. The publisher says stock will arrive after 15 Nov."},{"at":"2026-10-25T12:00:00.000Z","by":"Buyer","kind":"remark","text":"The 2025 edition is available. Waiting for your confirmation."},{"at":"2026-10-26T03:30:00.000Z","by":"Teacher F","kind":"remark","text":"Checking with the HOD whether the 2025 edition works."}],"sample":true,"unavailableBy":"Buyer","unavailableAt":"2026-10-25T11:30:00.000Z","unavailableNote":"Visited 3 shops. The publisher says stock will arrive after 15 Nov.","items":[{"item":"Economics reference book, 2026 edition","qty":3,"unit":"pcs","est":650,"price":null}],"department":"Academics"},{"id":"demo-14","kind":"purchase","origKind":"purchase","createdAt":"2026-10-20T04:30:00.000Z","staff":"Science Teacher","item":"Lab coats (size M)","qty":10,"unit":"pcs","deadline":"2026-10-24","refImg":null,"approvedBy":"Principal","approvedAt":"2026-10-20T05:30:00.000Z","estPrice":600,"status":"refunded","log":[{"at":"2026-10-20T04:30:00.000Z","by":"Science Teacher","kind":"event","text":"Purchase request logged"},{"at":"2026-10-20T05:30:00.000Z","by":"Principal","kind":"event","text":"Approved by Principal"},{"at":"2026-10-21T09:30:00.000Z","by":"Buyer","kind":"event","text":"Bought by Buyer at Rs 580 per unit, total Rs 5,800"},{"at":"2026-10-22T04:30:00.000Z","by":"Science Teacher","kind":"remark","text":"These are size L, not M."},{"at":"2026-10-24T08:30:00.000Z","by":"Buyer","kind":"event","text":"Refund Rs 5,800: Wrong size supplied. The vendor refunded the full amount."}],"sample":true,"buyer":"Buyer","price":580,"total":5800,"boughtAt":"2026-10-21T09:30:00.000Z","buyNote":"Sharma Uniforms","refundAmount":5800,"refundWhy":"Wrong size supplied. The vendor refunded the full amount.","refundedBy":"Buyer","refundedAt":"2026-10-24T08:30:00.000Z","items":[{"item":"Lab coats (size M)","qty":10,"unit":"pcs","est":600,"price":580,"lineTotal":5800,"bought":true,"shop":"Sharma Uniforms","bill":"yes"}],"department":"Science Lab","shop":"Sharma Uniforms"},{"id":"demo-15","kind":"purchase","origKind":"purchase","createdAt":"2026-10-24T08:30:00.000Z","staff":"Event Coordinator","item":"Folding tables (Annual Day)","qty":6,"unit":"pcs","deadline":"2026-10-30","refImg":null,"approvedBy":"Principal","approvedAt":"2026-10-24T09:00:00.000Z","estPrice":null,"status":"arranged","log":[{"at":"2026-10-24T08:30:00.000Z","by":"Event Coordinator","kind":"event","text":"Purchase request logged"},{"at":"2026-10-24T09:00:00.000Z","by":"Principal","kind":"event","text":"Approved by Principal"},{"at":"2026-10-26T07:30:00.000Z","by":"Buyer","kind":"event","text":"Arranged without buying: Borrowed from the community hall, no purchase needed."},{"at":"2026-10-26T07:40:00.000Z","by":"Buyer","kind":"remark","text":"Must be returned after Annual Day."}],"sample":true,"arrangedBy":"Buyer","arrangedAt":"2026-10-26T07:30:00.000Z","arrangedHow":"Borrowed from the community hall, no purchase needed.","keptAt":"Auditorium side room","items":[{"item":"Folding tables (Annual Day)","qty":6,"unit":"pcs","est":null,"price":null}],"department":"Events"},{"id":"demo-16","kind":"purchase","origKind":"stock","createdAt":"2026-10-27T03:30:00.000Z","staff":"Teacher A","item":"Whiteboard cleaner spray","qty":6,"unit":"bottles","deadline":"2026-10-28","refImg":null,"approvedBy":"Principal","approvedAt":"2026-10-27T03:50:00.000Z","estPrice":90,"status":"pending","log":[{"at":"2026-10-27T03:30:00.000Z","by":"Teacher A","kind":"event","text":"Stock order logged"},{"at":"2026-10-27T03:50:00.000Z","by":"Principal","kind":"event","text":"Approved by Principal"},{"at":"2026-10-27T05:30:00.000Z","by":"Store Manager","kind":"event","text":"Sent to purchase: Not in stock"},{"at":"2026-10-28T03:40:00.000Z","by":"Buyer","kind":"remark","text":"Will buy this afternoon."}],"sample":true,"routedFrom":"stock","routedAt":"2026-10-27T05:30:00.000Z","items":[{"item":"Whiteboard cleaner spray","qty":6,"unit":"bottles","est":90,"price":null}],"department":"Academics"},{"id":"demo-17","kind":"purchase","origKind":"purchase","createdAt":"2026-10-21T04:45:00.000Z","staff":"Office Staff","item":"Notice board pins (box)","qty":20,"unit":"boxes","deadline":"2026-10-25","refImg":null,"approvedBy":"Principal","approvedAt":"2026-10-21T05:30:00.000Z","estPrice":40,"status":"refunded","log":[{"at":"2026-10-21T04:45:00.000Z","by":"Office Staff","kind":"event","text":"Purchase request logged"},{"at":"2026-10-21T05:30:00.000Z","by":"Principal","kind":"event","text":"Approved by Principal"},{"at":"2026-10-22T07:30:00.000Z","by":"Buyer","kind":"event","text":"Bought by Buyer at Rs 40 per unit, total Rs 800"},{"at":"2026-10-23T05:30:00.000Z","by":"Store Manager","kind":"event","text":"Handed over to Office Staff by Store Manager, kept at Office cupboard"},{"at":"2026-10-24T06:30:00.000Z","by":"Buyer","kind":"event","text":"Refund Rs 120: 3 boxes were damaged. The vendor refunded those."}],"sample":true,"buyer":"Buyer","price":40,"total":800,"boughtAt":"2026-10-22T07:30:00.000Z","handedTo":"Office Staff","handedBy":"Store Manager","handedAt":"2026-10-23T05:30:00.000Z","keptAt":"Office cupboard","refundAmount":120,"refundWhy":"3 boxes were damaged. The vendor refunded those.","refundedBy":"Buyer","refundedAt":"2026-10-24T06:30:00.000Z","items":[{"item":"Notice board pins (box)","qty":20,"unit":"boxes","est":40,"price":40,"lineTotal":800,"bought":true,"shop":"Gupta Stationers","bill":"no"}],"department":"Administration","shop":"Gupta Stationers","accepted":"yes"},{"id":"demo-18","kind":"purchase","origKind":"purchase","createdAt":"2026-10-28T03:20:00.000Z","department":"Events","staff":"Event Coordinator","item":"Marigold flowers and 3 more","items":[{"item":"Marigold flowers","qty":10,"unit":"bunches","est":60,"state":"purchased","price":65,"lineTotal":650,"at":"2026-10-28T05:10:00.000Z","by":"Buyer","remark":"Fresh stock from the flower market.","remarkBy":"Buyer","remarkAt":"2026-10-28T05:10:00.000Z","shop":"Flower market (Mali Bhai)","bill":"no"},{"item":"Milk","qty":12,"unit":"litres","est":56,"state":"pending","remark":"Will buy fresh on the morning of the event.","remarkBy":"Buyer","remarkAt":"2026-10-28T04:50:00.000Z"},{"item":"Sugar","qty":3,"unit":"kg","est":48,"state":"expensive","quote":72,"at":"2026-10-28T05:30:00.000Z","by":"Buyer","remark":"Shop asking Rs 72 against Rs 48. Trying another shop.","remarkBy":"Buyer","remarkAt":"2026-10-28T05:30:00.000Z","shop":"Raju Kirana"},{"item":"Paper cups","qty":200,"unit":"pcs","est":1.5,"state":"soldout","at":"2026-10-28T05:20:00.000Z","by":"Buyer","remark":"Sold out at the nearby shop. Will try the wholesale market.","remarkBy":"Buyer","remarkAt":"2026-10-28T05:20:00.000Z","shop":"Nearby shop"}],"qty":10,"unit":"bunches","deadline":"2026-10-29","refImg":null,"approvedBy":"Principal","approvedAt":"2026-10-28T03:40:00.000Z","estPrice":null,"status":"pending","log":[{"at":"2026-10-28T03:20:00.000Z","by":"Event Coordinator","kind":"event","text":"Purchase request logged (4 items)"},{"at":"2026-10-28T03:40:00.000Z","by":"Principal","kind":"event","text":"Approved by Principal"},{"at":"2026-10-28T04:50:00.000Z","by":"Buyer","kind":"remark","text":"Milk: Will buy fresh on the morning of the event."},{"at":"2026-10-28T05:10:00.000Z","by":"Buyer","kind":"event","text":"Marigold flowers · Purchased at Rs 65 per unit, total Rs 650. Fresh stock from the flower market."},{"at":"2026-10-28T05:20:00.000Z","by":"Buyer","kind":"event","text":"Paper cups · Sold out. Sold out at the nearby shop. Will try the wholesale market."},{"at":"2026-10-28T05:30:00.000Z","by":"Buyer","kind":"event","text":"Sugar · Too expensive (quoted Rs 72 per unit). Shop asking Rs 72 against Rs 48. Trying another shop."}],"sample":true,"total":650,"buyer":"Buyer","boughtAt":"2026-10-28T05:10:00.000Z"},{"id":"demo-19","kind":"purchase","origKind":"purchase","createdAt":"2026-10-27T10:30:00.000Z","department":"Kitchen and Canteen","staff":"Canteen In-charge","item":"Fresh flowers for puja and 3 more","items":[{"item":"Fresh flowers for puja","qty":6,"unit":"bunches","est":50,"price":50,"lineTotal":300,"bought":true,"shop":"Flower market (Mali Bhai)","bill":"no","state":"purchased","at":"2026-10-28T04:00:00.000Z","by":"Buyer"},{"item":"Milk","qty":20,"unit":"litres","est":56,"price":56,"lineTotal":1120,"bought":true,"shop":"Amul Parlour","bill":"yes","state":"purchased","at":"2026-10-28T04:00:00.000Z","by":"Buyer"},{"item":"Bananas","qty":5,"unit":"dozen","est":60,"price":null,"lineTotal":0,"bought":false,"state":"skipped","at":"2026-10-28T04:00:00.000Z","by":"Buyer","remark":"Not available today.","remarkBy":"Buyer","remarkAt":"2026-10-28T04:00:00.000Z"},{"item":"Curd","qty":5,"unit":"kg","est":90,"price":90,"lineTotal":450,"bought":true,"shop":"Amul Parlour","bill":"yes","state":"purchased","at":"2026-10-28T04:00:00.000Z","by":"Buyer"}],"qty":6,"unit":"bunches","deadline":"2026-10-28","refImg":null,"approvedBy":"Principal","approvedAt":"2026-10-27T10:50:00.000Z","estPrice":null,"status":"bought","log":[{"at":"2026-10-27T10:30:00.000Z","by":"Canteen In-charge","kind":"event","text":"Purchase request logged (4 items)"},{"at":"2026-10-27T10:50:00.000Z","by":"Principal","kind":"event","text":"Approved by Principal"},{"at":"2026-10-28T04:00:00.000Z","by":"Buyer","kind":"event","text":"Bought by Buyer, total Rs 1,870, 1 item not bought"},{"at":"2026-10-28T04:10:00.000Z","by":"Buyer","kind":"remark","text":"Bananas will be bought tomorrow in a new request."}],"sample":true,"buyer":"Buyer","total":1870,"price":null,"boughtAt":"2026-10-28T04:00:00.000Z","billImg":null,"buyNote":"Local market. Bananas were not available today."},{"id":"demo-20","kind":"stock","origKind":"stock","createdAt":"2026-10-25T03:30:00.000Z","department":"Housekeeping","staff":"Housekeeping Head","item":"Phenyl and 2 more","items":[{"item":"Phenyl","qty":5,"unit":"litres","est":null},{"item":"Mop","qty":4,"unit":"pcs","est":null},{"item":"Hand gloves","qty":10,"unit":"pairs","est":null}],"qty":5,"unit":"litres","deadline":"2026-10-27","refImg":null,"approvedBy":"Principal","approvedAt":"2026-10-25T04:00:00.000Z","estPrice":null,"status":"handed","log":[{"at":"2026-10-25T03:30:00.000Z","by":"Housekeeping Head","kind":"event","text":"Stock order logged (3 items)"},{"at":"2026-10-25T04:00:00.000Z","by":"Principal","kind":"event","text":"Approved by Principal"},{"at":"2026-10-26T05:30:00.000Z","by":"Store Manager","kind":"event","text":"Handed over to Housekeeping Head by Store Manager"}],"sample":true,"handedTo":"Housekeeping Head","handedBy":"Store Manager","handedAt":"2026-10-26T05:30:00.000Z","handImg":null,"handNote":"All three items issued","accepted":"yes"},{"id":"demo-21","kind":"purchase","origKind":"purchase","createdAt":"2026-10-28T03:00:00.000Z","staff":"Art Teacher","item":"Masking tape (2 rolls)","qty":2,"unit":"rolls","deadline":"2026-10-30","refImg":null,"approvedBy":"Principal","approvedAt":"2026-10-28T03:20:00.000Z","estPrice":35,"status":"bought","log":[{"at":"2026-10-28T03:00:00.000Z","by":"Art Teacher","kind":"event","text":"Purchase request logged"},{"at":"2026-10-28T03:20:00.000Z","by":"Principal","kind":"event","text":"Approved by Principal"},{"at":"2026-10-28T04:20:00.000Z","by":"Store Manager","kind":"remark","text":"Masking tape · In stock. Found 3 rolls in the store room. Issuing from stock."}],"sample":true,"items":[{"item":"Masking tape (2 rolls)","qty":2,"unit":"rolls","est":35,"state":"instock","at":"2026-10-28T04:20:00.000Z","by":"Store Manager","remark":"Found 3 rolls in the store room. Issuing from stock.","remarkBy":"Store Manager","remarkAt":"2026-10-28T04:20:00.000Z"}],"department":"Art and Craft"}];
function shiftDemo_(v,days){
  if(typeof v==="string"){
    if(/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(v))return new Date(Date.parse(v)+days*864e5).toISOString();
    if(/^\d{4}-\d\d-\d\d$/.test(v))return addDays(v,days);
    return v;
  }
  if(Array.isArray(v))return v.map(x=>shiftDemo_(x,days));
  if(v&&typeof v==="object"){const o={};Object.keys(v).forEach(k=>{o[k]=shiftDemo_(v[k],days)});return o}
  return v;
}
function addDays(iso,n){const d=new Date(iso+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}

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
