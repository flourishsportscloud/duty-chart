/* FIS Tasks & Projects · Google Apps Script backend
 * Daily tasks and projects (events) for the Director and staff: allocate, cross-allocate, deadlines, photos, chat,
 * submit for approval / approve / rework / decline. Everything lives in its own Google Sheet ("Tasks & Projects Data":
 * tab "Docs" for projects, tasks and the access list, tab "Images" for photos, tab "Log" for who did what).
 * Every request needs a staff login: password = first name + the common FIS staff suffix (Script Property STAFF_SUFFIX).
 * Only people on the access list (config/members) can log in. Admins (the Director) see the dashboard of everyone.
 */
const TZ = 'Asia/Kolkata', TOKEN_DAYS = 120;
const TEAM = [['jay','Jay',0],['anup','Anup',0],['rahul','Rahul Yadav',1],['harsh','Harsh Yadav',0],['saurabh','Saurabh',0],['asha','Asha',0],['sanjana','Sanjana',0],['vishali','Vishali',0],['shubhangi','Shubhangi',0],['chandan','Chandan',0],['neha','Neha',0]];
function fail(m){ throw new Error(m); }
function props_(){ return PropertiesService.getScriptProperties(); }
function own_(){
  const p = props_(); let id = p.getProperty('SHEET_ID'), ss = null;
  if(id) try{ ss = SpreadsheetApp.openById(id); }catch(e){ ss = null; }
  if(!ss){ ss = SpreadsheetApp.create('Tasks & Projects Data'); p.setProperty('SHEET_ID', ss.getId()); }
  return ss;
}
function tab_(name, head){
  const ss = own_(); let sh = ss.getSheetByName(name);
  if(!sh){ sh = ss.insertSheet(name); sh.getRange(1,1,1,head.length).setValues([head]).setFontWeight('bold'); sh.setFrozenRows(1); }
  return sh;
}
const DOCS = () => tab_('Docs', ['key','json','updated','who']);
const IMGS = () => tab_('Images', ['key','data']);
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
  const suf = String(props_().getProperty('STAFF_SUFFIX') || '').toLowerCase();   // empty = open mode: choose your name, no password
  if(suf) Utilities.sleep(400);
  const list = members_();
  let m = list.filter(x => norm_(x.name) === name)[0];
  if(!m){ const f = list.filter(x => first_(x.name) === first_(name) && first_(name) === name.replace(/[^a-z]/g,'')); if(f.length === 1) m = f[0]; }
  if(!m || (suf && String(pw||'').trim().toLowerCase().replace(/\s+/g,'') !== first_(m.name) + suf)) fail('Wrong name or password, or your name is not on the access list. Ask the Director.');
  const body = m.name + '|' + (Date.now() + TOKEN_DAYS*864e5) + '|' + (props_().getProperty('TOKEN_VER') || '1');
  return {token: H_.b64(body) + '.' + H_.hmac(body, secret_()), name: m.name};
}

