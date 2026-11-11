/* FIS Transport Complaints & Requests · Google Apps Script backend
 * Reads live from the Daily FO sheet ("Feedback 2026"): Transport rows of "Feedback Updated Final",
 * Transport rows of "Changes" and Transport calls of "In House- Calls ".
 * Each child is matched to a vehicle from the "Student Entry Exit Data" Roster (and any bus/van number written in the entry).
 * The script's own sheet "Transport Complaints Data" keeps only follow-up marks (status, vehicle/driver correction, note)
 * and the vehicle → driver list. Nothing is written back to the Daily FO.
 * Every request needs a staff login: password = staff first name + the common FIS staff suffix (Script Property STAFF_SUFFIX).
 */
const TZ = 'Asia/Kolkata';
const FO_ID = '1DAx096q0BtPAEsBI2AAtxYtGyEmHEXqFaLpghy_rhSA';      // Daily FO – "Feedback 2026"
const ROSTER_ID = '1wxkOdzcg3-jRo9y0L6ueaNFQwEonIeyPgfjwzTKtmqM';  // "Student Entry Exit Data" (Roster tab)
const TOKEN_DAYS = 120, CACHE_SEC = 300;
const SEED_DRIVERS = {"Bus 1":"Samsudin","Bus 2":"Suresh Nayak","Bus 3":"Mahender","Bus 4":"Deepak","Bus 5":"Bharat","Bus 6":"Ajay Gujrati",
  "Bus 7":"Vikash Saraswat","Bus 8":"Aman Siyota","Bus 9":"Kushal Singh","Bus 10":"Ajij","Bus 11":"Manish","Bus 12":"Suresh Gujrati",
  "Bus 13":"Jairaj","Bus 14":"Shivratan","Bus 15":"Dilip Chanwariya","Bus 16":"Hanuman Singh","Bus 34":"Gopal Jawa",
  "Bus A":"Kushal Singh","Bus B":"Mahender","Bus C":"Bharat","Bus D":"Jairaj","Bus E":"Deepak","Bus F":"Suresh Nayak","Bus G":"Nitin Chawariya","Bus H":"Shivratan",
  "Van 17":"Raj Inda","Van 18":"Mumtaj","Van 19":"Yogesh","Van 20":"Jaswant","Van 21":"Surya","Van 22":"Ram Lal","Van 23":"Dulhi Chand","Van 24":"Anwar Khan","Van 25":"Chennaram","Van 26":"Jeet","Van 27":"Mohsin","Van 28":"Mangtu Ram","Van 29":"Prabhu","Van 30":"Jagdish","Van 31":"Ravi","Van 32":"Mussa","Van 33":"Kishan Singh","Van 35":"Yashwardhan","Van 36":"Badal","Van 37":"Sonu","Van 38":"Ajij (Van)"};

