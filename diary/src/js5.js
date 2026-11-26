<script>
/* ================= Settings (FO) ================= */
function renderSet(){
  const box = $("vSet"); const a0 = document.activeElement; if (a0 && (a0.tagName === "SELECT" || a0.tagName === "INPUT") && box.contains(a0)) return; box.textContent = "";
  box.appendChild(rosterCard());
  if (rosterReady()) box.appendChild(moveCard());
  const pend = users.filter(u => u.status === "pending"), act = users.filter(u => u.status !== "pending");
  const roleSel = cur => { const s = el("select"); ALL_ROLES.forEach(r => { const o = el("option", null, ROLE_LABEL[r]); o.value = r; if (r === cur) o.selected = true; s.appendChild(o); }); return s; };
  const row = u => {
    const c = el("div","urow"); const n = el("div","un", u.name);
    n.appendChild(el("small", null, ROLE_LABEL[u.role] + " · " + (u.status === "active" ? "active" : u.status === "reset" ? "password reset, waiting for a new password" : "waiting for approval")));
    c.appendChild(n);
    if (u.status === "pending") {
      const s = roleSel(u.role);
      c.appendChild(s); c.appendChild(btn("btn sm", "Approve", async ev => { ev.target.disabled = true; try { applyState(await api("approve", [token, u.name, s.value])); toast("Approved " + u.name); } catch(e){ toast(e.message); ev.target.disabled = false; } }));
    } else if (u.name !== me.name) {
      const s = roleSel(u.role);
      s.onchange = async () => { try { applyState(await api("approve", [token, u.name, s.value])); toast("Role changed"); } catch(e){ toast(e.message); } };
      let ar = false, am = false;
      const rs = btn("btn ghost sm", "Reset password", async () => { if (!ar) { ar = true; rs.textContent = "Tap again"; return; } try { applyState(await api("resetUser", [token, u.name])); toast("Reset. " + u.name + " sets a new password."); } catch(e){ toast(e.message); } });
      const rm = btn("btn ghost sm", "Remove", async () => { if (!am) { am = true; rm.textContent = "Tap again"; return; } try { applyState(await api("removeUser", [token, u.name])); toast("Removed"); } catch(e){ toast(e.message); } });
      c.appendChild(s); c.appendChild(rs); c.appendChild(rm);
    }
    return c;
  };
  const card = (t, sub, list) => { const k = el("div","card"); const h = el("div","cardh"); const h2 = el("h2", null, t); if (sub) h2.appendChild(el("small", null, sub)); h.appendChild(h2); k.appendChild(h); list.forEach(u => k.appendChild(row(u))); if (!list.length) k.appendChild(el("div","empty","No one here.")); return k; };
  if (pend.length) box.appendChild(card("Waiting for approval", pend.length + " request" + (pend.length === 1 ? "" : "s"), pend));
  box.appendChild(card("Staff logins", "Everyone marks the diary for their classes · PL, PM and FO act on remarks · FO also sends SMS and manages Settings", act));
}
function parseRoster(text){
  const out = {}; let n = 0, bad = 0;
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const cells = []; line.replace(/("([^"]*)"|[^,\t]*)(,|\t|$)/g, (m, a, q) => { cells.push((q != null ? q : a).trim()); return ""; });
    const cm = /(\d{1,2})/.exec(cells[0] || ""), sc = /^[A-Za-z]$/.test(cells[1] || "") ? cells[1].toUpperCase() : "", nm = (cells[2] || "").trim();
    if (!cm || !sc || !nm) { if (i > 0) bad++; return; }
    const c = +cm[1]; if (c < 1 || c > 11) { bad++; return; }
    ((out[c] = out[c] || {})[sc] = out[c][sc] || []).push(nm); n++;
  });
  return {out, n, bad};
}
function rosterCard(){
  const k = el("div","card"); const h = el("div","cardh");
  const total = Object.keys(ROSTER).reduce((a, x) => a + Object.values(ROSTER[x]).reduce((b, l) => b + l.length, 0), 0);
  const h2 = el("h2", null, "Class lists"); h2.appendChild(el("small", null, total ? total + " students loaded" : "Not loaded yet")); h.appendChild(h2); k.appendChild(h);
  const p = el("div","pad");
  p.appendChild(el("div","small muted", "Upload a CSV with columns Class, Section, Name. It replaces only the classes it contains."));
  const inp = el("input"); inp.type = "file"; inp.accept = ".csv,.txt,text/csv"; inp.style.margin = "10px 0"; inp.setAttribute("aria-label","Class list CSV file");
  const msg = el("div","small muted"); const go = btn("btn", "Upload class lists"); go.disabled = true; let parsed = null;
  inp.onchange = async () => { parsed = null; go.disabled = true; const f = inp.files && inp.files[0]; if (!f) return; const r = parseRoster(await f.text());
    if (!r.n) { msg.textContent = "No students found. Columns must be Class, Section, Name."; return; }
    parsed = r; const secs = Object.values(r.out).reduce((a, o) => a + Object.keys(o).length, 0);
    msg.textContent = r.n + " students in " + secs + " sections of " + Object.keys(r.out).length + " classes" + (r.bad ? " (" + r.bad + " rows skipped)" : "") + ". Check, then tap Upload."; go.disabled = false; };
  go.onclick = async () => { if (!parsed) return; go.disabled = true; try { applyState(await api("saveRoster", [token, parsed.out])); toast("Class lists saved"); } catch(e){ toast(e.message); go.disabled = false; } };
  p.appendChild(inp); p.appendChild(msg); const r = el("div","row"); r.style.marginTop = "10px"; r.appendChild(go); p.appendChild(r);
  k.appendChild(p); return k;
}
function moveCard(){
  const k = el("div","card"); const h = el("div","cardh"); const h2 = el("h2", null, "Move a student to another section");
  h2.appendChild(el("small", null, "Past marks, actions and SMS records move with the child")); h.appendChild(h2); k.appendChild(h);
  const p = el("div","pad"); const r = el("div","row");
  const sC = el("select","inp"), sF = el("select","inp"), sN = el("select","inp"), sT = el("select","inp");
  [sC, sF, sT].forEach(x => x.style.width = "auto"); sN.style.flex = "1 1 200px";
  for (let c = 1; c <= 11; c++) { const o = el("option", null, "Class " + c); o.value = c; sC.appendChild(o); }
  const fill = (sel, items) => { sel.textContent = ""; items.forEach(([v, l]) => { const o = el("option", null, l); o.value = v; sel.appendChild(o); }); };
  const upd = lvl => { const c = +sC.value, secs = sections(c);
    if (lvl < 1) fill(sF, secs.map(x => [x, "From " + c + x]));
    if (lvl < 2) fill(sN, (ROSTER[c][sF.value] || []).map((n, i) => [n, (i + 1) + ". " + n]));
    fill(sT, secs.filter(x => x !== sF.value).map(x => [x, "To " + c + x])); };
  sC.onchange = () => upd(0); sF.onchange = () => upd(1); upd(0);
  [sC, sF, sN, sT].forEach(x => r.appendChild(x)); p.appendChild(r);
  const go = btn("btn", "Move student", async () => { if (!sN.value || !sT.value) return; go.disabled = true;
    try { const st = await api("moveStudent", [token, +sC.value, sF.value, sN.value, sT.value]); docs = {}; applyState(st); toast(st.msg || "Moved"); } catch(e){ toast(e.message); } finally { go.disabled = false; } });
  const r2 = el("div","row"); r2.style.marginTop = "10px"; r2.appendChild(go); p.appendChild(r2);
  k.appendChild(p); return k;
}

