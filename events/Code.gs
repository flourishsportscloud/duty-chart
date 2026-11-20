/* FIS Events & Operations · Google Apps Script backend
 * Stores events, tasks and the access list in its own Google Sheet ("Events & Operations Data", tab "Docs").
 * Every request needs a staff login: password = first name + the common FIS staff suffix (Script Property STAFF_SUFFIX).
 * Only people on the access list (config/members) can log in. Members marked admin (the Director) can create events,
 * manage the list and see every member's report; other members see all tasks but only their own report.
 */
const TZ = 'Asia/Kolkata', TOKEN_DAYS = 120;
function fail(m){ throw new Error(m); }
function props_(){ return PropertiesService.getScriptProperties(); }
function own_(){
  const p = props_(); let id = p.getProperty('SHEET_ID'), ss = null;
  if(id) try{ ss = SpreadsheetApp.openById(id); }catch(e){ ss = null; }
  if(!ss){ ss = SpreadsheetApp.create('Events & Operations Data'); p.setProperty('SHEET_ID', ss.getId()); }
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

/* ---------- login (same scheme as the other FIS apps) ---------- */
const H_ = {
  hmac: (s,k) => Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s,k,Utilities.Charset.UTF_8)).replace(/=+$/,''),
  b64: s => Utilities.base64EncodeWebSafe(s,Utilities.Charset.UTF_8).replace(/=+$/,''),
  unb64: s => Utilities.newBlob(Utilities.base64DecodeWebSafe(s + '==='.slice((s.length+3)%4))).getDataAsString('UTF-8')
};
function secret_(){ const p = props_(); let s = p.getProperty('TOKEN_SECRET'); if(!s){ s = Utilities.getUuid()+Utilities.getUuid(); p.setProperty('TOKEN_SECRET', s); } return s; }
function norm_(n){ return String(n||'').trim().replace(/\s+/g,' ').toLowerCase(); }
function first_(n){ return String(n||'').trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g,''); }
function slug_(n){ return String(n||'').toLowerCase().replace(/[^a-z0-9]+/g,'').slice(0,20) || ('m' + Date.now().toString(36)); }
function nameOf_(token){
  const t = String(token||'').split('.'); if(t.length !== 2) fail('LOGIN');
  let body; try{ body = H_.unb64(t[0]); }catch(e){ fail('LOGIN'); }
  if(H_.hmac(body, secret_()) !== t[1]) fail('LOGIN');
  const b = body.split('|');
  if(Number(b[1]) < Date.now() || b[2] !== String(props_().getProperty('TOKEN_VER') || '1')) fail('LOGIN');
  return b[0];
}
function user_(token){      // the member behind a token; a removed member loses access at once
  const n = norm_(nameOf_(token)), m = members_().filter(x => norm_(x.name) === n)[0];
  if(!m) fail('LOGIN');
  return m;
}
function login_(name, pw){
  name = norm_(name);
  if(name.length < 2) fail('Type your name.');
  const suf = String(props_().getProperty('STAFF_SUFFIX') || '').toLowerCase();
  if(!suf) fail('The staff password is not set up yet. Ask the Director.');
  Utilities.sleep(400);
  const list = members_();
  let m = list.filter(x => norm_(x.name) === name)[0];
  if(!m){ const f = list.filter(x => first_(x.name) === first_(name) && first_(name) === name.replace(/[^a-z]/g,'')); if(f.length === 1) m = f[0]; }
  if(!m || String(pw||'').trim().toLowerCase().replace(/\s+/g,'') !== first_(m.name) + suf) fail('Wrong name or password, or your name is not on the access list. Ask the Director.');
  const body = m.name + '|' + (Date.now() + TOKEN_DAYS*864e5) + '|' + (props_().getProperty('TOKEN_VER') || '1');
  log_(m.name, '', 'login');
  return {token: H_.b64(body) + '.' + H_.hmac(body, secret_()), name: m.name};
}

