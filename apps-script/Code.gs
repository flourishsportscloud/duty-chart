/**
 * FIS Duty Chart – web app (full version: duty chart, date-wise leave notice,
 * check-in, class / activity adjustments, duty covers, WhatsApp note reader).
 *
 * Tabs in this Google Sheet:
 *   Duty Chart   – one row per staff entry (edit duties here)
 *   Shifts       – tab order and the time shown on each tab
 *   Daily Log    – one row per date, saved by the app (do not edit by hand)
 *   Roster       – check-in name lists edited in the app (do not edit by hand)
 *   Leave Log, Adjustments, Check-in Log – readable copies, rebuilt on every save
 *   Settings     – title, month, edit PIN, data version
 */

const T_CHART = 'Duty Chart', T_SHIFTS = 'Shifts', T_DAILY = 'Daily Log', T_ROSTER = 'Roster',
      T_LEAVE = 'Leave Log', T_ADJ = 'Adjustments', T_ATT = 'Check-in Log', T_SET = 'Settings';

const COLOUR_KEYS = {
  'gate & entry': 'gate', 'transport': 'transport', 'discipline & rooms': 'disc',
  'corridors': 'floor', 'late comers & free staff': 'time', 'stayback': 'stay', 'sports': 'sports'
};

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function clean_(v) { return String(v == null ? '' : v).trim(); }
function safe_(o) { return JSON.stringify(o).replace(/</g, '\\u003c'); }

function doGet(e) {
  if (e && e.parameter && e.parameter.api) return api_({ fn: e.parameter.api, args: [] });
  ensure_();
  const s = settings_();
  const t = HtmlService.createTemplateFromFile('Index');
  const all = getAll();
  t.TABS_JSON = safe_(getChart().tabs);
  t.DAILY_JSON = safe_(all.daily);
  t.ROSTER_JSON = safe_(all.roster);
  t.VER_JSON = safe_(all.ver);
  t.SETTINGS_JSON = safe_({ Title: s['Title'] || '', Month: s['Month'] || '' });
  return t.evaluate()
    .setTitle((s['Title'] || 'Duty Chart') + (s['Month'] ? ' – ' + s['Month'] : ''))
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ---------- JSON API for the standalone page (works with no Google login) ---------- */
function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (x) { return json_({ ok: false, err: 'bad request' }); }
  return api_(req);
}
function boot() {
  const all = getAll(), s = settings_();
  return { tabs: getChart().tabs, daily: all.daily, roster: all.roster, ver: all.ver,
           settings: { Title: s['Title'] || '', Month: s['Month'] || '' } };
}
function api_(req) {
  const fns = { boot: boot, getAll: getAll, getVer: getVer, checkPin: checkPin, saveAll: saveAll, savePatch: savePatch };
  try {
    ensure_();
    const f = fns[req && req.fn];
    if (!f) throw new Error('unknown call');
    return json_({ ok: true, v: f.apply(null, (req.args || []).slice(0, 4)) });
  } catch (err) {
    return json_({ ok: false, err: String(err && err.message || err) });
  }
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ---------- settings ---------- */
function settings_() {
  const sh = ss_().getSheetByName(T_SET); const out = {};
  if (!sh) return out;
  sh.getDataRange().getDisplayValues().forEach(r => { if (r[0]) out[clean_(r[0])] = clean_(r[1]); });
  return out;
}
function setSetting_(name, value) {
  const sh = ss_().getSheetByName(T_SET);
  const vals = sh.getDataRange().getDisplayValues();
  const i = vals.findIndex(r => clean_(r[0]) === name);
  if (i >= 0) sh.getRange(i + 1, 2).setNumberFormat('@').setValue(String(value));
  else sh.appendRow([name, String(value)]);
}
function checkPin(pin) { const want = settings_()['Edit PIN']; return !!want && clean_(pin) === want; }
function getVer() { return Number(settings_()['Data version'] || 0); }

/* ---------- duty chart ---------- */
function getChart() {
  const ss = ss_();
  const shifts = ss.getSheetByName(T_SHIFTS).getDataRange().getDisplayValues().slice(1).filter(r => clean_(r[0]) && clean_(r[1]));
  const rows = ss.getSheetByName(T_CHART).getDataRange().getDisplayValues().slice(1).filter(r => clean_(r[0]) && clean_(r[1]));
  const tabs = shifts.map(r => {
    const id = clean_(r[0]), label = clean_(r[1]), when = clean_(r[2]);
    if (id === 'checkin') return { id, label, when, checkin: true, cards: [] };
    if (id === 'extra' || /extra/i.test(label)) return { id, label, when, extra: true, cols: [] };
    return { id, label, when, cards: [] };
  });
  const byLabel = {}; tabs.forEach(t => byLabel[t.label.toLowerCase()] = t);
  rows.forEach(r => {
    const [shift, duty, time, colour, group, bus, staff, note] = r.map(clean_);
    const tab = byLabel[shift.toLowerCase()];
    if (!tab || tab.checkin) return;
    const c = COLOUR_KEYS[colour.toLowerCase()] || 'time';
    if (tab.extra) {
      const colName = group || 'Staff';
      let col = tab.cols.find(x => x.h === colName); if (!col) { col = { h: colName, groups: [] }; tab.cols.push(col); }
      let g = col.groups.find(x => x.t === duty); if (!g) { g = { t: duty, c: c, p: [] }; col.groups.push(g); }
      if (staff) g.p.push(staff + (note ? '|' + note : ''));
      return;
    }
    let card = tab.cards.find(x => x.t === duty && (x.w || '') === time);
    if (!card) { card = { t: duty, c: c, p: [], _g: '' }; if (time) card.w = time; tab.cards.push(card); }
    if (group && group !== card._g) { card.p.push({ s: group }); card._g = group; }
    if (!staff) return;
    if (bus) { card.bus = true; card.p.push(bus + '|' + staff + (note ? '|' + note : '')); }
    else card.p.push(staff + (note ? '|' + note : ''));
  });
  tabs.forEach(t => (t.cards || []).forEach(c => delete c._g));
  return { tabs: tabs };
}

/* ---------- daily data ---------- */
function dateKey_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  return clean_(v);
}
function getAll() {
  const ss = ss_(); const daily = {}, roster = {};
  ss.getSheetByName(T_DAILY).getDataRange().getValues().slice(1).forEach(r => {
    const d = dateKey_(r[0]); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    try { daily[d] = JSON.parse(r[1]); } catch (e) {}
  });
  ss.getSheetByName(T_ROSTER).getDataRange().getValues().slice(1).forEach(r => {
    const id = clean_(r[0]); if (!id) return;
    try { roster[id] = JSON.parse(r[1]); } catch (e) {}
  });
  return { daily: daily, roster: roster, ver: getVer() };
}

/** Saves the whole daily log + rosters. Rejects if someone else saved since the page loaded. */
function saveAll(daily, roster, baseVer, pin) {
  if (!checkPin(pin)) throw new Error('Wrong PIN');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const ver = getVer();
    if (Number(baseVer) !== ver) throw new Error('conflict');
    const ss = ss_(), stamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');
    const days = Object.keys(daily || {}).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
    writeRows_(ss.getSheetByName(T_DAILY), days.map(d => [d, JSON.stringify(daily[d]), stamp]), 3);
    writeRows_(ss.getSheetByName(T_ROSTER), Object.keys(roster || {}).map(id => [id, JSON.stringify(roster[id])]), 2);
    readable_(daily, days);
    setSetting_('Data version', ver + 1);
    return { ver: ver + 1 };
  } finally { lock.releaseLock(); }
}

/** Many people at once: applies small changes (one day / one check-in area) on top of what is
    saved now, so nobody's check-in or leave entry is lost. Returns the merged data. */
