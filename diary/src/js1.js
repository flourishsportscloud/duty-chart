<script>
/* ================= Diary & Remarks · FIS =================
   Same Google Sheet backend as before (Apps Script web app). Roles: cm = Class Manager (CM),
   pl = Class incharge (PL), admin = Front Office (FO). */
function EMPTY_ROSTER(){ const r = {}; for (let c = 1; c <= 11; c++) r[c] = {A: []}; return r; }
let ROSTER = EMPTY_ROSTER(), rosterVer = "";
const rosterReady = () => Object.keys(ROSTER).some(c => Object.values(ROSTER[c]).some(l => l.length));
const ORD = ["","1st","2nd","3rd","4th","5th","6th","7th","8th","9th","10th","11th"];
const $ = id => document.getElementById(id);
const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
const btn = (c, txt, fn, title) => { const b = el("button", c, txt); b.type = "button"; if (fn) b.onclick = fn; if (title) b.setAttribute("aria-label", title); return b; };
const ICON = {
  check:'<path d="M5 12.5l4.2 4.2L19 7"/>',
  bolt:'<path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z"/>',
  note:'<path d="M5 4h14v12H9l-4 4z"/><path d="M8.5 8.5h7M8.5 12h4.5"/>',
  clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'
};
const svg = k => '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[k] + '</svg>';

const API_URL = new URLSearchParams(location.search).get("api") || "https://script.google.com/macros/s/AKfycbyvWTDOKOQ8F0vD-oy9vchmq04GdhfZfgtpomgWg73rIa13gmkrFkpZsvQl9ISZKrSFQw/exec";
let token = ""; try { token = localStorage.getItem("diary-token") || ""; } catch(e){}
let me = null, ready = false, authMode = "login", users = [], refreshing = false;
const ROLE_LABEL = {cm:"CM · Class Manager", cmh:"CMH · CM Head", tp:"Teacher · Primary (1–5)", ts:"Teacher · Classes 6–11", teacher:"Teacher · All classes", pm:"PM · Primary Manager (1–5)", pl:"PL · Class incharge", admin:"FO · Front Office"};
const SIGNUP_ROLES = ["cm","cmh","tp","ts","pm","pl","admin"], ALL_ROLES = ["cm","cmh","tp","ts","teacher","pm","pl","admin"];
// which classes each role works with: primary staff see 1–5, senior teachers 6–11, everyone else the whole school
function myClasses(){ const r = me && me.role; const a = []; for (let c = 1; c <= 11; c++) if ((r === "tp" || r === "pm") ? c <= 5 : r === "ts" ? c >= 6 : true) a.push(c); return a; }
const myCls = c => myClasses().includes(Number(c));
const limited = () => myClasses().length < 11;
const ROLE_SHORT = {cm:"CM", cmh:"CMH", tp:"TR", ts:"TR", teacher:"TR", pm:"PM", pl:"PL", admin:"FO"};
const canMark = () => !!me;   // the CM (marking) tab is open to every role, limited to the role's classes
const canPL = () => !!me && (me.role === "pl" || me.role === "pm" || me.role === "admin");
const canAdmin = () => !!me && me.role === "admin";
function setToken(t){ token = t || ""; try { if (token) localStorage.setItem("diary-token", token); else localStorage.removeItem("diary-token"); } catch(e){} }
async function api(fn, args){
  let r;
  try { r = await fetch(API_URL, {method:"POST", redirect:"follow", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify({fn, args:args || []})}); }
  catch(e){ throw new Error("Can't reach the server. Check your internet and try again."); }
  const txt = await r.text(); let j;
  try { j = JSON.parse(txt); } catch(e){ throw new Error("The server didn't answer properly. Please try again."); }
  if (!j.ok) { if (/log in again/i.test(j.err || "")) { setToken(""); me = null; render(); } throw new Error(j.err || "Something went wrong."); }
  return j.v;
}
function banner(msg, info){ const b = $("banner"); b.textContent = msg || ""; b.hidden = !msg; b.className = "banner" + (info ? " info" : ""); }
let toastT;
function toast(t){ const e = $("toast"); e.textContent = t; e.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { e.hidden = true; }, 2400); }
async function copyText(t, ok){ try { await navigator.clipboard.writeText(t); toast(ok || "Copied"); } catch(e){ toast("Copy is blocked here. Long-press to select."); } }

