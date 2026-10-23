# Checking Tracker 6–8 — one-time setup

The page (`index.html`) is hosted on GitHub Pages. Its data lives in a Google Sheet, through a Google Apps Script web app (`Code.gs`), the same way as the duty chart.

## 1. Create the Google Sheet and script (about 5 minutes)

1. Create a new Google Sheet named **Checking Tracker 6-8 Data**.
2. **Extensions → Apps Script**. Delete everything in `Code.gs` and paste the whole of `checking/Code.gs` from this repo. Save.
3. In the function list at the top choose **setupSheets** and press **Run**. Allow the permissions it asks for. This creates the Users, Reports, Tasks, Overrides and Log tabs.
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - **Deploy**, then copy the **Web app URL** (it ends in `/exec`).
5. Paste that URL into `checking/index.html` at `const API_URL = ... || ''` (between the last two quotes), or send it to Claude to do it.

## 2. First manager login

Open the tracker link → **First time? Set password** → choose **Manager — type name below** → type your name → set a password → **Create login**.
The first manager is approved automatically. Every login after that needs one approval from a manager.

## 3. Teachers

Send teachers the link. Each one taps **First time? Set password**, chooses their name and sets their own password. Approve each one once in **Admin → Teacher logins**. After that they just log in with name + password.

## 4. Section list and mentors (Admin tab, managers only)

- **Section list:** paste the Class 6–8 list (Section, Roll No, Name — one student per line, straight from Excel) and tap **Save section list**. Names are stored only in the Google Sheet and are shown only to logged-in staff; they are never in this public GitHub page.
- **Mentors:** pre-filled (6A Shailesh, 6B Ishita, 6C Monika, 7A Swati, 7B Yavnika, 7C Jyotsna, 8A Pallavi, 8B Shreya, 8C Ritika); change and **Save mentors** if needed.
- **Extra lessons:** add any lesson missing from the planner so teachers can mark its preparation.

## Areas

| Area | Who updates | What |
|---|---|---|
| Checking | Subject teacher of the section | Notebook / Assignment / Book / Test reports; tap student names as Defaulter or Absent; type test marks |
| Preparation & Review | Each teacher, own lessons | Booklet, Assignment answer key, Video, PPT, EPL; review of Booklet/Content and Assignments — Done / Due / NA |
| Mentor tasks | Mentor of the section | Attendance Register (daily); Record Register, Route Plan, Co-curricular (weekly); Class Display, Student Wall Display number (monthly) |
| Defaulters | — (dashboard) | Lesson-wise, section-wise names of defaulters and absentees; repeat defaulters |
| Performance | — (dashboard) | Test averages per section, students below 60%, students below 60% in 2+ tests |

## Rules the server enforces

- Passwords are stored only as salted hashes; nobody (including managers) can see them.
- A teacher can report only their own sections; managers can report anything.
- A teacher can change a report only on the day it was entered (India time). After that only a manager can correct it; the report then shows who corrected it.
- Only managers can add, edit or remove tasks, approve or reset logins, and change the section list, mentors and extra lessons.
- A teacher can change only their own preparation rows; only a section's mentor (or a manager) can mark its mentor tasks.
- Student names are sent only to logged-in users.
- Every change is written to the **Log** tab with time and name.

## Updating the script later

After pasting a new `Code.gs`: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same.