function savePatch(ops, pin) {
  if (!checkPin(pin)) throw new Error('Wrong PIN');
  const lock = LockService.getScriptLock(); lock.waitLock(28000);
  try {
    const all = getAll(); const daily = all.daily, roster = all.roster;
    (ops || []).forEach(function (o) {
      if (o && o.t === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(o.day)) {
        const m = mergeDay_(o.base, o.val, daily[o.day]);
        if (!o.val && emptyDay_(m)) delete daily[o.day]; else daily[o.day] = m;
      } else if (o && o.t === 'roster' && o.id) {
        if (o.val) roster[o.id] = o.val; else delete roster[o.id];
      }
    });
    const ss = ss_(), tz = ss.getSpreadsheetTimeZone(), stamp = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
    const cut = Utilities.formatDate(new Date(Date.now() - 60 * 864e5), tz, 'yyyy-MM-dd');
    Object.keys(daily).forEach(function (d) { if (d < cut) delete daily[d]; });
    const days = Object.keys(daily).sort().reverse();
    writeRows_(ss.getSheetByName(T_DAILY), days.map(function (d) { return [d, JSON.stringify(daily[d]), stamp]; }), 3);
    writeRows_(ss.getSheetByName(T_ROSTER), Object.keys(roster).map(function (id) { return [id, JSON.stringify(roster[id])]; }), 2);
    readable_(daily, days);
    const ver = all.ver + 1; setSetting_('Data version', ver);
    return { ver: ver, daily: daily, roster: roster };
  } finally { lock.releaseLock(); }
}
function jk_(x) { return JSON.stringify(x === undefined ? null : x); }
function emptyDay_(m) { return !(m.leave || []).length && !(m.cover || []).length && !(m.adj || []).length && !Object.keys(m.att || {}).length; }
function mergeDay_(base, val, cur) {
  base = base || {}; val = val || {}; const out = cur ? JSON.parse(JSON.stringify(cur)) : {};
  const keys = {}; Object.keys(base).concat(Object.keys(val)).forEach(function (k) { keys[k] = 1; });
  Object.keys(keys).forEach(function (k) {
    const b = base[k], v = val[k]; if (jk_(b) === jk_(v)) return;
    if (k === 'att') {
      const o = out.att = out.att || {}; const ids = {};
      Object.keys(b || {}).concat(Object.keys(v || {})).forEach(function (id) { ids[id] = 1; });
      Object.keys(ids).forEach(function (id) {
        const ba = (b || {})[id] || {}, va = (v || {})[id];
        if (jk_((b || {})[id]) === jk_(va)) return;
        if (!va) { delete o[id]; return; }
        const ca = o[id] = o[id] ? JSON.parse(JSON.stringify(o[id])) : { s: {} }; ca.s = ca.s || {};
        const bs = ba.s || {}, vs = va.s || {}, ns = {};
        Object.keys(bs).concat(Object.keys(vs)).forEach(function (n) { ns[n] = 1; });
        Object.keys(ns).forEach(function (n) { if (jk_(bs[n]) === jk_(vs[n])) return; if (vs[n]) ca.s[n] = vs[n]; else delete ca.s[n]; });
        if (va.at) ca.at = va.at;
      });
      return;
    }
    if (Array.isArray(b) || Array.isArray(v)) {
      const B = {}, V = {}; (b || []).forEach(function (x) { B[jk_(x)] = 1; }); (v || []).forEach(function (x) { V[jk_(x)] = 1; });
      const c = (out[k] || []).filter(function (x) { return !(B[jk_(x)] && !V[jk_(x)]); }); const C = {};
      c.forEach(function (x) { C[jk_(x)] = 1; });
      (v || []).forEach(function (x) { if (!B[jk_(x)] && !C[jk_(x)]) { c.push(x); C[jk_(x)] = 1; } });
      out[k] = c; return;
    }
    if (v === undefined) delete out[k]; else out[k] = v;
  });
  return out;
}

function writeRows_(sh, rows, width) {
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, Math.max(width, sh.getLastColumn())).clearContent();
  if (rows.length) { sh.getRange(2, 1, rows.length, width).setNumberFormat('@').setValues(rows); }
}

/* readable copies for people who open the Sheet */
function readable_(daily, days) {
  const ss = ss_(), lv = [], adj = [], att = [];
  days.forEach(d => {
    const x = daily[d] || {};
    (x.leave || []).forEach(l => lv.push([d, l.n || '', l.k || '', l.half ? 'Half day' : '', l.late === true ? 'Late' : (l.late ? 'Late till ' + l.late : '')]));
    (x.adj || []).forEach(a => adj.push([d, a.a ? 'Activity adjustment' : 'Class adjustment', a.a || a.c || '', a.f || '', a.b || '', a.t || '']));
    (x.cover || []).forEach(c => adj.push([d, 'Duty cover', c.d || '', c.f || '', c.n || '', '']));
    Object.keys(x.att || {}).forEach(area => {
      const rec = x.att[area] || {}; const s = rec.s || {};
      Object.keys(s).forEach(n => att.push([d, area, n, ({ r: 'Reached', l: 'Late', a: 'Absent' })[s[n].st] || s[n].st || '', s[n].t || '']));
    });
  });
  writeRows_(ss.getSheetByName(T_LEAVE), lv, 5);
  writeRows_(ss.getSheetByName(T_ADJ), adj, 6);
  writeRows_(ss.getSheetByName(T_ATT), att, 5);
}

