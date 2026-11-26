# Student Entry Exit Report — one-time setup

The page (`transport/index.html` + `app.js`) is hosted on GitHub Pages and opens from the FIS app. Attendance, Front Office marks, stayback and departure records live in a Google Sheet, through a Google Apps Script web app (`transport/Code.gs`), the same way as the other FIS apps.

**Student names are not stored in this GitHub repository** (it is public). The student list is kept only in the Google Sheet and is sent to a phone only after a staff login.

## Current setup (done 10 Nov 2026)

- Sheet: **Student Entry Exit Data** in the flourishsportscloud Drive (Roster tab imported).
- Script: standalone Apps Script project **Student Entry Exit API** (it opens the sheet by `SHEET_ID` in `Code.gs`), deployed as a web app (Execute as: Me, Who has access: Anyone). The `/exec` URL is built into `transport/index.html`.
- Still to do by the Director: add the `STAFF_SUFFIX` Script Property (step 4 below). Until then logins show "The staff password is not set up yet".

## 1. Create the Google Sheet and script (about 10 minutes)

1. Create a new Google Sheet named **Student Entry Exit Data**.
2. **Import the student list:** File → Import → Upload → choose **Transport_Roster.xlsx** (sent by Claude, not in this repo) → Import location: **Insert new sheet(s)** → Import data. A tab named **Roster** appears (1,154 students).
3. **Extensions → Apps Script.** Delete everything in `Code.gs` and paste the whole of `transport/Code.gs` from this repo. Save.
4. **Set the staff password code:** ⚙️ Project Settings → Script Properties → Add script property
   - Property: `STAFF_SUFFIX`
   - Value: the common FIS staff code (the part after the first name). Staff log in with *first name + this code*, e.g. `megha` + code.
5. Back in the editor, choose **setupSheets** in the function list and press **Run**. Allow the permissions it asks for. This creates the **Docs** and **Log** tabs and loads the regular stayback list (201) and the special by-walk list.
6. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - **Deploy**, then copy the **Web app URL** (it ends in `/exec`).
7. Send the URL to Claude to build it into the page and switch the FIS tile to live. To try it first, open `transport/?api=<that URL>`.

## How it works

- **Roster** tab: vehicle key, vehicle, type, serial, student name, class. To correct a name or class, edit it here; phones pick it up the next time the app is opened.
- **Docs** tab: one row per record (`att/<date>/veh/<vehicle>`, `att/<date>/gate/<student>`, `att/<date>/sb/<class>`, `att/<date>/out/<vehicle>`, `att/<date>/derr/<vehicle>`, `config/...`). **Log** tab: who saved what, and when.
- Every phone checks for changes every 15 seconds, and straight away when the app is opened again.
- If the network drops, entries wait on the phone and upload when it is back.
- A login lasts 120 days. To sign everyone out (for example after changing `STAFF_SUFFIX`), run **signOutEveryone**.

## Privacy note

The sheet holds student names, classes and transport details of minors. Keep it shared only with the people who need it. Phones that log in keep a copy of the student list; staff should use **Settings → Sign out** on shared or personal phones they hand over.

## Updating the script later

After pasting a new `Code.gs`: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same.

## Update 26 Nov 2026 – reliability (needs a redeploy of Code.gs)
Paste the new `Code.gs` into the Apps Script project "Student Entry Exit API", then **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**. The web-app URL stays the same.
What it adds: `patch` (only changed fields are sent and merged into the current record, so two people on one class or vehicle keep both changes), a short-term change cache so the 20–30 s checks of ~100 phones do not read the whole sheet, server time in every reply, old/new values in the Log tab for each change, and `clientlog` (phone errors are written to the Log tab).
Until it is redeployed the app still works: it sends whole records as before (no merge).
