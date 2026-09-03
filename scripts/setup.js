// One-time (and safely re-runnable) database setup: creates all tables if
// they don't exist, then upserts everything from data/seed-data.js.
//
// Usage:
//   DATABASE_URL=postgres://... npm run setup
// or just `npm run setup` if DATABASE_URL is in a local .env file.
require('../lib/env').loadEnv();

const { q, pool, slugify } = require('../data/db');
const { hashPassword, newId, newToken } = require('../lib/auth');
const { zonedTimeToUtc, addDays } = require('../lib/tz');
const seed = require('../data/seed-data');

const TZ = process.env.CONFERENCE_TIMEZONE || 'America/Denver';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tracks (
  id text PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  color_hex text NOT NULL,
  text_hex text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS rooms (
  id text PRIMARY KEY,
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  capacity int,
  is_breakout boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS conference_days (
  id text PRIMARY KEY,
  day_number int UNIQUE NOT NULL,
  date date NOT NULL,
  label text NOT NULL,
  subtitle text
);
CREATE TABLE IF NOT EXISTS speakers (
  id text PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  full_name text NOT NULL,
  title text,
  company text,
  bio text,
  headshot_url text,
  linkedin_url text,
  website_url text,
  is_keynote boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  day_id text NOT NULL REFERENCES conference_days(id),
  room_id text REFERENCES rooms(id),
  track_id text REFERENCES tracks(id),
  title text NOT NULL,
  description text,
  session_type text NOT NULL DEFAULT 'breakout',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  capacity int,
  is_registrable boolean NOT NULL DEFAULT true,
  is_published boolean NOT NULL DEFAULT true,
  has_room_conflict boolean NOT NULL DEFAULT false,
  notes text,
  sort_order int NOT NULL DEFAULT 0,
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_sessions_day_start ON sessions (day_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_sessions_room_start ON sessions (room_id, starts_at);
CREATE TABLE IF NOT EXISTS session_speakers (
  session_id text NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  speaker_id text NOT NULL REFERENCES speakers(id) ON DELETE CASCADE,
  speaking_order int NOT NULL DEFAULT 0,
  role_label text,
  PRIMARY KEY (session_id, speaker_id)
);
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text UNIQUE NOT NULL,
  username text UNIQUE,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  job_title text,
  company text,
  bio text,
  avatar_color text NOT NULL DEFAULT '#C4E538',
  linkedin_url text,
  role text NOT NULL DEFAULT 'attendee',
  share_attendance boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  feed_token text UNIQUE,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS registrations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id text NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'going',
  conflict_acknowledged boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'web',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_id)
);
CREATE INDEX IF NOT EXISTS idx_registrations_user ON registrations (user_id);
CREATE INDEX IF NOT EXISTS idx_registrations_session ON registrations (session_id);
CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY,
  token_hash text UNIQUE NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS conference_settings (
  id int PRIMARY KEY CHECK (id = 1),
  name text NOT NULL,
  presenter text,
  tagline text,
  date_range_label text,
  venue_name text,
  venue_secondary text,
  venue_address text,
  partners jsonb NOT NULL DEFAULT '[]',
  timezone text NOT NULL DEFAULT 'America/Denver',
  footer_note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ===== Day 2 additions: profiles/magic-link, chat, live session notes =====
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS twitter_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS website_url text;

CREATE TABLE IF NOT EXISTS chat_rooms (
  id text PRIMARY KEY,
  kind text NOT NULL DEFAULT 'session',
  session_id text REFERENCES sessions(id) ON DELETE CASCADE,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY,
  room_id text NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created ON chat_messages (room_id, created_at);
CREATE TABLE IF NOT EXISTS chat_read_state (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id text NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, room_id)
);

CREATE TABLE IF NOT EXISTS session_recordings (
  id uuid PRIMARY KEY,
  session_id text NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  started_by uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'recording',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  transcript text,
  summary text,
  action_items jsonb,
  shared boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_session_recordings_session ON session_recordings (session_id);
CREATE TABLE IF NOT EXISTS recording_chunks (
  id uuid PRIMARY KEY,
  recording_id uuid NOT NULL REFERENCES session_recordings(id) ON DELETE CASCADE,
  seq int NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  transcript text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recording_id, seq)
);
`;

// Storage bucket + RLS + Realtime publication — Supabase-specific, safe to
// re-run. Chat/recordings are treated as fully public within the conference
// (no DMs, no private rooms), so read access is open to any Realtime
// subscriber; all writes still go through our own backend (which connects
// as the `postgres` role and bypasses RLS), so these policies only govern
// what the browser can read directly via Supabase Realtime/Storage.
const SUPABASE_EXTRAS_SQL = `
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Avatar public read" ON storage.objects;
CREATE POLICY "Avatar public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Avatar upload by owner" ON storage.objects;
CREATE POLICY "Avatar upload by owner" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Avatar update by owner" ON storage.objects;
CREATE POLICY "Avatar update by owner" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Chat rooms public read" ON chat_rooms;
CREATE POLICY "Chat rooms public read" ON chat_rooms FOR SELECT USING (true);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Chat messages public read" ON chat_messages;
CREATE POLICY "Chat messages public read" ON chat_messages FOR SELECT USING (true);

ALTER TABLE session_recordings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Recordings public read" ON session_recordings;
CREATE POLICY "Recordings public read" ON session_recordings FOR SELECT USING (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'session_recordings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE session_recordings;
  END IF;
END $$;
`;

async function main() {
  console.log('Creating tables (if not present)...');
  await q(SCHEMA);

  console.log('Setting up Storage bucket, RLS policies, and Realtime publication...');
  try {
    await q(SUPABASE_EXTRAS_SQL);
  } catch (err) {
    console.warn('  Skipped Supabase-specific setup (fine on non-Supabase Postgres):', err.message);
  }

  const day1Date = process.env.CONFERENCE_START_DATE || addDays(new Date().toISOString().slice(0, 10), 1);
  const day2Date = addDays(day1Date, 1);
  const dayDates = { 1: day1Date, 2: day2Date };
  const weekday = (d) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long' }).format(new Date(`${d}T12:00:00Z`));

  console.log(`Seeding days: Day 1 = ${day1Date}, Day 2 = ${day2Date}`);
  for (const d of seed.days) {
    const date = dayDates[d.dayNumber];
    await q(
      `INSERT INTO conference_days (id, day_number, date, label, subtitle) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET date = $3, label = $4, subtitle = $5`,
      [`day-${d.dayNumber}`, d.dayNumber, date, weekday(date), d.subtitle || null]
    );
  }

  console.log(`Seeding ${seed.tracks.length} tracks...`);
  for (const t of seed.tracks) {
    await q(
      `INSERT INTO tracks (id, slug, name, color_hex, text_hex, sort_order, is_active) VALUES ($1,$2,$3,$4,$5,$6,true)
       ON CONFLICT (id) DO UPDATE SET name=$3, color_hex=$4, text_hex=$5, sort_order=$6`,
      [t.slug, t.slug, t.name, t.colorHex, t.textHex, t.sortOrder]
    );
  }

  console.log(`Seeding ${seed.rooms.length} rooms...`);
  for (const r of seed.rooms) {
    await q(
      `INSERT INTO rooms (id, code, name, capacity, is_breakout, sort_order) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET name=$3, capacity=$4, is_breakout=$5, sort_order=$6`,
      [r.code, r.code, r.name, r.capacity ?? null, r.isBreakout, r.sortOrder]
    );
  }

  console.log(`Seeding ${seed.speakers.length} speakers...`);
  for (const s of seed.speakers) {
    await q(
      `INSERT INTO speakers (id, slug, full_name, title, company, bio, headshot_url, linkedin_url, website_url, is_keynote)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET full_name=$3, title=$4, company=$5, bio=$6, headshot_url=$7, linkedin_url=$8, website_url=$9, is_keynote=$10`,
      [s.slug, s.slug, s.fullName, s.title || null, s.company || null, s.bio || null, s.headshotUrl || null, s.linkedinUrl || null, s.websiteUrl || null, !!s.isKeynote]
    );
  }

  console.log(`Seeding ${seed.sessions.length} sessions...`);
  for (const sIn of seed.sessions) {
    const dateStr = dayDates[sIn.dayNumber];
    const startsAt = zonedTimeToUtc(dateStr, sIn.start, TZ).toISOString();
    const endsAt = zonedTimeToUtc(dateStr, sIn.end, TZ).toISOString();
    await q(
      `INSERT INTO sessions (id, slug, day_id, room_id, track_id, title, description, session_type,
        starts_at, ends_at, capacity, is_registrable, is_published, has_room_conflict, notes, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,$13,$14,$15)
       ON CONFLICT (id) DO UPDATE SET day_id=$3, room_id=$4, track_id=$5, title=$6, description=$7,
        session_type=$8, starts_at=$9, ends_at=$10, capacity=$11, is_registrable=$12, has_room_conflict=$13, notes=$14, sort_order=$15`,
      [
        sIn.slug, sIn.slug, `day-${sIn.dayNumber}`, sIn.roomCode || null, sIn.trackSlug || null,
        sIn.title, sIn.description || null, sIn.sessionType || 'breakout', startsAt, endsAt,
        sIn.capacity ?? null, sIn.isRegistrable !== false, !!sIn.hasRoomConflict, sIn.notes || null, sIn.sortOrder || 0,
      ]
    );
    await q('DELETE FROM session_speakers WHERE session_id = $1', [sIn.slug]);
    const speakerSlugs = sIn.speakerSlugs || [];
    for (let i = 0; i < speakerSlugs.length; i++) {
      await q(
        'INSERT INTO session_speakers (session_id, speaker_id, speaking_order, role_label) VALUES ($1,$2,$3,$4)',
        [sIn.slug, speakerSlugs[i].slug, i, speakerSlugs[i].roleLabel || null]
      );
    }
  }

  console.log('Seeding chat rooms (lounge + one per session)...');
  await q(
    `INSERT INTO chat_rooms (id, kind, session_id, name) VALUES ('lounge','lounge',NULL,'Conference Lounge')
     ON CONFLICT (id) DO NOTHING`
  );
  for (const sIn of seed.sessions) {
    await q(
      `INSERT INTO chat_rooms (id, kind, session_id, name) VALUES ($1,'session',$1,$2)
       ON CONFLICT (id) DO UPDATE SET name = $2`,
      [sIn.slug, sIn.title]
    );
  }

  console.log(`Seeding ${seed.users.length} users (skipped if they already exist)...`);
  for (const u of seed.users) {
    await q(
      `INSERT INTO users (id, email, username, password_hash, full_name, job_title, company, bio,
        avatar_color, linkedin_url, role, share_attendance, is_active, feed_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,$13)
       ON CONFLICT (email) DO NOTHING`,
      [
        newId(), u.email, u.username || null, hashPassword(u.password), u.fullName,
        u.jobTitle || null, u.company || null, u.bio || null, u.avatarColor || '#C4E538',
        null, u.role || 'attendee', u.shareAttendance !== false, newToken(),
      ]
    );
  }

  console.log(`Seeding ${(seed.registrations || []).length} demo registrations (skipped if already present)...`);
  for (const r of seed.registrations || []) {
    const { rows } = await q('SELECT id FROM users WHERE email = $1', [r.userEmail]);
    if (!rows[0]) continue;
    await q(
      `INSERT INTO registrations (id, user_id, session_id, status, conflict_acknowledged, source)
       VALUES ($1,$2,$3,'going',$4,'seed') ON CONFLICT (user_id, session_id) DO NOTHING`,
      [newId(), rows[0].id, r.sessionSlug, !!r.conflictAcknowledged]
    );
  }

  const days = seed.days.slice().sort((a, b) => a.dayNumber - b.dayNumber);
  const dateRangeLabel = `${weekday(dayDates[days[0].dayNumber])}–${weekday(dayDates[days[days.length - 1].dayNumber])}, ${dayDates[days[days.length - 1].dayNumber].slice(0, 4)}`;

  console.log('Seeding conference settings...');
  await q(
    `INSERT INTO conference_settings (id, name, presenter, tagline, date_range_label, venue_name,
      venue_secondary, venue_address, partners, timezone, footer_note)
     VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (id) DO UPDATE SET name=$1, presenter=$2, tagline=$3, date_range_label=$4,
      venue_name=$5, venue_secondary=$6, venue_address=$7, partners=$8, timezone=$9, footer_note=$10`,
    [
      seed.settings.name, seed.settings.presenter, seed.settings.tagline, dateRangeLabel,
      seed.settings.venueName, seed.settings.venueSecondary || null, seed.settings.venueAddress || null,
      JSON.stringify(seed.settings.partners || []), seed.settings.timezone || TZ, seed.settings.footerNote || null,
    ]
  );

  console.log('\nDone. Admin login: admin / password1 (change this before going public — see README).');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
