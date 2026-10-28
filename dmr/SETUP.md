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

## 2. First manager login — do this straight away

Open the link → **First time? Set password** → choose **Maintenance manager** → type your name → set a password → **Create login**.
The first manager request is approved automatically, so create it before sharing the link with anyone. Every login after that needs one approval from a manager.

## 3. Staff and Director

Send staff the link. Each taps **First time? Set password**, types their name, chooses **Staff** and sets their own password. The maintenance manager approves each one once in **Admin → Waiting for approval**, and can set the role there (Staff, Director, Maintenance manager). Approve the Director with the **Director** role.

## Who can do what

| Role | Can do |
|---|---|
| Staff | Log complaints with date and photo; see all complaints and their status; edit or delete their own complaint on the day they logged it |
| Maintenance manager | Everything staff can, plus change status (Open / Working / Done), remark, time required to repair, vendor, priority, category, date; edit or delete any complaint; approve and reset logins; edit the vendor list |
| Director | View only: Dashboard (pending, urgent, overdue, completed this week, department status, pending by location, oldest unresolved) and all lists |

## Views

- **Dashboard** — summary tiles, department status (CCTV, Computer lab, Digital board, Electric, Machinery, Wifi, Vendors, Others, Management tasks), pending by location, due / overdue, oldest unresolved.
- **By date**, **Location** (LGF, GF, 1F, 2F, 3F, Outdoor, Campus-wide) and **Vendor** — filter by status, category, or a single date.
- A complaint is shown as **hot** when it is urgent or has been pending 3 or more days. Due date is the date the repair time was set plus the days given; "Needs parts" gives no due date.

## Rules the server enforces

- Passwords are stored only as salted hashes; nobody (including managers) can see them.
- Complaints and photos are sent only to logged-in users. Photos are kept in a private Drive folder and loaded only on request.
- Only the maintenance manager can change status, remark, repair time, vendor and date, and approve or reset logins.
- The Director cannot change anything.
- The page loads open complaints and the last 45 days; picking an older date fetches that day.
- Every change is written to the **Log** tab with time and name.

## Privacy note

This tracker stores staff names (who logged each complaint) and login names. Both stay in the Google Sheet and are never in this public GitHub page. Keep the sheet shared only with the people who need it.

## Updating the script later

After pasting a new `Code.gs`: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same.