/* ---------- setup & upgrade ---------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Duty Chart')
    .addItem('Set up / upgrade sheet', 'setup')
    .addItem('Rebuild Duty Chart tab from app (keeps a backup)', 'rebuildChart')
    .addItem('Fresh start from today (archives older days)', 'freshStart')
    .addItem('Load corrected duty chart (22 Oct)', 'updateDutyChart22Oct')
    .addToUi();
}

function ensure_() {
  const ss = ss_();
  if (![T_CHART, T_SHIFTS, T_DAILY, T_ROSTER, T_LEAVE, T_ADJ, T_ATT, T_SET].every(n => ss.getSheetByName(n))) setup();
  if (settings_()['Fresh start'] !== START_DATE) freshStart();
}

const SEED_ROWS = [["Morning", "Outer Area", "", "Gate & entry", "", "", "Guards", "1-4"], ["Morning", "Outer Area", "", "Gate & entry", "", "", "Vishwabandhu", ""], ["Morning", "Outer Area", "", "Gate & entry", "", "", "Kamal", ""], ["Morning", "Outer Area", "", "Gate & entry", "", "", "Saurabh / Anoop", "Auto"], ["Morning", "Outer Area", "", "Gate & entry", "", "", "Jay", ""], ["Morning", "Main Door", "", "Gate & entry", "", "", "Harshvardhan", ""], ["Morning", "Main Door", "", "Gate & entry", "", "", "Shivika", ""], ["Morning", "Entry Door 2-3", "", "Gate & entry", "", "", "Poonam Rathore", ""], ["Morning", "Entry Door 2-3", "", "Gate & entry", "", "", "Madhu", ""], ["Morning", "Defaulter Room – Nur B", "", "Discipline & rooms", "", "", "Sanjana", ""], ["Morning", "Defaulter Room – Nur B", "", "Discipline & rooms", "", "", "Poojal", ""], ["Morning", "Bus Coordinator", "", "Transport", "", "", "Harsh", ""], ["Morning", "Bus Coordinator", "", "Transport", "", "", "Amit", ""], ["Morning", "Bus Coordinator", "", "Transport", "", "", "Anita", ""], ["Morning", "Bus Duty", "", "Transport", "", "1-3", "Juhi", ""], ["Morning", "Bus Duty", "", "Transport", "", "4-6", "Priyanka S.", ""], ["Morning", "Bus Duty", "", "Transport", "", "7-9", "Mansi", ""], ["Morning", "Bus Duty", "", "Transport", "", "10-12", "Komal", ""], ["Morning", "Bus Duty", "", "Transport", "", "13-15", "Bhagyashree", ""], ["Morning", "Bus Duty", "", "Transport", "", "16-18", "Ram", ""], ["Morning", "Bus Duty", "", "Transport", "", "19-22", "Chandan", ""], ["Morning", "Bus Duty", "", "Transport", "", "23-26", "Rashmi", "CM"], ["Morning", "Bus Duty", "", "Transport", "", "27-30", "Renuka", ""], ["Morning", "Bus Duty", "", "Transport", "", "31-34", "Vijay", ""], ["Morning", "Bus Duty", "", "Transport", "", "35-38", "Yashika", ""], ["Morning", "Bus Duty", "", "Transport", "", "—", "Pooja", ""], ["Morning", "Pvt Van Area", "", "Transport", "", "", "Vipul", ""], ["Morning", "Pvt Van Area", "", "Transport", "", "", "Himanshu", ""], ["Morning", "Late Comer", "7:30 – 7:45", "Late comers & free staff", "", "", "Nahida", ""], ["Morning", "Late Comer", "7:30 – 7:45", "Late comers & free staff", "", "", "Harsh", ""], ["Morning", "Late Comer", "7:30 – 7:45", "Late comers & free staff", "", "", "Saurabh", ""], ["Morning", "Late Comer", "7:30 – 7:45", "Late comers & free staff", "", "", "Himanshu / Anita", ""], ["Morning", "GF Corridor", "", "Corridors", "", "", "Nahida", ""], ["Morning", "GF Corridor", "", "Corridors", "", "", "Chandani", ""], ["Morning", "GF Corridor", "", "Corridors", "", "", "Suman / Priyanka", "MR"], ["Morning", "First Floor Corridor", "", "Corridors", "", "", "Himanshi", "Stairs"], ["Morning", "First Floor Corridor", "", "Corridors", "", "", "Karishma", "Stairs"], ["Morning", "First Floor Corridor", "", "Corridors", "", "", "Richa", ""], ["Morning", "First Floor Corridor", "", "Corridors", "", "", "Shally – Divyanshi", ""], ["Morning", "First Floor Corridor", "", "Corridors", "", "", "Diksha – Neetu", ""], ["Morning", "Second Floor Corridor", "", "Corridors", "", "", "Ajita", "Stairs"], ["Morning", "Second Floor Corridor", "", "Corridors", "", "", "Tanushree", "Stairs"], ["Morning", "Second Floor Corridor", "", "Corridors", "", "", "Tripti – Bharti", ""], ["Morning", "Second Floor Corridor", "", "Corridors", "", "", "Asha – Saba", ""], ["Morning", "Second Floor Corridor", "", "Corridors", "", "", "Sarita – Garima – Poonam – Renu Harsh", ""], ["Morning", "Third Floor Corridor", "", "Corridors", "", "", "Shobha", ""], ["Morning", "Third Floor Corridor", "", "Corridors", "", "", "Upinder", ""], ["Morning", "Third Floor Corridor", "", "Corridors", "", "", "Jatin", ""], ["Morning", "Free Staff", "7:30", "Late comers & free staff", "", "", "Neha / Rashmi", ""], ["Morning", "Free Staff", "7:30", "Late comers & free staff", "", "", "Pre Staff", ""], ["Morning", "Free Staff", "7:30", "Late comers & free staff", "", "", "Karishma – Richa", ""], ["Morning", "Free Staff", "7:30", "Late comers & free staff", "", "", "Geeta – Preeti", ""], ["Morning", "Free Staff", "7:30", "Late comers & free staff", "", "", "Tripti – Bharti – Poonam", ""], ["Departure", "Outer Area", "", "Gate & entry", "", "", "Guards", "3"], ["Departure", "Outer Area", "", "Gate & entry", "", "", "Kamal", ""], ["Departure", "Outer Area", "", "Gate & entry", "", "", "Vishwabandhu", ""], ["Departure", "Outer Area", "", "Gate & entry", "", "", "Anoop", ""], ["Departure", "Main Door – Bywalk", "", "Gate & entry", "", "", "Shally", ""], ["Departure", "Main Door – Bywalk", "", "Gate & entry", "", "", "Sunita", ""], ["Departure", "Main Door – Bywalk", "", "Gate & entry", "", "", "Deepmala", ""], ["Departure", "Main Door – Bywalk", "", "Gate & entry", "", "", "Saroj, Tina", ""], ["Departure", "Main Door – Bywalk", "", "Gate & entry", "", "", "Priyanshi", ""], ["Departure", "Main Door – Bywalk", "", "Gate & entry", "", "", "Chhavi", ""], ["Departure", "Main Door – Bywalk", "", "Gate & entry", "", "", "Priya, Pooja", ""], ["Departure", "Main Door – Bywalk", "", "Gate & entry", "", "", "Anuradha, Reema", ""], ["Departure", "On Floor – Discipline / SB Movement", "", "Discipline & rooms", "", "", "Sanjana – Diksha – Neetu", ""], ["Departure", "On Floor – Discipline / SB Movement", "", "Discipline & rooms", "", "", "Kanika", ""], ["Departure", "On Floor – Discipline / SB Movement", "", "Discipline & rooms", "", "", "Deepali", ""], ["Departure", "On Floor – Discipline / SB Movement", "", "Discipline & rooms", "", "", "Gauri, Devanshi, Vahnishwari", ""], ["Departure", "On Floor – Discipline / SB Movement", "", "Discipline & rooms", "", "", "Karishma – Geeta – Divyanshi – Manisha", ""], ["Departure", "On Floor – Discipline / SB Movement", "", "Discipline & rooms", "", "", "Ishita", ""], ["Departure", "On Floor – Discipline / SB Movement", "", "Discipline & rooms", "", "", "Jyotsana", ""], ["Departure", "On Floor – Discipline / SB Movement", "", "Discipline & rooms", "", "", "Pallavi", ""], ["Departure", "On Floor – Discipline / SB Movement", "", "Discipline & rooms", "", "", "Ritika", ""], ["Departure", "Bywalk Area – Archery", "", "Gate & entry", "", "", "Amit", ""], ["Departure", "Bywalk Area – Archery", "", "Gate & entry", "", "", "Shailesh", "6"], ["Departure", "Bywalk Area – Archery", "", "Gate & entry", "", "", "Swati", "7"], ["Departure", "Bywalk Area – Archery", "", "Gate & entry", "", "", "Shreya", "8"], ["Departure", "Bywalk Area – Archery", "", "Gate & entry", "", "", "Nisha", "9"], ["Departure", "Bywalk Area – Archery", "", "Gate & entry", "", "", "Monika", ""], ["Departure", "Bywalk Area – Archery", "", "Gate & entry", "", "", "Yavnika", ""], ["Departure", "Bywalk Area – Archery", "", "Gate & entry", "", "", "Neha", ""], ["Departure", "Bywalk Area – Archery", "", "Gate & entry", "", "", "Shaan", ""], ["Departure", "Bus Coordinator", "", "Transport", "", "", "Harsh", ""], ["Departure", "Bus Coordinator", "", "Transport", "", "", "Jay", ""], ["Departure", "Bus Coordinator", "", "Transport", "", "", "Anita", ""], ["Departure", "Bus Duty", "", "Transport", "", "1-3", "Juhi", ""], ["Departure", "Bus Duty", "", "Transport", "", "4-6", "Priyanka S.", ""], ["Departure", "Bus Duty", "", "Transport", "", "7-9", "Mansi", ""], ["Departure", "Bus Duty", "", "Transport", "", "10-12", "Komal", ""], ["Departure", "Bus Duty", "", "Transport", "", "13-15", "Bhagyashree", ""], ["Departure", "Bus Duty", "", "Transport", "", "16-18", "Ram", ""], ["Departure", "Bus Duty", "", "Transport", "", "19-22", "Chandan", ""], ["Departure", "Bus Duty", "", "Transport", "", "23-26", "Rashmi", "CM"], ["Departure", "Bus Duty", "", "Transport", "", "27-30", "Renuka", ""], ["Departure", "Bus Duty", "", "Transport", "", "31-34", "Vijay", ""], ["Departure", "Bus Duty", "", "Transport", "", "35-38", "Yashika", ""], ["Departure", "Auto Duty", "", "Transport", "", "", "Sourabh & Suman", ""], ["Departure", "Auto Duty", "", "Transport", "", "", "Preeti", "1st F"], ["Departure", "Auto Duty", "", "Transport", "", "", "Vipul", "2nd F"], ["Departure", "Auto Duty", "", "Transport", "", "", "Poonam – Chandani", "GF"], ["Departure", "Auto Duty", "", "Transport", "", "", "Anamika", "GF"], ["Departure", "Pvt Van", "", "Transport", "", "", "Vipul", ""], ["Departure", "GF Corridor", "", "Corridors", "", "", "Jatin", "BW"], ["Departure", "GF Corridor", "", "Corridors", "", "", "Madhu / Priyanka", "MR"], ["Departure", "First Floor Corridor", "", "Corridors", "", "", "Karishma", "Stairs"], ["Departure", "First Floor Corridor", "", "Corridors", "", "", "Himanshi", "Stairs"], ["Departure", "First Floor Corridor", "", "Corridors", "", "", "Sanjana – Diksha – Neetu", ""], ["Departure", "First Floor Corridor", "", "Corridors", "", "", "Geeta", "SB Room"], ["Departure", "First Floor Corridor", "", "Corridors", "", "", "Karishma", ""], ["Departure", "Second Floor Corridor", "", "Corridors", "", "", "Radha", "Bus Line"], ["Departure", "Second Floor Corridor", "", "Corridors", "", "", "Vipul", "Auto Lines"], ["Departure", "Second Floor Corridor", "", "Corridors", "", "", "Sarita – Garima – Poonam – Renu Harsh", ""], ["Departure", "Second Floor Corridor", "", "Corridors", "", "", "Tripti – Asha – Saba", ""], ["Departure", "Second Floor Corridor", "", "Corridors", "", "", "Ajita – Bharti", "Stairs"], ["Departure", "Third Floor Corridor", "", "Corridors", "", "", "Shobha", ""], ["Departure", "Third Floor Corridor", "", "Corridors", "", "", "Poonam Gaur", ""], ["Departure", "Free Staff", "2:30", "Late comers & free staff", "", "", "Pre Teachers + 3", ""], ["Departure", "Free Staff", "2:30", "Late comers & free staff", "", "", "Tripti – Ajita", ""], ["Departure", "Free Staff", "2:30", "Late comers & free staff", "", "", "Renu Harsh", ""], ["Departure", "Free Staff", "2:30", "Late comers & free staff", "", "", "Poonam G.", ""], ["Departure", "Free Staff", "2:30", "Late comers & free staff", "", "", "Mansi – Manisha", ""], ["Stayback & Sports", "Stayback – First Floor", "2:25 pm", "Stayback", "", "", "Sanjana", ""], ["Stayback & Sports", "Stayback – First Floor", "2:25 pm", "Stayback", "", "", "Bhavya / Mansi", "5B"], ["Stayback & Sports", "Stayback – First Floor", "2:25 pm", "Stayback", "", "", "Yogesh", "5C"], ["Stayback & Sports", "Stayback – First Floor", "2:25 pm", "Stayback", "", "", "Geeta", "Help"], ["Stayback & Sports", "Stayback – Second Floor", "2:25 pm", "Stayback", "", "", "Nahida – Asha", ""], ["Stayback & Sports", "Stayback – Second Floor", "2:25 pm", "Stayback", "", "", "Saba", "9A"], ["Stayback & Sports", "Stayback – Second Floor", "2:25 pm", "Stayback", "", "", "Vaibhav", "9B"], ["Stayback & Sports", "Stayback – Second Floor", "2:25 pm", "Stayback", "", "", "Bhuwan", "8C"], ["Stayback & Sports", "Stayback – Second Floor", "2:25 pm", "Stayback", "", "", "Shivika", "9C"], ["Stayback & Sports", "Stayback – Second Floor", "2:25 pm", "Stayback", "", "", "Shakil", "Pottery (Dance)"], ["Stayback & Sports", "Stayback – Second Floor", "2:25 pm", "Stayback", "", "", "Poonam", "Help"], ["Stayback & Sports", "Waiting Kids", "2:40 pm", "Stayback", "", "", "Jatan", "GF"], ["Stayback & Sports", "Stayback Departure", "4:00 pm", "Stayback", "Bywalk", "", "Mansi – Shivika", ""], ["Stayback & Sports", "Stayback Departure", "4:00 pm", "Stayback", "Bywalk", "", "Shakil", ""], ["Stayback & Sports", "Stayback Departure", "4:00 pm", "Stayback", "Bywalk", "", "Yogesh", ""], ["Stayback & Sports", "Stayback Departure", "4:00 pm", "Stayback", "Bywalk", "", "Jay", ""], ["Stayback & Sports", "Stayback Departure", "4:00 pm", "Stayback", "Auto", "", "Bhavya", ""], ["Stayback & Sports", "Stayback Departure", "4:00 pm", "Stayback", "Auto", "", "Vaibhav", ""], ["Stayback & Sports", "Stayback Departure", "4:00 pm", "Stayback", "Auto", "", "Saurabh", ""], ["Stayback & Sports", "Stayback Departure", "4:00 pm", "Stayback", "Sports", "", "Bhuwan", ""], ["Stayback & Sports", "Sports Pickup", "4:45 pm", "Sports", "", "", "Nishant", ""], ["Stayback & Sports", "Sports Departure", "6:15 pm", "Sports", "", "", "Nishant", ""], ["Stayback & Sports", "Sports Departure", "6:15 pm", "Sports", "", "", "Sports Coaches", ""], ["Extra Staff", "Extra", "", "Gate & entry", "Morning", "", "Nandini", ""], ["Extra Staff", "Extra", "", "Gate & entry", "Morning", "", "Rekha", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Morning", "", "Pooja", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Morning", "", "Karishma", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Morning", "", "Saba", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Morning", "", "Chandani", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Morning", "", "Khushi", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Morning", "", "Tanushree", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Morning", "", "Priya Bagri", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Morning", "", "Poonam Gaur", ""], ["Extra Staff", "1st Floor", "", "Corridors", "Morning", "", "Geeta", ""], ["Extra Staff", "1st Floor", "", "Corridors", "Morning", "", "Preeti", ""], ["Extra Staff", "2nd Floor", "", "Corridors", "Morning", "", "Neha", ""], ["Extra Staff", "2nd Floor", "", "Corridors", "Morning", "", "Mansi", ""], ["Extra Staff", "3rd Floor", "", "Corridors", "Morning", "", "Poonam Gaur", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Departure", "", "Pooja", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Departure", "", "Karishma", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Departure", "", "Saba", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Departure", "", "Chandani", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Departure", "", "Khushi", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Departure", "", "Tanushree", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Departure", "", "Manisha", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Departure", "", "Priya Bagri", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Departure", "", "Poonam Gaur", ""], ["Extra Staff", "1st Floor", "", "Corridors", "Departure", "", "Manisha", ""], ["Extra Staff", "1st Floor", "", "Corridors", "Departure", "", "Diksha – Neetu – Karishma", ""], ["Extra Staff", "1st Floor", "", "Corridors", "Departure", "", "Divyanshi", ""], ["Extra Staff", "1st Floor", "", "Corridors", "Departure", "", "Richa", ""], ["Extra Staff", "2nd Floor", "", "Corridors", "Departure", "", "Neha", ""], ["Extra Staff", "2nd Floor", "", "Corridors", "Departure", "", "Mansi", ""], ["Extra Staff", "2nd Floor", "", "Corridors", "Departure", "", "Manisha", ""], ["Extra Staff", "3rd Floor", "", "Corridors", "Departure", "", "", ""]];
const SEED_SHIFTS = [["morning", "Morning", "7:00 am"], ["checkin", "Check-in", "Reached on duty"], ["departure", "Departure", "2:30 pm"], ["stayback", "Stayback & Sports", "2:25 – 6:15 pm"], ["extra", "Extra Staff", "Morning & departure"]];
const SEED_DAILY = {"2026-09-26":{"leave":[{"n":"Swati Sehgal","k":"Teacher"},{"n":"Radha Soni","k":"Teacher"},{"n":"Khushi Bhadani","k":"Teacher","half":true},{"n":"Komal Suthar","k":"CM"},{"n":"Upender Singh Shekhawat","k":"CM"},{"n":"Shikha Sharma","k":"Activity"},{"n":"Kanhaiya Lal Swami","k":"Activity"},{"n":"Prashant Verma","k":"Activity"},{"n":"Monika Rajpurohit","k":"Teacher","late":"7:30"},{"n":"Renu Harsh","k":"Teacher","late":"8"},{"n":"Sanjana Sarswat","k":"Floor Manager","late":true},{"n":"Ajita Upadhyay","k":"Teacher"},{"n":"Megha Shekhawat","k":"Admin & PL"}],"cover":[{"n":"Poonam Gaur","f":"Upender Singh Shekhawat","d":"Third Floor Corridor (Morning)"},{"n":"Pooja","f":"Khushi Bhadani","d":"CM (Extra – Morning)"},{"n":"Rekha","f":"Sanjana Sarswat","d":"Defaulter Room – Nur B (Morning)"},{"n":"Tanushree Purohit","f":"Ajita Upadhyay"}],"adj":[{"c":"7A","b":"Tripti","t":"7:00–7:30 & Lunch"},{"c":"6C","b":"Bharti Ratawa","t":"7:00–7:30","f":"Monika Rajpurohit"},{"c":"10B","b":"Neha","f":"Radha Soni"},{"c":"","a":"Skating","b":"Niviya Singh Bhati","f":"Manmohan Singh"}],"att":{"fo":{"s":{"Vaishali":{"st":"r","t":"7:14"},"Preeti Jain":{"st":"r","t":"7:14"},"Megha":{"st":"r","t":"7:14"},"Narendra":{"st":"r","t":"7:14"},"Harshvardhan":{"st":"r","t":"7:14"}},"at":"7:14"},"out":{"s":{"Anoop":{"st":"r","t":"7:14"},"Sourabh":{"st":"r","t":"7:14"},"Kamal":{"st":"l","t":"7:14"},"Vishwabandhu":{"st":"l","t":"7:15"},"Radheshyam":{"st":"r","t":"7:15"},"Jatan":{"st":"r","t":"7:15"},"Navratan":{"st":"r","t":"7:15"},"Jai":{"st":"r","t":"7:15"}},"at":"7:15"},"sf":{"s":{"Tanushree":{"st":"a"},"Ajita":{"st":"r","t":"7:15"},"Garima":{"st":"r","t":"7:15"},"Renu Harsh":{"st":"a"},"Saba":{"st":"a"},"Sarita":{"st":"r","t":"12:56"},"Asha":{"st":"a"},"Bharti":{"st":"r","t":"7:15"},"Neha":{"st":"r","t":"7:15"},"Mansi":{"st":"r","t":"7:15"}},"at":"12:56"},"tf":{"s":{"Jatin":{"st":"l","t":"7:19"},"Shobha":{"st":"r","t":"7:19"},"Poonam Gaur":{"st":"r","t":"7:19"}},"at":"7:19"},"ff":{"s":{"Neetu":{"st":"r","t":"7:19"},"Diksha":{"st":"l","t":"7:19"},"Karishma":{"st":"r","t":"10:24"},"Divyanshi":{"st":"r","t":"10:24"},"Shally":{"st":"r","t":"10:24"},"Himanshi":{"st":"r","t":"10:24"},"Richa":{"st":"a"},"Geeta":{"st":"r","t":"7:19"},"Preeti":{"st":"r","t":"7:20"}},"at":"10:24"},"bus":{"s":{"Harsh":{"st":"l","t":"7:20"},"Amit":{"st":"r","t":"7:21"},"Anita":{"st":"r","t":"7:21"},"Juhi":{"st":"r","t":"7:21"},"Priyanka S.":{"st":"r","t":"7:21"},"Mansi":{"st":"r","t":"7:21"},"Komal":{"st":"r","t":"7:21"},"Bhagyashree":{"st":"r","t":"7:21"},"Ram":{"st":"r","t":"7:21"},"Chandan":{"st":"r","t":"7:21"},"Rashmi":{"st":"r","t":"7:21"},"Renuka":{"st":"r","t":"7:21"},"Vijay":{"st":"r","t":"7:21"},"Yashika":{"st":"r","t":"7:21"},"Pooja":{"st":"r","t":"7:21"},"Vipul":{"st":"l","t":"7:21"},"Himanshu":{"st":"l","t":"7:21"}},"at":"7:22"},"gf":{"s":{"Harshvardhan":{"st":"l","t":"15:33"},"Shivika":{"st":"r","t":"18:17"},"Poonam Rathore":{"st":"l","t":"18:17"},"Madhu":{"st":"r","t":"18:17"},"Sanjana":{"st":"r","t":"18:17"},"Poojal":{"st":"a"},"Nahida":{"st":"r","t":"15:33"},"Suman":{"st":"r","t":"18:17"},"Priyanka":{"st":"r","t":"10:25"},"Nandini":{"st":"a"},"Rekha":{"st":"r","t":"7:22"}},"at":"18:17"}}},"2026-09-28":{"leave":[{"n":"Manisha Sharma","k":"Teacher","half":true},{"n":"Tina Sangtani","k":"Teacher"},{"n":"Neetu Dara","k":"Floor Manager"},{"n":"Shikha Sharma","k":"Activity"},{"n":"Himanshi Negi","k":"Teacher"},{"n":"Swati Sehgal","k":"Teacher"},{"n":"Kanhaiya Lal Swami","k":"Activity"},{"n":"Khushi Bhadani","k":"Teacher"},{"n":"Shubhangi","k":"Admin & PL"},{"n":"Saba Panwar","k":"CM"}],"cover":[],"adj":[{"c":"3A","b":"Shobha Sharma","f":"Tina Sangtani"},{"c":"7A","b":"Poonam Gaur","f":"Himanshi Negi"}],"att":{"fo":{"s":{"Vaishali":{"st":"r","t":"7:02"},"Preeti Jain":{"st":"r","t":"7:02"},"Megha":{"st":"r","t":"7:02"},"Narendra":{"st":"r","t":"7:02"},"Harshvardhan":{"st":"r","t":"7:02"}},"at":"7:02"}}}};
const SEED_FILLS = {'Gate & entry':'#FBDDD5','Transport':'#FFF1C2','Discipline & rooms':'#E6DFFA','Corridors':'#D2EFEA','Late comers & free staff':'#DCE7FB','Stayback':'#F9D6E2','Sports':'#D6F0DB'};

function header_(sh, header, widths) {
  sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#18213A');
  sh.setFrozenRows(1);
  widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));
}
function make_(name, header, rows, widths) {
  const ss = ss_(); if (ss.getSheetByName(name)) return null;
  const sh = ss.insertSheet(name);
  header_(sh, header, widths);
  sh.getRange(2, 1, 500, header.length).setNumberFormat('@');
  if (rows.length) sh.getRange(2, 1, rows.length, header.length).setValues(rows);
  return sh;
}
function buildChart_() {
  const chart = make_(T_CHART, ['Shift','Duty','Time','Colour','Group','Bus','Staff','Note'], SEED_ROWS, [130,240,100,170,90,60,240,120]);
  if (chart) {
    chart.getRange(2, 4, SEED_ROWS.length, 1).setBackgrounds(SEED_ROWS.map(r => [SEED_FILLS[r[3]] || '#FFFFFF']));
    chart.getRange('D2:D500').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(Object.keys(SEED_FILLS), true).setAllowInvalid(false).build());
  }
  make_(T_SHIFTS, ['ID','Shift','Time shown'], SEED_SHIFTS, [100,160,170]);
}

/** Creates missing tabs. Upgrades an older build (no Daily Log / no Check-in tab) without deleting anything. */
function setup() {
  const ss = ss_();
  const oldBuild = ss.getSheetByName(T_CHART) && !ss.getSheetByName(T_DAILY);
  if (oldBuild) backupChart_();
  buildChart_();
  if (!ss.getSheetByName(T_SET)) {
    const st = ss.insertSheet(T_SET);
    st.getRange('A1:B3').setNumberFormat('@').setValues([['Title','Duty Chart'],['Month','September 2026'],['Edit PIN','1234']]);
    st.getRange('A1:A4').setFontWeight('bold'); st.setColumnWidth(1, 120); st.setColumnWidth(2, 200);
  }
  if (!settings_()['Data version']) setSetting_('Data version', 0);
  const dl = make_(T_DAILY, ['Date','Data (saved by the app)','Updated'], [], [100,600,140]);
  if (dl) { const days = Object.keys(SEED_DAILY).sort().reverse();
    if (days.length) { dl.getRange(2, 1, days.length, 3).setValues(days.map(d => [d, JSON.stringify(SEED_DAILY[d]), 'imported'])); } }
  make_(T_ROSTER, ['Area','Names (saved by the app)'], [], [100,600]);
  make_(T_LEAVE, ['Date','Staff on leave','Category','Half day','Late'], [], [100,200,140,90,110]);
  make_(T_ADJ, ['Date','Type','Class / Activity / Duty','Absent','Adjusted by / Covering','Time'], [], [100,150,240,180,180,140]);
  make_(T_ATT, ['Date','Area','Name','Status','Time'], [], [100,90,180,90,70]);
  if (dl) readable_(SEED_DAILY, Object.keys(SEED_DAILY).sort().reverse());
  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
}

