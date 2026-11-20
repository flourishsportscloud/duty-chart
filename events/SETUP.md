# Events & Operations — setup

The page (`events/index.html`) is hosted on GitHub Pages and opens from the FIS app. Its data (events, tasks, remarks, access list) lives in a Google Sheet that the Apps Script in `events/Code.gs` creates and manages. **No staff or task data is stored in this GitHub repository** (it is public).

## One-time setup (about 5 minutes)

1. Go to script.google.com (signed in as the school account) → **New project** → name it `FIS Events & Operations`.
2. Replace the default code with all of `events/Code.gs`. Save.
3. **Project Settings → Script properties → Add**: `STAFF_SUFFIX` = the same common suffix the other FIS apps use (password = first name + suffix).
4. Select the function **setup** → **Run** → allow the permissions. The log shows the data sheet link; the Director (Harsh Yadav) is already on the access list as admin.
5. **Deploy → New deployment → Web app** · Execute as **Me** · Who has access **Anyone** → Deploy → copy the `/exec` URL.
6. Paste that URL into `API_URL` near the top of the script in `events/index.html` (or send it and it will be added), then remove the "Setting up" tag from the hub tile.

## Who can do what

| | Director / admin | Other members |
|---|---|---|
| Open the app | yes | only if on the access list |
| Create / edit / delete events | yes | no |
| Add tasks and operations, allocate to members | yes | yes |
| Update status and remarks | any task | tasks allocated to them or created by them |
| Edit / delete a task | any | only their own creation |
| Reports | every member and event | their own only |
| Access list, sample data | yes | no |

Login: the member's name (first name is enough if unique) and password = first name + `STAFF_SUFFIX`. Add or remove members from the name button (top right) → Members. A removed member loses access immediately. **Sign-out everywhere:** run `signOutEveryone`.

## Updating later

Paste the new `Code.gs`, then **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**.

## Privacy note

The app shows staff names, task remarks and completion times. Keep the access list to the people who need it.
