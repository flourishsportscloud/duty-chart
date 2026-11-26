<script>
/* ================= scope picker: whole school, any classes, any sections ================= */
let view = "cm", pcls = 1, psec = "A";
function mkScope(){ return {cls: new Set(), secs: new Set()}; }     // empty = all
function inScope(sc, c, s){ return myCls(c) && (!sc.cls.size || sc.cls.has(c)) && (!sc.secs.size || sc.secs.has(s)); }
function scopeLabel(sc){
  const c = sc.cls.size ? "Class " + Array.from(sc.cls).sort((a,b) => a - b).join(", ") : limited() ? "Classes " + myClasses()[0] + "–" + myClasses().slice(-1)[0] : "Whole school";
  const s = sc.secs.size ? " · Section " + Array.from(sc.secs).sort().join(" + ") : sc.cls.size ? " · all sections" : "";
  return c + s;
}
function scopePicker(sc){
  const wrap = el("div"); wrap.style.display = "grid"; wrap.style.gap = "8px";
  const cc = el("div","chips"); cc.setAttribute("aria-label","Classes");
  cc.appendChild(btn("chip sm" + (!sc.cls.size ? " on" : ""), limited() ? "All my classes" : "All classes", () => { sc.cls.clear(); render(true); }));
  myClasses().forEach(c => { const b = btn("chip sm" + (sc.cls.has(c) ? " on" : ""), String(c), () => { if (sc.cls.has(c)) sc.cls.delete(c); else sc.cls.add(c); render(true); }, "Class " + c); b.setAttribute("aria-pressed", String(sc.cls.has(c))); cc.appendChild(b); });
  wrap.appendChild(cc);
  const avail = new Set(); for (const c of myClasses()) if (!sc.cls.size || sc.cls.has(c)) sections(c).forEach(x => avail.add(x));
  Array.from(sc.secs).forEach(x => { if (!avail.has(x)) sc.secs.delete(x); });
  const sg = el("div","seg");
  sg.appendChild(btn(!sc.secs.size ? "on" : "", avail.size > 1 ? "All sections" : "Section " + Array.from(avail).join(""), () => { sc.secs.clear(); render(true); }));
  if (avail.size > 1) Array.from(avail).sort().forEach(x => { const b = btn(sc.secs.has(x) ? "on" : "", x, () => { if (sc.secs.has(x)) sc.secs.delete(x); else sc.secs.add(x); if (sc.secs.size === avail.size) sc.secs.clear(); render(true); }, "Section " + x); b.setAttribute("aria-pressed", String(sc.secs.has(x))); sg.appendChild(b); });
  wrap.appendChild(sg);
  return wrap;
}
function itemsIn(seg, sc, from, to){ return rangeItems(seg, from, to, 0, "all").filter(x => inScope(sc, x.c, x.s)); }
function emptyCard(t, sub){ const e = el("div","card"); const m = el("div","empty"); m.appendChild(el("b", null, t)); m.appendChild(document.createTextNode(sub)); e.appendChild(m); return e; }
function statChips(all, cur, set){
  const sc = el("div","chips");
  [["all","All"],["pend","Pending"],["noted","Noted"],["act","Actioned"],["fup","Followed up"]].forEach(([k,l]) => {
    const n = k === "all" ? all.length : all.filter(x => x.st.k === k).length;
    sc.appendChild(btn("chip sm" + (cur === k ? " on" : ""), l + " · " + n, () => set(k)));
  });
  return sc;
}
const statOk = (x, k) => k === "all" || x.st.k === k;
function listCards(box, list, per){
  list.sort((a,b) => (a.dt < b.dt ? 1 : a.dt > b.dt ? -1 : 0) || a.c - b.c || a.s.localeCompare(b.s) || a.i - b.i);
  let last = "";
  list.forEach(it => {
    const g = (per !== "day" ? nice(it.dt) + " · " : "") + "Class " + it.c + " " + it.s;
    if (g !== last) { const h = el("div","dgrp", g); h.appendChild(el("small", null, list.filter(x => x.dt === it.dt && x.c === it.c && x.s === it.s).length + "")); box.appendChild(h); last = g; }
    box.appendChild(itemCard(it));
  });
}
function searchBox(val, id, set){
  const q = el("input","search"); q.type = "search"; q.placeholder = "Search a child's name"; q.value = val; q.id = id;
  q.oninput = () => { set(q.value.trim().toLowerCase()); render(true); setTimeout(() => { const x = $(id); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }, 0); };
  return q;
}