/* ---------- document store (one row per document) ---------- */
let ROWS_ = null;                       // the sheet is read once per request, not once per question
function rows_(){
  if(ROWS_) return ROWS_;
  const sh = DOCS(), n = sh.getLastRow();
  ROWS_ = n < 2 ? [] : sh.getRange(2,1,n-1,4).getValues();
  return ROWS_;
}
function touch_(){ ROWS_ = null; try{ props_().setProperty('REV', Date.now().toString(36) + Math.random().toString(36).slice(2,5)); }catch(e){} }
function get_(key){
  const r = rows_().filter(x => x[0] === key)[0]; if(!r) return null;
  try{ return JSON.parse(r[1]); }catch(e){ return null; }
}
function put_(key, obj, who){
  if(key.indexOf('config/') !== 0){ obj.upd = Date.now(); obj.updBy = who || ''; }      // who changed it last, and when (server clock)
  const sh = DOCS(); let json = JSON.stringify(obj);
  if(json.length > 46000 && obj.msgs){ while(json.length > 46000 && obj.msgs.length > 2){ obj.msgs.shift(); json = JSON.stringify(obj); } }
  if(json.length > 46000) fail('Too long.');
  const last = sh.getLastRow(); let row = 0;
  if(last > 1){ const k = sh.getRange(2,1,last-1,1).getValues(); for(let i = 0; i < k.length; i++) if(k[i][0] === key){ row = i+2; break; } }
  const v = [key, json, new Date().toISOString(), who || ''];
  if(row) sh.getRange(row,1,1,4).setValues([v]); else sh.appendRow(v);
  if(key === 'config/members'){ try{ CacheService.getScriptCache().put('MEM', JSON.stringify(obj.list || []), 21600); props_().setProperty('MEM_BAK', JSON.stringify(obj.list || [])); }catch(e){} }
  touch_();
}
function del_(key){
  const sh = DOCS(), last = sh.getLastRow(); if(last < 2) return;
  const k = sh.getRange(2,1,last-1,1).getValues();
  for(let i = k.length-1; i >= 0; i--) if(k[i][0] === key){ sh.deleteRow(i+2); touch_(); return; }
}
function members_(){        // cached, with a saved copy, so a slow or half-written sheet read can never lock people out
  const c = CacheService.getScriptCache(); let j = null;
  try{ j = c.get('MEM'); }catch(e){}
  if(j){ try{ const l = JSON.parse(j); if(l && l.length) return l; }catch(e){} }
  const d = get_('config/members'); let list = (d && d.list) || [];
  if(!list.length){ try{ list = JSON.parse(props_().getProperty('MEM_BAK') || '[]'); }catch(e){ list = []; } }
  if(list.length){ try{ c.put('MEM', JSON.stringify(list), 21600); }catch(e){} }
  return list;
}

/* ---------- photos: a small thumbnail row plus the full picture split into rows (a cell holds 50,000 characters) ---------- */
const CH_ = 45000, IMGID_ = /^[a-z0-9-]{6,30}$/;
function imgRows_(){ const sh = IMGS(), n = sh.getLastRow(); return n < 2 ? [] : sh.getRange(2,1,n-1,1).getValues().map(r => String(r[0])); }
function rmImg_(id){
  const sh = IMGS(), k = imgRows_();
  for(let i = k.length-1; i >= 0; i--) if(k[i].indexOf(id + ':') === 0) sh.deleteRow(i+2);
}
function writeImg_(id, thumb, full){
  rmImg_(id);
  const rows = [[id + ':t', thumb]];
  for(let i = 0; i * CH_ < full.length; i++) rows.push([id + ':' + i, full.slice(i*CH_, (i+1)*CH_)]);
  const sh = IMGS(), last = sh.getLastRow();
  sh.getRange(last+1, 1, rows.length, 2).setValues(rows);
}
function readImgs_(ids, which){
  const sh = IMGS(), keys = imgRows_(), at = {}; keys.forEach((k,i) => { at[k] = i+2; });
  const out = {}, cache = CacheService.getScriptCache(), want = ids.slice(0,24).filter(id => IMGID_.test(id)); let tc = {};
  if(which === 't'){ try{ const g = cache.getAll(want.map(id => 'T_' + id)); want.forEach(id => { if(g['T_' + id]) tc[id] = g['T_' + id]; }); }catch(e){ tc = {}; } }
  ids.slice(0,24).forEach(id => {
    if(!IMGID_.test(id)) return;
    if(which === 't'){
      const hit = tc[id]; if(hit){ out[id] = hit; return; }
      const r = at[id + ':t']; if(r){ const v = String(sh.getRange(r,2).getValue()); out[id] = v; try{ cache.put('T_' + id, v, 21600); }catch(e){} }
      return;
    }
    let s = '', i = 0; while(at[id + ':' + i]){ s += String(sh.getRange(at[id + ':' + i],2).getValue()); i++; }
    if(s) out[id] = s;
  });
  return out;
}

