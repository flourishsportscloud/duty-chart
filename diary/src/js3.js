<script>
/* ================= items: remarks & defaulters, and the PL / FO workflow ================= */
function aid(c, s, i, dt){ return dt + "_" + c + s + (i+1); }
function rawLog(c, s, i, dt){ const a = acts[aid(c,s,i,dt)]; return (a && a.log) || []; }
/* older entries had no type: "Noted" was the acknowledgement, anything else a written action */
function entryType(e){ return e.t || (e.a === "Noted" ? "ack" : "act"); }
function issuesFor(c, s, i, seg, dt){
  const m = mark(c, s, i, dt), t = m.t || {}, out = [];
  if (seg === "rem") { if (m.r && m.r.trim()) out.push({cat:"rem", text:m.r.trim(), at:t.r}); }
  else if (m.a !== 1) DCATS.forEach(x => { if (x.test(m)) out.push({cat:x.k, at:t[x.f]}); });
  return out;
}
function makeItem(dt, c, s, i, seg){
  const iss = issuesFor(c, s, i, seg, dt); if (!iss.length) return null;
  const nm = (ROSTER[c][s] || [])[i] || "";
  const cats = seg === "rem" ? ["rem"] : iss.map(x => x.cat);
  const log = rawLog(c, s, i, dt).filter(e => !e.x && (e.cats || []).some(x => seg === "rem" ? x === "rem" : x !== "rem"));
  const it = {dt, c, s, i, nm, seg, iss, cats, log, topic: seg === "rem" ? topicOf(iss[0].text) : "def"};
  it.st = itemStatus(it);
  return it;
}
function openFus(it){ return it.log.filter(e => entryType(e) === "fu" && !e.done); }
function itemStatus(it){
  const fus = it.log.filter(e => entryType(e) === "fu");
  if (fus.length) return {k:"fup", at: Math.max.apply(null, fus.map(f => f.at))};
  if (it.log.some(e => entryType(e) === "act")) return {k:"act"};
  if (it.log.length) return {k:"noted"};
  return {k:"pend"};
}
const ST_LABEL = {pend:["Pending","t-warn"], noted:["Noted","t-navy"], act:["Actioned","t-ok"], fup:["Followed up","t-sky"]};
function dayItems(dt, c0, s0, seg){
  const out = [];
  for (let c = 1; c <= 11; c++){
    if (c0 && c !== c0) continue; if (!docs[docId(c, dt)]) continue;
    sections(c).forEach(s => { if (s0 && s0 !== "all" && s !== s0) return; (ROSTER[c][s] || []).forEach((n, i) => { const it = makeItem(dt, c, s, i, seg); if (it) out.push(it); }); });
  }
  return out;
}
function rangeItems(seg, from, to, c0, s0){
  const out = []; let dt = to, g = 0;
  while (dt >= from && g++ < 62) { dayItems(dt, c0, s0, seg).forEach(x => out.push(x)); dt = shiftDate(dt, -1); }
  return out;
}

/* ---------- saving workflow entries ---------- */
let noRemarkOp = false;
function remarkOp(it, op){
  const id = aid(it.c, it.s, it.i, it.dt), before = rawLog(it.c, it.s, it.i, it.dt);
  const tmp = Object.assign({id:"tmp" + Date.now(), at:Date.now(), by: canAdmin() ? "admin" : "pl", who: me.name, cats: it.cats}, op);
  let next = before.slice();
  if (["ack","act","note","fu"].includes(op.t)) next.push(tmp);
  else next = next.map(e => {
    if (e.id !== op.id) return e;
    const c = Object.assign({}, e);
    if (op.t === "edit") { c.a = op.a; c.ed = Date.now(); }
    if (op.t === "del") c.x = Date.now();
    if (op.t === "done") { c.done = Date.now(); c.dw = me.name; }
    if (op.t === "undo") { delete c.done; delete c.dw; }
    return c;
  });
  acts[id] = {log: next}; aBusy[id] = (aBusy[id] || 0) + 1;
  render();
  const by = canAdmin() ? "admin" : "pl";
  /* until the server has the new workflow (remarkOp), Noted / Action / Remark still save through the older addLog */
  const legacy = async () => {
    if (!["ack","act","note"].includes(op.t)) throw new Error("Follow-ups, edit and delete start working once the server update is installed.");
    return api("addLog", [token, it.dt, it.c, it.s, it.i + 1, it.nm, op.a || "Noted", it.cats, by]);
  };
  (noRemarkOp ? legacy() : api("remarkOp", [token, it.dt, it.c, it.s, it.i + 1, it.nm, Object.assign({cats: it.cats}, op)])
    .catch(e => { if (/^Unknown action\.$/.test(e.message) && ["ack","act","note"].includes(op.t)) { noRemarkOp = true; return legacy(); } throw e; }))
    .then(r => { acts[id] = {log: r.log}; })
    .catch(e => { acts[id] = {log: before}; toast(e.message); })
    .finally(() => { aBusy[id]--; if (!aBusy[id]) delete aBusy[id]; render(true); });
}

