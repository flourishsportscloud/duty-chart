/* ===== PL Plan – Live — server logic (runs inside Google Apps Script) =====
   One row per PL × mode (dp = Day Plan, de = Day End) × date in the "Plan" sheet.
   Rules enforced here, not in the browser:
   - ticks and remarks can only be saved for today's date (India time) — past days are read only
   - every tick time is stamped by the server, so nothing can be back-dated
   - only the seniors (Sarita, Dean, Director–Admin) can change block due times
*/
const TZ="Asia/Kolkata";
const PLS=["poonam","garima","renu"];
const MODES=["dp","de"];
const PEOPLE={poonam:"Poonam",garima:"Garima",renu:"Renu Harsh",sarita:"Sarita (Head of Secondary)",dean:"Dean of Academics",director:"Director–Admin"};
const SENIORS=["Sarita (Head of Secondary)","Dean of Academics","Director–Admin"];
const COLS={Plan:["id","pl","mode","date","wk","json","updated"],Config:["key","json","by","at"],Log:["time","who","doc","what"]};

function fail(m){throw new Error(m)}
function isoDate(v){return /^\d{4}-\d\d-\d\d$/.test(String(v||""))}
function today_(){return Utilities.formatDate(new Date(),TZ,"yyyy-MM-dd")}
function sheet_(name){
  const ss=SpreadsheetApp.getActiveSpreadsheet();let sh=ss.getSheetByName(name);
  if(!sh){sh=ss.insertSheet(name);sh.getRange(1,1,1,COLS[name].length).setValues([COLS[name]]).setFontWeight("bold");sh.setFrozenRows(1)}
  return sh;
}
function rows_(name){const sh=sheet_(name);const n=sh.getLastRow();if(n<2)return [];return sh.getRange(2,1,n-1,COLS[name].length).getValues()}
function parse_(s){try{return JSON.parse(s)||{}}catch(e){return {}}}
function getTimes_(){const r=rows_("Config").find(x=>x[0]==="times");return r?parse_(r[1]):{}}

function state_(wk){
  if(!isoDate(wk))fail("Bad week.");
  const docs={};
  rows_("Plan").forEach(r=>{if(String(r[4])===wk){const j=parse_(r[5]);docs[r[0]]={pl:r[1],mode:r[2],date:String(r[3]),wk:String(r[4]),cells:j.cells||{},rem:j.rem||{}}}});
  return {today:today_(),docs,times:getTimes_()};
}

function save_(id,patch,who){
  const p=String(id||"").split("_");
  const pl=p[0],mode=p[1],date=p[2];
  if(PLS.indexOf(pl)<0||MODES.indexOf(mode)<0||!isoDate(date))fail("Bad record.");
  if(date!==today_())fail("Only today's plan can be updated.");
  const name=String(who||"");
  if(Object.keys(PEOPLE).map(k=>PEOPLE[k]).indexOf(name)<0)fail("Pick your name first.");
  if(name!==PEOPLE[pl]&&SENIORS.indexOf(name)<0)fail("Only "+PEOPLE[pl]+" and the seniors can update this plan.");
  const d=new Date(date+"T00:00:00Z");d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
  const wk=d.toISOString().slice(0,10);
  const sh=sheet_("Plan");const all=rows_("Plan");
  let idx=all.findIndex(r=>r[0]===id);
  const j=idx>=0?parse_(all[idx][5]):{};j.cells=j.cells||{};j.rem=j.rem||{};
  const now=Date.now();let n=0;
  Object.keys((patch&&patch.cells)||{}).forEach(k=>{
    const c=patch.cells[k]||{};const s=["","D","N","A"].indexOf(c.s)>=0?c.s:"";
    j.cells[String(k).slice(0,80)]={s:s,by:name,at:now,l:c.l?1:0};n++;
  });
  Object.keys((patch&&patch.rem)||{}).forEach(k=>{
    const e=patch.rem[k]||{};
    const num=(e.n===""||e.n==null||isNaN(Number(e.n)))?"":Number(e.n);
    j.rem[String(k).slice(0,80)]={n:num,x:String(e.x||"").slice(0,500),by:name,at:now};n++;
  });
  const row=[id,pl,mode,date,wk,JSON.stringify(j),new Date(now)];
  if(idx>=0)sh.getRange(idx+2,1,1,row.length).setValues([row]);else sh.appendRow(row);
  const lg=sheet_("Log");lg.appendRow([Utilities.formatDate(new Date(now),TZ,"yyyy-MM-dd HH:mm"),name,id,n+" change(s)"]);
  return {pl,mode,date,wk,cells:j.cells,rem:j.rem};
}

function setTime_(b,v,who){
  if(SENIORS.indexOf(String(who||""))<0)fail("Only the seniors can change due times.");
  if(!/^(dp|de)\d{1,2}$/.test(String(b)))fail("Bad block.");
  if(!(v==="none"||v==="def"||/^\d\d:\d\d$/.test(String(v))))fail("Bad time.");
  const t=getTimes_();t[b]=v;
  const sh=sheet_("Config");const all=rows_("Config");const idx=all.findIndex(r=>r[0]==="times");
  const row=["times",JSON.stringify(t),who,new Date()];
  if(idx>=0)sh.getRange(idx+2,1,1,4).setValues([row]);else sh.appendRow(row);
  return t;
}

function doPost(e){
  let out;const lock=LockService.getScriptLock();
  try{
    const req=JSON.parse(e.postData.contents||"{}");const a=req.args||[];
    let v;
    if(req.fn==="state")v=state_(a[0]);
    else{
      lock.waitLock(20000);
      if(req.fn==="save")v=save_(a[0],a[1],a[2]);
      else if(req.fn==="setTime")v=setTime_(a[0],a[1],a[2]);
      else fail("Unknown request.");
    }
    out={ok:true,v};
  }catch(err){out={ok:false,err:String(err&&err.message||err)}}
  finally{try{lock.releaseLock()}catch(x){}}
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function doGet(){return ContentService.createTextOutput("PL Plan – Live API is running.")}
function setupSheets(){Object.keys(COLS).forEach(sheet_)}