/* ================= auth ================= */
function renderAuth(){
  const setup = authMode === "setup";
  const wrap = el("div","card auth"); wrap.id = "loginCard";
  const hero = el("div","hero"); hero.appendChild(el("h2", null, setup ? "First-time setup" : "Welcome"));
  hero.appendChild(el("p", null, setup ? "Type your name, choose your role and set your own password. FO approves your login once." : "Log in to mark diaries, act on remarks or open the FO desk.")); wrap.appendChild(hero);
  const f = el("form","pad"); f.id = "loginForm"; f.noValidate = true;
  const fld = (lab, inp) => { const d = el("div","field"); const l = el("label", null, lab); l.htmlFor = inp.id; d.appendChild(l); d.appendChild(inp); return d; };
  const name = el("input"); name.type = "text"; name.id = "lgName"; name.maxLength = 40; name.autocomplete = "username"; name.placeholder = "e.g. Anita Sharma";
  const role = el("select"); role.id = "lgRole"; SIGNUP_ROLES.forEach(r => { const o = el("option", null, ROLE_LABEL[r]); o.value = r; role.appendChild(o); });
  const pw = el("input"); pw.type = "password"; pw.id = "lgPw"; pw.autocomplete = setup ? "new-password" : "current-password"; pw.placeholder = setup ? "Set a password (6+ characters)" : "Password";
  f.appendChild(fld("Your name", name)); if (setup) f.appendChild(fld("I am", role)); f.appendChild(fld("Password", pw));
  const go = el("button","btn", setup ? "Create login" : "Log in"); go.type = "submit"; go.style.width = "100%"; go.style.padding = "13px";
  f.appendChild(go);
  const sw = btn("lnk", setup ? "I already have a password" : "First time? Set your password", () => { authMode = setup ? "login" : "setup"; banner(""); renderAuth(); });
  const sr = el("div","row"); sr.style.justifyContent = "center"; sr.style.marginTop = "12px"; sr.appendChild(sw); f.appendChild(sr);
  f.onsubmit = async e => {
    e.preventDefault();
    const nm = name.value.trim(); if (!nm) { banner("Type your name."); return; } if (!pw.value) { banner("Enter your password."); return; }
    go.disabled = true; banner("");
    try {
      if (setup) { const r = await api("setup", [nm, pw.value, role.value]);
        if (r.token) { setToken(r.token); applyState(r.state); }
        else { authMode = "login"; renderAuth(); banner("Password set for " + nm + ". FO needs to approve your login once. After that, log in with this password.", true); } }
      else { const r2 = await api("login", [nm, pw.value]); setToken(r2.token); applyState(r2.state); }
    } catch(err){ banner(err.message); }
    go.disabled = false;
  };
  wrap.appendChild(f);
  $("auth").textContent = ""; $("auth").appendChild(wrap);
}

