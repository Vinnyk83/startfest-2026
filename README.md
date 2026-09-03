# StartFEST 2026

Two-day conference agenda, personal schedule, and admin back end. Plain Node.js
+ Express + Postgres (via `pg`, no ORM) and static HTML/CSS/vanilla JS on the
front end — no build step, no framework, nothing to compile.

## 1. Get a database (pick one)

**Option A — Supabase (recommended, works with Vercel):**
1. Create a free project at supabase.com.
2. Project Settings → Database → Connection string → copy the "URI" one
   (use the **pooler** connection string — port 6543 — if deploying to
   Vercel's serverless functions; the direct 5432 one is fine for local use).
3. That's your `DATABASE_URL`.

**Option B — local Postgres on your machine (dev/testing only):**
- If you have Docker: `docker run -d --name startfest-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=startfest -p 5432:5432 postgres:16-alpine`
- `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/startfest"`
- This only works for local development — Vercel's serverless functions
  cannot reach a database running on your own machine, so you'll still need
  Supabase (or another hosted Postgres) for the actual deployment.

## 2. Configure

Copy `.env.example` to `.env` and fill in `DATABASE_URL`. The other variables
have sane defaults for tonight; see the table below.

```bash
cp .env.example .env
```

| Variable | What it does | Default |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | — required |
| `SESSION_SECRET` | unused placeholder for future signed-cookie upgrade; sessions are currently random opaque tokens hashed in the DB, so this isn't load-bearing yet | — |
| `CONFERENCE_START_DATE` | Day 1's date (`YYYY-MM-DD`). Day 2 is always +1 day. | tomorrow if unset |
| `CONFERENCE_TIMEZONE` | IANA timezone for all display + seeding | `America/Denver` |
| `APP_BASE_URL` | used to build `.ics` UIDs and links | `http://localhost:3000` |
| `FORCE_ADMIN_PASSWORD_CHANGE` | reserved for a future forced-reset flow — not enforced yet, just change the password manually before going public | `false` |

## 3. Install, set up the database, run

```bash
npm install
npm run setup   # creates tables (if missing) + seeds the agenda — safe to re-run
npm start       # http://localhost:3000
```

`npm run setup` is idempotent: re-running it won't duplicate sessions/speakers/
tracks/rooms (it upserts by slug), and it will NOT overwrite existing users'
passwords or admin edits on a re-run (users/registrations are insert-if-missing
only) — that way your seed script stays safe to run again after a data fix
without clobbering real signups from attendees.

**Admin login:** `admin` / `password1` (email `admin@startfest.local` also
works as the identifier). **Change this before the URL is public** — either
log in and use a future admin-password-change flow, or run:
```sql
-- get a real hash by starting a node REPL: require('./lib/auth').hashPassword('newpassword')
UPDATE users SET password_hash = '<hash from above>' WHERE username = 'admin';
```

**Seeded attendee logins** (all password `startfest2026`): maya.ellsworth@northlooplabs.com,
devin.park@sagebrushhealth.com, priya.raman@vectatech.io, tomas.cordero@bluffpoint.co,
hannah.zhao@orchardpay.com (hannah has `shareAttendance: false` — a live example
of the "1 private attendee" rendering).

## 4. Try it locally before deploying

Open `sample.html` directly in a browser (double-click it, no server needed)
for an instant static preview of the agenda styling with the seeded data
baked in — it doesn't hit the API or a database at all, so it's the fastest
way to sanity-check the look before wiring up Postgres. It has no login,
no registration, no admin — just the agenda view.

Once `npm start` is running, the full app is at `http://localhost:3000`.
Walk the acceptance checklist below on both desktop and phone width.

## 5. Deploy to Vercel

1. Push this folder to a GitHub repo (or `vercel --prod` directly from here
   with the Vercel CLI).
2. In the Vercel project settings, add the same environment variables from
   `.env` (`DATABASE_URL` pointing at Supabase, plus the others). Set
   `APP_BASE_URL` to your real `https://your-app.vercel.app` domain —
   this matters for `.ics` links and the Google Calendar button.
3. Before the first deploy (or any time after, from your own machine),
   run `npm run setup` **once** with `DATABASE_URL` pointed at the *same*
   Supabase database Vercel will use, to create tables and seed data.
4. Deploy. `vercel.json` is already configured to route every request
   through the single Express app in `api/index.js`.

Replit works too, if you'd rather use that: set the same env vars in
Replit's Secrets panel, run `npm run setup` once from the shell, then
`npm start` (or let Replit's run button call it).

## 6. What's simplified vs. a "full spec" build

This was built fast and deliberately scoped down from a maximal version:

- **No Prisma/ORM** — plain parameterized SQL via `pg`. Fewer moving parts,
  no codegen step, easier to read and modify directly.
- **No audit log** — admin actions aren't recorded to a table. Everything
  else from the spec (conflict detection, calendar export, room-conflict
  flagging, self-lockout protection, etc.) is implemented.
- **No admin UI for tracks/rooms/conference-day dates** — those are edited
  by changing `data/seed-data.js` / `CONFERENCE_START_DATE` and re-running
  `npm run setup`, not through `/admin`. Sessions, speakers, users, and
  conference settings (name/tagline/venue/footer/partners) all have full
  admin CRUD.
- **`.ics` files use UTC timestamps** instead of a `VTIMEZONE` block — still
  fully correct (every mainstream calendar app converts a UTC instant to the
  viewer's local time), just a smaller file.
- **No email** — matches the original spec's decision; password auth only.

## 7. Before you tell attendees the URL

1. Confirm `CONFERENCE_START_DATE` is right, then run `npm run setup` again
   if you changed it (safe — see idempotency note above).
2. Change the admin password (see §3).
3. Double-check `venueAddress` in `/admin/settings` — it's a best-guess and
   is used in every attendee's calendar invite.
4. Load the deployed URL on an actual phone on cellular data, not just
   localhost.
5. `pg_dump $DATABASE_URL > backup-preconference.sql` (or use Supabase's
   built-in backup/point-in-time-restore) so a bad edit during the event
   is recoverable.

If something breaks mid-event: `/admin/sessions` lets an organizer fix a
time, title, or room from their phone, and every attendee sees the change
within 15 seconds (the agenda polls automatically).
