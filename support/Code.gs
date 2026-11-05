/* FIS Support Staff – Live · Google Apps Script backend
 * A small document store kept in a Google Sheet:
 *   Docs  – one row per record (collection/id, revision, JSON)
 *   Blobs – photos and area reference images (data URLs, split in chunks)
 * The page polls "sync" for records changed since its last revision.
 */
const COLLS = ['cfg','log','photos','refs','visits','wash','green','issues','tasks','routine'];
const BLOB_COLLS = {photos: true, refs: true};   // these keep their image in the Blobs sheet
const NO_SYNC = {photos: true};                  // photos are fetched one by one, never synced
const CHUNK = 45000;                             // characters per cell
const DOC_CHUNKS = 4;                            // max JSON size of a record = 180 000 chars
const BLOB_CHUNKS = 10;                          // max image size = 450 000 chars
const MAX_BLOB = CHUNK * BLOB_CHUNKS;
const DOC_COLS = 5 + DOC_CHUNKS;                 // key, coll, rev, deleted, updated, json…

function fail(m){throw new Error(m)}
function sheet_(name){
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if(!sh){
    sh = ss.insertSheet(name);
    if(name === 'Docs'){
      const h = ['key','coll','rev','deleted','updated']; for(let i=1;i<=DOC_CHUNKS;i++) h.push('json'+i);
      sh.getRange(1,1,1,h.length).setValues([h]); sh.setFrozenRows(1);
    }else if(name === 'Blobs'){
      const h = ['key','updated']; for(let i=1;i<=BLOB_CHUNKS;i++) h.push('data'+i);
      sh.getRange(1,1,1,h.length).setValues([h]); sh.setFrozenRows(1);
    }
  }
  return sh;
}
function rowOf_(sh, key){
  if(sh.getLastRow() < 2) return 0;
  const c = sh.getRange(2,1,sh.getLastRow()-1,1).createTextFinder(key).matchEntireCell(true).findNext();
  return c ? c.getRow() : 0;
}
function split_(s, n){
  const out = []; for(let i=0;i<n;i++) out.push(s.slice(i*CHUNK,(i+1)*CHUNK)); return out;
}
function nextRev_(){
  const p = PropertiesService.getScriptProperties();
  const r = Number(p.getProperty('rev') || 0) + 1;
  p.setProperty('rev', String(r));
  CacheService.getScriptCache().put('rev', String(r), 21600);
  return r;
}
function curRev_(){
  const c = CacheService.getScriptCache().get('rev');
  if(c) return Number(c);
  const r = Number(PropertiesService.getScriptProperties().getProperty('rev') || 0);
  CacheService.getScriptCache().put('rev', String(r), 21600);
  return r;
}
function checkColl_(c){ if(COLLS.indexOf(c) < 0) fail('Unknown collection.'); }
function checkId_(id){ id = String(id||''); if(!id || id.length > 120 || /[\/]/.test(id)) fail('Bad record id.'); return id; }

function writeBlob_(key, data){
  if(typeof data !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(data)) fail('That photo is not valid. Take it again.');
  if(data.length > MAX_BLOB) fail('That photo is too large. Take it again.');
  const sh = sheet_('Blobs'), row = [key, new Date().toISOString()].concat(split_(data, BLOB_CHUNKS));
  const r = rowOf_(sh, key);
  if(r) sh.getRange(r,1,1,row.length).setValues([row]); else sh.appendRow(row);
}
function readBlobs_(keys){
  const sh = sheet_('Blobs'), out = {};
  if(sh.getLastRow() < 2 || !keys.length) return out;
  const want = {}; keys.forEach(k => want[k] = true);
  const vals = sh.getRange(2,1,sh.getLastRow()-1,2+BLOB_CHUNKS).getValues();
  vals.forEach(v => { if(want[v[0]]) out[v[0]] = v.slice(2).join(''); });
  return out;
}
function deleteBlob_(key){ const sh = sheet_('Blobs'), r = rowOf_(sh, key); if(r) sh.deleteRow(r); }

