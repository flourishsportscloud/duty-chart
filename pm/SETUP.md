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