/* ---------- document store (one row per document) ---------- */
function rows_(){
  const sh = DOCS(), n = sh.getLastRow(); if(n < 2) return [];
  return sh.getRange(2,1,n-1,4).getValues();
}
function get_(key){
  const r = rows_().filter(x => x[0] === key)[0]; if(!r) return null;
  try{ return JSON.parse(r[1]); }catch(e){ return null; }
}
function put_(key, obj, who){
  const sh = DOCS(), json = JSON.stringify(obj);
  if(json.length > 45000) fail('Too long.');
  const last = sh.getLastRow(); let row = 0;
  if(last > 1){ const k = sh.getRange(2,1,last-1,1).getValues(); for(let i = 0; i < k.length; i++) if(k[i][0] === key){ row = i+2; break; } }
  const v = [key, json, new Date().toISOString(), who || ''];
  if(row) sh.getRange(row,1,1,4).setValues([v]); else sh.appendRow(v);
}
function del_(key){
  const sh = DOCS(), last = sh.getLastRow(); if(last < 2) return;
  const k = sh.getRange(2,1,last-1,1).getValues();
  for(let i = k.length-1; i >= 0; i--) if(k[i][0] === key){ sh.deleteRow(i+2); return; }
}
function members_(){ const d = get_('config/members'); return (d && d.list) || []; }
const KEY_ = /^(events|tasks)\/[a-z0-9]{4,24}$/;
const STATUS_ = {pending:1, working:1, done:1};
function inLock_(f){
  const lock = LockService.getScriptLock();
  if(!lock.tryLock(20000)) fail('Server busy, try again.');
  try{ return f(); }finally{ try{ lock.releaseLock(); }catch(x){} }
}
function cleanTask_(t, u){
  const a = (Array.isArray(t.assignees) ? t.assignees : []).map(String).slice(0,30);
  return {kind: t.kind === 'event' ? 'event' : 'ops', event: String(t.event||''), title: String(t.title||'').trim().slice(0,200), note: String(t.note||'').slice(0,1000),
    date: /^\d{4}-\d{2}-\d{2}$/.test(t.date||'') ? t.date : '', time: /^\d{2}:\d{2}$/.test(t.time||'') ? t.time : '', assignees: a, by: String(t.by||u.id)};
}

