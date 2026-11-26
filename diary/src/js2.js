<script>
/* ================= CM · marking ================= */
function classChips(cur, onPick, dotFn){
  const box = el("div","chips"); box.setAttribute("role","group"); box.setAttribute("aria-label","Class");
  myClasses().forEach(c => {
    const b = btn("chip" + (c === cur ? " on" : ""), String(c), () => onPick(c), "Class " + c);
    b.setAttribute("aria-pressed", String(c === cur));
    if (dotFn && dotFn(c)) b.appendChild(el("i"));
    box.appendChild(b);
  });
  return box;
}
function secSeg(c, cur, onPick, labelFn){
  const seg = el("div","seg"); seg.setAttribute("role","tablist");
  sections(c).forEach(s => {
    const b = btn(s === cur ? "on" : "", c + " " + s, () => onPick(s)); b.setAttribute("role","tab"); b.setAttribute("aria-selected", String(s === cur));
    const extra = labelFn && labelFn(s); if (extra) b.appendChild(el("em", null, extra));
    seg.appendChild(b);
  });
  return seg;
}
function summaryGroups(c, s){
  const names = ROSTER[c][s] || [], out = [];
  CATS.forEach(cat => {
    const l = []; names.forEach((n,i) => { if (cat.test(mark(c,s,i))) l.push({i, n}); });
    if (l.length) out.push({k:cat.k, l:cat.l, tone:cat.tone, list:l});
  });
  const rem = []; names.forEach((n,i) => { const m = mark(c,s,i); if (m.r && m.r.trim()) rem.push({i, n}); });
  if (rem.length) out.push({k:"rem", l:"Parent remarks", tone:"gold", list:rem});
  const un = []; names.forEach((n,i) => { const m = mark(c,s,i); if (!m.a) un.push({i, n}); });
  if (un.length && un.length < names.length) out.push({k:"un", l:"Attendance not marked", tone:"mute", list:un});
  return out;
}
function jumpTo(i){ const r = $("kid-" + i); if (!r) return; r.scrollIntoView({behavior:"smooth", block:"center"}); r.classList.remove("flash"); void r.offsetWidth; r.classList.add("flash"); }