/* ---------- dates & times ---------- */
function todayStr(){ const d = new Date(), p = n => String(n).padStart(2,"0"); return d.getFullYear() + "-" + p(d.getMonth()+1) + "-" + p(d.getDate()); }
function shiftDate(s, n){ const [y,m,d] = s.split("-").map(Number); const t = new Date(Date.UTC(y, m-1, d + n)), p = x => String(x).padStart(2,"0"); return t.getUTCFullYear() + "-" + p(t.getUTCMonth()+1) + "-" + p(t.getUTCDate()); }
function dayGap(a, b){ return Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 864e5); }
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"], WD = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
function dmy(s){ const [y,m,d] = s.split("-"); return d + "-" + m + "-" + y; }
function nice(s){ const [y,m,d] = s.split("-").map(Number); const w = new Date(Date.UTC(y,m-1,d)).getUTCDay(); return WD[w] + ", " + d + " " + MON[m-1]; }
function hm(ms){ const d = new Date(ms); let h = d.getHours(); const ap = h >= 12 ? "pm" : "am"; h = h % 12 || 12; return h + ":" + String(d.getMinutes()).padStart(2,"0") + " " + ap; }
function fmtT(ms){ if (!ms) return "time not recorded"; const d = new Date(ms); const ds = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); return (ds === todayStr() ? "Today" : d.getDate() + " " + MON[d.getMonth()]) + ", " + hm(ms); }
function gap(from, to){ if (!from || !to) return ""; const m = Math.max(0, Math.round((to - from) / 60000)); return m < 1 ? "within a minute" : m < 60 ? m + " min" : m < 1440 ? Math.floor(m/60) + " h " + (m%60 ? (m%60) + " min" : "") : Math.floor(m/1440) + " d " + Math.floor((m%1440)/60) + " h"; }
function until(ms){ const m = Math.round((ms - Date.now()) / 60000), a = Math.abs(m); const t = a < 60 ? a + " min" : a < 1440 ? Math.floor(a/60) + " h" + (a%60 ? " " + (a%60) + " min" : "") : Math.floor(a/1440) + " d"; return m >= 0 ? "in " + t : t + " overdue"; }

let date = todayStr();
let cls = 1, sec = "A";
let docs = {};            // "date_cls" -> {date, cls, m:{}}
let acts = {};            // "date_1A9" -> {log:[...]}
let smsRec = {};          // "1A9_def" -> {sentOn, sentAt, remark, by}
const timers = {}, writing = {}, dirtyKeys = {}, aBusy = {};
const openRem = new Set();

