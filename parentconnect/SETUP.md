# Parent Connect: one-time setup (about 10 minutes)

Staff sign in with the **same name and password as the Diary app**. No Claude account is needed.

1. Open https://script.google.com with the school Google account that can already open **Feedback 2026**, **Diary Report Data** and the Parent Insight Charts folder. Create a new project named "Parent Connect API".
2. Paste all of `Code.gs` over the default file. Save.
3. Choose the function `setupParentConnect` and press Run. Allow the permissions. This creates the "Parent Connect Data" sheet that holds follow-ups, remarks, acknowledgements and profiles. It only reads the two source sheets and never writes to them.
4. Deploy > New deployment > Web app. Execute as: **Me**. Who has access: **Anyone**. Copy the `/exec` URL.
5. Done: the /exec URL is already set in `index.html`.
6. In `fis/index.html` change the Parent Connect tile `status` to `live`.

Notes
- Student and parent data is never stored in this repository. It is read by the script at sign-in time and cached for 10 minutes.
- The first load after the cache expires takes a few seconds.
- Role and class scope are applied in the app. Any signed-in staff member's token can fetch the full feedback data, so treat the link as staff-only.
- To test before step 5, open `index.html?api=<your /exec URL>`.