function backupChart_() {
  const ss = ss_(), stamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'dd MMM HH:mm');
  [T_CHART, T_SHIFTS].forEach(n => { const sh = ss.getSheetByName(n); if (sh) sh.setName(n + ' (backup ' + stamp + ')'); });
}

/** Menu: replace Duty Chart + Shifts with the app's current chart; old tabs are kept as backups. */
function rebuildChart() { backupChart_(); buildChart_(); }

/* ---------- fresh start: chart begins clean from START_DATE; older days are moved to archive tabs ---------- */
const START_DATE = '2026-10-12';

function freshStart() {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (settings_()['Fresh start'] === START_DATE) return;
    const ss = ss_(), label = ' (archive before ' + START_DATE + ')';
    [T_DAILY, T_LEAVE, T_ADJ, T_ATT].forEach(n => {
      const sh = ss.getSheetByName(n);
      if (sh && !ss.getSheetByName(n + label)) sh.copyTo(ss).setName(n + label);
    });
    const all = getAll(), daily = {};
    Object.keys(all.daily).forEach(d => { if (d >= START_DATE) daily[d] = all.daily[d]; });
    const stamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');
    const days = Object.keys(daily).sort().reverse();
    writeRows_(ss.getSheetByName(T_DAILY), days.map(d => [d, JSON.stringify(daily[d]), stamp]), 3);
    readable_(daily, days);
    setSetting_('Data version', getVer() + 1);
    setSetting_('Month', 'October 2026');
    setSetting_('Fresh start', START_DATE);
  } finally { lock.releaseLock(); }
}