const API = {
  ping(){ return {rev: curRev_()}; },

  // records changed after revision "since" (photos excluded)
  sync(since){
    since = Number(since) || 0;
    const rev = curRev_();
    if(since >= rev) return {rev: rev, docs: []};
    const sh = sheet_('Docs'), n = sh.getLastRow() - 1;
    if(n < 1) return {rev: rev, docs: []};
    const head = sh.getRange(2,1,n,5).getValues();
    const hit = [];
    head.forEach((v,i) => { if(Number(v[2]) > since && !NO_SYNC[v[1]]) hit.push(i); });
    let body;
    if(hit.length > 40) body = sh.getRange(2,6,n,DOC_CHUNKS).getValues();
    const docs = hit.map(i => {
      const v = head[i], id = String(v[0]).slice(String(v[1]).length + 1);
      if(v[3] === true || v[3] === 'TRUE') return {c: v[1], id: id, del: 1};
      const parts = body ? body[i] : sh.getRange(i+2,6,1,DOC_CHUNKS).getValues()[0];
      let j = null; try{ j = JSON.parse(parts.join('')); }catch(e){}
      return {c: v[1], id: id, j: j};
    }).filter(d => d.del || d.j);
    return {rev: rev, docs: docs};
  },

  set(c, id, obj){
    checkColl_(c); id = checkId_(id);
    if(!obj || typeof obj !== 'object' || Array.isArray(obj)) fail('Bad record.');
    const key = c + '/' + id;
    obj = JSON.parse(JSON.stringify(obj));
    if(BLOB_COLLS[c]){
      if(obj.data){ writeBlob_(key, obj.data); }
      delete obj.data; obj._blob = 1;
    }
    const json = JSON.stringify(obj);
    if(json.length > CHUNK * DOC_CHUNKS) fail('This record is too large to save.');
    const rev = nextRev_();
    const row = [key, c, rev, false, new Date().toISOString()].concat(split_(json, DOC_CHUNKS));
    const sh = sheet_('Docs'), r = rowOf_(sh, key);
    if(r) sh.getRange(r,1,1,row.length).setValues([row]); else sh.appendRow(row);
    return {rev: rev};
  },

  del(c, id){
    checkColl_(c); id = checkId_(id);
    const key = c + '/' + id, sh = sheet_('Docs'), r = rowOf_(sh, key);
    if(!r) return {rev: curRev_()};
    const rev = nextRev_();
    const row = [key, c, rev, true, new Date().toISOString()].concat(split_('', DOC_CHUNKS));
    sh.getRange(r,1,1,row.length).setValues([row]);
    if(BLOB_COLLS[c]) deleteBlob_(key);
    return {rev: rev};
  },

  // one record with its image put back in "data"
  get(c, id){
    checkColl_(c); id = checkId_(id);
    const key = c + '/' + id, sh = sheet_('Docs'), r = rowOf_(sh, key);
    if(!r) return null;
    const v = sh.getRange(r,1,1,DOC_COLS).getValues()[0];
    if(v[3] === true || v[3] === 'TRUE') return null;
    let obj = null; try{ obj = JSON.parse(v.slice(5).join('')); }catch(e){ return null; }
    if(BLOB_COLLS[c]){ const b = readBlobs_([key]); if(b[key]) obj.data = b[key]; }
    return obj;
  },

  // images for several ids of one collection: {id: dataURL}
  blobs(c, ids){
    checkColl_(c); if(!BLOB_COLLS[c]) fail('No images in this collection.');
    ids = (Array.isArray(ids) ? ids : []).slice(0, 60).map(checkId_);
    const m = readBlobs_(ids.map(id => c + '/' + id)), out = {};
    ids.forEach(id => { const k = c + '/' + id; if(m[k]) out[id] = m[k]; });
    return out;
  }
};

function doPost(e){
  let req = {};
  try{ req = JSON.parse(e.postData.contents); }catch(x){}
  const fn = API[req.fn];
  const out = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  if(!fn) return out({ok: false, err: 'Unknown request.'});
  const write = req.fn === 'set' || req.fn === 'del';
  const lock = LockService.getScriptLock();
  try{
    if(write && !lock.tryLock(25000)) return out({ok: false, err: 'Server busy, trying again.'});
    return out({ok: true, v: fn.apply(null, req.args || [])});
  }catch(x){
    return out({ok: false, err: String(x && x.message || x)});
  }finally{
    if(write) try{ lock.releaseLock(); }catch(x){}
  }
}
function doGet(){ return ContentService.createTextOutput('FIS Support Staff API is running.'); }
function setupSheets(){ sheet_('Docs'); sheet_('Blobs'); curRev_(); }