/* ================= views & routing ================= */
const VIEWS = {cm:"vCM", rem:"vRem", def:"vDef", dash:"vDash", set:"vSet"};
function allowedView(v){ return v === "cm" ? canMark() : v === "set" ? canAdmin() : !!me; }
function typingIn(box){ const a = document.activeElement; return a && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && a.type !== "search" && a.type !== "date" && a.type !== "time")) && box.contains(a); }
function render(force){
  const authed = !!me;
  $("auth").hidden = authed || !ready; $("app").hidden = !authed; $("nav").hidden = !authed;
  if (!authed) { if (ready && !$("loginCard")) renderAuth(); $("dock").hidden = true; document.body.classList.remove("dock-on"); return; }
  if ($("loginCard")) { $("auth").textContent = ""; banner(""); }
  if (!allowedView(view)) { setView(canMark() ? "cm" : "rem"); return; }
  const w = $("who"); w.textContent = "";
  w.appendChild(el("span","rolepill", ROLE_SHORT[me.role])); const nb = el("span"); nb.appendChild(el("b", null, me.name)); w.appendChild(nb);
  w.appendChild(el("span","sp"));
  w.appendChild(btn("lnk", "Log out", () => { setToken(""); me = null; docs = {}; acts = {}; smsRec = {}; ready = true; authMode = "login"; render(); }));
  if (!rosterReady()) banner(canAdmin() ? "Class lists are not loaded yet. Open Settings and upload them." : "Class lists are not loaded yet. Ask FO to upload them.", true);
  else if (/Class lists are not loaded/.test($("banner").textContent)) banner("");
  $("nav").querySelectorAll("button").forEach(b => { b.hidden = !allowedView(b.dataset.v); b.classList.toggle("on", b.dataset.v === view); });
  Object.keys(VIEWS).forEach(v => { $(VIEWS[v]).hidden = v !== view; });
  const box = $(VIEWS[view]);
  if (!(force !== true && view !== "cm" && typingIn(box))) {
    const y = window.scrollY;
    if (view === "cm") renderCM(); else if (view === "rem") renderRem(); else if (view === "def") renderDef(); else if (view === "dash") renderDash(); else renderSet();
    if (view !== "cm" || force !== "nav") window.scrollTo(0, y);
  }
  renderDock(); badges();
}
function badges(){
  const set = (v, n) => { const b = document.querySelector('#nav [data-v="' + v + '"]'); if (!b) return; let e = b.querySelector("em"); if (!n) { if (e) e.remove(); return; } if (!e) { e = el("em"); b.appendChild(e); } e.textContent = String(n); };
  set("rem", dayItems(date, 0, "all", "rem").filter(x => x.st.k === "pend" && myCls(x.c)).length);
  set("def", dayItems(date, 0, "all", "def").filter(x => x.st.k === "pend" && myCls(x.c)).length + (canAdmin() ? smsDue().filter(x => !x.sent).length : 0));
}
function setView(v){
  view = v; history.replaceState(null, "", "#" + v);
  render("nav"); window.scrollTo(0, 0);
}
$("nav").querySelectorAll("button").forEach(b => { b.onclick = () => setView(b.dataset.v); });
$("date").value = date; $("date").max = todayStr();
$("date").onchange = e => { if (!e.target.value) return; date = e.target.value; render(true); refresh(); };
function route(){
  const h = location.hash.replace("#","");
  const map = {cm:"cm", marking:"cm", rem:"rem", remarks:"rem", pl:"rem", "class":"rem", def:"def", defaulters:"def", fo:"def", central:"rem", sms:"def", dash:"dash", dashboard:"dash", set:"set", staff:"set", settings:"set"};
  const m = /^class-(\d{1,2})$/.exec(h); if (m) { rsc.cls = new Set([Math.min(11, Math.max(1, +m[1]))]); view = "rem"; }
  else view = map[h] || "cm";
  if (h === "sms") dseg = "sms";
  Object.keys(VIEWS).forEach(v => { $(VIEWS[v]).hidden = v !== view; });
}
window.addEventListener("hashchange", () => { route(); render(true); });
route();
if (token) refresh(); else { ready = true; render(); }
setInterval(() => {
  if (document.visibilityState !== "visible" || !me) return;
  retryDirty();
  const a = document.activeElement, typing = a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA");
  if (!typing) refresh();
}, 20000);
/* time-sensitive: keep "due in / overdue" fresh every 30 seconds */
setInterval(() => { if (document.visibilityState === "visible" && me && view !== "cm") { const a = document.activeElement; if (!(a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA"))) render(); } }, 30000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && me) { retryDirty(); refresh(); } });

/* ---------- auto-update: if a newer page is published, reload into it ---------- */
const BUILD = "__BUILD__";
(function(){
  const run = () => fetch(location.pathname + "?v=" + Date.now(), {cache:"no-store"}).then(r => r.text()).then(t => {
    const m = t.match(/const BUILD = "(\d+)"/);
    if (m && m[1] !== BUILD) location.replace(location.pathname + "?v=" + m[1] + location.hash);
  }).catch(() => {});
  run(); document.addEventListener("visibilitychange", () => { if (!document.hidden) run(); });
})();
</script>
</body>
</html>
