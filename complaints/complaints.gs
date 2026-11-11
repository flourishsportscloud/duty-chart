/* FIS Transport Complaints & Requests — added as its own file to the "Student Entry Exit API" project,
 * so it uses that project's staff login (STAFF_SUFFIX) and Google permissions. It does not change any
 * Student Entry Exit code: it only adds the requests cr_data and cr_set to that project's API.
 * Reads live from the Daily FO ("Feedback 2026"); keeps follow-up marks and the drivers list in its own
 * sheet "Transport Complaints Data" (id in Script Property CR_SHEET_ID). Nothing is written to the Daily FO.
 * Run crSetup once after adding this file.
 */
var CR_ = (function(){
const TZ = 'Asia/Kolkata';
const FO_ID = '1DAx096q0BtPAEsBI2AAtxYtGyEmHEXqFaLpghy_rhSA';      // Daily FO – "Feedback 2026"
const ROSTER_ID = '1wxkOdzcg3-jRo9y0L6ueaNFQwEonIeyPgfjwzTKtmqM';  // "Student Entry Exit Data" (Roster tab)
const CACHE_SEC = 300;
const SEED_DRIVERS = {"Bus 1":"Samsudin","Bus 2":"Suresh Nayak","Bus 3":"Mahender","Bus 4":"Deepak","Bus 5":"Bharat","Bus 6":"Ajay Gujrati",
  "Bus 7":"Vikash Saraswat","Bus 8":"Aman Siyota","Bus 9":"Kushal Singh","Bus 10":"Ajij","Bus 11":"Manish","Bus 12":"Suresh Gujrati",
  "Bus 13":"Jairaj","Bus 14":"Shivratan","Bus 15":"Dilip Chanwariya","Bus 16":"Hanuman Singh","Bus 34":"Gopal Jawa",
  "Bus A":"Kushal Singh","Bus B":"Mahender","Bus C":"Bharat","Bus D":"Jairaj","Bus E":"Deepak","Bus F":"Suresh Nayak","Bus G":"Nitin Chawariya","Bus H":"Shivratan",
  "Van 17":"Raj Inda","Van 18":"Mumtaj","Van 19":"Yogesh","Van 20":"Jaswant","Van 21":"Surya","Van 22":"Ram Lal","Van 23":"Dulhi Chand","Van 24":"Anwar Khan","Van 25":"Chennaram","Van 26":"Jeet","Van 27":"Mohsin","Van 28":"Mangtu Ram","Van 29":"Prabhu","Van 30":"Jagdish","Van 31":"Ravi","Van 32":"Mussa","Van 33":"Kishan Singh","Van 35":"Yashwardhan","Van 36":"Badal","Van 37":"Sonu","Van 38":"Ajij"};

function fail(m){ throw new Error(m); }
function props_(){ return PropertiesService.getScriptProperties(); }
function own_(){
  const p = props_(); let id = p.getProperty('CR_SHEET_ID'), ss = null;
  if(id) try{ ss = SpreadsheetApp.openById(id); }catch(e){ ss = null; }
  if(!ss){ ss = SpreadsheetApp.create('Transport Complaints Data'); p.setProperty('CR_SHEET_ID', ss.getId()); }
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
  if(!fresh){ const parts = c.get('cr_n'); if(parts){ let j = ''; for(let i = 0; i < Number(parts); i++){ const p = c.get('cr_e' + i); if(p == null){ j = ''; break; } j += p; } if(j) return JSON.parse(j); } }
  const e = read_(), j = JSON.stringify(e), n = Math.ceil(j.length / 90000), o = {cr_n: String(n)};
  for(let i = 0; i < n; i++) o['cr_e' + i] = j.slice(i*90000, (i+1)*90000);
  try{ c.putAll(o, CACHE_SEC); }catch(x){}
  return e;
}
function docs_(){
  const sh = DOCS(), o = {}; if(sh.getLastRow() < 2) return o;
  sh.getRange(2,1,sh.getLastRow()-1,4).getValues().forEach(r => { if(r[0]) try{ o[r[0]] = JSON.parse(r[1]); }catch(e){} });
  return o;
}
function set_(key, obj, who){
  key = String(key||''); if(!/^(ov\/[a-z0-9]+|config\/drivers)$/i.test(key)) fail('Bad key.');
  const lock = LockService.getScriptLock(); if(!lock.tryLock(20000)) fail('Server busy, try again.');
  try{
    const sh = DOCS(), last = sh.getLastRow(), json = JSON.stringify(Object.assign({}, obj, {by: who, at: new Date().toISOString()}));
    if(json.length > 45000) fail('Too long.');
    let row = 0; if(last > 1){ const k = sh.getRange(2,1,last-1,1).getValues(); for(let i = 0; i < k.length; i++) if(k[i][0] === key){ row = i+2; break; } }
    const v = [key, json, new Date().toISOString(), who];
    if(row) sh.getRange(row,1,1,4).setValues([v]); else sh.appendRow(v);
    log_(who, key, 'saved'); return {ok: 1};
  }finally{ lock.releaseLock(); }
}
return {
  data: fresh => ({entries: entries_(!!fresh), docs: docs_(), at: Utilities.formatDate(new Date(), TZ, 'dd MMM yyyy, HH:mm')}),
  set: set_,
  saveDrivers(){ set_('config/drivers', {map: SEED_DRIVERS}, 'Director'); return Object.keys(SEED_DRIVERS).length; },
  setup(){ DOCS(); LOG(); if(!docs_()['config/drivers']) set_('config/drivers', {map: SEED_DRIVERS}, 'setup');
    const e = entries_(true); return 'Daily FO read OK: ' + e.length + ' transport entries. Data sheet: ' + own_().getUrl(); }
};
})();
// The Student Entry Exit doPost checks the staff login (me_) before calling these.
Object.assign(API, {
  cr_data: function(fresh){ return CR_.data(fresh); },
  cr_set: function(token, key, obj){ return CR_.set(key, obj, me_(token)); }
});
function crSetup(){ Logger.log(CR_.setup()); }
/* Run to replace the saved drivers list with SEED_DRIVERS above (overwrites edits made in the app's Drivers list). */
function crSaveDrivers(){ Logger.log('Drivers list saved: ' + CR_.saveDrivers() + ' vehicles'); }
