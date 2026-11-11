# Transport Complaints & Requests — one-time setup

The page (`complaints/index.html`) is hosted on GitHub Pages and opens from the FIS app. It reads **live from the Daily FO** Google Sheet ("Feedback 2026") through a Google Apps Script web app (`complaints/Code.gs`), the same way as the other FIS apps. Nothing is written back to the Daily FO.

**No student data is stored in this GitHub repository** (it is public). Entries are read from the Daily FO only after a staff login.

## What it reads

| Daily FO tab | Rows used |
|---|---|
| Feedback Updated Final | Department = Transport, Category = Complain / Concern (→ Complaint), Request, Query, or blank (→ Not marked). Informative updates are left out. |
| Changes | Department = Transport (Change Tracker: from → to, status, fee) |
| In House- Calls | Category = Transport |

Each child is linked to a vehicle from the bus/van/auto number written in the entry or change, otherwise from the **Roster** tab of *Student Entry Exit Data*. The regular driver of each vehicle comes from the **Drivers list** in the app.

The script's own sheet **Transport Complaints Data** (created automatically) keeps only: follow-up status, vehicle/driver corrections and notes per entry, and the drivers list.

## Setup (about 10 minutes, Director's Google account flourishsportscloud@gmail.com)

1. Go to **script.google.com → New project**. Name it **Transport Complaints API**.
2. Delete everything in `Code.gs` and paste the whole of `complaints/Code.gs` from this repo. Save.
3. **⚙️ Project Settings → Script Properties → Add script property**: `STAFF_SUFFIX` = the common FIS staff code (same as the other FIS apps).
4. Choose **setupSheets** in the function list and press **Run**. Allow the permissions (it needs to read the Daily FO and the Student Entry Exit sheet, and create its own sheet). The log shows how many transport entries were read.
5. **Deploy → New deployment → Web app** · Execute as: **Me** · Who has access: **Anyone** · **Deploy**. Copy the **Web app URL** (ends in `/exec`).
6. Send the URL to Claude to build it into the page and switch the FIS tile to live. To try it first, open `complaints/?api=<that URL>`.

The Director's account must keep at least view access to the Daily FO ("Feedback 2026", owned by flourishcloud1@gmail.com).

## How it works

- Entries are read again from the Daily FO when the app is opened, every 5 minutes, and on **Refresh** (the server keeps a 5-minute copy).
- Complaint status: **Open** (no action written in Daily FO), **Action logged** (Action/Remarks filled in Daily FO), or **Closed** — any staff member can change it in the app; the name and time are saved.
- Views: Dashboard · Complaints · Requests · Changes · Student-wise · Bus-wise · Driver-wise · Drivers list.

## Privacy note

The app shows names, classes and complaint details of minors. Share the FIS link only with transport, front office and management staff.

## Updating the script later

After pasting a new `Code.gs`: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same.
