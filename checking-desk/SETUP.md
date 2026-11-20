# Checking Desk — one-time setup

The page (`checking-desk/index.html`) is hosted on GitHub Pages. Its data lives in a Google Sheet through a Google Apps Script web app (`Code.gs`), like the other FIS apps.

1. Create a Google Sheet named **Checking Desk Data** (account flourishcloud1@gmail.com).
2. **Extensions → Apps Script**. Replace everything with `checking-desk/Code.gs`.
3. At the top of the script change `CODE_TO_SET` to the staff code everyone will type, save, choose **setupCheckingDesk** in the function list and **Run** (allow permissions). Then change `CODE_TO_SET` back to `"CHANGE-ME"` and save. The code is kept in Script Properties (Project Settings), where it can be changed later.
4. **Deploy → New deployment → Web app**. Execute as: **Me**. Who has access: **Anyone**. Copy the URL ending in `/exec`.
5. Send that URL to Claude, or paste it between the quotes of `API =` ... `"%%API%%"` was replaced by an empty string in `checking-desk/index.html`: set `|| ""` to the URL. Test first by opening `.../checking-desk/?api=<URL>`.
6. In `fis/index.html` point the Checking Desk tile to `../checking-desk/`.

Notes: every call needs the staff code; photos are kept in the Photos tab; the page refreshes from the sheet about every 12 seconds. After changing `Code.gs` redeploy with **Manage deployments → ✏️ Edit → New version → Deploy** (the URL stays the same).
