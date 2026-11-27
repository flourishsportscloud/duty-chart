/* FIS Transport Daily Report — added as its own file to the "Student Entry Exit API" project, so it uses
 * that project's staff login (STAFF_SUFFIX) and Google permissions. It does not change Student Entry Exit code:
 * it only adds the requests td_since, td_set, td_update and td_photo to that project's API.
 * Data lives in the Google Sheet "Transport Daily Data" (first tab: key | coll | json | updated | rev; tab Log).
 * Salary records (salary/...) are sent only to the people named in Script Property TD_ADMINS
 * (first names, comma-separated, e.g. "harsh, rahul"). If Script Property TD_SAL_PIN is set, salary records also
 * need that PIN, so typing an admin's name at login is not enough.
 */
var TD_ = (function(){
const TZ = 'Asia/Kolkata';
const SHEET = '1MNUE8rhZK0vvnf-6Rsk3NvNIKvnS4bEZp6PtN64HeTU';   // "Transport Daily Data"
const KEY_RE = /^(reports|roster|salary|vehicles|service|photos)\/[A-Za-z0-9_.\-]{1,60}$/;
function fail(m){ throw new Error(m); }
const props = () => PropertiesService.getScriptProperties();
const ss = () => SpreadsheetApp.openById(SHEET);
function docs_(){ const s = ss(); return s.getSheetByName('Docs') || s.getSheets()[0]; }
function log_(who, key, what){ try{ const s = ss(); let l = s.getSheetByName('Log');
  if(!l){ l = s.insertSheet('Log'); l.appendRow(['time','who','key','what']); l.setFrozenRows(1); }
  l.appendRow([Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'), who, key, what]); }catch(e){} }
const first = n => String(n||'').trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g,'');
function admin_(who){ return String(props().getProperty('TD_ADMINS')||'').toLowerCase().split(/[,\s]+/).filter(Boolean).indexOf(first(who)) >= 0; }
function pinSet_(){ return String(props().getProperty('TD_SAL_PIN')||'').trim(); }
function pinOk_(pin){ const p = pinSet_(); return !p || String(pin||'').trim() === p; }
const may_ = (key, who, pin) => key.indexOf('salary/') !== 0 || (admin_(who) && pinOk_(pin));
function rows_(){ const s = docs_(), n = s.getLastRow(); return n < 2 ? [] : s.getRange(2,1,n-1,5).getValues(); }
// fast read: keys and revs only (small columns); the JSON column is read only for the rows that are needed
// (photos live in the same sheet and are large, so reading every row's JSON was the slow part)
function meta_(){ const s = docs_(), n = s.getLastRow(); if(n < 2) return {s: s, keys: [], revs: []};
  return {s: s, keys: s.getRange(2,1,n-1,1).getValues().map(r => String(r[0])), revs: s.getRange(2,5,n-1,1).getValues().map(r => Number(r[0]))}; }
function readJson_(s, idx){ const out = {}; let i = 0;
  while(i < idx.length){ let j = i; while(j + 1 < idx.length && idx[j+1] === idx[j] + 1) j++;
    const vals = s.getRange(idx[i] + 2, 3, j - i + 1, 1).getValues(); for(let t = 0; t <= j - i; t++) out[idx[i+t]] = vals[t][0]; i = j + 1; }
  return out; }
function pick_(m, test){ const idx = []; m.keys.forEach((k, i) => { if(k && test(k, m.revs[i])) idx.push(i); }); const raw = readJson_(m.s, idx), out = {};
  idx.forEach(i => { try{ out[m.keys[i]] = JSON.parse(raw[i]); }catch(e){} }); return out; }
function rev_(){ return Number(props().getProperty('TD_REV') || '1'); }
function merge_(a, b){ for(const k in b){ const v = b[k];
  if(v && typeof v === 'object' && !Array.isArray(v)){ if(!a[k] || typeof a[k] !== 'object' || Array.isArray(a[k])) a[k] = {}; merge_(a[k], v); } else a[k] = v; } return a; }
function since(who, since, pin){
  since = Number(since) || 0; const out = {}, cur = rev_();
  const adm0 = admin_(who), pinState = !adm0 ? 'no' : (pinSet_() ? (pinOk_(pin) ? 'ok' : 'need') : 'none');
  // nothing changed since this phone's last sync: answer without reading the sheet (most polls)
  if(since > 0 && since >= cur) return {docs: {}, rev: cur, admin: adm0, full: false, salPin: pinState};
  const docs = pick_(meta_(), (k, rv) => k.indexOf('photos/') !== 0 && rv > since && may_(k, who, pin));
  return {docs: docs, rev: cur, admin: adm0, full: since === 0, salPin: pinState};
}
function write(who, key, obj, isMerge, pin){
  key = String(key||''); if(!KEY_RE.test(key)) fail('Bad key.');
  if(!may_(key, who, pin)) fail('Only Harsh Yadav and Rahul Yadav (with the salary PIN) can change salaries.');
  if(!obj || typeof obj !== 'object') fail('Nothing to save.');
  const lock = LockService.getScriptLock(); if(!lock.tryLock(20000)) fail('Server busy, try again.');
  try{
    const m = meta_(), s = m.s, i0 = m.keys.indexOf(key); let row = 0, cur = {};
    if(i0 >= 0){ row = i0 + 2; try{ cur = JSON.parse(s.getRange(row, 3).getValue()); }catch(e){} }
    // audit trail: what was sent and the old value of every field it changed
    const old = {}; (function walk(o, c, p){ for(const k in o){ const v = o[k], q = p ? p + '.' + k : k;
      if(v && typeof v === 'object' && !Array.isArray(v) && c && c[k] && typeof c[k] === 'object' && !Array.isArray(c[k])) walk(v, c[k], q); else old[q] = c ? c[k] : undefined; } })(obj, JSON.parse(JSON.stringify(cur)), '');
    const next = isMerge ? merge_(cur, obj) : obj, json = JSON.stringify(next);
    if(json.length > 49000) fail('Too long to save.');
    const rev = rev_() + 1; props().setProperty('TD_REV', String(rev));
    const v = [key, key.split('/')[0], json, new Date().toISOString(), rev];
    if(row) s.getRange(row,1,1,5).setValues([v]); else s.appendRow(v);
    log_(who, key, (isMerge ? 'updated ' : 'saved ') + JSON.stringify(obj).slice(0, 1500) + ' | old ' + JSON.stringify(old).slice(0, 1500));
    return {rev: rev};
  }finally{ lock.releaseLock(); }
}
// photos (photos/...) are not sent with td_since; the page asks for one photo when someone opens it
function photo(who, key){ key = String(key||''); if(!/^photos\//.test(key) || !KEY_RE.test(key)) fail('Bad key.');
  const m = meta_(), i = m.keys.indexOf(key); if(i < 0) return {}; try{ return JSON.parse(m.s.getRange(i + 2, 3).getValue()); }catch(e){ return {}; } }
// first screen: just the documents a page needs to start (names, issues, today/tomorrow, fleet) — the rest follows with td_since
function boot(who, keys, prefixes, pin){ keys = (keys || []).map(String); prefixes = (prefixes || []).map(String);
  const docs = pick_(meta_(), k => k.indexOf('photos/') !== 0 && may_(k, who, pin) && (keys.indexOf(k) >= 0 || prefixes.some(p => k.indexOf(p) === 0)));
  return {docs: docs, rev: rev_()}; }
return {since: since, write: write, photo: photo, boot: boot};
})();
// The Student Entry Exit doPost checks the staff login (me_) before calling these.
Object.assign(API, {
  td_since: function(token, rev, pin){ return TD_.since(me_(token), rev, pin); },
  td_set: function(token, key, obj, pin){ return TD_.write(me_(token), key, obj, false, pin); },
  td_update: function(token, key, obj, pin){ return TD_.write(me_(token), key, obj, true, pin); },
  td_photo: function(token, key){ return TD_.photo(me_(token), key); },
  td_boot: function(token, keys, prefixes, pin){ return TD_.boot(me_(token), keys, prefixes, pin); }
});
