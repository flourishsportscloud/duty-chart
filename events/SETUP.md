# Tasks & Projects: one-time setup (about 5 minutes)

Try it first without setup: open `/events/?demo=1` and tap any name (sample data stays in your browser).

## Connect the live app
1. Go to script.google.com, **New project**, name it "FIS Tasks & Projects".
2. Delete the sample code, paste all of `Code.gs`, Save.
3. **Project Settings > Script properties > Add**: `STAFF_SUFFIX` = the same common staff suffix used in the other FIS apps.
4. Choose function `setup`, **Run**, allow permissions. This creates the data sheet and adds the 9 people (Harsh Yadav = Director/admin).
5. **Deploy > New deployment > Web app**: Execute as **Me**, access **Anyone**. Copy the URL ending in `/exec`.
6. Done: the live URL is already set in `API_URL` (deployed 22 Nov 2026).
7. Log in as Harsh Yadav, open the person icon, and tap **Remove sample data** if sample data was loaded.

Login: full name (or unique first name) + password = first name + staff suffix. Only people on the access list can enter; the Director adds or removes people from the person icon.
To sign everyone out: run `signOutEveryone`.

## Who can do what
| Action | Staff | Giver of the task | Director |
|---|---|---|---|
| Give a task to anyone | yes | yes | yes |
| Start, message, photos, submit (if assigned) | yes | yes | yes |
| Approve, rework, demand, decline, edit, reopen | no | yes | yes |
| Create project | yes | | yes |
| Dashboard of everyone, access list | no | | yes |

Staff data is stored only in your Google Sheet, never in this public repo.