function docId(c, dt){ return (dt || date) + "_" + c; }
function getDoc(c){ const id = docId(c); if (!docs[id]) docs[id] = {date, cls:c, m:{}}; return docs[id]; }
function sections(c){ return Object.keys(ROSTER[c] || {}); }
function key(s, i){ return s + "-" + (i+1); }
function mark(c, s, i, dt){ const d = docs[docId(c, dt)]; return (d && d.m[key(s,i)]) || {}; }
function firstName(n){ return n.trim().split(/\s+/)[0].toUpperCase(); }
function title(n){ return n.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "); }

/* ---------- saving marks ---------- */
function scheduleSave(c, k){
  const id = docId(c); (dirtyKeys[id] = dirtyKeys[id] || new Set()).add(k);
  setStatus("Saving…"); clearTimeout(timers[id]); timers[id] = setTimeout(() => flush(id), 500);
}
async function flush(id){
  if (!me) return;
  const keys = dirtyKeys[id]; if (!keys || !keys.size) return;
  if (writing[id]) { timers[id] = setTimeout(() => flush(id), 400); return; }
  writing[id] = true;
  const sent = Array.from(keys); keys.clear();
  const d = docs[id], set = {}, del = [];
  sent.forEach(k => { if (d.m[k]) set[k] = d.m[k]; else del.push(k); });
  try { await api("saveMarks", [token, d.date, d.cls, set, del]); setStatus("Saved for everyone · " + hm(Date.now())); }
  catch(e){ sent.forEach(k => keys.add(k)); setStatus("Not saved yet. Will retry."); toast(e.message); }
  finally { writing[id] = false; }
}
function retryDirty(){ Object.keys(dirtyKeys).forEach(id => { if (dirtyKeys[id].size && !writing[id]) flush(id); }); }
let statusText = "";
function setStatus(t){ statusText = t; const s = $("cmStatus"); if (s) s.textContent = t; }
function applyState(s){
  if (!s) return;
  me = s.me || null; users = s.users || [];
  if (me && !myCls(cls)) { cls = myClasses()[0]; sec = sections(cls)[0]; }
  if (!me) { if (token) { setToken(""); banner("Please log in again.", true); } ready = true; render(); return; }
  if (s.roster) {
    const r = EMPTY_ROSTER(); Object.keys(s.roster).forEach(c => { if (r[c]) r[c] = s.roster[c]; });
    ROSTER = r; rosterVer = s.rosterVer || "";
    if (!myCls(cls)) cls = myClasses()[0]; if (!myCls(pcls)) pcls = myClasses()[0];
    if (!ROSTER[cls][sec]) sec = sections(cls)[0]; if (!ROSTER[pcls][psec]) psec = sections(pcls)[0];
  }
  Object.keys(s.docs || {}).forEach(id => {
    if (writing[id]) return;
    const v = s.docs[id], m = JSON.parse(JSON.stringify(v.m || {})), loc = docs[id];
    if (loc && dirtyKeys[id]) dirtyKeys[id].forEach(k => { if (loc.m[k]) m[k] = loc.m[k]; else delete m[k]; });
    docs[id] = {date:v.date, cls:v.cls, m};
  });
  Object.keys(s.acts || {}).forEach(id => { if (aBusy[id]) return; acts[id] = {log: s.acts[id].log || []}; });
  smsRec = s.sms || {};
  ready = true;
  if (!statusText || /^Live/.test(statusText)) setStatus("Live · updated " + hm(Date.now()));
  render();
}
async function refresh(){
  if (!token || refreshing) return;
  refreshing = true;
  try { applyState(await api("state", [token, date, rosterVer])); }
  catch(e){ setStatus("Can't reach the server. Retrying."); if (!ready) { ready = true; render(); } }
  finally { refreshing = false; }
}

/* ---------- marks ---------- */
const MF = ["a","d","e","s","b","v","y","p"];
/* value codes: a 2 present · 1 absent · 3 diary not brought | d 2 OK · 1 not completed | others 1 yes/good · 2 no/bad */
function subKey(s){ return "_" + s; }
function subOf(c, s, dt){ const d = docs[docId(c, dt)]; return (d && d.m[subKey(s)]) || null; }
function hasMarks(c, s, dt){ const d = docs[docId(c, dt)]; return !!d && Object.keys(d.m).some(k => k.indexOf(s + "-") === 0); }
function secDone(c, s, dt){ return !!subOf(c, s, dt) || hasMarks(c, s, dt); }
function submitSec(c, s){ const d = getDoc(c), k = subKey(s); d.m[k] = {k:1, at:Date.now(), u:(me && me.name) || ""}; scheduleSave(c, k); }
function setMark(c, s, i, patch){
  const d = getDoc(c), k = key(s,i), prev = d.m[k] || {};
  const cur = Object.assign({}, prev, patch);
  const tm = Object.assign({}, prev.t || {}), now = Date.now();
  MF.forEach(f => { if (f in patch) { if (cur[f]) tm[f] = now; else delete tm[f]; } });
  if ("r" in patch) { if (cur.r && cur.r.trim()) { if (!(prev.r && prev.r.trim())) tm.r = now; } else delete tm.r; }
  MF.forEach(f => { if (!cur[f]) delete cur[f]; });
  if (!cur.r || !cur.r.trim()) delete cur.r;
  cur.t = tm; if (!Object.keys(tm).length) delete cur.t;
  if (MF.concat(["r"]).some(f => cur[f])) d.m[k] = cur; else delete d.m[k];
  scheduleSave(c, k);
}

/* categories used everywhere */
const CATS = [
  {k:"abs",  l:"Absent",              tone:"bad",  test:m => m.a === 1},
  {k:"nb",   l:"Diary not brought",   tone:"warn", test:m => m.a === 3, f:"a"},
  {k:"def",  l:"Diary not completed", tone:"warn", test:m => m.a !== 1 && m.d === 1, f:"d"},
  {k:"sig",  l:"Diary not signed",    tone:"bad",  test:m => m.a !== 1 && m.s === 2, f:"s"},
  {k:"eng",  l:"Spoken English",      tone:"plum", test:m => m.a !== 1 && m.e === 2, f:"e"},
  {k:"beh",  l:"Behaviour",           tone:"bad",  test:m => m.a !== 1 && m.b === 2, f:"b"},
  {k:"tv",   l:"TV hour",             tone:"sky",  test:m => m.a !== 1 && m.v === 2, f:"v"},
  {k:"study",l:"Study hour",          tone:"sky",  test:m => m.a !== 1 && m.y === 2, f:"y"},
  {k:"play", l:"Play hour",           tone:"sky",  test:m => m.a !== 1 && m.p === 2, f:"p"}
];
const DCATS = CATS.filter(x => x.k !== "abs");
const CAT = {}; CATS.forEach(x => CAT[x.k] = x);
const LABEL = {rem:"Parent remark"}; DCATS.forEach(x => LABEL[x.k] = x.l);
function flagged(m, cat){ return !!m && !!CAT[cat] && CAT[cat].test(m); }
function counts(c, s, dt){
  const names = ROSTER[c][s] || [], k = {total:names.length, present:0, absent:0, unmarked:0, def:0, kids:0, rem:0};
  names.forEach((n,i) => {
    const m = mark(c,s,i,dt);
    if (m.r && m.r.trim()) k.rem++;
    if (m.a === 1) { k.absent++; return; }
    if (m.a === 2 || m.a === 3) k.present++; else k.unmarked++;
    if (m.d === 1 || m.a === 3) k.def++;
    if (DCATS.some(x => x.test(m))) k.kids++;
  });
  return k;
}

/* ---------- topics for parent remarks (from the last weeks of real remarks) ---------- */
const TOPICS = [
  {k:"health", l:"Health & medicine", tone:"bad", re:/not well|unwell|fever|sick|injur|pain|hurt|wound|medicine|doctor|stomach|\bfell\b|fall (down|from)|vomit|cough|\bcold\b|allerg|muscle|fracture|headache/i, acts:["Informed","Given","Counselled"]},
  {k:"leave", l:"Leave & absence", tone:"mute", re:/\bleave\b|absent|out of (the )?(town|station)|wedding|marriage|function|could ?n['’]?t (come|attend)|not (be )?able to (come|attend)|late for school|nani|grandparent|election|went to/i, acts:["Informed","Allowed","Excused"]},
  {k:"stay", l:"Stay back & academy", tone:"plum", re:/stay ?back|staying back|stay in school|smart study|after school|evening academy|(not|won['’]?t|n['’]?t) (do )?stay|stay (for|only|till|from)|will stay/i, acts:["Updated","Informed","Allowed"]},
  {k:"pickup", l:"Pick-up & transport", tone:"sky", re:/pick(ed)? ?up|\bpick\b|by walk|\bbus\b|\bvan\b|\bauto\b|transport|conveyance|go with|drop/i, acts:["Informed","Arranged","Updated"]},
  {k:"uniform", l:"Uniform", tone:"navy", re:/uniform|dress|jacket|shoes?\b|\bshirt\b|\bpant|beige|blazer|sweater/i, acts:["Allowed","Excused","Informed"]},
  {k:"books", l:"Books & material", tone:"warn", re:/\bbooks?\b|notebook|\bkit\b|stationery|\bcopy\b|guide book/i, acts:["Given","Sent","Received"]},
  {k:"food", l:"Lunch & water", tone:"ok", re:/lunch|tiffin|\bfood\b|\beat\b|fruit|water bottle|\bmeal/i, acts:["Informed","Counselled","Given"]},
  {k:"work", l:"Homework & tests", tone:"warn", re:/assignment|home ?work|worksheet|\btests?\b|exam|submit|pending work|written work|work done|complete (his|her|the)/i, acts:["Allowed","Received","Informed"]},
  {k:"study", l:"Academic help", tone:"sky", re:/explain|doubt|understood|understand|guide|concept|teach|learn|spelling|practi[cs]e|correct/i, acts:["Guided","Arranged","Informed"]},
  {k:"behav", l:"Behaviour concerns", tone:"bad", re:/behav|misbehav|disciplin|rude|fight/i, acts:["Counselled","Informed","Warned"]},
  {k:"activity", l:"Activity & sports change", tone:"plum", re:/activit|academy|sports?\b|skill course|dance|music|guitar|karate|taekwondo|yoga|skating|tennis|shooting|cricket|tabla|harmonium|pottery|\bart\b|archery|fitness|abacus|keyboard|photography|acting|legacy league|tournament|olympiad|swimming|chess/i, acts:["Changed","Allocated","Informed"]},
  {k:"other", l:"Other", tone:"mute", re:/.^/, acts:["Informed"]}
];
const TOPIC = {}; TOPICS.forEach(t => TOPIC[t.k] = t);
function topicOf(text){ const t = TOPICS.find(x => x.re.test(text || "")); return t ? t.k : "other"; }
const ACTION_WORDS = ["Acknowledged","Given","Received","Allocated","Changed","Informed","Counselled","Allowed","Sent","Excused","Arranged","Guided","Updated","Warned","Called parent"];
const DEF_ACTS = ["Counselled","Called parent","Warned","Informed"];
</script>