let showUn = false;
function renderCM(){
  const box = $("vCM");
  const ae = document.activeElement;
  if (ae && ae.tagName === "TEXTAREA" && box.contains(ae)) { renderDock(); return; }
  box.textContent = "";
  if (!(ROSTER[cls] && ROSTER[cls][sec])) sec = sections(cls)[0];

  // selector
  const sel = el("div","card"); const sp = el("div","selector");
  sp.appendChild(classChips(cls, c => { cls = c; if (!ROSTER[c][sec]) sec = sections(c)[0]; render(); }, c => { const d = docs[docId(c)]; return d && Object.keys(d.m).length; }));
  sp.appendChild(secSeg(cls, sec, s => { sec = s; render(); }));
  sel.appendChild(sp); box.appendChild(sel);

  // summary
  const k = counts(cls, sec), sb = subOf(cls, sec);
  const sum = el("div","card");
  const h = el("div","cardh"); const h2 = el("h2", null, "Class " + cls + " " + sec);
  h2.appendChild(el("small", null, nice(date) + " · " + (sb ? "Submitted " + hm(sb.at) + (sb.u ? " by " + sb.u : "") : "Not submitted yet")));
  h.appendChild(h2); h.appendChild(el("span","pill " + (sb ? "t-ok" : "t-warn"), sb ? "Submitted" : "Open"));
  sum.appendChild(h);
  const st = el("div","stats");
  [[k.present + "/" + k.total, "Present", ""],[k.absent, "Absent", k.absent ? "bad" : ""],[k.kids, "Defaulters", k.kids ? "warn" : ""],[k.rem, "Remarks", k.rem ? "plum" : ""]].forEach(([v,l,t]) => {
    const d = el("div","stat " + t); d.appendChild(el("b", null, String(v))); d.appendChild(el("span", null, l)); st.appendChild(d);
  });
  sum.appendChild(st);
  const gs = summaryGroups(cls, sec);
  const gw = el("div","groups");
  if (!gs.length) gw.appendChild(el("div","empty", k.present ? "Everyone marked so far is fine." : "Nothing marked yet for this section."));
  gs.forEach(g => {
    const d = el("div","grp"); const gh = el("div","grp-h");
    gh.appendChild(el("span","dot d-" + g.tone)); gh.appendChild(el("span", null, g.l)); gh.appendChild(el("span","n", String(g.list.length)));
    d.appendChild(gh);
    const ns = el("div","names");
    const many = g.k === "un" && g.list.length > 8 && !showUn;
    (many ? g.list.slice(0, 8) : g.list).forEach(x => { const b = btn("nm t-" + (g.tone === "gold" ? "warn" : g.tone), "", () => jumpTo(x.i)); b.appendChild(el("small", null, String(x.i + 1))); b.appendChild(document.createTextNode(x.n)); ns.appendChild(b); });
    if (g.k === "un" && g.list.length > 8) ns.appendChild(btn("lnk", showUn ? "Show fewer" : "+ " + (g.list.length - 8) + " more", () => { showUn = !showUn; render(); }));
    d.appendChild(ns); gw.appendChild(d);
  });
  sum.appendChild(gw);
  if (sections(cls).length > 1) {
    const ss = el("div","secs");
    sections(cls).forEach(s2 => { const kk = counts(cls, s2), done = !!subOf(cls, s2);
      const b = btn("secpill" + (s2 === sec ? " on" : "") + (done ? " done" : ""), cls + s2, () => { sec = s2; render(); });
      b.appendChild(el("span", null, done ? "✓ " + kk.present + "/" + kk.total : kk.present + "/" + kk.total)); ss.appendChild(b); });
    sum.appendChild(ss);
  }
  box.appendChild(sum);

  box.appendChild(el("div","status", "")).id = "cmStatus"; $("cmStatus").textContent = statusText;

  // list
  const names = ROSTER[cls][sec] || [];
  const list = el("div","card");
  if (!names.length) list.appendChild(el("div","empty", rosterReady() ? "No students in this section." : "Class lists are not loaded yet."));
  names.forEach((n, i) => list.appendChild(kidRow(n, i)));
  box.appendChild(list);
  renderDock();
}
function mbtn(label, val, tone, fn, dis, extra){
  const b = btn("mb" + (tone ? " " + tone : "") + (extra ? " " + extra : ""), "", fn, label + ": " + val);
  b.appendChild(el("small", null, label)); b.appendChild(el("span", null, val)); b.disabled = !!dis; return b;
}
function kidRow(n, i){
  const m = mark(cls, sec, i), abs = m.a === 1;
  const row = el("div","kid" + (abs ? " abs" : "")); row.id = "kid-" + i;
  const h = el("div","kid-h");
  h.appendChild(el("span","roll", String(i + 1)));
  const nm = el("div","kid-n", n);
  if (m.t) { const lt = Math.max.apply(null, Object.values(m.t)); nm.appendChild(el("small", null, "Marked " + hm(lt))); }
  h.appendChild(nm);
  const ALLOK = {a:2, d:2, e:1, s:1, b:1, v:1, y:1, p:1};
  const isAll = Object.keys(ALLOK).every(f => m[f] === ALLOK[f]);
  h.appendChild(btn("mini" + (isAll ? " on" : ""), isAll ? "All OK ✓" : "All OK", () => { const p = {}; Object.keys(ALLOK).forEach(f => { p[f] = isAll ? 0 : ALLOK[f]; }); setMark(cls,sec,i,p); render(); }, (isAll ? "Clear all marks for " : "Mark everything OK for ") + n));
  const hasR = !!(m.r && m.r.trim());
  h.appendChild(btn("mini" + (hasR ? " on" : ""), hasR ? "Remark" : "+ Remark", () => { const k = cls + sec + i; if (openRem.has(k)) openRem.delete(k); else openRem.add(k); render(); setTimeout(() => { const t = $("rem-" + k); if (t) t.focus(); }, 30); }, "Parent remark for " + n));
  row.appendChild(h);
  const mk = el("div","mk");
  const av = m.a, nx = {0:2, 2:1, 1:3, 3:0}[av || 0];
  mk.appendChild(mbtn("Attend", av === 2 ? "P" : av === 1 ? "A" : av === 3 ? "NB" : "–", av === 2 ? "ok" : av === 1 ? "bad" : av === 3 ? "warn" : "", () => { setMark(cls,sec,i,{a: nx}); render(); }, false, "att"));
  const tri = (label, f, yes, no, noTone) => {
    const good = f === "d" ? 2 : 1, bad = 3 - good, v = m[f];
    return mbtn(label, v === good ? yes : v === bad ? no : "–", v === good ? "ok" : v === bad ? noTone : "", () => { setMark(cls,sec,i,{[f]: v === good ? bad : v === bad ? 0 : good}); render(); }, abs);
  };
  mk.appendChild(tri("Diary","d","OK","Not done","warn"));
  mk.appendChild(tri("Sign","s","Yes","No","bad"));
  mk.appendChild(tri("English","e","Yes","No","bad"));
  mk.appendChild(tri("Behav","b","Good","Bad","bad"));
  mk.appendChild(tri("TV hr","v","Yes","No","bad"));
  mk.appendChild(tri("Study hr","y","Yes","No","bad"));
  mk.appendChild(tri("Play hr","p","Yes","No","bad"));
  row.appendChild(mk);
  const k = cls + sec + i;
  if (hasR || openRem.has(k)) {
    const nt = el("div","note"); const ta = el("textarea"); ta.id = "rem-" + k;
    ta.placeholder = "Parent's remark from the diary"; ta.value = m.r || ""; ta.setAttribute("aria-label","Parent remark for " + n);
    let t; ta.oninput = () => { clearTimeout(t); t = setTimeout(() => setMark(cls,sec,i,{r: ta.value}), 450); };
    ta.onblur = () => { clearTimeout(t); setMark(cls,sec,i,{r: ta.value}); if (!ta.value.trim()) openRem.delete(k); setTimeout(render, 50); };
    nt.appendChild(ta); row.appendChild(nt);
  }
  return row;
}
function renderDock(){
  const show = view === "cm" && !!me && canMark();
  $("dock").hidden = !show; document.body.classList.toggle("dock-on", show); if (!show) return;
  const sb = subOf(cls, sec);
  $("bSubmit").textContent = sb ? "Submitted ✓" : "Submit " + cls + " " + sec;
}
$("bAll").onclick = () => { (ROSTER[cls][sec] || []).forEach((n,i) => { if (!mark(cls,sec,i).a) setMark(cls,sec,i,{a:2}); }); render(); toast("Unmarked children set to present"); };
$("bSubmit").onclick = () => { const was = !!subOf(cls, sec); submitSec(cls, sec); render(); toast(was ? "Submitted again" : "Class " + cls + " " + sec + " submitted"); };

