# Academic Preparation Tracker — one-time setup

The page (`prep/index.html`) is hosted on GitHub Pages and opens from the FIS app. Lesson starts and marks live in a Google Sheet, through a Google Apps Script web app (`prep/Code.gs`), the same way as the other FIS apps.

No staff or student names are stored in this GitHub repository (it is public). The November–December 2026 lesson starts are built into `Code.gs`; the marks already made in the old tracker are in a separate lesson file sent by Claude.

## 1. Create the Google Sheet and script (about 10 minutes)

1. Create a new Google Sheet named **Academic Preparation Data**.
2. **Extensions → Apps Script.** Delete everything in `Code.gs` and paste the whole of `prep/Code.gs` from this repo. Save.
3. (Optional) **⚙️ Project Settings → Script Properties**: `PREP_ADMINS` (default `shubhangi`) = first names of the people who may load new months and set lesson dates, comma-separated (for example `shubhangi, <director's first name>`).
4. Choose **setupSheets** in the function list and press **Run**. Allow the permissions. This creates the **Docs** and **Log** tabs and loads the November and December lessons.
5. **Deploy → New deployment → Web app** · Execute as: **Me** · Who has access: **Anyone** · **Deploy**. Copy the **Web app URL** (ends in `/exec`).
6. Send the URL to Claude to build it into the page and switch the FIS tile to live. To try it first, open `prep/?api=<that URL>`.
7. Open the app with an admin name, open **Load lessons**, and load **Academic_Prep_Lessons_and_Marks_Nov-Dec_2026.json** (sent by Claude) to bring across the marks already made in the old tracker.

## How it works

- **Docs** tab: `plan/<month>` (lesson starts for that month; lessons without a date yet are listed under it) and `status/<lesson id>` (the marks for one lesson). **Log** tab: who changed what, and when.
- Dean and PL both see Classes 1–11; a mark made in either view, or in Class Master, is the same record. The name and the time on every mark are stamped by the server from the login.
- Only the people in `PREP_ADMINS` can load a new month or set a lesson's start date.
- Every phone checks for changes every 15 seconds, and straight away when the app is opened again.
- No password: each person types their full name once on their phone ("Change name" resets it).

## New month

Send the month's planners (Class 1–5 and 6–10) to Claude. Claude sends back a lesson file; load it from **Load lessons**.

## Updating the script later

After pasting a new `Code.gs`: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same.
