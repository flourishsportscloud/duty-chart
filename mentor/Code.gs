/* FIS Mentor Student Record · Google Apps Script backend
 * Kept in the "Mentor Student Record Data" Google Sheet:
 *   Roster – the student list for Classes 1-11 (Class | Section | Name); imported once, never stored in GitHub
 *   Docs   – one row per record (checking entries, performance tests, settings)
 *   Log    – who saved what, and when
 * Every request needs a staff login. Password = staff first name + the common FIS staff suffix,
 * which is kept only in Script Properties (STAFF_SUFFIX), never in the code.
 */
const TZ = 'Asia/Kolkata';
const CHUNK = 45000, DOC_CHUNKS = 2;
const HEAD = ['key','coll','day','rev','deleted','updated'];
const TOKEN_DAYS = 120;
function ss_(){ return SpreadsheetApp.getActive(); }
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
  const v = sh.getRange(2,1,sh.getLastRow()-1,3).getValues();   // Class | Section | Name, in roll order
  const out = {};
  v.forEach(r => { const c = String(r[0]).trim(), s = String(r[1]).trim().toUpperCase(), n = String(r[2]).trim(); if(!c || !s || !n) return;
    (out[c + s] = out[c + s] || []).push(n); });
  return out;
}
/* ---------- documents ---------- */
const PATH_RE = /^(config\/(setup|lessons)|(e|t)\/\d{4}-\d\d-\d\d\/(?:[1-9]|1[01])[ABC]\/[a-z0-9]{4,12})$/;
function parts_(path){ if(!PATH_RE.test(String(path||''))) fail('Bad record.'); const s = path.split('/');
  return s[0] === 'config' ? {coll: 'config', day: 'config'} : {coll: s[0] + '/' + s[2], day: s[1]}; }
function rev_(next){ const p = props_(); let r = Number(p.getProperty('rev') || 0); if(next){ r++; p.setProperty('rev', String(r)); } return r; }
function rowOf_(sh, key){ if(sh.getLastRow() < 2) return 0;
  const c = sh.getRange(2,1,sh.getLastRow()-1,1).createTextFinder(key).matchEntireCell(true).findNext(); return c ? c.getRow() : 0; }
function read_(test){
  const sh = sheet_('Docs'), n = sh.getLastRow() - 1; if(n < 1) return [];
  const head = sh.getRange(2,1,n,HEAD.length).getValues(), hit = [], tz = ss_().getSpreadsheetTimeZone();
  head.forEach(v => { if(v[2] instanceof Date) v[2] = Utilities.formatDate(v[2], tz, 'yyyy-MM-dd'); v[0] = String(v[0]); });
  head.forEach((v,i) => { if(test(v)) hit.push(i); }); if(!hit.length) return [];
  const body = sh.getRange(2,HEAD.length+1,n,DOC_CHUNKS).getValues();
  return hit.map(i => { const v = head[i];
    if(v[4] === true || v[4] === 'TRUE') return {p: v[0], del: 1};
    let j = null; try{ j = JSON.parse(body[i].join('')); }catch(e){} return j ? {p: v[0], j: j} : null; }).filter(Boolean);
}
const API = {
  login: (name, pw) => login_(name, pw),
  roster(){ return roster_(); },
  // everything changed since revision "since": settings plus records from the day "from" onwards
  pull(since, from){ since = Number(since) || 0; const rev = rev_(); from = /^\d{4}-\d\d-\d\d$/.test(String(from)) ? String(from) : '2000-01-01';
    if(since >= rev) return {rev: rev, docs: []};
    return {rev: rev, docs: read_(v => Number(v[3]) > since && (v[2] === 'config' || String(v[2]) >= from))}; },
  set(path, obj, who){ const p = parts_(path);
    if(!obj || typeof obj !== 'object' || Array.isArray(obj)) fail('Bad record.');
    const json = JSON.stringify(obj); if(json.length > CHUNK*DOC_CHUNKS) fail('This record is too large to save.');
    const rev = rev_(true), sh = sheet_('Docs');
    const row = [path, p.coll, "'" + p.day, rev, false, new Date().toISOString()].concat(Array.from({length: DOC_CHUNKS}, (_, i) => json.slice(i*CHUNK, (i+1)*CHUNK)));
    const r = rowOf_(sh, path); if(r) sh.getRange(r,1,1,row.length).setValues([row]); else sh.appendRow(row);
    log_(who, path, 'saved'); return {rev: rev}; },
  del(path, obj, who){ const p = parts_(path); const sh = sheet_('Docs'), r = rowOf_(sh, path); if(!r) return {rev: rev_()};
    const rev = rev_(true); sh.getRange(r,1,1,HEAD.length).setValues([[path, p.coll, "'" + p.day, rev, true, new Date().toISOString()]]);
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
function doGet(){ return ContentService.createTextOutput('FIS Mentor Student Record API is running.'); }
/* Run once after pasting: creates the tabs. */
function setupSheets(){
  const ss = ss_();
  if(!ss.getSheetByName('Roster')){ // the imported student list may still carry the default tab name
    const f = ss.getSheets()[0];
    if(f && String(f.getRange(1,1).getValue()) === 'Class' && String(f.getRange(1,3).getValue()) === 'Name') f.setName('Roster');
  }
  sheet_('Docs'); sheet_('Log'); secret_();
  if(!ss.getSheetByName('Roster')) Logger.log('Now import FIS_Class_Lists_1-11.csv as a sheet named Roster.');
}
/* Run to sign everyone out (e.g. after changing STAFF_SUFFIX). */
function signOutEveryone(){ const p = props_(); p.setProperty('TOKEN_VER', String(Number(p.getProperty('TOKEN_VER') || 1) + 1)); }
