const { Pool } = require('pg');
const { hashPassword, newToken, sha256, newId } = require('../lib/auth');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Point it at a Supabase or local Postgres instance — see README.md.');
}
const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);

const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

function q(text, params) {
  return pool.query(text, params);
}

// ---------- lookups ----------
async function listTracks() {
  const { rows } = await q('SELECT * FROM tracks WHERE is_active ORDER BY sort_order');
  return rows.map(mapTrack);
}
async function listRooms() {
  const { rows } = await q('SELECT * FROM rooms ORDER BY sort_order');
  return rows.map(mapRoom);
}
async function listDays() {
  const { rows } = await q('SELECT * FROM conference_days ORDER BY day_number');
  return rows.map(mapDay);
}
async function getTrack(id) {
  if (!id) return null;
  const { rows } = await q('SELECT * FROM tracks WHERE id = $1', [id]);
  return rows[0] ? mapTrack(rows[0]) : null;
}
async function getRoom(id) {
  if (!id) return null;
  const { rows } = await q('SELECT * FROM rooms WHERE id = $1', [id]);
  return rows[0] ? mapRoom(rows[0]) : null;
}
async function getDay(id) {
  const { rows } = await q('SELECT * FROM conference_days WHERE id = $1', [id]);
  return rows[0] ? mapDay(rows[0]) : null;
}
async function listSpeakers({ keynote } = {}) {
  const clauses = [];
  const params = [];
  if (keynote === true) clauses.push('is_keynote = true');
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await q(`SELECT * FROM speakers ${where} ORDER BY full_name`, params);
  return rows.map(mapSpeaker);
}
async function getSpeakerBySlug(slug) {
  const { rows } = await q('SELECT * FROM speakers WHERE slug = $1', [slug]);
  return rows[0] ? mapSpeaker(rows[0]) : null;
}

async function attendeesForSession(sessionId) {
  const { rows } = await q(
    `SELECT u.* FROM registrations r JOIN users u ON u.id = r.user_id
     WHERE r.session_id = $1 AND r.status = 'going' AND u.is_active`,
    [sessionId]
  );
  const visible = rows
    .filter((u) => u.share_attendance)
    .map((u) => ({ id: u.id, fullName: u.full_name, jobTitle: u.job_title, company: u.company, avatarColor: u.avatar_color }));
  const privateCount = rows.filter((u) => !u.share_attendance).length;
  return { visible, privateCount, total: rows.length };
}

async function speakersForSession(sessionId) {
  const { rows } = await q(
    `SELECT sp.*, ss.role_label, ss.speaking_order FROM session_speakers ss
     JOIN speakers sp ON sp.id = ss.speaker_id
     WHERE ss.session_id = $1 ORDER BY ss.speaking_order`,
    [sessionId]
  );
  return rows.map((r) => ({ ...mapSpeaker(r), roleLabel: r.role_label }));
}

async function findOverlaps(userId, targetSession) {
  const { rows } = await q(
    `SELECT s.* FROM sessions s JOIN registrations r ON r.session_id = s.id
     WHERE r.user_id = $1 AND r.status = 'going' AND s.id != $2
       AND s.starts_at < $3 AND $4 < s.ends_at`,
    [userId, targetSession.id, targetSession.ends_at, targetSession.starts_at]
  );
  return rows.map(mapSession);
}

