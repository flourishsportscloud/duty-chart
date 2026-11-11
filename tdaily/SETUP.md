# Transport Daily Report — setup

Moved from the Claude artifact on 11 Nov 2026. The page (`tdaily/index.html`) is hosted on GitHub Pages and opens from the FIS app.

- **Data:** Google Sheet **Transport Daily Data** (flourishsportscloud Drive). First tab: one row per record — `key` (e.g. `reports/2026-11-04`, `roster/main`, `salary/p1d`, `vehicles/rj07pb4003`, `service/rj07pb4003`), `coll`, `json`, `updated`, `rev`. Tab **Log**: who saved what. All 98 records from the artifact were imported.
- **Backend:** `tdaily/tdaily.gs`, added as a separate file to the **Student Entry Exit API** Apps Script project (same staff login and permissions). It only adds `td_since`, `td_set`, `td_update` to that project's API.
- **Deployment:** its own web app deployment "Transport Daily Report" (Version 4). The Student Entry Exit and Complaints deployments were not changed.
- **Salary:** salary records are sent only to the first names in Script Property **TD_ADMINS** (comma-separated). Everyone else sees "visible only to Transport admins".
- Phones check for changes every 15 seconds and when the app is opened again.

No staff phone numbers, salaries or student data are in this repository; they live only in the Google Sheet.

## Updating the script later

Paste the new `tdaily.gs` into the project, then **Deploy → Manage deployments → "Transport Daily Report" → ✏️ Edit → Version: New version → Deploy**.
