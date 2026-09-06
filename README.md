# Project Tracker — Recruitment Team

Single-page app for the recruitment team: projects, personal to-do lists, a shared calendar and a notification centre, behind company-email sign-in with head approval.

Deliberately a separate product from the recruitment tracker: its own database, its own identity (warm paper canvas, near-black surfaces, violet accent) and a floating pill navigation at the bottom of the screen.

## Access

- Registration is limited to `@pathao.com` addresses (`ALLOWED_EMAIL_DOMAIN`).
- The address in `HEAD_EMAIL` is approved automatically when it registers and becomes the **head**.
- Everyone else lands in a pending queue; the head authorises them from **Settings**. A head can also revoke access or promote another member to head.
- Sign-in is email + password (scrypt-hashed). **Keep me signed in on this device** stores a year-long session cookie; leaving it unticked ends the session when the browser closes.

| Rule | Enforced where |
| --- | --- |
| Only the person who assigned a task can delete it | `DELETE /api/tasks/[id]` |
| Only a project owner can delete it; sub-owners can edit | `DELETE`/`PUT /api/projects/[id]` |
| You see tasks assigned to you or by you | `GET /api/tasks` |
| You see projects you own or were added to | `GET /api/projects` |
| The calendar shows your own events and your open tasks | `GET /api/events`, calendar filter |
| Only a head can manage people or the shared lists | `/api/admin/users`, `PUT /api/settings` |

## Screens

The dark nav pill floats at bottom-centre: app mark, **Dashboard · Tasks · Projects · Calendar**, a divider, the notifications bell with its unread badge, the settings gear, and the profile pill (sign out).

| Screen | Contents |
| --- | --- |
| **Dashboard** | One matrix box with two halves — *Projects* (total entries plus a bar per status) and *Tasks* (My tasks, Tasks assigned, and the five closest upcoming events) — then the next dated items waiting on you. |
| **Tasks** | Search, a from/to date filter, and a **My tasks / Assigned / Completed** switch. *Assigned* splits into "to me" and "by me"; *Completed* shows the completion time and whether it was your own or an assigned task, filterable the same way. |
| **Projects** | Search and a project-type filter over projects you own or were added to: title, link, file type, owner, sub-owners, timeline, status. |
| **Calendar** | Month grid with your events and your open tasks (completed tasks drop off), showing who assigned each task. Click a day to inspect it and add an event on it. |
| **Notifications** | Full page with **Ongoing / Previous / All** filters, unread markers and mark-all-read. Clicking an item jumps to what it refers to. |
| **Settings** | Head: pending approvals and people management. Everyone: shared lists, account, access rules, sign out. |

## Keyboard

Every dialog focuses its title field on open. **Enter** saves, **Escape** closes without saving. Inside a notes box Enter starts a new line and **Ctrl/Cmd+Enter** saves. If a required field is missing, Enter surfaces the error instead of saving. The sign-in form submits on Enter from any field.

Times are stored 24-hour and always displayed 12-hour (`3:30 PM`). Ticking a task off plays a 480 ms sequence — the circle pops, a line draws through the title, the row slides out — and only then does the task move to Completed; the save is sent immediately and the row snaps back if it fails.

## What raises a notification

- Someone assigns you a task — you also see who assigned it on the task and on the calendar.
- Someone adds you as a sub-owner on a project.
- Someone completes a task you assigned.
- A new account registers (heads only) and a head approves an account.

Events with no start time are treated as **09:30** for reminders.

## Stack

- Next.js 15 (App Router), React 19, TypeScript
- Tailwind CSS v4 + shadcn/ui on Radix primitives
- Neon PostgreSQL (`DATABASE_URL` in `.env.local`)
- Sessions: HMAC-signed cookie, scrypt password hashing — both from Node's `crypto`, no external auth service

## Data model

- `users` — email, name, password_hash, role (head/member), status (pending/approved/blocked), who approved them and when
- `projects` — title, link, file_type, owner, sub_owners (JSON array of emails), status, start_date, end_date, notes
- `tasks` — title, notes, assigned_to, created_by, status, due_date, due_time, completed_at
- `events` — title, event_type, event_date + event_time (start), end_date + end_time, link, notes, created_by
- `notifications` — recipient, actor, kind, title, body, ref_type/ref_id, event_at, read_at
- `app_settings` — key/value JSON for the shared file-type and event-type lists

`project_files` and a few columns on `projects`/`tasks` are left over from earlier versions of the app and are no longer read.

## API

| Route | Methods |
| --- | --- |
| `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me` | POST / POST / POST / GET |
| `/api/projects`, `/api/projects/[id]` | GET, POST / PUT, DELETE |
| `/api/tasks`, `/api/tasks/[id]` | GET, POST / PUT, DELETE |
| `/api/events`, `/api/events/[id]` | GET, POST / PUT, DELETE |
| `/api/notifications` | GET, PUT (mark one or all read) |
| `/api/users` | GET (approved people, for the assignee and sub-owner pickers) |
| `/api/admin/users` | GET, PUT (approve / block / unblock / promote / demote) — head only |
| `/api/settings` | GET, PUT (head only) |
| `/api/setup` | GET (schema + counts), POST (create tables, idempotent) |

## Running it

```bash
npm run dev
```

Then open http://localhost:3000. From Claude Code in this folder, `/run` uses `.claude/launch.json` (port 3100).

First run:

1. Set `HEAD_EMAIL` in `.env.local` to the real head's `@pathao.com` address.
2. Call `POST /api/setup` once to create the tables.
3. Register with that head address — it is approved immediately.
4. Everyone else registers and waits in **Settings → Waiting for authorisation**.