function fail(m){ throw new Error(m); }
function props_(){ return PropertiesService.getScriptProperties(); }
function own_(){
  const p = props_(); let id = p.getProperty('SHEET_ID'), ss = null;
  if(id) try{ ss = SpreadsheetApp.openById(id); }catch(e){ ss = null; }
  if(!ss){ ss = SpreadsheetApp.create('Transport Complaints Data'); p.setProperty('SHEET_ID', ss.getId()); }
  return ss;
}
function tab_(name, head){
  const ss = own_(); let sh = ss.getSheetByName(name);
  if(!sh){ sh = ss.insertSheet(name); sh.getRange(1,1,1,head.length).setValues([head]).setFontWeight('bold'); sh.setFrozenRows(1); }
  return sh;
}
const DOCS = () => tab_('Docs', ['key','json','updated','who']);
const LOG = () => tab_('Log', ['time','who','key','what']);
function log_(who, key, what){ try{ LOG().appendRow([Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'), who, key, what]); }catch(e){} }

/* ---------- login (same as the other FIS apps) ---------- */
const H_ = {
  hmac: (s,k) => Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s,k,Utilities.Charset.UTF_8)).replace(/=+$/,''),
  b64: s => Utilities.base64EncodeWebSafe(s,Utilities.Charset.UTF_8).replace(/=+$/,''),
  unb64: s => Utilities.newBlob(Utilities.base64DecodeWebSafe(s + '==='.slice((s.length+3)%4))).getDataAsString('UTF-8')
};
function secret_(){ const p = props_(); let s = p.getProperty('TOKEN_SECRET'); if(!s){ s = Utilities.getUuid()+Utilities.getUuid(); p.setProperty('TOKEN_SECRET', s); } return s; }
function first_(n){ return String(n||'').trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g,''); }
function me_(token){
  const t = String(token||'').split('.'); if(t.length !== 2) fail('LOGIN');
  let body; try{ body = H_.unb64(t[0]); }catch(e){ fail('LOGIN'); }
  if(H_.hmac(body, secret_()) !== t[1]) fail('LOGIN');
  const b = body.split('|');
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

/* ---------- reading the Daily FO ---------- */
function day_(v){
  if(v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  const m = String(v||'').trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if(!m) return '';
  const y = m[3].length === 2 ? '20' + m[3] : m[3];
  return y + '-' + ('0'+m[2]).slice(-2) + '-' + ('0'+m[1]).slice(-2);
}
const s_ = v => String(v == null ? '' : v).replace(/\s+/g,' ').trim();
const WORD = {first:'1',second:'2',third:'3',fourth:'4',fifth:'5',sixth:'6',seventh:'7',eighth:'8',ninth:'9',tenth:'10',eleventh:'11',twelfth:'12',nursery:'NUR',nur:'NUR',lkg:'LKG',ukg:'UKG',pg:'PG',playgroup:'PG'};
function cls_(v){   // "Ninth - A", "U.KG. - B", "9A", "Nur.A", "UKG A" -> "9A", "UKGB", "NURA"
  let s = String(v||'').toLowerCase().replace(/[.\-]/g,' ').replace(/\bu\s*kg\b/g,'ukg').replace(/\bl\s*kg\b/g,'lkg').replace(/\bp\s*g\b/g,'pg').trim();
  let m = s.match(/^(\d{1,2})\s*([a-z])?$/); if(m) return m[1] + (m[2]||'').toUpperCase();
  m = s.match(/^([a-z]+)\s*([a-z])?$/); if(m && WORD[m[1]]) return WORD[m[1]] + (m[2]||'').toUpperCase();
  m = s.match(/^(nur|lkg|ukg|pg)([a-z])$/); if(m) return WORD[m[1]] + m[2].toUpperCase();
  return s.replace(/\s+/g,'').toUpperCase();
}
const key_ = (n, c) => String(n||'').toLowerCase().replace(/[^a-z ]/g,'').trim().split(/\s+/)[0] + '|' + cls_(c);
function veh_(t){   // "Bus 5", "Bus-11", "van 32", "Bus A", "Auto-4" written in the text
  const m = String(t||'').match(/\b(bus|van|auto)\s*[-:#]?\s*(\d{1,2}|[a-i])\b/i);
  return m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() + ' ' + m[2].toUpperCase() : '';
}
function roster_(){
  const sh = SpreadsheetApp.openById(ROSTER_ID).getSheetByName('Roster');
  const map = {}; if(!sh || sh.getLastRow() < 2) return map;
  sh.getRange(2,1,sh.getLastRow()-1,6).getValues().forEach(r => {
    const v = s_(r[1]); if(!r[4] || !v) return;
    const k = key_(r[4], r[5]); (map[k] = map[k] || []).indexOf(v) < 0 && map[k].push(v);
  });
  return map;
}
function kind_(c){ c = s_(c).toLowerCase();
  if(c.indexOf('complain') === 0 || c === 'concern') return 'Complaint';
  if(c === 'request') return 'Request'; if(c === 'query') return 'Query';
  if(c === '') return 'Not marked'; return ''; }
function pri_(p){ p = s_(p).toLowerCase(); return p ? p[0].toUpperCase() + p.slice(1) : ''; }
function read_(){
  const fo = SpreadsheetApp.openById(FO_ID), ros = roster_(), out = [];
  const match = (name, cls, text) => { const t = veh_(text); if(t) return {vehs:[t], vsrc:'text'};
    const r = ros[key_(name, cls)]; return r && r.length ? {vehs: r.slice(), vsrc: r.length > 1 ? 'roster?' : 'roster'} : {vehs: [], vsrc: ''}; };
  // 1. Feedback Updated Final – Transport complaints, concerns, requests, queries, unmarked
  let sh = fo.getSheetByName('Feedback Updated Final');
  if(sh && sh.getLastRow() > 1) sh.getRange(2,1,sh.getLastRow()-1,13).getValues().forEach((r, i) => {
    if(s_(r[5]).toLowerCase() !== 'transport') return;
    const k = kind_(r[6]); if(!k) return;
    const name = s_(r[2]), cls = s_(r[3]), text = s_(r[8]);
    out.push(Object.assign({id: 'fb' + (s_(r[0]) || ('r' + (i+2))).replace(/\.0$/,''), src: 'Feedback', d: day_(r[1]), name: name, cls: cls_(cls),
      kind: k, cat: s_(r[6]), mode: s_(r[7]), text: text, pri: pri_(r[9]), action: s_(r[12]), need: s_(r[11])}, match(name, cls, text)));
  });
  // 2. Changes – Transport rows (Change Tracker)
  sh = fo.getSheetByName('Changes');
  if(sh && sh.getLastRow() > 2) sh.getRange(3,1,sh.getLastRow()-2,13).getValues().forEach((r, i) => {
    if(s_(r[3]).toLowerCase() !== 'transport') return;
    const name = s_(r[1]), cls = s_(r[2]), from = s_(r[5]), to = s_(r[6]);
    const vs = [veh_(from), veh_(to)].filter(Boolean);
    const m = vs.length ? {vehs: vs, vsrc: 'change'} : match(name, cls, '');
    out.push(Object.assign({id: 'ch' + (i+3), src: 'Changes', d: day_(r[0]), name: name, cls: cls_(cls), kind: 'Change', cat: s_(r[4]),
      text: (from || '-') + ' → ' + (to || '-'), from: from, to: to, status: s_(r[7]) || 'Not entered', fee: s_(r[12]) || '—', pri: ''}, m));
  });
  // 3. In House- Calls – Transport calls
  sh = fo.getSheetByName('In House- Calls ') || fo.getSheetByName('In House- Calls');
  if(sh && sh.getLastRow() > 1){ let last = '';
    sh.getRange(2,1,sh.getLastRow()-1,11).getValues().forEach((r, i) => {
      const d = day_(r[1]); if(d) last = d;
      if(s_(r[4]).toLowerCase() !== 'transport') return;
      const name = s_(r[2]), cls = s_(r[3]), text = s_(r[5]);
      out.push(Object.assign({id: 'ca' + (i+2), src: 'Calls', d: d || last, name: name, cls: cls_(cls), kind: 'Call', cat: 'In-house call',
        text: text, action: s_(r[10]), by: s_(r[8]), status: s_(r[9]), pri: ''}, match(name, cls, text)));
    });
  }
  return out;
}
function entries_(fresh){
  const c = CacheService.getScriptCache();
  if(!fresh){ const parts = c.get('n'); if(parts){ let j = ''; for(let i = 0; i < Number(parts); i++){ const p = c.get('e' + i); if(p == null){ j = ''; break; } j += p; } if(j) return JSON.parse(j); } }
  const e = read_(), j = JSON.stringify(e), n = Math.ceil(j.length / 90000), o = {n: String(n)};
  for(let i = 0; i < n; i++) o['e' + i] = j.slice(i*90000, (i+1)*90000);
  try{ c.putAll(o, CACHE_SEC); }catch(x){}
  return e;
}
function docs_(){
  const sh = DOCS(), o = {}; if(sh.getLastRow() < 2) return o;
  sh.getRange(2,1,sh.getLastRow()-1,4).getValues().forEach(r => { if(r[0]) try{ o[r[0]] = JSON.parse(r[1]); }catch(e){} });
  return o;
}
const API = {
  login: login_,
  data(fresh){ return {entries: entries_(!!fresh), docs: docs_(), at: Utilities.formatDate(new Date(), TZ, 'dd MMM yyyy, HH:mm')}; },
  set(key, obj, who){
    key = String(key||''); if(!/^(ov\/[a-z0-9]+|config\/drivers)$/i.test(key)) fail('Bad key.');
    const sh = DOCS(), last = sh.getLastRow(), json = JSON.stringify(Object.assign({}, obj, {by: who, at: new Date().toISOString()}));
    if(json.length > 45000) fail('Too long.');
    let row = 0; if(last > 1){ const k = sh.getRange(2,1,last-1,1).getValues(); for(let i = 0; i < k.length; i++) if(k[i][0] === key){ row = i+2; break; } }
    const v = [key, json, new Date().toISOString(), who];
    if(row) sh.getRange(row,1,1,4).setValues([v]); else sh.appendRow(v);
    log_(who, key, 'saved'); return {ok: 1};
  }
};
function doPost(e){
  let req = {}; try{ req = JSON.parse(e.postData.contents); }catch(x){}
  const out = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  const fn = API[req.fn]; if(!fn) return out({ok: false, err: 'Unknown request.'});
  const lock = LockService.getScriptLock(), write = req.fn === 'set';
  try{
    let args = req.args || [];
    if(req.fn !== 'login'){ const who = me_(req.token); if(write) args = args.slice(0, 2).concat([who]); }
    if(write && !lock.tryLock(20000)) return out({ok: false, err: 'Server busy, try again.'});
    return out({ok: true, v: fn.apply(null, args)});
  }catch(x){ const m = String(x && x.message || x); return out({ok: false, err: m, login: m === 'LOGIN' ? 1 : 0});
  }finally{ if(write) try{ lock.releaseLock(); }catch(x){} }
}
function doGet(){ return ContentService.createTextOutput('FIS Transport Complaints & Requests API is running.'); }
/* Run once after pasting: creates "Transport Complaints Data", loads the vehicle → driver list, and test-reads the Daily FO. */
function setupSheets(){
  secret_(); DOCS(); LOG();
  const d = docs_(); if(!d['config/drivers']) API.set('config/drivers', {map: SEED_DRIVERS}, 'setup');
  const e = entries_(true);
  Logger.log('Daily FO read OK: ' + e.length + ' transport entries. Data sheet: ' + own_().getUrl());
}
function signOutEveryone(){ const p = props_(); p.setProperty('TOKEN_VER', String(Number(p.getProperty('TOKEN_VER') || '1') + 1)); }
/* Names used by complaints/index.html (same as the add-on file complaints.gs) */
API.cr_data = function(fresh){ return API.data(fresh); };
API.cr_set = function(token, key, obj){
  const who = me_(token), lock = LockService.getScriptLock();
  if(!lock.tryLock(20000)) fail('Server busy, try again.');
  try{ return API.set(key, obj, who); }finally{ lock.releaseLock(); }
};
