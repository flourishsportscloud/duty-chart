# PM Plan – Live — setup

PM Plan (Classes 1–5) has its own Google Sheet **PM Plan Data** (account flourishcloud1@gmail.com) with the Apps Script web app **PM Plan Live API** (`pm/Code.gs`), deployed 5 Nov 2026 (Execute as: Me, Who has access: Anyone). Tabs: PM Plan, Users, Config, Log.

Records: `<pm>_dp_<date>` Day Plan, `<pm>_de_<date>` Day End, `<pm>_wk_<monday>` weekly Observation Update. Due-time overrides are under `pmtimes` in Config.

## Logins
- Users: Shally, Neetu, Divyanshi, Diksha (PMs), Dean of Academics, Director–Admin. Passwords are stored only as salted hashes in Users.
- A PM sees and updates only their own plan. Dashboard and all PM tabs: Dean and Director–Admin only; they alone change due times.
- Starting passwords were created with `setupPmLogins` (editor-only; skips anyone who already has a password).
- Director–Admin can reset any password from the **Logins** button; anyone can change their own with **Password**.

PM entries made before 5 Nov 2026 stay in the old PL Plan Data sheet ("PM Plan" tab).

## After changing `pm/Code.gs`
Paste it into the PM Plan Live API project, save, then **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same.

## Update 20 Nov 2026 — faster saves & photos, medical cases, Class Timeline
Paste the new `pm/Code.gs` and redeploy (**Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**; the URL stays the same).
- Saves and photos now find their row with a TextFinder instead of reading whole sheets, so they stay fast as the Photos tab grows.
- Photos are written before the lock is taken and carry a phone-side id, so automatic retries never create duplicates. New `pmPhotos` call loads up to 12 thumbnails at once.
- New: per-child medical log (`med` in each Day Plan record: Noted + Follow-up times), Washroom NA, Class Timeline activity field (`a`).

## Reliability (26 Nov 2026)
- Saves go through a queue kept on the phone (`pmplan_q_<user>` in localStorage): each patch has an id (`pid`), survives reload/offline, retries with backoff. The server keeps the last 80 pids per record and applies each once.
- Busy-server errors (lock, timeout, quota) are retried; only real refusals ("Only today's plan…") drop a change, with a message.
- Medical cases are soft-deleted (kept in `medDel`); every save is logged in the Log tab with the change itself.
- `sw.js`: network-first app shell, "New version — tap to refresh". Bump `VERSION` when index.html changes.