/* ---------- tasks ---------- */
const KEY_ = /^(projects|tasks|notes)\/[a-z0-9-]{4,30}$/;
function inLock_(f){
  const lock = LockService.getScriptLock();
  if(!lock.tryLock(20000)) fail('Server busy, try again.');
  ROWS_ = null;     // anything read before the lock may be out of date
  try{ return f(); }finally{ try{ lock.releaseLock(); }catch(x){} }
}
const cleanImgs_ = a => (Array.isArray(a) ? a : []).map(String).filter(x => IMGID_.test(x)).slice(0,8);
const day_ = s => /^\d{4}-\d{2}-\d{2}$/.test(s||'') ? s : '';
function cleanTask_(t, u, base){
  const ids = members_().map(m => m.id);
  const a = (Array.isArray(t.assignees) ? t.assignees : []).map(String).filter(x => ids.indexOf(x) >= 0).slice(0,12);
  return {title: String(t.title||'').trim().slice(0,200), note: String(t.note||'').slice(0,1000), project: String(t.project||'').replace(/[^a-z0-9-]/g,'').slice(0,30),
    date: day_(t.date), time: /^\d{2}:\d{2}$/.test(t.time||'') ? t.time : '', assignees: a,
    by: u.admin && ids.indexOf(t.by) >= 0 ? t.by : ((base && base.by) || u.id), priority: t.priority === 'high' ? 'high' : 'normal', approval: !!t.approval};
}
function msg_(u, kind, text, imgs, st, problem){ return {by: u.id, at: Date.now(), kind: kind, text: text, imgs: imgs, st: st, problem: problem ? true : undefined}; }
function strip_(o){ Object.keys(o).forEach(k => { if(o[k] === undefined) delete o[k]; }); return o; }

function snapshot_(rev){     // the whole list, kept in the script cache until anything changes
  const c = CacheService.getScriptCache(), pre = 'D' + rev + '_';
  try{
    const n = Number(c.get(pre + 'n') || 0);
    if(n){ const keys = []; for(let i = 0; i < n; i++) keys.push(pre + i); const g = c.getAll(keys); let s = '', ok = true;
      for(let i = 0; i < n; i++){ if(g[pre + i] == null){ ok = false; break; } s += g[pre + i]; }
      if(ok) return JSON.parse(s); }
  }catch(e){}
  const projects = [], tasks = [], notes = [];
  rows_().forEach(r => {
    const k = String(r[0]); let o; try{ o = JSON.parse(r[1]); }catch(e){ return; }
    const id = k.split('/')[1];
    if(o.del) return;       // soft-deleted: kept in the sheet, hidden in the app
    if(k.indexOf('projects/') === 0){ o.id = id; projects.push(o); } else if(k.indexOf('tasks/') === 0){ o.id = id; tasks.push(o); } else if(k.indexOf('notes/') === 0){ o.id = id; notes.push(o); }
  });
  const out = {projects: projects, tasks: tasks, notes: notes};
  try{
    const s = JSON.stringify(out), SZ = 30000, n = Math.ceil(s.length / SZ);
    if(n > 0 && n <= 30){ const put = {}; for(let i = 0; i < n; i++) put[pre + i] = s.slice(i*SZ, (i+1)*SZ); put[pre + 'n'] = String(n); c.putAll(put, 21600); }
  }catch(e){}
  return out;
}