/* ================= Remarks (PL) ================= */
const rsc = mkScope(); let rseg = "rem", rper = "day", rtopic = "all", rstat = "all", rq = "";
function renderRem(){
  const box = $("vRem"); box.textContent = "";
  const from = rper === "day" ? date : shiftDate(date, -6);
  const all = itemsIn("rem", rsc, from, date);
  const f = el("div","card"); const fp = el("div","selector");
  if (rseg === "rem") { const per = el("div","seg"); [["day", nice(date)],["week","Last 7 days"]].forEach(([k,l]) => per.appendChild(btn(rper === k ? "on" : "", l, () => { rper = k; render(true); }))); fp.appendChild(per); }
  fp.appendChild(scopePicker(rsc));
  if (rseg === "rem") {
    const tc = el("div","chips");
    [["all","All topics"]].concat(TOPICS.filter(t => all.some(x => x.topic === t.k)).map(t => [t.k, t.l + " · " + all.filter(x => x.topic === t.k).length])).forEach(([k,l]) => tc.appendChild(btn("chip sm" + (rtopic === k ? " on" : ""), l, () => { rtopic = k; render(true); })));
    fp.appendChild(tc);
    fp.appendChild(statChips(all, rstat, k => { rstat = k; render(true); }));
    fp.appendChild(searchBox(rq, "rq", v => { rq = v; }));
  }
  f.appendChild(fp); box.appendChild(f);
  const fs = fuStrip(x => x.seg === "rem" && inScope(rsc, x.c, x.s)); if (fs) box.appendChild(fs);
  const list = all.filter(x => (rtopic === "all" || x.topic === rtopic) && statOk(x, rstat) && (!rq || x.nm.toLowerCase().includes(rq)));
  const ex = el("div","row"); ex.style.margin = "4px 2px 0";
  ex.appendChild(el("span","small muted", scopeLabel(rsc) + " · " + list.length + " remark" + (list.length === 1 ? "" : "s")));
  ex.appendChild(el("span","sp"));
  ex.appendChild(btn("btn ghost sm", "Copy for Excel", () => copyText(remarksTSV(list), list.length + " rows copied. Paste into Excel.")));
  box.appendChild(ex);
  if (!list.length) { box.appendChild(emptyCard("No parent remarks", "Nothing for " + scopeLabel(rsc) + (rper === "day" ? " on " + nice(date) : " in the last 7 days") + ".")); return; }
  listCards(box, list, rper);
}

