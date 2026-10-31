# Stock and Purchase Desk — one-time setup

The page (`index.html`) is hosted on GitHub Pages. Its records live in a Google Sheet, through a Google Apps Script web app (`Code.gs`), the same way as the Lost and Found Desk. Use a **new** Google Sheet, separate from the Lost and Found one.

## 1. Create the Google Sheet and script (about 5 minutes)

1. Create a new Google Sheet named **Stock and Purchase Data**.
2. **Extensions → Apps Script**. Delete everything in `Code.gs` and paste the whole of `stock/Code.gs` from this repo. Save.
3. In the function list choose **setupSheets** and press **Run**. Allow the permissions it asks for. This creates the Users, Requests, Photos and Log tabs.
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - **Deploy**, then copy the **Web app URL** (it ends in `/exec`).
5. Send the URL to Claude to build it into `stock/index.html` (`var API_URL = ""`) and switch the launcher tile to live. To try it first, open `stock/?api=<that URL>`.

## 2. First admin login — do this straight away

Open the link → **First time? Set password** → choose **Admin** → type your name → set a password → **Create login**.
The first admin is approved automatically, so create it before sharing the link. Every login after that needs one approval from the admin (**Team logins** at the top of the page).

## Who can do what

| Role | Can do |
|---|---|
| Staff | Log stock orders and purchases, approve, buy (item by item), hand over, forward to store, arrange, refund, add remarks |
| Incharge | Everything staff can, plus delete a wrong request |
| Admin | Everything above, plus approve, reset and remove logins |

## Rules the server enforces

- Passwords are stored only as salted hashes; nobody, including the admin, can see them.
- The history of each request (who did what, and when) is stamped by the server and can only grow, so nobody can back-date it or sign as someone else.
- The logging time of a request and who logged it are set by the server.
- Photos (reference, bill, handover, per-item) are kept in the **Photos** tab and are sent only to a logged-in person.

## Notes

- The page checks for changes every 20 seconds and straight after you save.
- Photos are shrunk on the phone before saving so they fit in the sheet.

## Updating the script later

After pasting a new `Code.gs`: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same.
