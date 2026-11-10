/* FIS Student Entry Exit Report · Google Apps Script backend
 * Kept in the "Student Entry Exit Data" Google Sheet:
 *   Roster – the student list (imported once from Transport_Roster.xlsx; never stored in GitHub)
 *   Docs   – one row per record (attendance, Front Office marks, stayback, departure, settings)
 *   Log    – who saved what, and when
 * Every request needs a staff login. Password = staff first name + the common FIS staff suffix,
 * which is kept only in Script Properties (STAFF_SUFFIX), never in the code.
 */
const TZ = 'Asia/Kolkata';
const CHUNK = 45000, DOC_CHUNKS = 2;
const HEAD = ['key','coll','day','rev','deleted','updated'];
const TOKEN_DAYS = 120;
const SHEET_ID = '1wxkOdzcg3-jRo9y0L6ueaNFQwEonIeyPgfjwzTKtmqM';   // the "Student Entry Exit Data" Google Sheet
function ss_(){ return SpreadsheetApp.getActive() || SpreadsheetApp.openById(SHEET_ID); }
const SEED = {"config/alloc":{"map":{"V31":"Rashmi Ma'am"}},"config/walkRegular":{"kids":{"B11-5":true,"B34-10":true,"V20-3":true,"V28-11":true}},"config/sbRegular":{"kids":{"A1-2":true,"A1-4":true,"A1-5":true,"A1-7":true,"A13-1":true,"A13-2":true,"A13-3":true,"A13-4":true,"A14-4":true,"A16-12":true,"A16-3":true,"A16-4":true,"A2-1":true,"A2-10":true,"A2-11":true,"A2-12":true,"A2-2":true,"A2-3":true,"A2-4":true,"A2-5":true,"A2-6":true,"A2-7":true,"A2-8":true,"A2-9":true,"A3-1":true,"A3-7":true,"A3-8":true,"A4-1":true,"A4-3":true,"A5-5":true,"A5-7":true,"A6-1":true,"A6-2":true,"A6-3":true,"A6-4":true,"A6-5":true,"A7-1":true,"A7-2":true,"A8-11":true,"A8-4":true,"A8-5":true,"A8-6":true,"A8-8":true,"A8-9":true,"B1-11":true,"B1-12":true,"B1-17":true,"B1-20":true,"B1-5":true,"B1-6":true,"B1-7":true,"B10-1":true,"B10-13":true,"B10-17":true,"B10-23":true,"B10-26":true,"B10-27":true,"B10-3":true,"B10-7":true,"B11-12":true,"B11-2":true,"B11-7":true,"B12-1":true,"B12-10":true,"B12-3":true,"B12-9":true,"B13-2":true,"B14-10":true,"B14-11":true,"B14-21":true,"B14-6":true,"B14-8":true,"B14-9":true,"B15-21":true,"B15-5":true,"B15-7":true,"B2-14":true,"B2-15":true,"B2-8":true,"B2-9":true,"B3-19":true,"B3-24":true,"B3-7":true,"B34-11":true,"B34-15":true,"B4-11":true,"B4-14":true,"B4-2":true,"B4-22":true,"B4-25":true,"B4-6":true,"B5-16":true,"B5-25":true,"B5-5":true,"B5-6":true,"B6-7":true,"B8-1":true,"B8-12":true,"B8-14":true,"B8-16":true,"B8-19":true,"B8-4":true,"B8-6":true,"B8-9":true,"V17-12":true,"V17-6":true,"V18-1":true,"V18-3":true,"V19-1":true,"V19-3":true,"V19-5":true,"V19-7":true,"V19-8":true,"V19-9":true,"V20-12":true,"V20-6":true,"V20-7":true,"V23-4":true,"V24-2":true,"V26-10":true,"V26-8":true,"V27-2":true,"V28-4":true,"V29-1":true,"V31-5":true,"V33-1":true,"V33-5":true,"V33-6":true,"V33-7":true,"V35-10":true,"V35-8":true,"V36-12":true,"V38-8":true,"W-10":true,"W-101":true,"W-103":true,"W-106":true,"W-109":true,"W-111":true,"W-114":true,"W-121":true,"W-124":true,"W-126":true,"W-131":true,"W-140":true,"W-142":true,"W-143":true,"W-144":true,"W-153":true,"W-156":true,"W-16":true,"W-163":true,"W-166":true,"W-168":true,"W-17":true,"W-173":true,"W-177":true,"W-179":true,"W-180":true,"W-20":true,"W-203":true,"W-209":true,"W-21":true,"W-212":true,"W-215":true,"W-219":true,"W-222":true,"W-223":true,"W-224":true,"W-226":true,"W-227":true,"W-23":true,"W-232":true,"W-233":true,"W-242":true,"W-243":true,"W-244":true,"W-34":true,"W-40":true,"W-44":true,"W-48":true,"W-49":true,"W-5":true,"W-52":true,"W-55":true,"W-56":true,"W-59":true,"W-62":true,"W-64":true,"W-67":true,"W-68":true,"W-8":true,"W-80":true,"W-82":true,"W-83":true,"W-84":true,"W-86":true,"W-87":true,"W-92":true,"W-98":true,"W-99":true}}};   // starting settings: regular stayback / special by-walk lists (student ids only)

