# Co-Curricular Desk: one-time server setup

Until a server is connected, the page works on one device only (each device keeps its own data) and asks for the data password.

1. Create a Google Sheet **Co-Curricular Data** (account flourishcloud1@gmail.com).
2. **Extensions → Apps Script**, replace everything with `cocurricular/Code.gs`, save.
3. Run **setupCoCurricular** once (allow permissions, including "connect to an external service" for the Diary sign-in).
4. **Deploy → New deployment → Web app**: Execute as **Me**, access **Anyone**. Copy the `/exec` URL.
5. Paste it into `cocurricular/index.html` where it says `const API_URL="";`. To test first, open `.../cocurricular/?api=<URL>`.
6. The **Director opens the page first**: sign in with the Diary name and password, then enter the data password once. This loads the students and the 12 to 21 Nov attendance onto the server. After that everyone signs in with their Diary name and password only.
7. In `fis/index.html` change the Co-Curricular Desk tile from `"status": "setup"` to `"status": "live"`.

## Who sees what
- The Diary **admin** is the Director: sees and edits everything.
- Everyone else shares the same attendance, learning remarks, staff check-in and announcements.
- **Private observations never reach non-admin staff**, and non-admin staff cannot create, edit or delete them. They appear for a coach only after the Director or a manager conveys them. A manager who is not the Diary admin therefore cannot write observations until the Diary admin role is used. Tell me if managers need this and I will add an editors list like Day Plan has.
- Approval of enrolment changes and uniform marking are enforced in the page, not the server.

## Notes
- Saves wait about 4 seconds after a change. The page checks for other people's changes every 25 seconds.
- If two people save at the same moment, the later one sees "Someone else saved first" and repeats the change. Their copy is kept in the browser as `fis-cc-v2-conflict`.
- After changing `Code.gs`: **Manage deployments → ✏️ Edit → New version → Deploy**.