/* ---------- 22 Oct 2026: load the corrected duty chart into the "Duty Chart" tab ----------
   Run once from the editor: choose updateDutyChart22Oct > Run.
   The current "Duty Chart" tab is kept as "Duty Chart (old 22 Oct)". */
const CHART_22OCT = [["Shift", "Duty", "Time", "Colour", "Group", "Bus", "Staff", "Note"], ["Morning", "Outer Area", "", "Gate & entry", "", "", "Kanhaiya", "Guard"], ["Morning", "Outer Area", "", "Gate & entry", "", "", "Chotulal", "Guard"], ["Morning", "Outer Area", "", "Gate & entry", "", "", "Navratan", "Guard"], ["Morning", "Outer Area", "", "Gate & entry", "", "", "Radheyshyam", "Guard"], ["Morning", "Outer Area", "", "Gate & entry", "", "", "Jatan", "Guard"], ["Morning", "Outer Area", "", "Gate & entry", "", "", "Vishwabandhu", ""], ["Morning", "Outer Area", "", "Gate & entry", "", "", "Kamal", ""], ["Morning", "Outer Area", "", "Gate & entry", "", "", "Anoop", ""], ["Morning", "Outer Area", "", "Gate & entry", "", "", "Jay", ""], ["Morning", "Auto Duty", "", "Transport", "", "", "Saurabh", "Auto"], ["Morning", "Auto Duty", "", "Transport", "", "", "Anoop", "If Saurabh absent"], ["Morning", "Main Door", "", "Gate & entry", "", "", "Harshvardhan", ""], ["Morning", "Main Door", "", "Gate & entry", "", "", "Shivika", ""], ["Morning", "Entry Door 2-3", "", "Gate & entry", "", "", "Poonam Rathore", ""], ["Morning", "Entry Door 2-3", "", "Gate & entry", "", "", "Madhu", ""], ["Morning", "Defaulter Room – Nur B", "", "Discipline & rooms", "", "", "Priya Bagri", ""], ["Morning", "Defaulter Room – Nur B", "", "Discipline & rooms", "", "", "Poojal", ""], ["Morning", "Defaulter Room – Nur B", "", "Discipline & rooms", "", "", "Chandani", ""], ["Morning", "Disciplinary Incharge", "", "Discipline & rooms", "", "", "Nahida", ""], ["Morning", "Disciplinary Incharge", "", "Discipline & rooms", "", "", "Sanjana", "Duty observation"], ["Morning", "Bus Coordinator", "", "Transport", "", "", "Harsh", ""], ["Morning", "Bus Coordinator", "", "Transport", "", "", "Amit", ""], ["Morning", "Bus Coordinator", "", "Transport", "", "", "Anita", ""], ["Morning", "Bus Duty", "", "Transport", "", "1-3", "Juhi", ""], ["Morning", "Bus Duty", "", "Transport", "", "4-6", "Priyanka S.", ""], ["Morning", "Bus Duty", "", "Transport", "", "7-9", "Mansi", ""], ["Morning", "Bus Duty", "", "Transport", "", "10-12", "Komal", ""], ["Morning", "Bus Duty", "", "Transport", "", "13-15", "Bhagyashree", ""], ["Morning", "Bus Duty", "", "Transport", "", "16-18", "Ram", ""], ["Morning", "Bus Duty", "", "Transport", "", "19-22", "Chandan", ""], ["Morning", "Bus Duty", "", "Transport", "", "23-26", "Rashmi", "CM"], ["Morning", "Bus Duty", "", "Transport", "", "27-30", "Renuka", ""], ["Morning", "Bus Duty", "", "Transport", "", "31-34", "Vijay", ""], ["Morning", "Bus Duty", "", "Transport", "", "35-38", "Yashika", ""], ["Morning", "Pvt Van Area", "", "Transport", "", "", "Vipul", ""], ["Morning", "Pvt Van Area", "", "Transport", "", "", "Himanshu", ""], ["Morning", "Pvt Van Area", "", "Transport", "", "", "Narendra Dara", ""], ["Morning", "Late Comer", "7:30 – 7:45", "Late comers & free staff", "", "", "Nahida", ""], ["Morning", "Late Comer", "7:30 – 7:45", "Late comers & free staff", "", "", "Harsh", ""], ["Morning", "Late Comer", "7:30 – 7:45", "Late comers & free staff", "", "", "Chandan Soni", ""], ["Morning", "Late Comer", "7:30 – 7:45", "Late comers & free staff", "", "", "Saurabh", ""], ["Morning", "GF Corridor", "", "Corridors", "", "", "Nahida", ""], ["Morning", "GF Corridor", "", "Corridors", "", "", "Sanjana", ""], ["Morning", "GF Corridor", "", "Corridors", "", "", "Khushi", ""], ["Morning", "GF Corridor", "", "Corridors", "", "", "Suman", "MR"], ["Morning", "GF Corridor", "", "Corridors", "", "", "Priyanka", "MR"], ["Morning", "First Floor Corridor", "", "Corridors", "", "", "Himanshi", "Stairs"], ["Morning", "First Floor Corridor", "", "Corridors", "", "", "Richa", "Stairs"], ["Morning", "First Floor Corridor", "", "Corridors", "", "", "Shally", ""], ["Morning", "First Floor Corridor", "", "Corridors", "", "", "Neetu", ""], ["Morning", "First Floor Corridor", "", "Corridors", "", "", "Diksha", ""], ["Morning", "First Floor Corridor", "", "Corridors", "", "", "Divyanshi", ""], ["Morning", "First Floor Corridor", "", "Corridors", "", "", "Sharda Yadav", ""], ["Morning", "First Floor Corridor", "", "Corridors", "", "", "Santosh Yadav", ""], ["Morning", "First Floor Corridor", "", "Corridors", "", "", "Karishma", ""], ["Morning", "Second Floor Corridor", "", "Corridors", "", "", "Tanushree", "Stairs"], ["Morning", "Second Floor Corridor", "", "Corridors", "", "", "Ajita", "Stairs"], ["Morning", "Second Floor Corridor", "", "Corridors", "", "", "Asha", ""], ["Morning", "Second Floor Corridor", "", "Corridors", "", "", "Saba", ""], ["Morning", "Second Floor Corridor", "", "Corridors", "", "", "Sarita", ""], ["Morning", "Second Floor Corridor", "", "Corridors", "", "", "Poonam Sharda", ""], ["Morning", "Second Floor Corridor", "", "Corridors", "", "", "Garima", ""], ["Morning", "Third Floor Corridor", "", "Corridors", "", "", "Shobha", ""], ["Morning", "Third Floor Corridor", "", "Corridors", "", "", "Upinder", ""], ["Morning", "Third Floor Corridor", "", "Corridors", "", "", "Jatin", ""], ["Morning", "Free Staff", "", "Late comers & free staff", "", "", "Neha", ""], ["Morning", "Free Staff", "", "Late comers & free staff", "", "", "Rashmi", ""], ["Morning", "Floor Free Staff", "", "Late comers & free staff", "First Floor", "", "Geeta", "1F"], ["Morning", "Floor Free Staff", "", "Late comers & free staff", "First Floor", "", "Preeti", "1F"], ["Morning", "Floor Free Staff", "", "Late comers & free staff", "Second Floor", "", "Poonam Gaur", ""], ["Morning", "Floor Free Staff", "", "Late comers & free staff", "Second Floor", "", "Geeta", "2F"], ["Morning", "Floor Free Staff", "", "Late comers & free staff", "Second Floor", "", "Preeti", "2F"], ["Morning", "Floor Free Staff", "", "Late comers & free staff", "Second Floor", "", "Tripti", ""], ["Morning", "Floor Free Staff", "", "Late comers & free staff", "Second Floor", "", "Bharti", ""], ["Morning", "Floor Free Staff", "", "Late comers & free staff", "Second Floor", "", "Mansi", ""], ["Morning", "Floor Free Staff", "", "Late comers & free staff", "Second Floor", "", "Neha Jain", ""], ["Departure", "Outer Area", "", "Gate & entry", "", "", "Guards", "3"], ["Departure", "Outer Area", "", "Gate & entry", "", "", "Kamal", ""], ["Departure", "Outer Area", "", "Gate & entry", "", "", "Vishwabandhu", ""], ["Departure", "Outer Area", "", "Gate & entry", "", "", "Anoop", ""], ["Departure", "Main Door – Bywalk", "", "Gate & entry", "", "", "Shally", ""], ["Departure", "Main Door – Bywalk", "", "Gate & entry", "", "", "Sunita", ""], ["Departure", "Main Door – Bywalk", "", "Gate & entry", "", "", "Deepmala", ""], ["Departure", "Main Door – Bywalk", "", "Gate & entry", "", "", "Saroj, Tina", ""], ["Departure", "Main Door – Bywalk", "", "Gate & entry", "", "", "Priyanshi", ""], ["Departure", "Main Door – Bywalk", "", "Gate & entry", "", "", "Chhavi", ""], ["Departure", "Main Door – Bywalk", "", "Gate & entry", "", "", "Priya, Pooja", ""], ["Departure", "Main Door – Bywalk", "", "Gate & entry", "", "", "Anuradha, Reema", ""], ["Departure", "On Floor – Discipline / SB Movement", "", "Discipline & rooms", "", "", "Sanjana – Diksha – Neetu", ""], ["Departure", "On Floor – Discipline / SB Movement", "", "Discipline & rooms", "", "", "Kanika", ""], ["Departure", "On Floor – Discipline / SB Movement", "", "Discipline & rooms", "", "", "Deepali", ""], ["Departure", "On Floor – Discipline / SB Movement", "", "Discipline & rooms", "", "", "Gauri, Devanshi, Vahnishwari", ""], ["Departure", "On Floor – Discipline / SB Movement", "", "Discipline & rooms", "", "", "Karishma – Geeta – Divyanshi – Manisha", ""], ["Departure", "On Floor – Discipline / SB Movement", "", "Discipline & rooms", "", "", "Ishita", ""], ["Departure", "On Floor – Discipline / SB Movement", "", "Discipline & rooms", "", "", "Jyotsana", ""], ["Departure", "On Floor – Discipline / SB Movement", "", "Discipline & rooms", "", "", "Pallavi", ""], ["Departure", "On Floor – Discipline / SB Movement", "", "Discipline & rooms", "", "", "Ritika", ""], ["Departure", "Bywalk Area – Archery", "", "Gate & entry", "", "", "Amit", ""], ["Departure", "Bywalk Area – Archery", "", "Gate & entry", "", "", "Shailesh", "6"], ["Departure", "Bywalk Area – Archery", "", "Gate & entry", "", "", "Swati", "7"], ["Departure", "Bywalk Area – Archery", "", "Gate & entry", "", "", "Shreya", "8"], ["Departure", "Bywalk Area – Archery", "", "Gate & entry", "", "", "Nisha", "9"], ["Departure", "Bywalk Area – Archery", "", "Gate & entry", "", "", "Monika", ""], ["Departure", "Bywalk Area – Archery", "", "Gate & entry", "", "", "Yavnika", ""], ["Departure", "Bywalk Area – Archery", "", "Gate & entry", "", "", "Neha", ""], ["Departure", "Bywalk Area – Archery", "", "Gate & entry", "", "", "Shaan", ""], ["Departure", "Bus Coordinator", "", "Transport", "", "", "Harsh", ""], ["Departure", "Bus Coordinator", "", "Transport", "", "", "Jay", ""], ["Departure", "Bus Coordinator", "", "Transport", "", "", "Anita", ""], ["Departure", "Bus Coordinator", "", "Transport", "", "", "Jatin", ""], ["Departure", "Bus Duty", "", "Transport", "", "1-3", "Juhi", ""], ["Departure", "Bus Duty", "", "Transport", "", "4-6", "Priyanka S.", ""], ["Departure", "Bus Duty", "", "Transport", "", "7-9", "Mansi", ""], ["Departure", "Bus Duty", "", "Transport", "", "10-12", "Komal", ""], ["Departure", "Bus Duty", "", "Transport", "", "13-15", "Bhagyashree", ""], ["Departure", "Bus Duty", "", "Transport", "", "16-18", "Ram", ""], ["Departure", "Bus Duty", "", "Transport", "", "19-22", "Chandan", ""], ["Departure", "Bus Duty", "", "Transport", "", "23-26", "Rashmi", "CM"], ["Departure", "Bus Duty", "", "Transport", "", "27-30", "Renuka", ""], ["Departure", "Bus Duty", "", "Transport", "", "31-34", "Vijay", ""], ["Departure", "Bus Duty", "", "Transport", "", "35-38", "Yashika", ""], ["Departure", "Auto Duty", "", "Transport", "", "", "Sourabh & Suman", ""], ["Departure", "Auto Duty", "", "Transport", "", "", "Preeti Choudhary", "1st F"], ["Departure", "Auto Duty", "", "Transport", "", "", "Vipul", "2nd F"], ["Departure", "Auto Duty", "", "Transport", "", "", "Poonam – Chandani", "GF"], ["Departure", "Auto Duty", "", "Transport", "", "", "Anamika", "GF"], ["Departure", "Pvt Van", "", "Transport", "", "", "Vipul", ""], ["Departure", "Pvt Van", "", "Transport", "", "", "Himanshu", ""], ["Departure", "Pvt Van", "", "Transport", "", "", "Narendra Dara", ""], ["Departure", "GF Corridor", "", "Corridors", "", "", "Madhu", "MR"], ["Departure", "GF Corridor", "", "Corridors", "", "", "Priyanka", "MR"], ["Departure", "First Floor Corridor", "", "Corridors", "", "", "Karishma", "Stairs"], ["Departure", "First Floor Corridor", "", "Corridors", "", "", "Himanshi", "Stairs"], ["Departure", "First Floor Corridor", "", "Corridors", "", "", "Sanjana – Diksha – Neetu", ""], ["Departure", "First Floor Corridor", "", "Corridors", "", "", "Geeta", "SB Room"], ["Departure", "First Floor Corridor", "", "Corridors", "", "", "Karishma", ""], ["Departure", "Second Floor Corridor", "", "Corridors", "", "", "Radha", "Bus Line"], ["Departure", "Second Floor Corridor", "", "Corridors", "", "", "Vipul", "Auto Lines"], ["Departure", "Second Floor Corridor", "", "Corridors", "", "", "Sarita – Garima – Poonam – Renu Harsh", ""], ["Departure", "Second Floor Corridor", "", "Corridors", "", "", "Tripti – Asha – Saba", ""], ["Departure", "Second Floor Corridor", "", "Corridors", "", "", "Ajita – Bharti", "Stairs"], ["Departure", "Third Floor Corridor", "", "Corridors", "", "", "Shobha", ""], ["Departure", "Third Floor Corridor", "", "Corridors", "", "", "Poonam Gaur", ""], ["Departure", "Free Staff", "2:30", "Late comers & free staff", "", "", "Pre Teachers + 3", ""], ["Departure", "Free Staff", "2:30", "Late comers & free staff", "", "", "Tripti – Ajita", ""], ["Departure", "Free Staff", "2:30", "Late comers & free staff", "", "", "Renu Harsh", ""], ["Departure", "Free Staff", "2:30", "Late comers & free staff", "", "", "Poonam G.", ""], ["Departure", "Free Staff", "2:30", "Late comers & free staff", "", "", "Mansi – Manisha", ""], ["Stayback & Sports", "Stayback – First Floor", "2:25 pm", "Stayback", "", "", "Sanjana", ""], ["Stayback & Sports", "Stayback – First Floor", "2:25 pm", "Stayback", "", "", "Bhavya / Mansi", "5B"], ["Stayback & Sports", "Stayback – First Floor", "2:25 pm", "Stayback", "", "", "Yogesh", "5C"], ["Stayback & Sports", "Stayback – First Floor", "2:25 pm", "Stayback", "", "", "Geeta", "Help"], ["Stayback & Sports", "Stayback – Second Floor", "2:25 pm", "Stayback", "", "", "Nahida – Asha", ""], ["Stayback & Sports", "Stayback – Second Floor", "2:25 pm", "Stayback", "", "", "Saba", "9A"], ["Stayback & Sports", "Stayback – Second Floor", "2:25 pm", "Stayback", "", "", "Vaibhav", "9B"], ["Stayback & Sports", "Stayback – Second Floor", "2:25 pm", "Stayback", "", "", "Bhuwan", "8C"], ["Stayback & Sports", "Stayback – Second Floor", "2:25 pm", "Stayback", "", "", "Shivika", "9C"], ["Stayback & Sports", "Stayback – Second Floor", "2:25 pm", "Stayback", "", "", "Shakil", "Pottery (Dance)"], ["Stayback & Sports", "Stayback – Second Floor", "2:25 pm", "Stayback", "", "", "Poonam", "Help"], ["Stayback & Sports", "Waiting Kids", "2:40 pm", "Stayback", "", "", "Jatan", "GF"], ["Stayback & Sports", "Stayback Departure", "4:00 pm", "Stayback", "Bywalk", "", "Mansi – Shivika", ""], ["Stayback & Sports", "Stayback Departure", "4:00 pm", "Stayback", "Bywalk", "", "Shakil", ""], ["Stayback & Sports", "Stayback Departure", "4:00 pm", "Stayback", "Bywalk", "", "Yogesh", ""], ["Stayback & Sports", "Stayback Departure", "4:00 pm", "Stayback", "Bywalk", "", "Jay", ""], ["Stayback & Sports", "Stayback Departure", "4:00 pm", "Stayback", "Auto", "", "Bhavya", ""], ["Stayback & Sports", "Stayback Departure", "4:00 pm", "Stayback", "Auto", "", "Vaibhav", ""], ["Stayback & Sports", "Stayback Departure", "4:00 pm", "Stayback", "Auto", "", "Saurabh", ""], ["Stayback & Sports", "Stayback Departure", "4:00 pm", "Stayback", "Sports", "", "Bhuwan", ""], ["Stayback & Sports", "Sports Pickup", "4:45 pm", "Sports", "", "", "Nishant", ""], ["Stayback & Sports", "Sports Departure", "6:15 pm", "Sports", "", "", "Nishant", ""], ["Stayback & Sports", "Sports Departure", "6:15 pm", "Sports", "", "", "Sports Coaches", ""], ["Extra Staff", "Extra", "", "Gate & entry", "Morning", "", "Nandini", ""], ["Extra Staff", "Extra", "", "Gate & entry", "Morning", "", "Rekha", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Morning", "", "Pooja", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Morning", "", "Karishma", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Morning", "", "Saba", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Morning", "", "Chandani", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Morning", "", "Khushi", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Morning", "", "Tanushree", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Morning", "", "Priya Bagri", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Morning", "", "Poonam Gaur", ""], ["Extra Staff", "1st Floor", "", "Corridors", "Morning", "", "Geeta", ""], ["Extra Staff", "1st Floor", "", "Corridors", "Morning", "", "Preeti", ""], ["Extra Staff", "2nd Floor", "", "Corridors", "Morning", "", "Neha", ""], ["Extra Staff", "2nd Floor", "", "Corridors", "Morning", "", "Mansi", ""], ["Extra Staff", "3rd Floor", "", "Corridors", "Morning", "", "Poonam Gaur", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Departure", "", "Pooja", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Departure", "", "Karishma", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Departure", "", "Saba", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Departure", "", "Chandani", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Departure", "", "Khushi", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Departure", "", "Tanushree", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Departure", "", "Manisha", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Departure", "", "Priya Bagri", ""], ["Extra Staff", "CM", "", "Discipline & rooms", "Departure", "", "Poonam Gaur", ""], ["Extra Staff", "1st Floor", "", "Corridors", "Departure", "", "Manisha", ""], ["Extra Staff", "1st Floor", "", "Corridors", "Departure", "", "Diksha – Neetu – Karishma", ""], ["Extra Staff", "1st Floor", "", "Corridors", "Departure", "", "Divyanshi", ""], ["Extra Staff", "1st Floor", "", "Corridors", "Departure", "", "Richa", ""], ["Extra Staff", "2nd Floor", "", "Corridors", "Departure", "", "Neha", ""], ["Extra Staff", "2nd Floor", "", "Corridors", "Departure", "", "Mansi", ""], ["Extra Staff", "2nd Floor", "", "Corridors", "Departure", "", "Manisha", ""], ["Extra Staff", "3rd Floor", "", "Corridors", "Departure", "", "", ""]];

