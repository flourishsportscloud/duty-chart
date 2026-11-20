# Mentor Student Record — one-time setup

The page (`mentor/index.html`) is hosted on GitHub Pages and opens from the FIS app. Checking entries, test marks and settings live in a Google Sheet through a Google Apps Script web app (`mentor/Code.gs`), the same way as the Student Entry Exit app.

**Student names are not stored in this GitHub repository** (it is public). The list lives only in the Google Sheet and reaches a phone after a staff login. Until the web app URL is built in, the page runs in a local **trial mode** with sample names (data stays on that phone only).

## 1. Create the Google Sheet and script (about 10 minutes)

1. Create a new Google Sheet named **Mentor Student Record Data**.
2. **Import the student list:** File → Import → Upload → choose **FIS_Class_Lists_1-5.csv** (sent by Claude, not in this repo; columns Class, Section, Name in roll order) → Import location: **Insert new sheet(s)** → Import data. Rename the new tab to **Roster** (529 students, 15 sections).
3. **Extensions → Apps Script.** Replace everything with `mentor/Code.gs`. Save.
4. ⚙️ **Project Settings → Script Properties → Add**: `STAFF_SUFFIX` = the common FIS staff code (the same one the other FIS apps use). Staff log in with *full name + (first name + code)*.
5. Choose **setupSheets** in the function list and **Run** (allow permissions).
6. **Deploy → New deployment → Web app** · Execute as **Me** · Who has access **Anyone** · copy the `/exec` URL.
7. Send the URL to Claude to build into `mentor/index.html` (`API_URL`) and switch the hub tile to live. To try first: `mentor/?api=<that URL>`.

## Who is who
- Class teachers (1A–5C) and Hindi teachers (A / B / C across Classes 1–5) are set in the app under **Setup → Teachers**. The Director (and anyone listed as admin there) can edit Setup.
- Lessons: the 12–21 Nov weekly plans (Classes 6–10) and the 16 Nov–4 Dec planner (Classes 1–5) are built in, so teachers pick the lesson from a list per class and subject. **Setup → Lessons** accepts pasted rows `Class, Subject, Lesson, Title` to add more; teachers can also just type a lesson.

## How it works
- **Docs** tab: `e/<date>/<section>/<id>` = a checking entry (book / notebook / assignment / test notebook), `t/<date>/<section>/<id>` = a performance test, `config/...` = settings.
- Each phone loads the last 90 days, refreshes every 15 seconds, and queues entries if the network drops.
- A login lasts 120 days. Run **signOutEveryone** after changing `STAFF_SUFFIX`.
- New admission: append the name at the end of that section in **Roster** (do not insert in the middle — marks are stored by roll number).