function fail(m){ throw new Error(m); }
function props_(){ return PropertiesService.getScriptProperties(); }
function sheet_(name){
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if(!sh && name !== 'Roster'){
    sh = ss.insertSheet(name);
    const h = name === 'Docs' ? HEAD.concat(Array.from({length: DOC_CHUNKS}, (_, i) => 'json' + (i+1))) : ['time','who','path','what'];
    sh.getRange(1,1,1,h.length).setValues([h]).setFontWeight('bold'); sh.setFrozenRows(1);
  }
  return sh;
}
/* ---------- login ---------- */
const H_ = {
  hmac: (s,k) => Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s,k,Utilities.Charset.UTF_8)).replace(/=+$/,''),
  b64: s => Utilities.base64EncodeWebSafe(s,Utilities.Charset.UTF_8).replace(/=+$/,''),
  unb64: s => Utilities.newBlob(Utilities.base64DecodeWebSafe(s + '==='.slice((s.length+3)%4))).getDataAsString('UTF-8')
};
function secret_(){ const p = props_(); let s = p.getProperty('TOKEN_SECRET'); if(!s){ s = Utilities.getUuid()+Utilities.getUuid(); p.setProperty('TOKEN_SECRET', s); } return s; }
function first_(name){ return String(name||'').trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g,''); }
function me_(token){
  const t = String(token||'').split('.'); if(t.length !== 2) fail('LOGIN');
  let body; try{ body = H_.unb64(t[0]); }catch(e){ fail('LOGIN'); }
  if(H_.hmac(body, secret_()) !== t[1]) fail('LOGIN');
  const b = body.split('|'); // name|expiry|version
  if(Number(b[1]) < Date.now() || b[2] !== String(props_().getProperty('TOKEN_VER') || '1')) fail('LOGIN');
  return b[0];
}
function login_(name, pw){
  name = String(name||'').trim().replace(/\s+/g,' ');
  if(name.length < 3) fail('Type your full name.');
  const suf = String(props_().getProperty('STAFF_SUFFIX') || '').toLowerCase();
  if(!suf) fail('The staff password is not set up yet. Ask the Director.');
  Utilities.sleep(400);
  if(String(pw||'').trim().toLowerCase().replace(/\s+/g,'') !== first_(name) + suf) fail('Wrong password.');
  const body = name + '|' + (Date.now() + TOKEN_DAYS*864e5) + '|' + (props_().getProperty('TOKEN_VER') || '1');
  log_(name, '', 'login');
  return {token: H_.b64(body) + '.' + H_.hmac(body, secret_()), name: name};
}
function log_(who, path, what){ try{ sheet_('Log').appendRow([Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'), who, path, what]); }catch(e){} }
/* ---------- roster ---------- */
function roster_(){
  const sh = sheet_('Roster'); if(!sh || sh.getLastRow() < 2) fail('The student list is not imported yet. Ask the Director.');
  const v = sh.getRange(2,1,sh.getLastRow()-1,6).getValues();   // vehicle key, vehicle, type, serial, name, class
  const veh = {}, order = [];
  v.forEach(r => { const k = String(r[0]).trim(); if(!k) return;
    if(!veh[k]){ veh[k] = {k: k, l: String(r[1]), t: String(r[2]), kids: []}; order.push(k); }
    veh[k].kids.push([Number(r[3]), String(r[4]).trim(), String(r[5]).trim()]); });
  const all = order.map(k => veh[k]);
  return {veh: all.filter(x => x.t !== 'Walk'), walk: all.filter(x => x.t === 'Walk')};
}
/* ---------- documents ---------- */
const PATH_RE = /^(config\/(alloc|sbRegular|walkRegular|managers|privateVan|settings)|att\/\d{4}-\d\d-\d\d\/(veh|gate|sb|out|derr)\/[A-Za-z0-9_.\-]{1,60})$/;
function parts_(path){ if(!PATH_RE.test(String(path||''))) fail('Bad record.'); const s = path.split('/');
  return s[0] === 'config' ? {coll: 'config', day: 'config'} : {coll: s.slice(0,3).join('/'), day: s[1]}; }
function rev_(next){ const p = props_(); let r = Number(p.getProperty('rev') || 0); if(next){ r++; p.setProperty('rev', String(r)); } return r; }
function rowOf_(sh, key){ if(sh.getLastRow() < 2) return 0;
  const c = sh.getRange(2,1,sh.getLastRow()-1,1).createTextFinder(key).matchEntireCell(true).findNext(); return c ? c.getRow() : 0; }
function read_(test){
  const sh = sheet_('Docs'), n = sh.getLastRow() - 1; if(n < 1) return [];
  const head = sh.getRange(2,1,n,HEAD.length).getValues(), hit = [];
  head.forEach((v,i) => { if(test(v)) hit.push(i); }); if(!hit.length) return [];
  const body = sh.getRange(2,HEAD.length+1,n,DOC_CHUNKS).getValues();
  return hit.map(i => { const v = head[i];
    if(v[4] === true || v[4] === 'TRUE') return {p: v[0], del: 1};
    let j = null; try{ j = JSON.parse(body[i].join('')); }catch(e){} return j ? {p: v[0], j: j} : null; }).filter(Boolean);
}
const API = {
  login: (name, pw) => login_(name, pw),
  roster(){ return roster_(); },
  // everything for some school days, plus settings
  days(dates){ dates = (Array.isArray(dates) ? dates : []).slice(0, 40); const want = {config: 1}; dates.forEach(d => want[d] = 1);
    return {rev: rev_(), docs: read_(v => want[v[2]])}; },
  // changes since revision "since", for settings and the given days
  sync(since, dates){ since = Number(since) || 0; const rev = rev_();
    if(since >= rev) return {rev: rev, docs: []};
    const want = {config: 1}; (Array.isArray(dates) ? dates : []).slice(0, 40).forEach(d => want[d] = 1);
    return {rev: rev, docs: read_(v => Number(v[3]) > since && want[v[2]])}; },
  set(path, obj, who){ const p = parts_(path);
    if(!obj || typeof obj !== 'object' || Array.isArray(obj)) fail('Bad record.');
    const json = JSON.stringify(obj); if(json.length > CHUNK*DOC_CHUNKS) fail('This record is too large to save.');
    const rev = rev_(true), sh = sheet_('Docs');
    const row = [path, p.coll, p.day, rev, false, new Date().toISOString()].concat(Array.from({length: DOC_CHUNKS}, (_, i) => json.slice(i*CHUNK, (i+1)*CHUNK)));
    const r = rowOf_(sh, path); if(r) sh.getRange(r,1,1,row.length).setValues([row]); else sh.appendRow(row);
    log_(who, path, 'saved'); return {rev: rev}; },
  del(path, who){ const p = parts_(path); const sh = sheet_('Docs'), r = rowOf_(sh, path); if(!r) return {rev: rev_()};
    const rev = rev_(true); sh.getRange(r,1,1,HEAD.length).setValues([[path, p.coll, p.day, rev, true, new Date().toISOString()]]);
    sh.getRange(r,HEAD.length+1,1,DOC_CHUNKS).clearContent(); log_(who, path, 'removed'); return {rev: rev}; }
};
function doPost(e){
  let req = {}; try{ req = JSON.parse(e.postData.contents); }catch(x){}
  const out = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  const fn = API[req.fn]; if(!fn) return out({ok: false, err: 'Unknown request.'});
  const write = req.fn === 'set' || req.fn === 'del', lock = LockService.getScriptLock();
  try{
    let args = req.args || [];
    if(req.fn !== 'login'){ const who = me_(req.token); if(write) args = args.slice(0, 2).concat([who]); }
    if(write && !lock.tryLock(25000)) return out({ok: false, err: 'Server busy, trying again.'});
    return out({ok: true, v: fn.apply(null, args)});
  }catch(x){ const m = String(x && x.message || x); return out({ok: false, err: m, login: m === 'LOGIN' ? 1 : 0});
  }finally{ if(write) try{ lock.releaseLock(); }catch(x){} }
}
function doGet(){ return ContentService.createTextOutput('FIS Student Entry Exit Report API is running.'); }
/* Run once after pasting: creates the tabs and loads the starting settings. */
function setupSheets(){
  sheet_('Docs'); sheet_('Log'); secret_();
  const sh = sheet_('Docs');
  Object.keys(SEED).forEach(path => { if(!rowOf_(sh, path)) API.set(path, Object.assign({}, SEED[path], {ts: Date.now()}), 'setup'); });
  if(!sheet_('Roster')) Logger.log('Now import Transport_Roster.xlsx as a new sheet named Roster.');
}
/* Run to sign everyone out (e.g. after changing STAFF_SUFFIX). */
function signOutEveryone(){ const p = props_(); p.setProperty('TOKEN_VER', String(Number(p.getProperty('TOKEN_VER') || 1) + 1)); }
