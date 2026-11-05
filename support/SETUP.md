# Support Staff – Live — one-time setup

The page (`support/index.html`) is hosted on GitHub Pages and opens from the FIS app. Its records and photos live in a Google Sheet, through a Google Apps Script web app (`support/Code.gs`), the same way as the other FIS apps.

## 1. Create the Google Sheet and script (about 5 minutes)

1. Create a new Google Sheet named **Support Staff Data**.
2. **Extensions → Apps Script**. Delete everything in `Code.gs` and paste the whole of `support/Code.gs` from this repo. Save.
3. In the function list choose **setupSheets** and press **Run**. Allow the permissions it asks for. This creates the **Docs** and **Blobs** tabs.
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - **Deploy**, then copy the **Web app URL** (it ends in `/exec`).
5. Send the URL to Claude to build it into `support/index.html` and switch the FIS tile to live. To try it first, open `support/?api=<that URL>`.

Until then the page shows "setting up · saved on this device"; entries made meanwhile stay on that phone and upload once the URL is in.

## How it works

- **Docs** tab: one row per record (staff list, areas, daily logs, check-ins, washroom inspections, tasks…). **Blobs** tab: photos and area reference images.
- Every phone checks for changes every 20 seconds, and straight away when the page is opened again.
- If the network drops, entries wait on the phone ("offline · will sync") and upload when it is back.
- Name and role (Staff / Supervisor) are chosen on each phone from the 👤 button; Manage is shown to Supervisors.

## Privacy note

The sheet holds staff names, phone numbers and photos. Keep it shared only with the people who need it.

## Updating the script later

After pasting a new `Code.gs`: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same.
