# Checking Desk — one-time setup

Until a server is connected the page opens in **preview** (sample data, nothing saved).

Staff log in with the **same name and password as the Diary app**; the script checks them against the Diary API, so no separate passwords exist.

1. Create a Google Sheet **Checking Desk Data** (account flourishcloud1@gmail.com).
2. **Extensions → Apps Script**, replace everything with `checking-desk/Code.gs`, save.
3. Run **setupCheckingDesk** once (allow permissions, including "connect to an external service" for the Diary check).
4. **Deploy → New deployment → Web app**: Execute as **Me**, access **Anyone**. Copy the `/exec` URL.
5. Paste it into `checking-desk/index.html` where it says `new URLSearchParams(location.search).get('api'))||""` (between the last two quotes). To test first, open `.../checking-desk/?api=<URL>`.

Photos are kept in the Photos tab; the page refreshes about every 12 seconds. After changing `Code.gs`: **Manage deployments → ✏️ Edit → New version → Deploy**.
