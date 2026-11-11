# Transport Complaints & Requests — setup

The page (`complaints/index.html`) is hosted on GitHub Pages and opens from the FIS app. It reads **live from the Daily FO** Google Sheet ("Feedback 2026"). Nothing is written back to the Daily FO.

**No student data is stored in this GitHub repository** (it is public). Entries reach a phone only after a staff login.

## Current setup (done 11 Nov 2026)

- `complaints.gs` added to the **Student Entry Exit API** project; `crSetup` run (270 transport entries read; sheet **Transport Complaints Data** created).
- Own deployment **"Transport Complaints & Requests"** (Version 3, Execute as Me, Anyone); its `/exec` URL is built into `complaints/index.html`. The Student Entry Exit deployment was not changed.
- `complaints/Code.gs` is a standalone copy of the same backend, kept only as an alternative; it is not deployed.

## Where the backend lives

`complaints/complaints.gs` is added as a **second file in the existing "Student Entry Exit API" Apps Script project** (flourishsportscloud@gmail.com). It uses that project's staff login (`STAFF_SUFFIX`) and its existing Google permissions, and only adds two requests (`cr_data`, `cr_set`) to that project's API — the Student Entry Exit code is not changed. The complaints page uses its **own web-app deployment** of that project, so the Student Entry Exit deployment is untouched.

## What it reads

| Daily FO tab | Rows used |
|---|---|
| Feedback Updated Final | Department = Transport; Category Complain / Concern (→ Complaint), Request, Query, or blank (→ Not marked). Informative updates are left out. |
| Changes | Department = Transport (from → to, status, fee) |
| In House- Calls | Category = Transport |

Each child is linked to a vehicle from the bus/van/auto number written in the entry or change, otherwise from the **Roster** tab of *Student Entry Exit Data*. The regular driver per vehicle comes from the app's **Drivers list**.

Its own sheet **Transport Complaints Data** (id in Script Property `CR_SHEET_ID`, created by `crSetup`) keeps only follow-up status, vehicle/driver corrections, notes and the drivers list.

## Setting it up again

1. Open the **Student Entry Exit API** project → Files **+** → Script → name it `complaints` → paste `complaints/complaints.gs`. Save.
2. Run **crSetup** once (log shows how many transport entries were read).
3. **Deploy → New deployment → Web app** · Execute as **Me** · Access **Anyone** → copy the `/exec` URL into `API_URL` in `complaints/index.html`.

The flourishsportscloud account must keep at least view access to the Daily FO (owned by flourishcloud1@gmail.com).

## Updating later

Paste the new `complaints.gs`, then **Deploy → Manage deployments → the Complaints deployment → ✏️ Edit → Version: New version → Deploy**. Update the Student Entry Exit deployment only when its own code changes.

## Privacy note

The app shows names, classes and complaint details of minors. Share the FIS link only with transport, front office and management staff.