const API = {
  login: login_,
  ev_data(u){
    const events = [], tasks = [];
    rows_().forEach(r => {
      const k = String(r[0]); let o; try{ o = JSON.parse(r[1]); }catch(e){ return; }
      const id = k.split('/')[1];
      if(k.indexOf('events/') === 0){ o.id = id; events.push(o); } else if(k.indexOf('tasks/') === 0){ o.id = id; tasks.push(o); }
    });
    return {me: {id: u.id, name: u.name, admin: !!u.admin}, members: members_(), events: events, tasks: tasks, at: Utilities.formatDate(new Date(), TZ, 'dd MMM yyyy, HH:mm')};
  },
  ev_set(u, key, obj){        // create an event (admin) or a task (any member); existing docs only by admin or creator
    key = String(key||''); if(!KEY_.test(key)) fail('Bad key.');
    const isEv = key.indexOf('events/') === 0, old = get_(key);
    if(isEv && !u.admin) fail('Only the Director can create or edit events.');
    if(old && !isEv && !(u.admin || old.createdBy === u.id)) fail('Only the creator or the Director can change this.');
    let doc;
    if(isEv){
      doc = {title: String(obj.title||'').trim().slice(0,160), date: /^\d{4}-\d{2}-\d{2}$/.test(obj.date||'') ? obj.date : '', note: String(obj.note||'').slice(0,600), createdAt: (old && old.createdAt) || Date.now(), sample: old && old.sample ? true : undefined};
      if(!doc.title) fail('Event title is needed.');
    }else{
      doc = cleanTask_(obj, u);
      if(!doc.title || !doc.date || !doc.assignees.length) fail('Task, date and at least one member are needed.');
      Object.assign(doc, old ? {status: old.status, remarks: old.remarks || [], createdAt: old.createdAt, createdBy: old.createdBy, doneAt: old.doneAt || null, doneBy: old.doneBy || '', sample: old.sample} :
        {status: 'pending', remarks: [], createdAt: Date.now(), createdBy: u.id});
    }
    return inLock_(() => { put_(key, doc, u.name); log_(u.name, key, old ? 'edited' : 'created'); doc.id = key.split('/')[1]; return doc; });
  },
  ev_task(u, id, fields, remark){   // atomic status / remark / edit of one task
    id = String(id||''); const key = 'tasks/' + id; if(!KEY_.test(key)) fail('Bad key.');
    return inLock_(() => {
      const t = get_(key); if(!t) fail('This task no longer exists.');
      const mine = u.admin || t.createdBy === u.id || (t.assignees || []).indexOf(u.id) >= 0;
      if(!mine) fail('Only the people it is allocated to, its creator or the Director can update this task.');
      fields = fields || {}; let changed = false;
      if(fields.status !== undefined){
        if(!STATUS_[fields.status]) fail('Bad status.');
        if(fields.status !== t.status){
          changed = true; t.status = fields.status;
          t.doneAt = fields.status === 'done' ? Date.now() : null; t.doneBy = fields.status === 'done' ? u.id : '';
          if(fields.status === 'working') t.startedAt = Date.now();
        }
      }
      const edit = ['title','note','date','time','assignees','by'].filter(f => fields[f] !== undefined);
      if(edit.length){
        if(!(u.admin || t.createdBy === u.id)) fail('Only the creator or the Director can edit the task details.');
        const c = cleanTask_(Object.assign({}, t, fields), u);
        if(!c.title || !c.date || !c.assignees.length) fail('Task, date and at least one member are needed.');
        Object.assign(t, {title: c.title, note: c.note, date: c.date, time: c.time, assignees: c.assignees, by: c.by});
      }
      const text = remark ? String(remark.text||'').trim().slice(0,600) : '', prob = !!(remark && remark.problem);
      if(text || prob || changed){
        t.remarks = (t.remarks || []).concat([{by: u.id, at: Date.now(), text: text, status: t.status, problem: prob}]).slice(-60);
      }
      put_(key, t, u.name); log_(u.name, key, 'update ' + (fields.status || (edit.length ? 'edit' : 'remark')));
      t.id = id; return t;
    });
  },
  ev_del(u, key){
    key = String(key||''); if(!KEY_.test(key)) fail('Bad key.');
    return inLock_(() => {
      const old = get_(key); if(!old) return {ok: 1};
      if(key.indexOf('events/') === 0){ if(!u.admin) fail('Only the Director can delete events.'); }
      else if(!(u.admin || old.createdBy === u.id)) fail('Only the creator or the Director can delete this task.');
      del_(key); log_(u.name, key, 'deleted'); return {ok: 1};
    });
  },
  ev_members(u, list){
    if(!u.admin) fail('Only the Director can change the access list.');
    if(!Array.isArray(list)) fail('Bad list.');
    const seen = {}, out = [];
    list.forEach(m => {
      const name = String(m.name||'').trim().replace(/\s+/g,' ').slice(0,40); if(name.length < 2) return;
      let id = String(m.id||'').replace(/[^a-z0-9-]/g,'') || slug_(name); while(seen[id]) id += 'x';
      seen[id] = 1; out.push({id: id, name: name, admin: !!m.admin, sample: m.sample ? true : undefined});
    });
    if(!out.some(m => m.admin)) fail('Keep at least one admin.');
    if(!out.some(m => m.id === u.id && m.admin)) fail('You cannot remove your own admin access.');
    return inLock_(() => { put_('config/members', {list: out}, u.name); log_(u.name, 'config/members', 'saved ' + out.length); return out; });
  },
  ev_sample(u, on){
    if(!u.admin) fail('Only the Director can do this.');
    return inLock_(() => {
      if(!on){
        rows_().forEach(r => { try{ if(JSON.parse(r[1]).sample) del_(r[0]); }catch(e){} });
        const keep = members_().filter(m => !m.sample); put_('config/members', {list: keep}, u.name); return {ok: 1};
      }
      const list = members_(), have = {}; list.forEach(m => have[m.id] = 1);
      [['sp-jay','Jay'],['sp-anu','Anu'],['sp-vis','Vishali'],['sp-pra','Prashant']].forEach(p => { if(!have[p[0]]) list.push({id: p[0], name: p[1], admin: false, sample: true}); });
      put_('config/members', {list: list}, u.name);
      const dir = u.id, now = Date.now(), t0 = new Date(Utilities.formatDate(new Date(), TZ, 'yyyy/MM/dd') + ' 00:00:00');
      const D = n => Utilities.formatDate(new Date(t0.getTime() + n*864e5 + 12*3600e3), TZ, 'yyyy-MM-dd');
      put_('events/sp-ev1', {title: 'Annual Day Celebration', date: D(15), note: 'Main stage, parents invited, 3 pm start', createdAt: 1, sample: true}, 'sample');
      put_('events/sp-ev2', {title: 'Parents Open House', date: D(8), note: 'Class-wise meetings with display boards', createdAt: 2, sample: true}, 'sample');
      let n = 0;
      const R = (by, text, st, p) => ({by: by, at: now - 3600e3, text: text, status: st, problem: !!p});
      const T = (kind, ev, title, off, time, ass, by, st, rem, note) => {
        n++; const o = {kind: kind, event: ev ? 'sp-' + ev : '', title: title, note: note || '', date: D(off), time: time, assignees: ass, by: by || dir, status: st || 'pending',
          remarks: rem || [], createdAt: now + n, createdBy: dir, sample: true};
        if(st === 'done'){ o.doneAt = now - 7200e3; o.doneBy = ass[0]; }
        put_('tasks/sp-t' + ('0' + n).slice(-2), o, 'sample');
      };
      T('event','ev1','Book tent and sound system',-1,'17:00',['sp-pra'],dir,'done',[R('sp-pra','Booked with Sharma Tent House. Advance paid.','done')]);
      T('event','ev1','Stage decor and backdrop',12,'10:00',['sp-anu','sp-vis'],dir,'working',[R('sp-anu','Design finalised. Backdrop printing sent to vendor.','working')]);
      T('event','ev1','Flowers and garlands',13,'09:00',['sp-vis'],dir,'pending',[],'Marigold garlands for the entrance and stage');
      T('event','ev1','Print invitation cards',4,'12:00',['sp-jay'],'sp-anu');
      T('event','ev1','Certificates and mementos',10,'15:00',['sp-anu']);
      T('event','ev1','Rehearsal schedule for all classes',7,'14:00',['sp-jay','sp-pra'],dir,'working',[R('sp-jay','Classes 1-5 slots done. Waiting for hall for Class 6-11.','working')]);
      T('event','ev1','Refreshments order',14,'11:00',['sp-pra']);
      T('event','ev2','Classroom display boards',6,'16:00',['sp-anu'],'sp-jay');
      T('event','ev2','Parent entry and parking arrangement',7,'12:00',['sp-pra']);
      T('event','ev2','Print feedback forms',5,'11:00',['sp-jay']);
      T('ops','','Morning gate and arrival check',0,'07:30',['sp-jay'],dir,'done');
      T('ops','','Floor round and cleanliness check',0,'10:30',['sp-anu'],dir,'working');
      T('ops','','Washroom and drinking water check',0,'11:30',['sp-vis'],dir,'pending',[R('sp-vis','Water cooler on 2nd floor not working. Maintenance informed.','pending',true)]);
      T('ops','','Update stock register',0,'14:00',['sp-pra']);
      T('ops','','Bus departure supervision',0,'15:30',['sp-pra','sp-jay']);
      T('ops','','End-of-day report to Director',0,'16:30',['sp-jay']);
      T('ops','','Washroom and drinking water check',-1,'11:30',['sp-vis'],dir,'pending',[R('sp-vis','Soap refill pending, store has no stock.','pending',true)]);
      T('ops','','Floor round and cleanliness check',-1,'10:30',['sp-anu'],dir,'done');
      T('ops','','Morning gate and arrival check',1,'07:30',['sp-jay']);
      T('ops','','Floor round and cleanliness check',1,'10:30',['sp-anu']);
      return {ok: 1};
    });
  }
};
function doPost(e){
  let req = {}; try{ req = JSON.parse(e.postData.contents); }catch(x){}
  const out = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  const fn = API[req.fn]; if(!fn || req.fn === 'constructor') return out({ok: false, err: 'Unknown request.'});
  try{
    const args = req.args || [];
    const v = req.fn === 'login' ? fn.apply(null, args) : fn.apply(null, [user_(req.token)].concat(args));
    return out({ok: true, v: v});
  }catch(x){ const m = String(x && x.message || x); return out({ok: false, err: m, login: m === 'LOGIN' ? 1 : 0}); }
}
function doGet(){ return ContentService.createTextOutput('FIS Events & Operations API is running.'); }
/* Run once after pasting: creates the data sheet and puts the Director on the access list (admin). */
function setup(){
  secret_(); DOCS(); LOG();
  if(!get_('config/members')) put_('config/members', {list: [{id: 'harsh', name: 'Harsh Yadav', admin: true}]}, 'setup');
  Logger.log('Ready. Data sheet: ' + own_().getUrl() + ' · STAFF_SUFFIX is ' + (props_().getProperty('STAFF_SUFFIX') ? 'set' : 'NOT set (add it under Project Settings > Script properties)'));
}
function signOutEveryone(){ const p = props_(); p.setProperty('TOKEN_VER', String(Number(p.getProperty('TOKEN_VER') || '1') + 1)); }