async function toSessionDTO(session, { userId } = {}) {
  const [track, room, day, attendees, speakers] = await Promise.all([
    getTrack(session.trackId),
    getRoom(session.roomId),
    getDay(session.dayId),
    attendeesForSession(session.id),
    speakersForSession(session.id),
  ]);
  const dto = {
    id: session.id,
    slug: session.slug,
    dayNumber: day ? day.dayNumber : null,
    dayId: session.dayId,
    roomId: session.roomId,
    roomCode: room ? room.code : null,
    roomName: room ? room.name : null,
    isBreakoutRoom: room ? room.isBreakout : null,
    trackId: session.trackId,
    trackSlug: track ? track.slug : null,
    trackName: track ? track.name : null,
    colorHex: track ? track.colorHex : null,
    textHex: track ? track.textHex : null,
    title: session.title,
    description: session.description,
    sessionType: session.sessionType,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    isRegistrable: session.isRegistrable,
    isPublished: session.isPublished,
    hasRoomConflict: session.hasRoomConflict,
    capacity: session.capacity,
    notes: session.notes,
    sortOrder: session.sortOrder,
    speakers: speakers.map((s) => ({ slug: s.slug, fullName: s.fullName, title: s.title, company: s.company, roleLabel: s.roleLabel })),
    attendeeCount: attendees.total,
    attendeesVisible: attendees.visible,
    attendeesPrivateCount: attendees.privateCount,
  };
  if (userId) {
    const { rows } = await q(
      `SELECT 1 FROM registrations WHERE user_id = $1 AND session_id = $2 AND status = 'going'`,
      [userId, session.id]
    );
    dto.isRegistered = rows.length > 0;
    const overlaps = await findOverlaps(userId, {
      id: session.id,
      starts_at: session.startsAt,
      ends_at: session.endsAt,
    });
    dto.conflictsWith = overlaps.map((c) => ({ id: c.id, title: c.title }));
  }
  return dto;
}

