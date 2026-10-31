# Lost and Found Desk — one-time setup

The page (`index.html`) is hosted on GitHub Pages. Its records live in a Google Sheet, through a Google Apps Script web app (`Code.gs`), the same way as the Diary Report and the Daily Maintenance Record.

## 1. Create the Google Sheet and script (about 5 minutes)

1. Create a new Google Sheet named **Lost and Found Data**.
2. **Extensions → Apps Script**. Delete everything in `Code.gs` and paste the whole of `lostfound/Code.gs` from this repo. Save.
3. In the function list choose **setupSheets** and press **Run**. Allow the permissions it asks for. This creates the Users, Found, Complaints, History, Handovers, Photos and Log tabs.
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - **Deploy**, then copy the **Web app URL** (it ends in `/exec`).
5. Send the URL to Claude to build it into `lostfound/index.html` (`var API_URL = ""`) and switch the launcher tile to live. To try it first, open `lostfound/?api=<that URL>`.

## 2. First admin login — do this straight away

Open the link → **First time? Set password** → choose **Admin** → type your name → set a password → **Create login**.
The first admin is approved automatically, so create it before sharing the link. Every login after that needs one approval from the admin (**Team logins** at the top of the page).

On the Home screen the admin can press **Load demo records** to try the flow, and **Delete demo records** to remove them. Demo records are marked "(demo)".

## Who can do what

| Role | Can do |
|---|---|
| Staff | Log found items and complaints, confirm matches, floor round, hand over (not restricted items), add remarks, export CSV |
| Incharge | Everything staff can, plus hand over restricted items, confirm disposal or donation (with a reason), remove a restricted mark |
| Admin | Everything above, plus approve, reset and remove logins, load and delete demo records |

## Rules the server enforces

- Passwords are stored only as salted hashes; nobody, including the admin, can see them.
- Every date, time and staff name in the records is stamped by the server; nobody can back-date or sign as someone else.
- Records are never deleted by staff and the history is append-only.
- Photos, the handover photo of the child and signatures are kept in the **Photos** tab and are sent only to a logged-in person who opens the case. They are not in the CSV export.
- Handover needs the owner verified, a collector name and the photo of the child with the item.

## Privacy note

The sheet holds photos of students with their items, staff names and parent names. Keep the sheet shared only with the people who need it, and do not publish the sheet itself.

## Updating the script later

After pasting a new `Code.gs`: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same.