/* ================= Defaulters (FO) ================= */
const dsc = mkScope(); let dseg = "def", dperd = "day", dcat = "all", dstat = "all", dq = "";
function renderDef(){
  const box = $("vDef"); box.textContent = "";
  const from = dperd === "day" ? date : shiftDate(date, -6);
  const all = itemsIn("def", dsc, from, date);
  const sms = smsDue().filter(x => inScope(dsc, x.c, x.s));
  const top = el("div","seg"); top.style.marginBottom = "12px";
  [["def","Defaulters", all.filter(x => x.st.k === "pend").length],["sms","SMS", sms.filter(x => !x.sent).length]].forEach(([k,l,n]) => { const b = btn(dseg === k ? "on" : "", l, () => { dseg = k; render(true); }); if (n) b.appendChild(el("em", null, String(n))); top.appendChild(b); });
  box.appendChild(top);
  const f = el("div","card"); const fp = el("div","selector");
  if (dseg === "def") { const per = el("div","seg"); [["day", nice(date)],["week","Last 7 days"]].forEach(([k,l]) => per.appendChild(btn(dperd === k ? "on" : "", l, () => { dperd = k; render(true); }))); fp.appendChild(per); }
  fp.appendChild(scopePicker(dsc));
  if (dseg === "def") {
    const cc = el("div","chips");
    [["all","All types"]].concat(DCATS.filter(c => all.some(x => x.cats.includes(c.k))).map(c => [c.k, c.l + " · " + all.filter(x => x.cats.includes(c.k)).length])).forEach(([k,l]) => cc.appendChild(btn("chip sm" + (dcat === k ? " on" : ""), l, () => { dcat = k; render(true); })));
    fp.appendChild(cc);
    fp.appendChild(statChips(all, dstat, k => { dstat = k; render(true); }));
    fp.appendChild(searchBox(dq, "dq", v => { dq = v; }));
  }
  f.appendChild(fp); box.appendChild(f);
  if (dseg === "sms") return renderSms(box, sms);
  const fs = fuStrip(x => x.seg !== "rem" && inScope(dsc, x.c, x.s)); if (fs) box.appendChild(fs);
  const list = all.filter(x => (dcat === "all" || x.cats.includes(dcat)) && statOk(x, dstat) && (!dq || x.nm.toLowerCase().includes(dq)));
  const ex = el("div","row"); ex.style.margin = "4px 2px 0";
  ex.appendChild(el("span","small muted", scopeLabel(dsc) + " · " + list.length + " child" + (list.length === 1 ? "" : "ren")));
  ex.appendChild(el("span","sp"));
  ex.appendChild(btn("btn ghost sm", "Copy for Excel", () => copyText(remarksTSV(list), list.length + " rows copied. Paste into Excel.")));
  box.appendChild(ex);
  if (!list.length) { box.appendChild(emptyCard("No defaulters", "Nothing for " + scopeLabel(dsc) + (dperd === "day" ? " on " + nice(date) : " in the last 7 days") + ".")); return; }
  listCards(box, list, dperd);
}
function logText(it, t){ return it.log.filter(e => entryType(e) === t).map(e => (t === "fu" ? fmtT(e.due) + (e.a ? " " + e.a : "") + (e.done ? " (done)" : "") : e.a) + " — " + (e.who || "") + " " + fmtT(e.at)).join("; "); }
function remarksTSV(list){
  const clean = v => String(v == null ? "" : v).replace(/[\t\r\n]+/g, " ");
  const rows = [["Date","Class","Section","Roll","Name","Topic","Remark","Remark time","Status","Noted","Action","Remarks (PL/FO)","Follow-up"]];
  list.forEach(it => rows.push([dmy(it.dt), it.c, it.s, it.i + 1, it.nm, it.seg === "rem" ? TOPIC[it.topic].l : it.iss.map(x => LABEL[x.cat]).join(", "), it.seg === "rem" ? it.iss[0].text : "", fmtT(it.iss[0].at), ST_LABEL[it.st.k][0], logText(it, "ack"), logText(it, "act"), logText(it, "note"), logText(it, "fu")]));
  return rows.map(r => r.map(clean).join("\t")).join("\n");
}
function renderFUs(box, seg, sc){
  const l = allFollowUps().filter(f => (seg === "rem" ? f.seg === "rem" : f.seg !== "rem") && inScope(sc, f.c, f.s)), now = Date.now();
  const groups = [["Overdue", l.filter(f => !f.e.done && f.e.due <= now)], ["Coming up", l.filter(f => !f.e.done && f.e.due > now)], ["Done", l.filter(f => f.e.done).sort((a,b) => b.e.done - a.e.done).slice(0, 30)]];
  if (!l.length) { box.appendChild(emptyCard("No follow-ups", "Set one from any card with the Follow-up button.")); return; }
  groups.forEach(([t, g]) => {
    if (!g.length) return;
    box.appendChild(el("div","dgrp", t + " · " + g.length));
    g.forEach(f => { const it = makeItem(f.dt, f.c, f.s, f.i, f.seg); if (it) box.appendChild(itemCard(it, {showDate: true})); });
  });
}
function renderSms(box, all){
  const open = all.filter(x => !x.sent);
  const head = el("div","card"); const hp = el("div","cardh");
  const h2 = el("h2", null, open.length + " SMS to send"); h2.appendChild(el("small", null, (all.length - open.length) + " sent · counted up to " + nice(date) + " · Diary not brought after 2 days, others after 3")); hp.appendChild(h2);
  hp.appendChild(btn("btn ghost sm", "Copy for Excel", () => {
    const rows = [["Class","Section","Roll","Name","Category","Days in a row","SMS","Status","Sent time"].join("\t")];
    all.forEach(it => rows.push([it.c, it.s, it.i + 1, it.nm, LABEL[it.cat], it.n, smsText(firstName(it.nm), it.cat, it.n).replace(/\n/g, " "), it.sent ? "Sent" : "To send", it.sent && it.rec.sentAt ? fmtT(it.rec.sentAt) : ""].join("\t")));
    copyText(rows.join("\n"), all.length + " rows copied");
  }));
  head.appendChild(hp); box.appendChild(head);
  if (!all.length) { const e = el("div","card"); const m = el("div","empty"); m.appendChild(el("b", null, "No SMS due")); m.appendChild(document.createTextNode("No child has been flagged enough days in a row.")); e.appendChild(m); box.appendChild(e); return; }
  let last = "";
  all.sort((a,b) => (a.sent ? 1 : 0) - (b.sent ? 1 : 0) || a.c - b.c || a.s.localeCompare(b.s) || a.i - b.i).forEach(it => {
    const g = it.sent ? "Sent" : "Class " + it.c + " " + it.s; if (g !== last) { box.appendChild(el("div","dgrp", g)); last = g; }
    const card = el("article","rc"); const h = el("div","rc-h");
    h.appendChild(el("span","roll", String(it.i + 1)));
    const n = el("div","rc-n", title(it.nm)); n.appendChild(el("span","cs", it.c + it.s)); h.appendChild(n);
    h.appendChild(el("span","pill " + (it.sent ? "t-ok" : "t-bad"), it.sent ? "Sent" : "To send"));
    card.appendChild(h);
    const m = el("div","rc-m"); m.appendChild(el("span","tag t-" + CAT[it.cat].tone, LABEL[it.cat])); m.appendChild(el("span", null, it.n + " days in a row")); card.appendChild(m);
    const msg = smsText(firstName(it.nm), it.cat, it.n);
    card.appendChild(el("div","sms-q", msg));
    if (it.sent) card.appendChild(el("div","rc-m", "Sent " + (it.rec.sentAt ? fmtT(it.rec.sentAt) : dmy(it.rec.sentOn)) + (it.rec.by ? " by " + it.rec.by : "") + (it.rec.remark ? " · " + it.rec.remark : "")));
    const a = el("div","sms-a");
    const inp = el("input"); inp.placeholder = "Remark (optional)"; inp.setAttribute("aria-label","Remark for SMS to " + it.nm);
    if (!it.sent && canAdmin()) a.appendChild(inp);
    a.appendChild(btn("btn ghost sm", "Copy SMS", () => copyText(msg, "SMS copied")));
    if (canAdmin()) a.appendChild(btn("btn sm" + (it.sent ? " ghost" : ""), it.sent ? "Undo" : "Mark sent", () => markSms(it, !it.sent, inp.value.trim())));
    card.appendChild(a); box.appendChild(card);
  });
}

