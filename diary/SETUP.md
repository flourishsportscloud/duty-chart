# Diary Report — one-time setup

The page (`index.html`) is hosted on GitHub Pages. Its data lives in a Google Sheet, through a Google Apps Script web app (`Code.gs`), the same way as the Daily Maintenance Record.

## 1. Create the Google Sheet and script (about 5 minutes)

1. Create a new Google Sheet named **Diary Report Data**.
2. **Extensions → Apps Script**. Delete everything in `Code.gs` and paste the whole of `diary/Code.gs` from this repo. Save.
3. In the function list choose **setupSheets** and press **Run**. Allow the permissions it asks for. This creates the Users, Marks, Actions, Sms and Log tabs.
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - **Deploy**, then copy the **Web app URL** (it ends in `/exec`).
5. Send the URL to Claude to build it into `diary/index.html` (`const API_URL = ... || ''`) and switch the launcher tile to live. To try it first, open `diary/?api=<that URL>`.

## 2. First admin login — do this straight away

Open the link → **First time? Set password** → choose **Admin / central team** → type your name → set a password → **Create login**.
The first admin is approved automatically, so create it before sharing the link. Every login after that needs one approval from an admin (**Staff** tab).

## 3. Upload the class lists (once)

The student names are **not** in this public GitHub page. They live in the sheet. Log in as admin → **Staff** tab → **Class lists** → choose `FIS_Class_Lists.csv` (columns **Class, Section, Name**; one row per student, in roll order) → **Upload class lists**. To change a class later (new admission), upload a CSV containing just that class; only the classes in the file are replaced.

## Who can do what

| Role | Can do |
|---|---|
| Class Manager (cm) | Mark the diary: present/absent, diary defaulter, spoken English, parent sign, behaviour, parent remark. Sees every view |
| Class incharge (PL) | Read remarks and defaulters per section and log the action taken. Sees the central dashboard |
| Admin / central team | Everything above, plus follow-up remarks on the PL's action, mark SMS sent, approve and reset logins, change roles |

## Rules the server enforces

- Passwords are stored only as salted hashes; nobody, including the admin, can see them.
- Action and SMS times are stamped by the server, with the name of the person. Nothing can be back-dated.
- Marks and actions can be entered for today or up to 30 days back; never for a future date.
- Logged actions are never removed: they stay on the child's card with their time.
- A child flagged in the same category on 3 marked days in a row appears in the admin SMS list.

## Privacy note

The sheet holds student names (from the class rosters in the page), parent remarks and staff names. Keep the sheet shared only with the people who need it.

## Updating the script later

After pasting a new `Code.gs`: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same.