/* ---------- the card ---------- */
const panelOpen = {};          // item id -> "act" | "note" | "fu"
const editing = {};            // entry id -> true
const iid = it => it.seg + ":" + aid(it.c, it.s, it.i, it.dt);
function roleOf(e){ return e.by === "admin" ? "fo" : "pl"; }
function itemCard(it, opts){
  opts = opts || {};
  const id = iid(it), st = ST_LABEL[it.st.k].slice();
  if (it.st.k === "act") { const la = it.log.filter(e => entryType(e) === "act").sort((a,b) => b.at - a.at)[0]; if (la && la.a.length <= 24) st[0] = la.a + " ✓"; }
  if (it.st.k === "fup") st[0] = "Followed up " + hm(it.st.at);
  const card = el("article","rc"); card.id = "rc-" + id.replace(/[^a-z0-9]/gi, "");
  const h = el("div","rc-h");
  h.appendChild(el("span","roll", String(it.i + 1)));
  const n = el("div","rc-n", title(it.nm)); n.appendChild(el("span","cs", it.c + it.s)); h.appendChild(n);
  h.appendChild(el("span","pill " + st[1], st[0]));
  card.appendChild(h);

  if (it.seg === "rem") {
    card.appendChild(el("div","rc-q", it.iss[0].text));
    const mt = el("div","rc-m"); const tp = TOPIC[it.topic];
    mt.appendChild(el("span","tag t-" + tp.tone, tp.l));
    mt.appendChild(el("span", null, "Written " + (opts.showDate ? fmtT(it.iss[0].at) : (it.iss[0].at ? hm(it.iss[0].at) : ""))));
    card.appendChild(mt);
  } else {
    const fl = el("div","flags");
    it.iss.forEach(x => { const c = CAT[x.cat]; const f = el("span","flag t-" + c.tone, c.l);
      const s2 = streak(it.c, it.s, it.i, x.cat);
      if (s2.n >= 2 && it.dt === date) f.appendChild(el("small", null, s2.n + " days in a row" + (s2.n >= smsAfter(x.cat) ? " · SMS" : "")));
      fl.appendChild(f); });
    card.appendChild(fl);
  }

  // timeline
  const first = it.iss[0].at;
  const log = it.log.slice().sort((a,b) => a.at - b.at);
  if (log.length) {
    const tl = el("div","tl");
    log.forEach(e => tl.appendChild(entryRow(it, e, first)));
    card.appendChild(tl);
  }

  if (!canPL()) { card.appendChild(el("div","rc-m", " ")); return card; }
  const mine = it.log.find(e => entryType(e) === "ack" && e.who === me.name);
  const bar = el("div","rc-bar"), p = panelOpen[id];
  const mk = (k, label, ic, fn, cls2) => { const b = btn((p === k ? "on " : "") + (cls2 || ""), "", fn, label + " · " + title(it.nm)); b.innerHTML = svg(ic) + "<span>" + label + "</span>"; bar.appendChild(b); };
  mk("ack", mine ? "Noted ✓" : "Noted", "check", () => { if (mine) return; remarkOp(it, {t:"ack", a:"Noted"}); toast("Noted"); }, mine ? "done" : "");
  mk("act", "Action", "bolt", () => { panelOpen[id] = p === "act" ? null : "act"; render(true); });
  mk("note", "Remark", "note", () => { panelOpen[id] = p === "note" ? null : "note"; render(true); setTimeout(() => { const t = $("np-" + id); if (t) t.focus(); }, 30); });
  mk("fu", "Follow-up", "clock", () => { panelOpen[id] = p === "fu" ? null : "fu"; render(true); });
  card.appendChild(bar);
  if (p) card.appendChild(panel(it, p, id));
  return card;
}
function entryRow(it, e, first){
  const t = entryType(e), r = roleOf(e);
  const row = el("div","te " + r + (t === "fu" ? " fu dn" : ""));
  row.appendChild(el("span","rb " + r, r.toUpperCase()));
  if (t === "ack") row.appendChild(el("b", null, "Noted"));
  else if (t === "act") { row.appendChild(document.createTextNode("Action: ")); row.appendChild(el("b", null, e.a)); }
  else if (t === "fu") {
    row.appendChild(el("b", null, "Follow-up taken"));
    if (e.a) { row.appendChild(document.createTextNode(" – ")); row.appendChild(el("span", null, e.a)); }
  } else if (editing[e.id]) {
    const ta = el("textarea"); ta.value = e.a; ta.id = "ed-" + e.id; row.appendChild(ta);
    const rr = el("div","row"); rr.style.marginTop = "6px";
    rr.appendChild(btn("btn sm", "Save", () => { const v = ta.value.trim(); if (!v) return; delete editing[e.id]; remarkOp(it, {t:"edit", id:e.id, a:v}); }));
    rr.appendChild(btn("btn ghost sm", "Cancel", () => { delete editing[e.id]; render(true); }));
    row.appendChild(rr); return row;
  } else row.appendChild(el("span", null, e.a));
  const tm = el("span","tm", (e.who || "") + " · " + fmtT(e.at) + (first ? " · " + gap(first, e.at) + " after" : "") + (e.ed ? " · edited" : ""));
  const own = canAdmin() || e.who === (me && me.name);
  if (canPL() && own && !String(e.id || "").startsWith("tmp") && e.id) {
    const ed = el("span","ed");
    if (t === "note") ed.appendChild(btn("lnk", "Edit", () => { editing[e.id] = true; render(true); setTimeout(() => { const x = $("ed-" + e.id); if (x) x.focus(); }, 30); }));
    let armed = false;
    const del = btn("lnk", "Delete", () => { if (!armed) { armed = true; del.textContent = "Tap again to delete"; return; } remarkOp(it, {t:"del", id:e.id}); });
    ed.appendChild(del); tm.appendChild(ed);
  }
  row.appendChild(tm);
  return row;
}
function panel(it, p, id){
  const box = el("div","rc-p");
  if (p === "act") {
    box.appendChild(el("div","lab", "Pick the action taken"));
    const sug = ["Acknowledged"].concat(it.seg === "rem" ? TOPIC[it.topic].acts : DEF_ACTS);
    const words = sug.concat(ACTION_WORDS.filter(w => !sug.includes(w)));
    const ws = el("div","words");
    words.forEach(w => ws.appendChild(btn("word" + (sug.includes(w) ? " sug" : ""), w, () => { panelOpen[id] = null; remarkOp(it, {t:"act", a:w}); toast("Action saved: " + w); })));
    box.appendChild(ws);
    box.appendChild(el("div","lab", "Or add your own")).style.marginTop = "12px";
    const r = el("div","row"); const inp = el("input"); inp.type = "text"; inp.maxLength = 30; inp.placeholder = "e.g. Book given"; inp.style.flex = "1 1 160px"; inp.id = "ap-" + id;
    const save = () => { const v = inp.value.trim(); if (!v) { inp.focus(); return; } panelOpen[id] = null; remarkOp(it, {t:"act", a:v}); toast("Action saved: " + v); };
    inp.onkeydown = e => { if (e.key === "Enter") save(); };
    r.appendChild(inp); r.appendChild(btn("btn", "Add", save)); box.appendChild(r);
  } else if (p === "note") {
    box.appendChild(el("div","lab", (canAdmin() ? "FO" : "PL") + " remark"));
    const ta = el("textarea"); ta.id = "np-" + id; ta.placeholder = "Write what was done or what is needed"; box.appendChild(ta);
    const r = el("div","row"); r.style.marginTop = "8px";
    r.appendChild(btn("btn", "Save remark", () => { const v = ta.value.trim(); if (!v) { ta.focus(); return; } panelOpen[id] = null; remarkOp(it, {t:"note", a:v}); }));
    r.appendChild(btn("btn ghost", "Cancel", () => { panelOpen[id] = null; render(true); }));
    box.appendChild(r);
  } else if (p === "fu") {
    box.appendChild(el("div","lab", "Record a follow-up now · " + hm(Date.now())));
    const ta = el("textarea"); ta.id = "fp-" + id; ta.placeholder = "Remark (optional) – e.g. spoke to mother, book handed over"; box.appendChild(ta);
    const r2 = el("div","row"); r2.style.marginTop = "8px";
    r2.appendChild(btn("btn", "Record follow-up", () => { const v = ta.value.trim(); panelOpen[id] = null; remarkOp(it, {t:"fu", due: Date.now(), a: v}); toast("Follow-up recorded at " + hm(Date.now())); }));
    r2.appendChild(btn("btn ghost", "Cancel", () => { panelOpen[id] = null; render(true); }));
    box.appendChild(r2);
  }
  return box;
}