/* ================= Dashboard: one-click reports ================= */
let dper = "day", drep = null; const bsc = mkScope();
function dashRange(){ return dper === "day" ? [date, date] : dper === "week" ? [shiftDate(date, -6), date] : [shiftDate(date, -29), date]; }
function eachKid(from, to, fn){
  let dt = to, g = 0;
  while (dt >= from && g++ < 40) { for (let c = 1; c <= 11; c++) { if (!docs[docId(c, dt)]) continue; sections(c).forEach(s => inScope(bsc, c, s) && (ROSTER[c][s] || []).forEach((nm, i) => fn(dt, c, s, i, nm, mark(c, s, i, dt)))); } dt = shiftDate(dt, -1); }
}
function buildReports(){
  const [from, to] = dashRange(), R = [];
  const add = (grp, k, l, tone, rows, note) => R.push({grp, k, l, tone, rows, note});
  CATS.forEach(cat => { const rows = []; eachKid(from, to, (dt, c, s, i, nm, m) => { if (cat.test(m)) rows.push({dt, c, s, i, nm, d: cat.l}); }); add("Attendance & diary", cat.k, cat.l, cat.tone, rows); });
  const rem = itemsIn("rem", bsc, from, to);
  TOPICS.forEach(t => { const rows = rem.filter(x => x.topic === t.k).map(x => ({dt:x.dt, c:x.c, s:x.s, i:x.i, nm:x.nm, d:x.iss[0].text, st:ST_LABEL[x.st.k][0]})); if (rows.length || t.k !== "other") add("Parent remarks by topic", "t-" + t.k, t.l, t.tone, rows); });
  const mk = (k) => rem.filter(x => x.st.k === k).map(x => ({dt:x.dt, c:x.c, s:x.s, i:x.i, nm:x.nm, d:x.iss[0].text, st:ST_LABEL[x.st.k][0]}));
  add("Follow-through", "pend", "Remarks pending", "warn", mk("pend"), "No one has noted or acted yet");
  add("Follow-through", "noted", "Noted only", "navy", mk("noted"));
  add("Follow-through", "act", "Actioned", "ok", mk("act"));
  add("Follow-through", "fup", "Followed up", "sky", mk("fup"));
  const sm = smsDue().filter(x => !x.sent && inScope(bsc, x.c, x.s)).map(x => ({dt:date, c:x.c, s:x.s, i:x.i, nm:x.nm, d:LABEL[x.cat] + " · " + x.n + " days", st:"To send"}));
  add("Follow-through", "sms", "SMS to send", "bad", sm);
  const nsub = []; for (let c = 1; c <= 11; c++) sections(c).forEach(s => { if (inScope(bsc, c, s) && (ROSTER[c][s] || []).length && !subOf(c, s, date)) nsub.push({dt:date, c, s, i:-1, nm:"Class " + c + " " + s, d: secDone(c, s, date) ? "Marked, not submitted" : "Not marked"}); });
  add("Follow-through", "nsub", "Sections not submitted", "mute", nsub, "For " + nice(date));
  return R;
}
/* ---------- student lookup: one child's last 7 / 30 days for talking to the parent ---------- */
let kq = "", kid = null, kper = 30;
function kidMatches(q){
  const out = []; if (q.length < 2) return out;
  for (const c of myClasses()) sections(c).forEach(s => (ROSTER[c][s] || []).forEach((n, i) => { if (n.toLowerCase().includes(q)) out.push({c, s, i, n}); }));
  return out.slice(0, 30);
}
const CELL = {
  a: v => v === 2 ? ["P","ok"] : v === 1 ? ["A","bad"] : v === 3 ? ["NB","warn"] : ["–",""],
  d: v => v === 2 ? ["OK","ok"] : v === 1 ? ["Not done","warn"] : ["–",""],
  g: v => v === 1 ? ["✓","ok"] : v === 2 ? ["✗","bad"] : ["–",""]
};
function kidProfile(k){
  const card = el("div","card"); const nm = (ROSTER[k.c][k.s] || [])[k.i] || "";
  const h = el("div","cardh"); const h2 = el("h2", null, title(nm)); h2.appendChild(el("small", null, "Class " + k.c + " " + k.s + " · Roll " + (k.i + 1))); h.appendChild(h2);
  h.appendChild(btn("btn ghost sm", "Close", () => { kid = null; render(true); })); card.appendChild(h);
  const pad = el("div","pad");
  const per = el("div","seg"); [[7,"Last 7 days"],[30,"Last 30 days"]].forEach(([n,l]) => per.appendChild(btn(kper === n ? "on" : "", l, () => { kper = n; render(true); }))); pad.appendChild(per);
  const days = []; for (let b = 0; b < kper; b++) { const dt = shiftDate(date, -b); if (docs[docId(k.c, dt)] && secDone(k.c, k.s, dt)) days.push(dt); }
  const cnt = {}; CATS.forEach(x => cnt[x.k] = 0);
  days.forEach(dt => { const m = mark(k.c, k.s, k.i, dt); CATS.forEach(x => { if (x.test(m)) cnt[x.k]++; }); });
  const tl = el("div","tiles"); tl.style.marginTop = "12px";
  const t0 = el("div","tile"); t0.appendChild(el("b", null, String(days.length))); t0.appendChild(el("span", null, "Days marked")); tl.appendChild(t0);
  CATS.forEach(x => { const t = el("div","tile" + (cnt[x.k] ? "" : " zero")); t.style.setProperty("--c", "var(--" + ({bad:"bad",warn:"warn",plum:"plum",sky:"sky"}[x.tone] || "navy") + ")"); t.appendChild(el("b", null, String(cnt[x.k]))); t.appendChild(el("span", null, x.l)); t.appendChild(el("small", null, cnt[x.k] === 1 ? "1 day" : cnt[x.k] + " days")); tl.appendChild(t); });
  pad.appendChild(tl);
  // remarks
  const rems = []; for (let b = 0; b < kper; b++) { const dt = shiftDate(date, -b); const it = makeItem(dt, k.c, k.s, k.i, "rem"); if (it) rems.push(it); }
  pad.appendChild(el("div","eyebrow", "Parent remarks · " + rems.length));
  if (!rems.length) pad.appendChild(el("div","small muted", "No parent remarks in this period."));
  rems.forEach(it => {
    const r = el("div"); r.style.padding = "9px 0"; r.style.borderBottom = "1px solid var(--line2)";
    const top = el("div","row"); top.appendChild(el("b", null, nice(it.dt))); top.appendChild(el("span","tag t-" + TOPIC[it.topic].tone, TOPIC[it.topic].l)); top.appendChild(el("span","sp")); top.appendChild(el("span","pill " + ST_LABEL[it.st.k][1], ST_LABEL[it.st.k][0])); r.appendChild(top);
    r.appendChild(el("div", null, it.iss[0].text)).style.marginTop = "4px";
    const acts2 = it.log.slice().sort((a,b) => a.at - b.at).map(e => { const t = entryType(e); return (roleOf(e).toUpperCase()) + " " + (t === "ack" ? "Noted" : t === "fu" ? "Follow-up" + (e.a ? ": " + e.a : "") : e.a) + " (" + hm(e.at) + ")"; });
    if (acts2.length) r.appendChild(el("div","small muted", acts2.join(" · "))).style.marginTop = "3px";
    pad.appendChild(r);
  });
  // day by day
  pad.appendChild(el("div","eyebrow", "Diary status day by day"));
  if (!days.length) pad.appendChild(el("div","small muted", "No marked days in this period."));
  else {
    const tw = el("div","tw"); tw.style.border = "1px solid var(--line)"; tw.style.borderRadius = "12px"; const tb = el("table");
    const hr = el("tr"); ["Date","Attend","Diary","Sign","English","Behav","TV","Study","Play"].forEach(x => hr.appendChild(el("th", null, x))); tb.appendChild(hr);
    days.forEach(dt => { const m = mark(k.c, k.s, k.i, dt); const tr = el("tr"); tr.appendChild(el("td","nw", nice(dt).replace(/^\w+, /, "")));
      [CELL.a(m.a), CELL.d(m.d), CELL.g(m.s), CELL.g(m.e), CELL.g(m.b), CELL.g(m.v), CELL.g(m.y), CELL.g(m.p)].forEach(([v, tone], j) => { const td = el("td","nw"); const off = j > 0 && m.a === 1; const sp = el("span", tone && !off ? "tag t-" + tone : "muted", off ? "–" : v); td.appendChild(sp); tr.appendChild(td); });
      tb.appendChild(tr); });
    tw.appendChild(tb); pad.appendChild(tw);
  }
  const cp = el("div","row"); cp.style.marginTop = "12px";
  cp.appendChild(btn("btn sm", "Copy summary for WhatsApp", () => {
    const L = ["*" + title(nm) + "* – Class " + k.c + " " + k.s + " (Roll " + (k.i + 1) + ")", "Last " + kper + " days · " + days.length + " days marked", ""];
    CATS.forEach(x => { if (cnt[x.k]) L.push("• " + x.l + ": " + cnt[x.k] + (cnt[x.k] === 1 ? " day" : " days")); });
    if (!CATS.some(x => cnt[x.k])) L.push("• No defaults recorded");
    if (rems.length) { L.push(""); L.push("*Parent remarks*"); rems.forEach(it => L.push(dmy(it.dt) + " – " + it.iss[0].text.replace(/\s+/g, " ") + " _(" + ST_LABEL[it.st.k][0] + ")_")); }
    copyText(L.join("\n"), "Summary copied");
  }));
  pad.appendChild(cp);
  card.appendChild(pad); return card;
}
function lookupCard(){
  const card = el("div","card"); const pad = el("div","selector");
  const q = el("input","search"); q.type = "search"; q.id = "kq"; q.placeholder = "Find a student by name (whole school)"; q.value = kq;
  q.oninput = () => { kq = q.value.trim().toLowerCase(); kid = null; render(true); setTimeout(() => { const x = $("kq"); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }, 0); };
  pad.appendChild(q);
  if (kq.length >= 2 && !kid) {
    const ms = kidMatches(kq), names = el("div","names");
    if (!ms.length) pad.appendChild(el("div","small muted", "No student found."));
    ms.forEach(x => { const b = btn("nm t-navy", "", () => { kid = {c:x.c, s:x.s, i:x.i}; render(true); }); b.appendChild(el("small", null, x.c + x.s)); b.appendChild(document.createTextNode(title(x.n))); names.appendChild(b); });
    pad.appendChild(names);
  }
  card.appendChild(pad);
  return card;
}
function renderDash(){
  const box = $("vDash"); box.textContent = "";
  box.appendChild(lookupCard());
  if (kid) { box.appendChild(kidProfile(kid)); return; }
  const per = el("div","seg period");
  [["day", nice(date)],["week","Last 7 days"],["month","Last 30 days"]].forEach(([k,l]) => per.appendChild(btn(dper === k ? "on" : "", l, () => { dper = k; render(); })));
  box.appendChild(per);
  const sp = el("div","card"); const spi = el("div","selector"); spi.appendChild(scopePicker(bsc)); sp.appendChild(spi); box.appendChild(sp);
  box.appendChild(el("div","dgrp", scopeLabel(bsc)));
  const R = buildReports();
  let grp = "";
  let tiles = null;
  R.forEach(r => {
    if (r.grp !== grp) { box.appendChild(el("div","eyebrow", r.grp)); tiles = el("div","tiles"); box.appendChild(tiles); grp = r.grp; }
    const kids = new Set(r.rows.map(x => x.c + x.s + x.i)).size;
    const t = btn("tile" + (drep === r.k ? " on" : "") + (r.rows.length ? "" : " zero"), "", () => { drep = drep === r.k ? null : r.k; render(); setTimeout(() => { const x = $("rep"); if (x) x.scrollIntoView({behavior:"smooth", block:"start"}); }, 30); }, r.l);
    t.style.setProperty("--c", getComputedStyle(document.documentElement).getPropertyValue("--" + ({bad:"bad",warn:"warn",plum:"plum",sky:"sky",ok:"ok",navy:"navy",mute:"faint"}[r.tone] || "navy")));
    t.appendChild(el("b", null, String(r.rows.length))); t.appendChild(el("span", null, r.l));
    t.appendChild(el("small", null, r.note || (!r.rows.length ? "None" : dper === "day" || r.k === "nsub" ? "Tap to open" : kids + " child" + (kids === 1 ? "" : "ren"))));
    tiles.appendChild(t);
    if (drep === r.k) tiles.after(reportPanel(r));
  });
}
function reportPanel(r){
  const card = el("div","card rep"); card.id = "rep";
  const [from, to] = dashRange();
  const h = el("div","cardh"); const h2 = el("h2", null, r.l); h2.appendChild(el("small", null, (from === to ? nice(to) : nice(from) + " – " + nice(to)) + " · " + r.rows.length + " entr" + (r.rows.length === 1 ? "y" : "ies"))); h.appendChild(h2);
  h.appendChild(btn("btn ghost sm", "Close", () => { drep = null; render(); }));
  card.appendChild(h);
  const rows = r.rows.slice().sort((a,b) => (a.dt < b.dt ? 1 : a.dt > b.dt ? -1 : 0) || a.c - b.c || a.s.localeCompare(b.s) || a.i - b.i);
  const act = el("div","row"); act.style.padding = "10px 14px"; act.style.borderBottom = "1px solid var(--line2)";
  act.appendChild(btn("btn sm", "Copy for WhatsApp", () => {
    const L = ["*" + r.l + "* – " + (from === to ? dmy(to) : dmy(from) + " to " + dmy(to)), ""]; let g = "";
    rows.forEach((x, n) => { const gg = (from === to ? "" : dmy(x.dt) + " · ") + "Class " + x.c + " " + x.s; if (gg !== g) { if (g) L.push(""); L.push("*" + gg + "*"); g = gg; } L.push((x.i >= 0 ? (x.i + 1) + ". " + title(x.nm) : x.nm) + (r.grp === "Attendance & diary" ? "" : " – " + String(x.d).replace(/\s+/g, " ")) + (x.st ? " _(" + x.st + ")_" : "")); });
    copyText(L.join("\n"), "Report copied for WhatsApp");
  }));
  act.appendChild(btn("btn ghost sm", "Copy for Excel", () => {
    const clean = v => String(v == null ? "" : v).replace(/[\t\r\n]+/g, " ");
    const L = [["Date","Class","Section","Roll","Name","Detail","Status"].join("\t")].concat(rows.map(x => [dmy(x.dt), x.c, x.s, x.i >= 0 ? x.i + 1 : "", x.nm, x.d, x.st || ""].map(clean).join("\t")));
    copyText(L.join("\n"), rows.length + " rows copied");
  }));
  card.appendChild(act);
  if (!rows.length) { card.appendChild(el("div","empty","Nothing in this period.")); return card; }
  const tw = el("div","tw"), tb = el("table");
  const hr = el("tr"); ["Date","Class","Name","Detail"].concat(r.rows.some(x => x.st) ? ["Status"] : []).forEach(x => hr.appendChild(el("th", null, x))); tb.appendChild(hr);
  rows.forEach(x => {
    const tr = el("tr");
    tr.appendChild(el("td","nw", nice(x.dt).replace(/^\w+, /, "")));
    tr.appendChild(el("td","nw", x.c + x.s));
    const n = el("td"); n.appendChild(el("b", null, x.i >= 0 ? title(x.nm) : x.nm)); if (x.i >= 0) n.appendChild(el("span","s", "Roll " + (x.i + 1))); tr.appendChild(n);
    tr.appendChild(el("td", null, x.d));
    if (r.rows.some(y => y.st)) tr.appendChild(el("td","nw", x.st || ""));
    tb.appendChild(tr);
  });
  tw.appendChild(tb); card.appendChild(tw);
  return card;
}
</script>
