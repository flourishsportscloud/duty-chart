# PM Plan – Live — setup

PM Plan (Classes 1–5) shares the **PL Plan Data** Google Sheet and Apps Script web app with PL Plan – Live (`pl/Code.gs`). Its records go in the **PM Plan** tab (`<pm>_dp_<date>` Day Plan, `<pm>_de_<date>` Day End, `<pm>_wk_<monday>` weekly Observation Update); due times are stored under `pmtimes` in Config.

## Logins (added 5 Nov 2026)
- Same login system as PL Plan (Users tab, salted hashes). PM logins: Shally, Neetu, Divyanshi, Diksha (role `pm`). Dean of Academics and Director–Admin use their PL Plan passwords.
- A PM sees and updates only their own plan; the Dashboard and all PM tabs are only for the Dean and the Director–Admin, who alone change due times.
- PM logins don't open PL Plan, and PL / Sarita logins don't open PM Plan.
- Starting PM passwords: run `setupPmLogins` once from the Apps Script editor; it prints them in the Execution log and skips anyone who already has a password.
- Director–Admin can reset any PM password from the **Logins** button.

## After changing `pl/Code.gs`
Paste it into the PL Plan Data script, save, then **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same.