/* ---------- follow-ups across everything loaded ---------- */
function allFollowUps(){
  const out = [];
  Object.keys(acts).forEach(id => {
    const m = /^(\d{4}-\d\d-\d\d)_(\d{1,2})([A-Z])(\d+)$/.exec(id); if (!m) return;
    const dt = m[1], c = +m[2], s = m[3], i = +m[4] - 1;
    (acts[id].log || []).forEach(e => {
      if (e.x || entryType(e) !== "fu") return;
      const seg = (e.cats || []).includes("rem") ? "rem" : "def";
      out.push({e, dt, c, s, i, seg, nm: ((ROSTER[c] || {})[s] || [])[i] || ""});
    });
  });
  return out.sort((a,b) => (a.e.done ? 1 : 0) - (b.e.done ? 1 : 0) || a.e.due - b.e.due);
}
function fuStrip(){ return null; }
function fuStripOld(filter){
  const due = allFollowUps().filter(f => !f.e.done && f.e.due <= Date.now() + 36e5 && (!filter || filter(f)));
  if (!due.length) return null;
  const box = el("div","fus");
  const h = el("h3"); h.textContent = "Follow-ups due · " + due.length; box.appendChild(h);
  due.slice(0, 6).forEach(f => {
    const r = el("div","it"); const late = f.e.due <= Date.now();
    const t = el("div"); t.appendChild(el("b", null, title(f.nm) + " · " + f.c + f.s));
    t.appendChild(el("span","due" + (late ? " late" : ""), until(f.e.due)));
    if (f.e.a) { t.appendChild(el("br")); t.appendChild(document.createTextNode(f.e.a)); }
    r.appendChild(t);
    const it = makeItem(f.dt, f.c, f.s, f.i, f.seg);
    if (it && canPL()) r.appendChild(btn("btn gold sm", "Done", () => remarkOp(it, {t:"done", id:f.e.id})));
    box.appendChild(r);
  });
  return box;
}

