# PL Plan – Live — one-time setup

The page (`index.html`) is hosted on GitHub Pages. Its data lives in a Google Sheet through a Google Apps Script web app (`Code.gs`), the same way as the Diary Report and DMR.

1. Create a new Google Sheet named **PL Plan Data**.
2. **Extensions → Apps Script**. Delete everything in `Code.gs`, paste the whole of `pl/Code.gs` from this repo, and save.
3. Choose **setupSheets** in the function list and press **Run**. Allow the permissions. This creates the Plan, Config and Log tabs.
4. **Deploy → New deployment → Web app** — Execute as: **Me**, Who has access: **Anyone** → **Deploy**, then copy the **Web app URL** (ends in `/exec`).
5. Send the URL to Claude to build it into `pl/index.html` (`const API_URL = ... || ''`) and switch the launcher tile to live. To try it first, open `pl/?api=<that URL>`.

Until then the page works in "this device only" mode (ticks are kept in that phone's browser only).

## Rules the server enforces
- Only today's plan (India time) can be ticked or remarked; past days are read only.
- Each PL's plan can be updated by that PL and by the seniors (Sarita, Dean of Academics, Director–Admin).
- Tick and remark times are stamped by the server with the person's name.
- Only the seniors can change a block's due time.

## Updating the script later
After pasting a new `Code.gs`: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same.

## Logins (added 4 Nov 2026)
- Every PL Plan user logs in with their name and a password. Passwords are stored only as salted hashes in the **Users** tab.
- PLs (Poonam, Garima, Renu Harsh) see and update only their own plan. The Dashboard and all PL tabs are visible only to Sarita, the Dean of Academics and the Director–Admin.
- Anyone can change their own password (**Password** button). The Director–Admin can set a new password for anyone (**Logins** button), which logs that person out everywhere.
- Starting passwords were set once with the `bootstrap` call; it refuses to run again once any login exists.
