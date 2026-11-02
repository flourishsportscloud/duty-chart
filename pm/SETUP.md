# PM Plan – Live — setup

PM Plan (Classes 1–5) shares the **PL Plan Data** Google Sheet and Apps Script web app with PL Plan – Live. Its records go in a separate **PM Plan** tab; due times are stored under `pmtimes` in Config.

One-time step (the URL does not change):
1. Open the **PL Plan Data** sheet → **Extensions → Apps Script**.
2. Replace everything in `Code.gs` with the whole of `pl/Code.gs` from this repo and save.
3. **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy.**

Until this is done the page shows "Setting up · saved on this device"; ticks made meanwhile sync automatically once the script is updated (only today's ticks are accepted).

Rules the server enforces: today-only daily plan; weekly Observation Update only in the current week; each PM's plan is updated by that PM, Dean of Academics or Director–Admin; only those two seniors change due times; tick times are stamped by the server.
