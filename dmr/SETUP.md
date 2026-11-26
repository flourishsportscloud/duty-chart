# Daily Maintenance Record — one-time setup

The page (`index.html`) is hosted on GitHub Pages. Its data lives in a Google Sheet, through a Google Apps Script web app (`Code.gs`), the same way as the Duty Chart and Checking Tracker.

## 1. Create the Google Sheet and script (about 5 minutes)

1. Create a new Google Sheet named **DMR Data**.
2. **Extensions → Apps Script**. Delete everything in `Code.gs` and paste the whole of `dmr/Code.gs` from this repo. Save.
3. In the function list at the top choose **setupSheets** and press **Run**. Allow the permissions it asks for. This creates the Users, Complaints, Config and Log tabs and a private Drive folder called **DMR Photos (private)**. Drive permission is used only for that folder.
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - **Deploy**, then copy the **Web app URL** (it ends in `/exec`).
5. Open the app once as `dmr/?api=<that URL>`, or send the URL to Claude to build it into `dmr/index.html` (`const API_URL = ... || ''`) and switch the launcher tile to live.

## 2. No passwords

Anyone with the link picks or types their name and can log a request (location, category, photo), add remarks and send reminders.
Roles come from names, set in **Admin → Who can update**:

| Who | Can do |
|---|---|
| Maintenance team (default Anoop, Rahul, Jay, Shubhangi, Sarita) | Change status, remark, repair time, vendor, completion photo; edit the team and vendor lists |
| Director (default Harsh Yadav) | See everything and the performance score |
| Everyone else (PLs, PMs, CMs, any staff) | Log requests, follow status, add 2nd/3rd remarks, send reminders (WhatsApp) |

A name is trusted as typed, so keep the link inside the school. Every change is written with the name to the **Log** tab.

## Views

Overview (clickable tiles, performance, trend, location, category, waiting time), By date, Location (incl. Storage), Vendor, Admin (team only).

## Updating the script later

After pasting a new `Code.gs`: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same.

## Reliability (how saving works)
- Every change is stored on the phone first (IndexedDB, with a localStorage copy), then sent in order. The top chip shows Saved / Saving / Offline / N changes pending / Save failed - retrying.
- Closing the app or losing the network never loses a change. It is sent when the connection returns; each change has an ID, so the server ignores duplicates (double tap, retry).
- Two people changing the same field: the second person is asked "<name> already changed <field>. Keep theirs or use mine?". Different fields merge silently.
- Delete is soft (the row stays in the sheet, marked deleted). The Log sheet records who, what and when. Use the Admin tab CSV for a backup.
- The screen refreshes only when someone else's change arrives, and never while you type, have a form open, or touched the screen in the last 4 seconds.
- Back button: one screen at a time; at Home, press Back twice to exit. Reload keeps the same screen.
- After pushing a new Code.gs you MUST redeploy: Deploy -> Manage deployments -> pencil -> New version -> Deploy. The page shows a warning if the script is out of date.
- Old sheets still load: missing columns (deleted, touched, thread) are added automatically.