const API = {
  login: login_,
  login_info(){ return {pw: !!String(props_().getProperty('STAFF_SUFFIX') || ''), names: members_().map(m => m.name)}; },
  ev_data(u, since){
    const rev = String(props_().getProperty('REV') || '0');
    if(since && String(since) === rev) return {same: true, rev: rev};       // nothing changed: a very small answer
    const base = snapshot_(rev);
    return {rev: rev, me: {id: u.id, name: u.name, admin: !!u.admin}, members: members_(), projects: base.projects, tasks: base.tasks,
      notes: base.notes.filter(n => n.owner === u.id), at: Utilities.formatDate(new Date(), TZ, 'dd MMM yyyy, HH:mm')};
  },
  ev_note(u, id, obj){        // a private note, only its owner can see or change it
    id = String(id||''); const key = 'notes/' + id; if(!KEY_.test(key)) fail('Bad key.');
    obj = obj || {};
    return inLock_(() => {
      const old = get_(key); if(old && old.owner !== u.id) fail('This is a private note.');
      const done = obj.done !== undefined ? !!obj.done : !!(old && old.done);
      const doc = strip_({title: String(obj.title||'').trim().slice(0,200), note: String(obj.note||'').slice(0,1500), date: day_(obj.date),
        time: /^\d{2}:\d{2}$/.test(obj.time||'') ? obj.time : '', project: String(obj.project||'').replace(/[^a-z0-9-]/g,'').slice(0,30),
        done: done, doneAt: done ? ((old && old.doneAt) || Date.now()) : undefined, owner: u.id, createdAt: (old && old.createdAt) || Date.now(), sample: old && old.sample ? true : undefined});
      if(!doc.title) fail('Write the note first.');
      put_(key, doc, u.name); doc.id = id; return doc;
    });
  },
  ev_set(u, key, obj){        // create a project or a task (any member); change a project (creator or admin)
    key = String(key||''); if(!KEY_.test(key)) fail('Bad key.');
    const isPj = key.indexOf('projects/') === 0, old = get_(key);
    obj = obj || {};
    let doc;
    if(isPj){
      if(old && !(u.admin || old.createdBy === u.id)) fail('Only the creator or the Director can change this project.');
      doc = strip_({title: String(obj.title||'').trim().slice(0,160), date: day_(obj.date), note: String(obj.note||'').slice(0,600), createdAt: (old && old.createdAt) || Date.now(), createdBy: (old && old.createdBy) || u.id, sample: old && old.sample ? true : undefined});
      if(!doc.title) fail('Project title is needed.');
    }else{
      if(old) fail('Use an update to change an existing task.');
      doc = cleanTask_(obj, u, null);
      if(!doc.title || !doc.date || !doc.assignees.length) fail('Task, deadline and at least one person are needed.');
      const imgs = cleanImgs_(obj.imgs);
      Object.assign(doc, {status: 'todo', msgs: imgs.length ? [msg_(u, 'brief', 'Reference photos', imgs, 'todo')] : [], createdAt: Date.now(), createdBy: u.id});
    }
    return inLock_(() => { put_(key, doc, u.name); log_(u.name, key, old ? 'edited' : 'created'); doc.id = key.split('/')[1]; return doc; });
  },
  ev_act(u, id, act, d){      // every change to a task: start, submit, approve, rework, decline, demand, reopen, say, edit
    id = String(id||''); const key = 'tasks/' + id; if(!KEY_.test(key)) fail('Bad key.');
    d = d || {};
    return inLock_(() => {
      const t = get_(key); if(!t || t.del) fail('This task no longer exists.');
      const isAsg = (t.assignees || []).indexOf(u.id) >= 0, owner = u.admin || t.by === u.id || t.createdBy === u.id;
      if(!(owner || isAsg)) fail('Only the people it is allocated to, whoever gave it, or the Director can act on this task.');
      const text = String(d.text||'').trim().slice(0,800), imgs = cleanImgs_(d.imgs), now = Date.now();
      const open = ['todo','working','rework'].indexOf(t.status) >= 0, closed = t.status === 'done' || t.status === 'declined';
      const setDue = () => { if(day_(d.date)){ t.date = d.date; t.time = /^\d{2}:\d{2}$/.test(d.time||'') ? d.time : t.time; } };
      let add = null, logWhat = act;
      switch(act){
        case 'start':
          if(!(isAsg || owner) || closed) fail('This task is already closed.');
          t.status = 'working'; add = msg_(u, 'start', '', [], 'working'); break;
        case 'submit':
          if(!(isAsg || owner) || closed || t.status === 'review') fail('This task cannot be submitted now.');
          if(t.approval && !text && !imgs.length) fail('Add a note or a photo with your submission.');
          t.deliveredAt = now; t.submittedBy = u.id;
          if(t.approval){ t.status = 'review'; }
          else { t.status = 'done'; t.doneAt = now; t.doneBy = u.id; }
          add = msg_(u, 'submit', text, imgs, t.status); break;
        case 'approve':
          if(!owner) fail('Only whoever gave the task or the Director can approve.');
          if(closed) fail('This task is already closed.');
          if(!t.deliveredAt) t.deliveredAt = now;
          t.status = 'done'; t.doneAt = now; t.doneBy = t.submittedBy || (t.assignees || [])[0] || u.id;
          add = msg_(u, 'approve', text, imgs, 'done'); break;
        case 'rework':
          if(!owner) fail('Only whoever gave the task or the Director can ask for rework.');
          if(!text) fail('Write what needs to change.');
          t.status = 'rework'; t.deliveredAt = null; t.doneAt = null; setDue();
          add = msg_(u, 'rework', text, imgs, 'rework'); break;
        case 'decline':
          if(!owner) fail('Only whoever gave the task or the Director can decline.');
          if(!text) fail('Write the reason.');
          t.status = 'declined'; t.doneAt = null; add = msg_(u, 'decline', text, imgs, 'declined'); break;
        case 'demand':
          if(!owner) fail('Only whoever gave the task or the Director can add a demand.');
          if(!text) fail('Write the new demand.');
          if(!open){ t.status = 'rework'; t.deliveredAt = null; t.doneAt = null; }
          setDue(); add = msg_(u, 'demand', text, imgs, t.status); break;
        case 'reopen':
          if(!owner) fail('Only whoever gave the task or the Director can reopen.');
          t.status = 'working'; t.deliveredAt = null; t.doneAt = null; add = msg_(u, 'reopen', text, [], 'working'); break;
        case 'say':
          if(!text && !imgs.length) fail('Write a message or add a photo.');
          add = msg_(u, 'say', text, imgs, t.status, d.problem); break;
        case 'edit': {
          if(!owner) fail('Only whoever gave the task or the Director can edit it.');
          const fl = d.fields || {}, was = d.was || {}, clash = [];
          Object.keys(fl).forEach(k => { if(k in was){ const cur = JSON.stringify(t[k] === undefined ? '' : t[k]), w = JSON.stringify(was[k] === undefined ? '' : was[k]), nw = JSON.stringify(fl[k]); if(cur !== w && cur !== nw) clash.push(k); } });
          if(clash.length && !d.force) fail('CONFLICT|' + (t.updBy || 'Someone') + '|' + clash.join(','));
          const before = {}; Object.keys(fl).forEach(k => { before[k] = t[k]; });
          const c = cleanTask_(Object.assign({}, t, fl), u, t);       // only the fields that were sent change; the rest keep the other person's edits
          if(!c.title || !c.date || !c.assignees.length) fail('Task, deadline and at least one person are needed.');
          Object.assign(t, c);
          try{ logWhat = 'edit ' + JSON.stringify(Object.keys(fl).reduce((o, k) => { if(JSON.stringify(before[k]) !== JSON.stringify(t[k])) o[k] = [before[k], t[k]]; return o; }, {})).slice(0, 380); }catch(x){}
          break; }
        default: fail('Unknown action.');
      }
      if(add){ strip_(add); t.msgs = (t.msgs || []).concat([add]).slice(-100); }
      put_(key, t, u.name); log_(u.name, key, logWhat); t.id = id; return t;
    });
  },
  ev_del(u, key){       // soft delete: the row stays in the sheet marked deleted, so nothing is ever truly lost
    key = String(key||''); if(!KEY_.test(key)) fail('Bad key.');
    return inLock_(() => {
      const old = get_(key); if(!old || old.del) return {ok: 1};
      if(key.indexOf('notes/') === 0){ if(old.owner !== u.id) fail('This is a private note.'); }
      else if(!(u.admin || old.createdBy === u.id)) fail('Only the creator or the Director can delete this.');
      const tomb = o => { o.del = 1; o.delAt = Date.now(); o.delBy = u.name; };
      if(key.indexOf('projects/') === 0){
        const pid = key.split('/')[1];
        rows_().forEach(r => { if(String(r[0]).indexOf('tasks/') === 0){ try{ const o = JSON.parse(r[1]); if(o.project === pid && !o.del){ tomb(o); put_(r[0], o, u.name); } }catch(e){} } });
      }
      tomb(old); put_(key, old, u.name); log_(u.name, key, 'deleted (kept in sheet): ' + String(old.title || '').slice(0, 80)); return {ok: 1};
    });
  },
  ev_img(u, id, thumb, full){
    id = String(id||''); if(!IMGID_.test(id)) fail('Bad picture.');
    thumb = String(thumb||''); full = String(full||'');
    if(thumb.indexOf('data:image/') !== 0 || full.indexOf('data:image/') !== 0) fail('Bad picture.');
    if(thumb.length > CH_ || full.length > 600000) fail('Picture too large.');
    return inLock_(() => { writeImg_(id, thumb, full); return {ok: 1}; });
  },
  ev_imgs(u, ids, which){ return readImgs_(Array.isArray(ids) ? ids.map(String) : [], which === 'f' ? 'f' : 't'); },
  ev_members(u, list){
    if(!u.admin) fail('Only the Director can change the access list.');
    if(!Array.isArray(list)) fail('Bad list.');
    const seen = {}, out = [];
    list.forEach(m => {
      const name = String(m.name||'').trim().replace(/\s+/g,' ').slice(0,40); if(name.length < 2) return;
      let id = String(m.id||'').replace(/[^a-z0-9-]/g,'') || slug_(name); while(seen[id]) id += 'x';
      seen[id] = 1; out.push(strip_({id: id, name: name, admin: !!m.admin, sample: m.sample ? true : undefined}));
    });
    if(!out.some(m => m.admin)) fail('Keep at least one admin.');
    if(!out.some(m => m.id === u.id && m.admin)) fail('You cannot remove your own admin access.');
    return inLock_(() => { put_('config/members', {list: out}, u.name); log_(u.name, 'config/members', 'saved ' + out.length); return out; });
  },
  ev_sample(u, on){
    if(!u.admin) fail('Only the Director can do this.');
    return inLock_(() => {
      rows_().forEach(r => { try{ if(JSON.parse(r[1]).sample) del_(r[0]); }catch(e){} });
      Object.keys(SAMPLE_IMGS).forEach(rmImg_);
      if(!on) return {ok: 1};
      const dir = (members_().filter(m => m.admin)[0] || {id: 'rahul'}).id, now = Date.now();
      const t0 = new Date(Utilities.formatDate(new Date(), TZ, 'yyyy/MM/dd') + ' 00:00:00');
      const D = n => Utilities.formatDate(new Date(t0.getTime() + n*864e5 + 12*3600e3), TZ, 'yyyy-MM-dd');
      Object.keys(SAMPLE_IMGS).forEach(k => writeImg_(k, SAMPLE_IMGS[k].t, SAMPLE_IMGS[k].f));
      put_('projects/sp-pj1', {title: 'Annual Day Celebration', date: D(14), note: 'Main stage · parents invited · 3 pm start', createdAt: 1, createdBy: dir, sample: true}, 'sample');
      put_('projects/sp-pj2', {title: 'Parents Open House', date: D(6), note: 'Class-wise meetings with display boards', createdAt: 2, createdBy: dir, sample: true}, 'sample');
      put_('projects/sp-pj3', {title: "Children's Day", date: D(-8), note: 'Completed · wrap-up photos shared', createdAt: 3, createdBy: dir, sample: true}, 'sample');
      let n = 0;
      const H = h => now - h*3600e3;
      const M = (by, h, kind, text, imgs, st, prob) => strip_({by: by, at: H(h), kind: kind, text: text, imgs: imgs || [], st: st, problem: prob ? true : undefined});
      const T = (pj, title, off, time, ass, by, st, pri, appr, msgs, note) => {
        n++; const o = {title: title, note: note || '', project: pj ? 'sp-' + pj : '', date: D(off), time: time, assignees: ass, by: by, priority: pri || 'normal', approval: !!appr,
          status: st, msgs: msgs || [], createdAt: now - (60 - n)*3600e3, createdBy: by, sample: true};
        if(st === 'done'){ o.doneAt = H(5); o.doneBy = ass[0]; o.deliveredAt = H(6); o.submittedBy = ass[0]; }
        if(st === 'review'){ o.deliveredAt = H(3); o.submittedBy = ass[0]; }
        put_('tasks/sp-t' + ('0' + n).slice(-2), o, 'sample');
      };
      const hd = dir;
      T('pj1','Book tent and sound system',-2,'17:00',['saurabh'],hd,'done','high',1,[M(hd,40,'brief','Please book the tent and sound for 5 Dec, get a written quote first.'),M('saurabh',6,'submit','Booked with Sharma Tent House. Advance paid, receipt attached.',['sp-img2'],'review'),M(hd,5,'approve','Good. Share the final bill after the event.',[],'done')]);
      T('pj1','Stage decor and backdrop design',9,'10:00',['asha','sanjana'],hd,'review','high',1,[M(hd,30,'brief','Gold and navy theme, keep school logo on the left.'),M('asha',3,'submit','Backdrop design ready for approval. Sanjana is checking the print size.',['sp-img1'],'review')]);
      T('pj1','Flowers and garlands',12,'09:00',['vishali'],hd,'todo','normal',1,[],'Marigold garlands for the entrance and stage');
      T('pj1','Print invitation cards',3,'12:00',['jay'],'anup','working','normal',0,[M('anup',20,'brief','Final text is in the shared doc. 300 copies.'),M('jay',4,'say','Printer needs the final text. Sending the draft today.')]);
      T('pj1','Certificates and mementos',8,'15:00',['shubhangi'],hd,'rework','normal',1,[M('shubhangi',26,'submit','First draft of the certificate attached.',['sp-img1'],'review'),M(hd,2,'rework','Use the new school logo and keep one font only. Redo and send again by tomorrow.',[],'rework')]);
      T('pj1','Rehearsal schedule for all classes',5,'14:00',['jay','sanjana'],hd,'working','normal',0,[M('jay',8,'say','Classes 1-5 slots done. Waiting for hall availability for Class 6-11.')]);
      T('pj1','Refreshments order',13,'11:00',['chandan'],hd,'todo','normal',0,[]);
      T('pj1','Guest seating plan',10,'12:00',['anup'],hd,'todo','normal',0,[]);
      T('pj1','Sound check with the DJ',-1,'16:00',['saurabh'],hd,'working','high',0,[M('saurabh',30,'say','DJ confirmed for Thursday. Waiting for the equipment list.',[],'working',true)]);
      T('pj2','Classroom display boards',4,'16:00',['asha'],'jay','working','normal',1,[M('jay',22,'brief','One board per class, student work only.')]);
      T('pj2','Parent entry and parking arrangement',5,'12:00',['chandan','saurabh'],hd,'todo','normal',0,[]);
      T('pj2','Print feedback forms',3,'11:00',['jay'],hd,'todo','normal',0,[]);
      T('pj2','Welcome desk roster',5,'09:00',['vishali'],'sanjana','todo','normal',0,[]);
      T('pj2','Refreshment for guests',5,'10:00',['shubhangi'],'anup','declined','normal',0,[M('anup',12,'decline','Canteen vendor will handle this. No longer needed, thank you.')]);
      T('pj3','Decor and balloons',-9,'10:00',['asha','vishali'],hd,'done','normal',1,[M('asha',200,'submit','Done. Photos attached.',['sp-img1'],'review'),M(hd,198,'approve','Lovely work.',[],'done')]);
      T('pj3','Games and stalls',-9,'11:00',['saurabh','chandan'],hd,'done','normal',0,[]);
      T('pj3','Gift distribution',-8,'13:00',['sanjana','shubhangi'],hd,'done','normal',0,[]);
      T('','Morning gate and arrival check',0,'07:30',['jay'],hd,'done','normal',0,[]);
      T('','Verify staff attendance',0,'09:30',['anup'],hd,'done','normal',0,[]);
      T('','Floor round and cleanliness check',0,'10:30',['asha'],hd,'working','normal',0,[]);
      T('','Washroom and drinking water check',0,'11:30',['vishali'],hd,'todo','normal',0,[M('vishali',3,'say','Water cooler on the 2nd floor is not working. Maintenance informed.',[],'todo',true)]);
      T('','Fee defaulter follow-up calls',0,'12:00',['anup'],hd,'working','high',0,[]);
      T('','Daily class plan acknowledgement',0,'13:00',['sanjana','shubhangi','asha'],'anup','todo','normal',0,[]);
      T('','Update stock register',0,'14:00',['chandan'],hd,'todo','normal',0,[]);
      T('','Lab and equipment check',0,'15:00',['sanjana'],'jay','todo','normal',0,[]);
      T('','Bus departure supervision',0,'15:30',['saurabh','jay'],hd,'todo','normal',0,[]);
      T('','End-of-day report to Director',0,'16:30',['jay'],hd,'todo','normal',0,[]);
      T('','Washroom and drinking water check',-1,'11:30',['vishali'],hd,'todo','normal',0,[M('vishali',27,'say','Soap refill pending, store has no stock.',[],'todo',true)]);
      T('','Floor round and cleanliness check',-1,'10:30',['asha'],hd,'done','normal',0,[]);
      T('','Update stock register',-1,'14:00',['chandan'],hd,'done','normal',0,[]);
      T('','Notice board update',1,'09:00',['shubhangi'],'sanjana','todo','normal',0,[]);
      T('','Morning gate and arrival check',1,'07:30',['jay'],hd,'todo','normal',0,[]);
      put_('notes/sp-n1', {title: 'Points for the staff meeting', note: 'Annual Day budget, Open House roster, transport complaints', date: D(1), time: '15:00', owner: dir, createdAt: now, sample: true}, 'sample');
      put_('notes/sp-n2', {title: 'Call the printer about invitation cards', date: D(0), time: '11:00', owner: dir, createdAt: now - 1, sample: true}, 'sample');
      put_('notes/sp-n3', {title: 'Review the half-yearly timetable', note: 'Check the clash between Class 9 and Class 10 papers', date: D(4), owner: dir, createdAt: now - 2, sample: true}, 'sample');
      put_('notes/sp-n4', {title: 'Order new visitor passes', date: D(-1), owner: dir, done: true, doneAt: now - 3600e3, createdAt: now - 3, sample: true}, 'sample');
      return {ok: 1};
    });
  }
};
const WRITES_ = {ev_set: 1, ev_act: 1, ev_note: 1, ev_del: 1, ev_img: 1, ev_members: 1};
function doPost(e){
  let req = {}; try{ req = JSON.parse(e.postData.contents); }catch(x){}
  const out = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  if(req.fn === 'log_err'){        // the app reports its own crashes here (no sign-in needed, limited per hour)
    try{ const c = CacheService.getScriptCache(), n = Number(c.get('ERRN') || 0); if(n < 60){ c.put('ERRN', String(n + 1), 3600); const a = req.args || [];
      log_('app-error', String(a[1] || '').slice(0,80), String(a[0] || '').slice(0,300) + ' | ' + String(a[2] || '').slice(0,120)); } }catch(x){}
    return out({ok: true, v: 1});
  }
  const fn = API[req.fn]; if(!fn || req.fn === 'constructor') return out({ok: false, err: 'Unknown request.'});
  try{
    const args = req.args || [];
    const rid = WRITES_[req.fn] && /^[a-z0-9]{6,40}$/.test(String(req.rid || '')) ? 'R_' + req.rid : '';
    if(rid){ try{ const hit = CacheService.getScriptCache().get(rid); if(hit) return out(JSON.parse(hit)); }catch(x){} }   // the same save sent twice is applied once
    const v = (req.fn === 'login' || req.fn === 'login_info') ? fn.apply(null, args) : fn.apply(null, [user_(req.token)].concat(args));
    const res = {ok: true, v: v};
    if(rid){ try{ const j = JSON.stringify(res); CacheService.getScriptCache().put(rid, j.length < 90000 ? j : JSON.stringify({ok: true, v: {dup: 1}}), 21600); }catch(x){} }
    return out(res);
  }catch(x){ const m = String(x && x.message || x); return out({ok: false, err: m, login: m === 'LOGIN' ? 1 : 0}); }
}
function doGet(){ return ContentService.createTextOutput('FIS Tasks & Projects API is running.'); }
/* Run once after pasting: creates the data sheet and puts the team on the access list (Rahul Yadav = Director/admin). */
function setup(){
  secret_(); DOCS(); IMGS(); LOG();
  if(!get_('config/members')) put_('config/members', {list: TEAM.map(t => ({id: t[0], name: t[1], admin: !!t[2]}))}, 'setup');
  Logger.log('Ready. Data sheet: ' + own_().getUrl() + ' · STAFF_SUFFIX is ' + (props_().getProperty('STAFF_SUFFIX') ? 'set' : 'NOT set (add it under Project Settings > Script properties)'));
}
function signOutEveryone(){ const p = props_(); p.setProperty('TOKEN_VER', String(Number(p.getProperty('TOKEN_VER') || '1') + 1)); }
/* Tiny sample photos used only by "Load sample data". */
const SAMPLE_IMGS = {"sp-img1":{"t":"data:image/jpeg;base64,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","f":"data:image/jpeg;base64,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"},"sp-img2":{"t":"data:image/jpeg;base64,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","f":"data:image/jpeg;base64,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"}};