function updateDutyChart22Oct() {
  const ss = ss_();
  const cur = ss.getSheetByName(T_CHART);
  if (cur) {
    const old = ss.getSheetByName('Duty Chart (old 22 Oct)');
    if (old) ss.deleteSheet(old);
    cur.setName('Duty Chart (old 22 Oct)');
  }
  const sh = ss.insertSheet(T_CHART, 0);
  const rows = CHART_22OCT, w = rows[0].length;
  sh.getRange(1, 1, 600, w).setNumberFormat('@');
  sh.getRange(1, 1, rows.length, w).setValues(rows);
  sh.getRange(1, 1, 1, w).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#18213A');
  sh.setFrozenRows(1);
  [130,240,100,170,110,60,240,140].forEach((px, i) => sh.setColumnWidth(i + 1, px));
  sh.getRange(2, 4, rows.length - 1, 1).setBackgrounds(rows.slice(1).map(r => [SEED_FILLS[r[3]] || '#FFFFFF']));
  sh.getRange('D2:D600').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(Object.keys(SEED_FILLS), true).setAllowInvalid(false).build());
  setSetting_('Data version', getVer() + 1);
  ss.setActiveSheet(sh);
  SpreadsheetApp.getActive().toast('Duty Chart updated – reload the app link', 'Done', 8);
}
