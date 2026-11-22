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
