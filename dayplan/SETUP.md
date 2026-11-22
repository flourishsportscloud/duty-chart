# Day Plan — one-time setup

Until a server is connected the page opens in **preview** (sample data, nothing saved).

Staff log in with the **same name and password as the Diary app**; the script checks them against the Diary API, so no separate passwords exist. The Diary **admin** is automatically an editor; the admin can add more editors in **Staff → Settings**.

1. Create a Google Sheet **Day Plan Data** (account flourishcloud1@gmail.com).
2. **Extensions → Apps Script**, replace everything with `dayplan/Code.gs`, save.
3. Run **setupDayPlan** once (allow permissions, including "connect to an external service" for the Diary check).
4. **Deploy → New deployment → Web app**: Execute as **Me**, access **Anyone**. Copy the `/exec` URL.
5. Paste it into `dayplan/index.html` where it says `new URLSearchParams(location.search).get('api'))||""` (between the last two quotes). To test first, open `.../dayplan/?api=<URL>`.
6. In `fis/index.html` change the Day Plan tile from `"status": "setup"` to `"status": "live"`.

## How it is used
- **Director / editors:** open a class (or Adjustments, Free Teachers, Co-curricular Schedule), tap **Add PDF or photo**, set the acknowledge-by time, **Share plan**. PDFs are turned into page images on the phone (up to 8 pages).
- **Staff:** open their class, read, tap **I have seen this plan**. The server stamps the time and marks it on time or late.
- Changing a shared plan makes everyone acknowledge again.
- **Free Staff** tab: hour-by-hour chart for Class 1–11 class teachers, subject teachers and mentors (pre-primary and co-curricular excluded) from the timetable entered under **Staff**. Editors can mark leave and give cover duty.
- **Dashboard** (editors): who has acknowledged, on time, late or pending, class-wise and teacher-wise.

Photos are kept in the Photos tab; the page refreshes about every 15 seconds. After changing `Code.gs`: **Manage deployments → ✏️ Edit → New version → Deploy**.