/* ---------- WhatsApp report ---------- */
function reportFor(c, withNames){
  const lines = [];
  sections(c).forEach(s => {
    const k = counts(c, s), label = "Class " + ORD[c] + " " + s;
    lines.push("*" + label + " - Present - " + k.present + "/" + k.total + "*" + (secDone(c, s) ? "" : " _(not submitted yet)_"));
    const rem = [];
    (ROSTER[c][s] || []).forEach((n,i) => { const m = mark(c,s,i); if (m.r && m.r.trim()) rem.push(firstName(n) + " - " + m.r.trim().replace(/\s+/g," ")); });
    if (rem.length) rem.forEach((t,i) => lines.push((i+1) + ". " + t)); else lines.push("NA");
    const extra = [];
    DCATS.filter(x => !["def","nb"].includes(x.k)).forEach(x => { const n = (ROSTER[c][s] || []).filter((nm,i) => x.test(mark(c,s,i))).length; if (n) extra.push(x.l + ": " + n); });
    if (extra.length) lines.push("_" + extra.join(" | ") + "_");
    lines.push("");
  });
  lines.push("*Diary defaulters -*");
  sections(c).forEach(s => {
    const k = counts(c, s);
    let t = "*" + c + ORD[c].replace(/^\d+/, "") + " " + s + " -* " + k.def;
    if (withNames && k.def){ const nm = []; (ROSTER[c][s] || []).forEach((n,i) => { const m = mark(c,s,i); if (m.a !== 1 && (m.d === 1 || m.a === 3)) nm.push(n); }); t += " (" + nm.join(", ") + ")"; }
    lines.push(t);
  });
  return lines.join("\n");
}
let scope = "class";
function buildReport(){
  const wn = $("sNames").checked, head = "*Diary Remarks*- " + dmy(date) + "\n\n";
  let body; if (scope === "class") body = reportFor(cls, wn); else { const p = []; myClasses().forEach(c => p.push(reportFor(c, wn))); body = p.join("\n\n"); }
  $("sText").value = head + body;
}
$("bReport").onclick = () => { buildReport(); $("sheet").hidden = false; };
$("sClose").onclick = () => { $("sheet").hidden = true; };
$("sheet").onclick = e => { if (e.target === $("sheet")) $("sheet").hidden = true; };
$("sNames").onchange = buildReport;
$("sScope").querySelectorAll("button").forEach(b => { b.onclick = () => { scope = b.dataset.s; $("sScope").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); buildReport(); }; });
$("sCopy").onclick = () => copyText($("sText").value, "Report copied");
document.addEventListener("keydown", e => { if (e.key === "Escape") $("sheet").hidden = true; });
</script>