/* ---------- streaks & SMS ---------- */
const SMS_AFTER = {nb:2};
const smsAfter = cat => SMS_AFTER[cat] || 3;
const STREAK_CATS = DCATS.map(x => x.k);
/* Only days on which the section was marked count as school days. The run must end on the section's
   latest marked day; absence, a fine mark, a blank, or a gap of more than 4 calendar days breaks it. */
function streak(c, s, i, cat){
  const k = key(s,i); let n = 0, start = null, prev = null;
  for (let b = 0; b < 21; b++){
    const dt = shiftDate(date, -b), d = docs[docId(c, dt)];
    if (!d || !secDone(c, s, dt)) continue;
    if (prev && dayGap(dt, prev) > 4) break;
    if (!flagged(d.m[k] || {}, cat)) break;
    n++; start = dt; prev = dt;
  }
  return {n, start};
}
function smsText(first, cat, n){
  const f = first.charAt(0) + first.slice(1).toLowerCase(), p = n + " days";
  const t = {
    sig:"your ward " + f + "'s diary has not been signed by you for the past " + p + ". You are requested to ensure that you sign your ward's diary every day.",
    nb:"your ward " + f + " has not brought the diary to school for the past " + p + ". You are requested to ensure that your ward brings the diary to school every day.",
    def:"your ward " + f + "'s diary has not been signed by you for the past " + p + ". You are requested to ensure that you sign your ward's diary every day.",
    eng:"your ward " + f + " has not been speaking in English at school for the past " + p + ". You are requested to encourage your ward to speak in English at home as well.",
    beh:"your ward " + f + "'s behaviour at school has not been appropriate for the past " + p + ". You are requested to talk to your ward about it.",
    tv:"your ward " + f + " has not followed the TV hour routine at home for the past " + p + ". You are requested to ensure that your ward follows the TV hour routine every day.",
    study:"your ward " + f + " has not followed the study hour routine at home for the past " + p + ". You are requested to ensure that your ward follows the study hour routine every day.",
    play:"your ward " + f + " has not followed the play hour routine at home for the past " + p + ". You are requested to ensure that your ward follows the play hour routine every day."
  };
  return "Dear Parent,\nGreetings!\nThis is to inform you that " + t[cat] + "\nRegards";
}
function smsDue(){
  const out = [];
  for (let c = 1; c <= 11; c++) sections(c).forEach(s => (ROSTER[c][s] || []).forEach((nm,i) => {
    STREAK_CATS.forEach(cat => {
      const st = streak(c,s,i,cat); if (st.n < smsAfter(cat)) return;
      const rec = smsRec[c + s + (i+1) + "_" + cat];
      out.push({c, s, i, nm, cat, n:st.n, start:st.start, sent: !!(rec && rec.sentOn >= st.start), rec});
    });
  }));
  return out;
}
async function markSms(it, sent, remark){
  const id = it.c + it.s + (it.i+1) + "_" + it.cat;
  try { const r = await api("markSms", [token, id, sent, {cls:it.c, sec:it.s, name:it.nm, cat:it.cat, sentOn:date, remark}]); if (sent) smsRec[id] = r; else delete smsRec[id]; render(true); }
  catch(e){ toast(e.message); }
}
</script>