async function listSessions({ day, track, room, q: search, userId, publishedOnly = true } = {}) {
  const clauses = [];
  const params = [];
  if (publishedOnly) clauses.push('s.is_published');
  if (day) {
    params.push(Number(day));
    clauses.push(`d.day_number = $${params.length}`);
  }
  if (track) {
    params.push(track);
    clauses.push(`s.track_id = $${params.length}`);
  }
  if (room) {
    params.push(room);
    clauses.push(`s.room_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    clauses.push(`(LOWER(s.title) LIKE $${params.length} OR EXISTS (
      SELECT 1 FROM session_speakers ss2 JOIN speakers sp2 ON sp2.id = ss2.speaker_id
      WHERE ss2.session_id = s.id AND LOWER(sp2.full_name) LIKE $${params.length}
    ))`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await q(
    `SELECT s.* FROM sessions s JOIN conference_days d ON d.id = s.day_id
     ${where} ORDER BY s.starts_at, s.sort_order`,
    params
  );
  const sessions = rows.map(mapSession);
  return Promise.all(sessions.map((s) => toSessionDTO(s, { userId })));
}

async function getSessionBySlug(slug) {
  const { rows } = await q('SELECT * FROM sessions WHERE slug = $1', [slug]);
  return rows[0] ? mapSession(rows[0]) : null;
}
async function getSessionById(id) {
  const { rows } = await q('SELECT * FROM sessions WHERE id = $1', [id]);
  return rows[0] ? mapSession(rows[0]) : null;
}

// ---------- users ----------
async function listUsers({ q: search, role, active, page = 1, pageSize = 25 } = {}) {
  const clauses = [];
  const params = [];
  if (role) {
    params.push(role);
    clauses.push(`role = $${params.length}`);
  }
  if (active === 'true') clauses.push('is_active');
  if (active === 'false') clauses.push('NOT is_active');
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    clauses.push(`(LOWER(full_name) LIKE $${params.length} OR LOWER(email) LIKE $${params.length} OR LOWER(COALESCE(company,'')) LIKE $${params.length})`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows: countRows } = await q(`SELECT COUNT(*)::int AS total FROM users ${where}`, params);
  const total = countRows[0].total;
  const offset = (page - 1) * pageSize;
  params.push(pageSize, offset);
  const { rows } = await q(
    `SELECT * FROM users ${where} ORDER BY full_name LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const users = await Promise.all(rows.map((r) => publicUser(mapUser(r))));
  return { total, page: Number(page), pageSize, users };
}

async function publicUser(u) {
  if (!u) return null;
  const { rows } = await q(`SELECT COUNT(*)::int AS c FROM registrations WHERE user_id = $1 AND status = 'going'`, [u.id]);
  const { passwordHash, ...rest } = u;
  return { ...rest, sessionCount: rows[0].c };
}

async function getUserById(id) {
  const { rows } = await q('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] ? mapUser(rows[0]) : null;
}
async function getUserByEmailOrUsername(identifier) {
  const { rows } = await q(
    'SELECT * FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($1)',
    [identifier]
  );
  return rows[0] ? mapUser(rows[0]) : null;
}
async function getUserByFeedToken(token) {
  const { rows } = await q('SELECT * FROM users WHERE feed_token = $1', [token]);
  return rows[0] ? mapUser(rows[0]) : null;
}

async function createUser(fields) {
  const existing = await getUserByEmailOrUsername(fields.email);
  if (existing) {
    const err = new Error('EMAIL_TAKEN');
    err.code = 'EMAIL_TAKEN';
    throw err;
  }
  const id = newId();
  await q(
    `INSERT INTO users (id, email, username, password_hash, full_name, job_title, company, bio,
      avatar_color, linkedin_url, role, share_attendance, is_active, feed_token)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,$13)`,
    [
      id, fields.email, fields.username || null, hashPassword(fields.password), fields.fullName,
      fields.jobTitle || null, fields.company || null, fields.bio || null,
      fields.avatarColor || '#C4E538', fields.linkedinUrl || null, fields.role || 'attendee',
      fields.shareAttendance !== false, newToken(),
    ]
  );
  return getUserById(id);
}

async function updateUser(id, fields) {
  const map = {
    fullName: 'full_name', jobTitle: 'job_title', company: 'company', bio: 'bio',
    avatarColor: 'avatar_color', linkedinUrl: 'linkedin_url', shareAttendance: 'share_attendance',
    role: 'role', isActive: 'is_active', email: 'email', username: 'username',
  };
  const sets = [];
  const params = [];
  for (const [key, col] of Object.entries(map)) {
    if (fields[key] !== undefined) {
      params.push(fields[key]);
      sets.push(`${col} = $${params.length}`);
    }
  }
  if (fields.password) {
    params.push(hashPassword(fields.password));
    sets.push(`password_hash = $${params.length}`);
  }
  if (!sets.length) return getUserById(id);
  params.push(id);
  await q(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  return getUserById(id);
}

async function setUserActive(id, active) {
  return updateUser(id, { isActive: active });
}

async function deleteUserHard(id) {
  await q('DELETE FROM users WHERE id = $1', [id]);
}

async function touchLogin(id) {
  await q('UPDATE users SET last_login_at = now() WHERE id = $1', [id]);
}

// ---------- auth sessions ----------
async function createAuthSession(userId, userAgent) {
  const token = newToken();
  await q(
    `INSERT INTO auth_sessions (id, token_hash, user_id, user_agent, expires_at)
     VALUES ($1,$2,$3,$4, now() + interval '7 days')`,
    [newId(), sha256(token), userId, userAgent || null]
  );
  return token;
}

async function getUserByToken(token) {
  if (!token) return null;
  const { rows } = await q(
    `SELECT u.* FROM auth_sessions a JOIN users u ON u.id = a.user_id
     WHERE a.token_hash = $1 AND a.expires_at > now()`,
    [sha256(token)]
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

async function deleteAuthSessionByToken(token) {
  await q('DELETE FROM auth_sessions WHERE token_hash = $1', [sha256(token)]);
}

// ---------- conflict detection ----------
class ConflictError extends Error {
  constructor(conflicts, target) {
    super('TIME_CONFLICT');
    this.code = 'TIME_CONFLICT';
    this.conflicts = conflicts;
    this.target = target;
  }
}

async function addRegistration(userId, sessionId, { acknowledgeConflict = false, source = 'web' } = {}) {
  const target = await getSessionById(sessionId);
  if (!target) {
    const err = new Error('NOT_FOUND');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (!target.isRegistrable) {
    const err = new Error('NOT_REGISTRABLE');
    err.code = 'NOT_REGISTRABLE';
    throw err;
  }
  const conflicts = await findOverlaps(userId, {
    id: target.id,
    starts_at: target.startsAt,
    ends_at: target.endsAt,
  });
  if (conflicts.length > 0 && !acknowledgeConflict) {
    const withRooms = await Promise.all(
      conflicts.map(async (c) => ({
        id: c.id,
        title: c.title,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        roomName: c.roomId ? (await getRoom(c.roomId)).name : null,
      }))
    );
    throw new ConflictError(withRooms, { id: target.id, title: target.title, startsAt: target.startsAt, endsAt: target.endsAt });
  }
  await q(
    `INSERT INTO registrations (id, user_id, session_id, status, conflict_acknowledged, source)
     VALUES ($1,$2,$3,'going',$4,$5)
     ON CONFLICT (user_id, session_id) DO UPDATE SET status = 'going', conflict_acknowledged = $4`,
    [newId(), userId, sessionId, conflicts.length > 0, source]
  );
  return { userId, sessionId, conflictAcknowledged: conflicts.length > 0 };
}

async function removeRegistration(userId, sessionId) {
  await q('DELETE FROM registrations WHERE user_id = $1 AND session_id = $2', [userId, sessionId]);
}

async function scheduleForUser(userId) {
  const { rows } = await q(
    `SELECT s.*, r.id AS reg_id, r.conflict_acknowledged FROM registrations r
     JOIN sessions s ON s.id = r.session_id
     WHERE r.user_id = $1 AND r.status = 'going' ORDER BY s.starts_at`,
    [userId]
  );
  const items = rows.map((r) => ({ session: mapSession(r), regId: r.reg_id, conflictAcknowledged: r.conflict_acknowledged }));
  const conflictMap = new Map(items.map((i) => [i.session.id, []]));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (new Date(items[j].session.startsAt) >= new Date(items[i].session.endsAt)) break;
      conflictMap.get(items[i].session.id).push(items[j].session.id);
      conflictMap.get(items[j].session.id).push(items[i].session.id);
    }
  }
  const registrations = await Promise.all(
    items.map(async (i) => ({
      ...(await toSessionDTO(i.session, { userId })),
      registrationId: i.regId,
      conflictAcknowledged: i.conflictAcknowledged,
      conflicts: conflictMap.get(i.session.id),
    }))
  );
  const conflictCount = registrations.filter((r) => r.conflicts.length > 0).length;
  return { registrations, conflictCount };
}

// ---------- admin: speakers ----------
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function createSpeaker(fields) {
  const slug = fields.slug || slugify(fields.fullName);
  const existing = await getSpeakerBySlug(slug);
  if (existing) {
    const err = new Error('SLUG_TAKEN');
    err.code = 'SLUG_TAKEN';
    throw err;
  }
  await q(
    `INSERT INTO speakers (id, slug, full_name, title, company, bio, headshot_url, linkedin_url, website_url, is_keynote)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [slug, slug, fields.fullName, fields.title || null, fields.company || null, fields.bio || null,
     fields.headshotUrl || null, fields.linkedinUrl || null, fields.websiteUrl || null, !!fields.isKeynote]
  );
  return getSpeakerBySlug(slug);
}

async function updateSpeaker(id, fields) {
  const map = {
    fullName: 'full_name', title: 'title', company: 'company', bio: 'bio',
    headshotUrl: 'headshot_url', linkedinUrl: 'linkedin_url', websiteUrl: 'website_url', isKeynote: 'is_keynote',
  };
  const sets = [];
  const params = [];
  for (const [key, col] of Object.entries(map)) {
    if (fields[key] !== undefined) {
      params.push(fields[key]);
      sets.push(`${col} = $${params.length}`);
    }
  }
  if (!sets.length) return getSpeakerBySlug(id);
  params.push(id);
  await q(`UPDATE speakers SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  return getSpeakerBySlug(id);
}

async function deleteSpeaker(id) {
  await q('DELETE FROM speakers WHERE id = $1', [id]);
}

async function sessionCountForSpeaker(id) {
  const { rows } = await q('SELECT COUNT(*)::int AS c FROM session_speakers WHERE speaker_id = $1', [id]);
  return rows[0].c;
}

// ---------- admin: sessions ----------
async function createSession(fields) {
  const slug = fields.slug || slugify(fields.title);
  const existing = await getSessionBySlug(slug);
  if (existing) {
    const err = new Error('SLUG_TAKEN');
    err.code = 'SLUG_TAKEN';
    throw err;
  }
  await q(
    `INSERT INTO sessions (id, slug, day_id, room_id, track_id, title, description, session_type,
      starts_at, ends_at, capacity, is_registrable, is_published, has_room_conflict, notes, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      slug, slug, fields.dayId, fields.roomId || null, fields.trackId || null, fields.title,
      fields.description || null, fields.sessionType || 'breakout', fields.startsAt, fields.endsAt,
      fields.capacity ?? null, fields.isRegistrable !== false, fields.isPublished !== false,
      !!fields.hasRoomConflict, fields.notes || null, fields.sortOrder || 0,
    ]
  );
  if (fields.speakerIds && fields.speakerIds.length) {
    await setSessionSpeakers(slug, fields.speakerIds);
  }
  return getSessionBySlug(slug);
}

async function setSessionSpeakers(sessionId, speakerIds) {
  await q('DELETE FROM session_speakers WHERE session_id = $1', [sessionId]);
  for (let i = 0; i < speakerIds.length; i++) {
    await q(
      'INSERT INTO session_speakers (session_id, speaker_id, speaking_order) VALUES ($1,$2,$3)',
      [sessionId, speakerIds[i], i]
    );
  }
}

async function updateSession(id, fields) {
  const map = {
    dayId: 'day_id', roomId: 'room_id', trackId: 'track_id', title: 'title', description: 'description',
    sessionType: 'session_type', startsAt: 'starts_at', endsAt: 'ends_at', capacity: 'capacity',
    isRegistrable: 'is_registrable', isPublished: 'is_published', hasRoomConflict: 'has_room_conflict',
    notes: 'notes', sortOrder: 'sort_order',
  };
  const sets = [];
  const params = [];
  for (const [key, col] of Object.entries(map)) {
    if (fields[key] !== undefined) {
      params.push(fields[key]);
      sets.push(`${col} = $${params.length}`);
    }
  }
  if (sets.length) {
    params.push(id);
    await q(`UPDATE sessions SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  }
  if (fields.speakerIds) {
    await setSessionSpeakers(id, fields.speakerIds);
  }
  return getSessionById(id);
}

async function registrationCountForSession(id) {
  const { rows } = await q(`SELECT COUNT(*)::int AS c FROM registrations WHERE session_id = $1 AND status = 'going'`, [id]);
  return rows[0].c;
}

async function deleteSession(id) {
  await q('DELETE FROM sessions WHERE id = $1', [id]);
}

// ---------- settings ----------
async function getSettings() {
  const { rows } = await q('SELECT * FROM conference_settings WHERE id = 1');
  return rows[0] ? mapSettings(rows[0]) : null;
}
async function updateSettings(fields) {
  const map = {
    name: 'name', presenter: 'presenter', tagline: 'tagline', dateRangeLabel: 'date_range_label',
    venueName: 'venue_name', venueSecondary: 'venue_secondary', venueAddress: 'venue_address',
    partners: 'partners', timezone: 'timezone', footerNote: 'footer_note',
  };
  const sets = [];
  const params = [];
  for (const [key, col] of Object.entries(map)) {
    if (fields[key] !== undefined) {
      params.push(key === 'partners' ? JSON.stringify(fields[key]) : fields[key]);
      sets.push(`${col} = $${params.length}`);
    }
  }
  if (sets.length) {
    await q(`UPDATE conference_settings SET ${sets.join(', ')}, updated_at = now() WHERE id = 1`, params);
  }
  return getSettings();
}

// ---------- admin stats ----------
async function adminStats() {
  const [{ rows: u1 }, { rows: u2 }, { rows: s1 }, { rows: r1 }] = await Promise.all([
    q('SELECT COUNT(*)::int AS c FROM users'),
    q('SELECT COUNT(*)::int AS c FROM users WHERE is_active'),
    q('SELECT COUNT(*)::int AS c FROM sessions'),
    q(`SELECT COUNT(*)::int AS c FROM registrations WHERE status = 'going'`),
  ]);
  const totalUsers = u1[0].c;
  const activeUsers = u2[0].c;
  const totalSessions = s1[0].c;
  const totalRegistrations = r1[0].c;
  const avgSessionsPerUser = activeUsers ? (totalRegistrations / activeUsers).toFixed(1) : '0.0';

  const { rows: activeUserRows } = await q('SELECT id FROM users WHERE is_active');
  let usersWithConflicts = 0;
  for (const u of activeUserRows) {
    const { conflictCount } = await scheduleForUser(u.id);
    if (conflictCount > 0) usersWithConflicts++;
  }

  const { rows: recentRows } = await q(
    `SELECT r.created_at, u.*, s.title AS session_title FROM registrations r
     JOIN users u ON u.id = r.user_id JOIN sessions s ON s.id = r.session_id
     ORDER BY r.created_at DESC LIMIT 10`
  );
  const recentRegistrations = await Promise.all(
    recentRows.map(async (r) => ({
      user: await publicUser(mapUser(r)),
      session: r.session_title,
      createdAt: r.created_at,
    }))
  );

  return { totalUsers, activeUsers, totalSessions, totalRegistrations, avgSessionsPerUser, usersWithConflicts, recentRegistrations };
}

async function exportRegistrationsCsv() {
  const { rows } = await q(
    `SELECT u.full_name, u.email, u.company, s.title AS session_title, d.day_number, s.starts_at, rm.name AS room_name
     FROM registrations r
     JOIN users u ON u.id = r.user_id
     JOIN sessions s ON s.id = r.session_id
     JOIN conference_days d ON d.id = s.day_id
     LEFT JOIN rooms rm ON rm.id = s.room_id
     WHERE r.status = 'going'
     ORDER BY s.starts_at`
  );
  const header = ['User', 'Email', 'Company', 'Session', 'Day', 'Start', 'Room'];
  const lines = [header, ...rows.map((r) => [
    r.full_name, r.email, r.company || '', r.session_title, `Day ${r.day_number}`, r.starts_at, r.room_name || '',
  ])];
  return lines.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

// ---------- row mappers ----------
function mapTrack(r) {
  return { id: r.id, slug: r.slug, name: r.name, colorHex: r.color_hex, textHex: r.text_hex, sortOrder: r.sort_order, isActive: r.is_active };
}
function mapRoom(r) {
  return { id: r.id, code: r.code, name: r.name, capacity: r.capacity, isBreakout: r.is_breakout, sortOrder: r.sort_order };
}
function mapDay(r) {
  return { id: r.id, dayNumber: r.day_number, date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date, label: r.label, subtitle: r.subtitle };
}
function mapSpeaker(r) {
  return {
    id: r.id, slug: r.slug, fullName: r.full_name, title: r.title, company: r.company, bio: r.bio,
    headshotUrl: r.headshot_url, linkedinUrl: r.linkedin_url, websiteUrl: r.website_url, isKeynote: r.is_keynote,
  };
}
function mapSession(r) {
  return {
    id: r.id, slug: r.slug, dayId: r.day_id, roomId: r.room_id, trackId: r.track_id, title: r.title,
    description: r.description, sessionType: r.session_type, startsAt: r.starts_at, endsAt: r.ends_at,
    capacity: r.capacity, isRegistrable: r.is_registrable, isPublished: r.is_published,
    hasRoomConflict: r.has_room_conflict, notes: r.notes, sortOrder: r.sort_order,
  };
}
function mapUser(r) {
  return {
    id: r.id, email: r.email, username: r.username, passwordHash: r.password_hash, fullName: r.full_name,
    jobTitle: r.job_title, company: r.company, bio: r.bio, avatarColor: r.avatar_color,
    linkedinUrl: r.linkedin_url, role: r.role, shareAttendance: r.share_attendance, isActive: r.is_active,
    feedToken: r.feed_token, lastLoginAt: r.last_login_at, createdAt: r.created_at,
  };
}
function mapSettings(r) {
  return {
    id: r.id, name: r.name, presenter: r.presenter, tagline: r.tagline, dateRangeLabel: r.date_range_label,
    venueName: r.venue_name, venueSecondary: r.venue_secondary, venueAddress: r.venue_address,
    partners: r.partners, timezone: r.timezone, footerNote: r.footer_note, updatedAt: r.updated_at,
  };
}

module.exports = {
  pool, q,
  listTracks, listRooms, listDays, getTrack, getRoom, getDay,
  listSpeakers, getSpeakerBySlug, createSpeaker, updateSpeaker, deleteSpeaker, sessionCountForSpeaker,
  listSessions, getSessionBySlug, getSessionById, toSessionDTO, attendeesForSession,
  createSession, updateSession, deleteSession, registrationCountForSession, setSessionSpeakers,
  listUsers, getUserById, getUserByEmailOrUsername, getUserByFeedToken, createUser, updateUser,
  setUserActive, deleteUserHard, touchLogin, publicUser,
  createAuthSession, getUserByToken, deleteAuthSessionByToken,
  addRegistration, removeRegistration, findOverlaps, scheduleForUser, ConflictError,
  getSettings, updateSettings, adminStats, exportRegistrationsCsv, slugify,
};
