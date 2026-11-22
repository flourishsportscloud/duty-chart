# DCR Desk — one-time setup

Until a server is connected the page shows a sign-in that cannot complete. Staff log in with the **same name and password as the Diary app** (checked against the Diary API). The Director and other management roles can use **View as another role**; everyone else sees only their own sections.

The student and staff lists are **not in this repo**. They live only in the Google Sheet.

1. Create the script: go to script.google.com (account flourishcloud1@gmail.com) → New project → name it **DCR Desk API**, paste `dcr/Code.gs`, save.
2. Run **setupDcr** once (allow permissions, including "connect to an external service"). It creates the Sheet **DCR Desk Data** in Drive with tabs Docs, Roster, Staff, ClassTeachers.
3. Open that Sheet and paste the three private files (given to the Director separately, not in the repo) into the tabs, under the header row: `Roster.csv` → Roster, `Staff.csv` → Staff, `ClassTeachers.csv` → ClassTeachers. (File → Import → "Append to current sheet" works too.) Staff.csv has a row `Harsh Yadav | Director` — the Director role comes from the Staff tab.
4. **Deploy → New deployment → Web app**: Execute as **Me**, access **Anyone**. Copy the `/exec` URL.
5. Paste it into `dcr/index.html` where it says `get('api'))||"__API__"` (replace `__API__`). To test first, open `.../dcr/?api=<URL>`.
6. In `fis/index.html` change the DCR Desk tile from `"status": "setup"` to `"status": "live"`.

Data: rounds and the defaulter ledger are stored in the Docs tab (long records are split across columns). The page checks for changes about every 12 seconds. After changing `Code.gs`: **Manage deployments → ✏️ Edit → New version → Deploy**.

Coordinator sections (which classes each Class Manager / Program Leader sees) are pre-filled with sample values; edit them in **Admin tools → Coordinator sections** (Director).
