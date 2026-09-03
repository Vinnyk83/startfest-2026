require('./lib/env').loadEnv();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const db = require('./data/db');
const { verifyPassword } = require('./lib/auth');
const { buildEvent, buildCalendar } = require('./lib/ics');
const { verifySupabaseAccessToken } = require('./lib/supabase');
const { transcribeChunk } = require('./lib/deepgram');
const { summarizeTranscript } = require('./lib/summarize');

const app = express();
const isProd = process.env.NODE_ENV === 'production';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

app.use(express.json());
app.use(cookieParser());

// ---------- rate limiting (login only, in-memory, resets on redeploy) ----------
const loginAttempts = new Map();
function rateLimitLogin(req, res, next) {
  const key = req.ip;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const entry = loginAttempts.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  entry.count++;
  loginAttempts.set(key, entry);
  if (entry.count > 10) {
    return res.status(429).json({ error: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' });
  }
  next();
}

// ---------- auth plumbing ----------
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.use(
  ah(async (req, res, next) => {
    const token = req.cookies.sid;
    req.user = token ? await db.getUserByToken(token) : null;
    next();
  })
);

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  next();
}
function requireAdminApi(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'FORBIDDEN' });
  next();
}
function adminPageGuard(req, res, next) {
  if (path.extname(req.path)) return next(); // let CSS/JS assets through, only guard page loads
  if (!req.user) return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  if (req.user.role !== 'admin') return res.status(403).send('Forbidden — admin access only.');
  next();
}

function setSessionCookie(res, token) {
  res.cookie('sid', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 7 * 24 * 3600 * 1000,
    path: '/',
  });
}

function sanitizeUser(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return rest;
}

// ===================== AUTH =====================
app.post(
  '/api/auth/register',
  ah(async (req, res) => {
    const { email, password, fullName, jobTitle, company, bio } = req.body || {};
    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'VALIDATION', fields: { email: 'required', password: 'required', fullName: 'required' } });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'VALIDATION', fields: { password: 'must be at least 8 characters' } });
    }
    try {
      const user = await db.createUser({ email, password, fullName, jobTitle, company, bio });
      const token = await db.createAuthSession(user.id, req.headers['user-agent']);
      setSessionCookie(res, token);
      res.status(201).json({ user: sanitizeUser(user) });
    } catch (err) {
      if (err.code === 'EMAIL_TAKEN') return res.status(400).json({ error: 'VALIDATION', fields: { email: 'already registered' } });
      throw err;
    }
  })
);

app.post(
  '/api/auth/login',
  rateLimitLogin,
  ah(async (req, res) => {
    const { identifier, password } = req.body || {};
    const user = await db.getUserByEmailOrUsername(identifier || '');
    if (!user || !user.isActive || !verifyPassword(password || '', user.passwordHash)) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Email/username or password is incorrect.' });
    }
    const token = await db.createAuthSession(user.id, req.headers['user-agent']);
    setSessionCookie(res, token);
    await db.touchLogin(user.id);
    res.json({ user: sanitizeUser(user) });
  })
);

app.post(
  '/api/auth/logout',
  ah(async (req, res) => {
    const token = req.cookies.sid;
    if (token) await db.deleteAuthSessionByToken(token);
    res.clearCookie('sid', { path: '/' });
    res.status(204).end();
  })
);

app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  res.json({ user: sanitizeUser(req.user) });
});

// ===================== PUBLIC / ATTENDEE =====================
// Publishable-key-only config for the browser's Supabase client (magic-link
// auth, avatar storage upload, realtime chat/presence). Safe to expose —
// the publishable key has no privileged access without RLS-granted policies.
app.get('/api/public-config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || null,
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || null,
  });
});

app.get(
  '/api/settings',
  ah(async (req, res) => {
    res.json(await db.getSettings());
  })
);

app.get(
  '/api/agenda',
  ah(async (req, res) => {
    const { day, track, room, q } = req.query;
    const [settings, tracks, rooms, days, sessions] = await Promise.all([
      db.getSettings(),
      db.listTracks(),
      db.listRooms(),
      db.listDays(),
      db.listSessions({ day, track, room, q, userId: req.user ? req.user.id : null }),
    ]);
    res.json({ settings, tracks, rooms, days, sessions });
  })
);

app.get(
  '/api/sessions/:slug',
  ah(async (req, res) => {
    const session = await db.getSessionBySlug(req.params.slug);
    if (!session) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(await db.toSessionDTO(session, { userId: req.user ? req.user.id : null }));
  })
);

app.get(
  '/api/sessions/:slug/attendees',
  ah(async (req, res) => {
    const session = await db.getSessionBySlug(req.params.slug);
    if (!session) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(await db.attendeesForSession(session.id));
  })
);

app.get(
  '/api/speakers',
  ah(async (req, res) => {
    res.json(await db.listSpeakers({ keynote: req.query.keynote === 'true' }));
  })
);

app.get(
  '/api/speakers/:slug',
  ah(async (req, res) => {
    const speaker = await db.getSpeakerBySlug(req.params.slug);
    if (!speaker) return res.status(404).json({ error: 'NOT_FOUND' });
    const allSessions = await db.listSessions({ userId: req.user ? req.user.id : null });
    const sessions = allSessions.filter((s) => s.speakers.some((sp) => sp.slug === speaker.slug));
    res.json({ ...speaker, sessions });
  })
);

app.get(
  '/api/me/schedule',
  requireAuth,
  ah(async (req, res) => {
    res.json(await db.scheduleForUser(req.user.id));
  })
);

app.patch(
  '/api/me',
  requireAuth,
  ah(async (req, res) => {
    const allowed = [
      'fullName', 'jobTitle', 'company', 'bio', 'avatarColor', 'shareAttendance',
      'linkedinUrl', 'twitterUrl', 'websiteUrl', 'avatarUrl',
    ];
    const fields = {};
    for (const k of allowed) if (req.body[k] !== undefined) fields[k] = req.body[k];
    if (fields.bio && fields.bio.length > 500) {
      return res.status(400).json({ error: 'VALIDATION', fields: { bio: 'max 500 characters' } });
    }
    const user = await db.updateUser(req.user.id, fields);
    res.json({ user: sanitizeUser(user) });
  })
);

app.post(
  '/api/registrations',
  requireAuth,
  ah(async (req, res) => {
    const { sessionId, acknowledgeConflict } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: 'VALIDATION', fields: { sessionId: 'required' } });
    try {
      const reg = await db.addRegistration(req.user.id, sessionId, { acknowledgeConflict: !!acknowledgeConflict });
      res.status(201).json(reg);
    } catch (err) {
      if (err.code === 'TIME_CONFLICT') {
        return res.status(409).json({
          error: 'TIME_CONFLICT',
          message: `This overlaps ${err.conflicts.length} session${err.conflicts.length > 1 ? 's' : ''} already on your schedule.`,
          target: err.target,
          conflicts: err.conflicts,
        });
      }
      if (err.code === 'NOT_REGISTRABLE') return res.status(400).json({ error: 'NOT_REGISTRABLE', message: 'This item is not something you can add to a schedule.' });
      if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'NOT_FOUND' });
      throw err;
    }
  })
);

app.delete(
  '/api/registrations/:sessionId',
  requireAuth,
  ah(async (req, res) => {
    await db.removeRegistration(req.user.id, req.params.sessionId);
    res.status(204).end();
  })
);

// ===================== CALENDAR =====================
function locationFor(session, settings, roomName) {
  return [roomName, settings.venueName].filter(Boolean).join(', ');
}

app.get(
  '/api/calendar/session/:slug.ics',
  ah(async (req, res) => {
    const session = await db.getSessionBySlug(req.params.slug);
    if (!session) return res.status(404).send('Not found');
    const dto = await db.toSessionDTO(session);
    const settings = await db.getSettings();
    const host = new URL(APP_BASE_URL).host;
    const speakerNames = dto.speakers.map((s) => s.fullName).join(', ');
    const description = [speakerNames, `${APP_BASE_URL}/session/${session.slug}`].filter(Boolean).join('\n');
    const event = buildEvent({
      uid: `${session.id}@${host}`,
      start: session.startsAt,
      end: session.endsAt,
      summary: dto.title,
      description,
      location: locationFor(session, settings, dto.roomName),
    });
    const ics = buildCalendar({ calname: dto.title, events: [event], method: 'PUBLISH' });
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${session.slug}.ics"`);
    res.send(ics);
  })
);

app.get(
  '/api/calendar/me.ics',
  requireAuth,
  ah(async (req, res) => {
    const { registrations } = await db.scheduleForUser(req.user.id);
    const settings = await db.getSettings();
    const host = new URL(APP_BASE_URL).host;
    const events = registrations.map((r) =>
      buildEvent({
        uid: `${r.id}@${host}`,
        start: r.startsAt,
        end: r.endsAt,
        summary: r.title,
        description: `${r.speakers.map((s) => s.fullName).join(', ')}\n${APP_BASE_URL}/session/${r.slug}`,
        location: locationFor(r, settings, r.roomName),
      })
    );
    const ics = buildCalendar({ calname: 'StartFEST — My Schedule', events, method: 'PUBLISH' });
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="my-schedule.ics"');
    res.send(ics);
  })
);

app.get(
  '/api/calendar/feed/:feedToken.ics',
  ah(async (req, res) => {
    const user = await db.getUserByFeedToken(req.params.feedToken);
    if (!user) return res.status(404).send('Not found');
    const { registrations } = await db.scheduleForUser(user.id);
    const settings = await db.getSettings();
    const host = new URL(APP_BASE_URL).host;
    const events = registrations.map((r) =>
      buildEvent({
        uid: `${r.id}@${host}`,
        start: r.startsAt,
        end: r.endsAt,
        summary: r.title,
        description: `${r.speakers.map((s) => s.fullName).join(', ')}\n${APP_BASE_URL}/session/${r.slug}`,
        location: locationFor(r, settings, r.roomName),
      })
    );
    const ics = buildCalendar({ calname: 'StartFEST — My Schedule', events, method: 'PUBLISH' });
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.send(ics);
  })
);

// ===================== MAGIC LINK SYNC =====================
// The browser talks to Supabase directly to send/verify the magic-link email
// (via the publishable key). Once Supabase confirms the click, the browser
// hands us the resulting access token here; we verify it server-side and
// mint our OWN session cookie exactly as the password-login flow does — so
// every existing authenticated route keeps working unchanged.
app.post(
  '/api/auth/sync',
  ah(async (req, res) => {
    const { access_token } = req.body || {};
    if (!access_token) return res.status(400).json({ error: 'VALIDATION', fields: { access_token: 'required' } });
    const supaUser = await verifySupabaseAccessToken(access_token);
    if (!supaUser || !supaUser.email) return res.status(401).json({ error: 'INVALID_TOKEN' });
    const user = await db.createOrGetAttendeeByAuthUser({
      email: supaUser.email,
      authUserId: supaUser.id,
      fullName: supaUser.user_metadata && supaUser.user_metadata.full_name,
    });
    if (!user.isActive) return res.status(403).json({ error: 'FORBIDDEN', message: 'This account has been deactivated.' });
    const token = await db.createAuthSession(user.id, req.headers['user-agent']);
    setSessionCookie(res, token);
    await db.touchLogin(user.id);
    res.json({ user: sanitizeUser(user) });
  })
);

// ===================== CHAT =====================
app.get(
  '/api/chat/rooms',
  ah(async (req, res) => {
    const rooms = await db.listChatRooms();
    const unread = req.user ? await db.unreadCountsForUser(req.user.id) : {};
    res.json(rooms.map((r) => ({ ...r, unread: unread[r.id] || 0 })));
  })
);

app.get(
  '/api/chat/rooms/:roomId/messages',
  ah(async (req, res) => {
    const room = await db.getChatRoom(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'NOT_FOUND' });
    const messages = await db.listChatMessages(req.params.roomId, {
      before: req.query.before,
      limit: req.query.limit ? Number(req.query.limit) : 50,
    });
    res.json({ messages });
  })
);

app.post(
  '/api/chat/rooms/:roomId/messages',
  requireAuth,
  ah(async (req, res) => {
    const room = await db.getChatRoom(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'NOT_FOUND' });
    const body = ((req.body && req.body.body) || '').trim();
    if (!body) return res.status(400).json({ error: 'VALIDATION', fields: { body: 'required' } });
    if (body.length > 1000) return res.status(400).json({ error: 'VALIDATION', fields: { body: 'max 1000 characters' } });
    const message = await db.postChatMessage(req.params.roomId, req.user.id, body);
    res.status(201).json(message);
  })
);

app.post(
  '/api/chat/rooms/:roomId/read',
  requireAuth,
  ah(async (req, res) => {
    await db.markRoomRead(req.user.id, req.params.roomId);
    res.status(204).end();
  })
);

// ===================== DIRECTORY + TRENDING =====================
app.get(
  '/api/directory',
  ah(async (req, res) => {
    res.json(await db.listDirectory({ q: req.query.q }));
  })
);

app.get(
  '/api/trending',
  ah(async (req, res) => {
    res.json(await db.trendingSessions());
  })
);

// ===================== LIVE SESSION NOTES =====================
app.get(
  '/api/sessions/:slug/recordings/active',
  ah(async (req, res) => {
    const session = await db.getSessionBySlug(req.params.slug);
    if (!session) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ recording: await db.activeRecordingForSession(session.id) });
  })
);

// Most recent recording regardless of status — lets the page show a
// finished summary after a reload, not just while a tab was kept open
// through the whole recording→processing→complete lifecycle.
app.get(
  '/api/sessions/:slug/recordings/latest',
  ah(async (req, res) => {
    const session = await db.getSessionBySlug(req.params.slug);
    if (!session) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ recording: await db.latestRecordingForSession(session.id) });
  })
);

app.post(
  '/api/sessions/:slug/recordings',
  requireAuth,
  ah(async (req, res) => {
    const session = await db.getSessionBySlug(req.params.slug);
    if (!session) return res.status(404).json({ error: 'NOT_FOUND' });
    const existing = await db.activeRecordingForSession(session.id);
    if (existing) return res.status(200).json(existing);
    const recording = await db.createRecording(session.id, req.user.id);
    res.status(201).json(recording);
  })
);

app.post(
  '/api/recordings/:id/chunks',
  requireAuth,
  upload.single('audio'),
  ah(async (req, res) => {
    const recording = await db.getRecording(req.params.id);
    if (!recording) return res.status(404).json({ error: 'NOT_FOUND' });
    if (recording.status !== 'recording') return res.status(400).json({ error: 'NOT_RECORDING' });
    const seq = Number(req.body.seq);
    if (!req.file || Number.isNaN(seq)) {
      return res.status(400).json({ error: 'VALIDATION', fields: { seq: 'required', audio: 'required' } });
    }
    const chunk = await db.addRecordingChunk(recording.id, seq);
    try {
      const transcript = await transcribeChunk(req.file.buffer, req.file.mimetype);
      await db.setChunkTranscript(chunk.id, transcript, 'transcribed');
      res.status(201).json({ chunkId: chunk.id, status: 'transcribed' });
    } catch (err) {
      await db.setChunkTranscript(chunk.id, null, 'failed');
      if (err.code === 'DEEPGRAM_NOT_CONFIGURED') {
        return res.status(503).json({ error: 'DEEPGRAM_NOT_CONFIGURED', message: 'Transcription is not configured yet.' });
      }
      res.status(502).json({ error: 'TRANSCRIBE_FAILED', message: 'Could not transcribe this chunk — it will be retried.' });
    }
  })
);

app.post(
  '/api/recordings/:id/stop',
  requireAuth,
  ah(async (req, res) => {
    const recording = await db.getRecording(req.params.id);
    if (!recording) return res.status(404).json({ error: 'NOT_FOUND' });
    await db.stopRecording(recording.id);
    const chunks = await db.listChunksForRecording(recording.id);
    const transcript = chunks
      .filter((c) => c.status === 'transcribed' && c.transcript)
      .map((c) => c.transcript)
      .join('\n');
    let summary = '';
    let actionItems = [];
    try {
      const result = await summarizeTranscript(transcript || '(no speech was transcribed)');
      summary = result.summary;
      actionItems = result.actionItems;
    } catch (err) {
      summary = 'Summary generation failed — the transcript below is still available.';
    }
    const finalRecording = await db.finalizeRecording(recording.id, { transcript, summary, actionItems });
    res.json(finalRecording);
  })
);

app.get(
  '/api/recordings/:id',
  ah(async (req, res) => {
    const recording = await db.getRecording(req.params.id);
    if (!recording) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(recording);
  })
);

app.patch(
  '/api/recordings/:id/share',
  requireAuth,
  ah(async (req, res) => {
    const recording = await db.getRecording(req.params.id);
    if (!recording) return res.status(404).json({ error: 'NOT_FOUND' });
    const updated = await db.shareRecording(recording.id, !!req.body.shared);
    if (req.body.shared && updated.summary) {
      const session = await db.getSessionById(updated.sessionId);
      if (session) {
        const actionText = (updated.actionItems || []).map((a) => `- ${a}`).join('\n');
        const body = `Session notes summary:\n${updated.summary}${actionText ? '\n\nAction items:\n' + actionText : ''}`;
        await db.postChatMessage(session.id, req.user.id, body);
      }
    }
    res.json(updated);
  })
);

// ===================== ADMIN =====================
app.use('/api/admin', requireAdminApi);

app.get(
  '/api/admin/stats',
  ah(async (req, res) => res.json(await db.adminStats()))
);

app.get(
  '/api/admin/users',
  ah(async (req, res) => {
    const { q, role, active, page } = req.query;
    res.json(await db.listUsers({ q, role, active, page: page ? Number(page) : 1 }));
  })
);

app.post(
  '/api/admin/users',
  ah(async (req, res) => {
    const body = req.body || {};
    const generatedPassword = body.password || Math.random().toString(36).slice(2, 10) + 'A1';
    try {
      const user = await db.createUser({ ...body, password: generatedPassword });
      res.status(201).json({ user: await db.publicUser(user), generatedPassword: body.password ? undefined : generatedPassword });
    } catch (err) {
      if (err.code === 'EMAIL_TAKEN') return res.status(400).json({ error: 'VALIDATION', fields: { email: 'already registered' } });
      throw err;
    }
  })
);

app.patch(
  '/api/admin/users/:id',
  ah(async (req, res) => {
    if (req.params.id === req.user.id && (req.body.role === 'attendee' || req.body.isActive === false)) {
      return res.status(400).json({ error: 'SELF_LOCKOUT', message: 'You cannot demote or deactivate your own account.' });
    }
    const user = await db.updateUser(req.params.id, req.body || {});
    if (!user) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ user: await db.publicUser(user) });
  })
);

app.delete(
  '/api/admin/users/:id',
  ah(async (req, res) => {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'SELF_LOCKOUT', message: 'You cannot deactivate or delete your own account.' });
    }
    if (req.query.hard === 'true') {
      await db.deleteUserHard(req.params.id);
    } else {
      await db.setUserActive(req.params.id, false);
    }
    res.status(204).end();
  })
);

app.get(
  '/api/admin/users/:id/schedule',
  ah(async (req, res) => res.json(await db.scheduleForUser(req.params.id)))
);

app.post(
  '/api/admin/users/:id/registrations',
  ah(async (req, res) => {
    const reg = await db.addRegistration(req.params.id, req.body.sessionId, { acknowledgeConflict: true, source: 'admin' });
    res.status(201).json(reg);
  })
);

app.delete(
  '/api/admin/users/:id/registrations/:sessionId',
  ah(async (req, res) => {
    await db.removeRegistration(req.params.id, req.params.sessionId);
    res.status(204).end();
  })
);

app.get(
  '/api/admin/speakers',
  ah(async (req, res) => {
    const speakers = await db.listSpeakers({});
    const withCounts = await Promise.all(
      speakers.map(async (s) => ({ ...s, sessionCount: await db.sessionCountForSpeaker(s.id) }))
    );
    res.json(withCounts);
  })
);

app.post(
  '/api/admin/speakers',
  ah(async (req, res) => {
    try {
      res.status(201).json(await db.createSpeaker(req.body || {}));
    } catch (err) {
      if (err.code === 'SLUG_TAKEN') return res.status(400).json({ error: 'VALIDATION', fields: { slug: 'already in use' } });
      throw err;
    }
  })
);

app.patch(
  '/api/admin/speakers/:id',
  ah(async (req, res) => {
    const speaker = await db.updateSpeaker(req.params.id, req.body || {});
    if (!speaker) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(speaker);
  })
);

app.delete(
  '/api/admin/speakers/:id',
  ah(async (req, res) => {
    await db.deleteSpeaker(req.params.id);
    res.status(204).end();
  })
);

app.get(
  '/api/admin/sessions',
  ah(async (req, res) => {
    res.json(await db.listSessions({ publishedOnly: false }));
  })
);

app.post(
  '/api/admin/sessions',
  ah(async (req, res) => {
    const body = req.body || {};
    if (!body.endsAt || !body.startsAt || new Date(body.endsAt) <= new Date(body.startsAt)) {
      return res.status(400).json({ error: 'VALIDATION', fields: { endsAt: 'must be after startsAt' } });
    }
    try {
      const session = await db.createSession(body);
      res.status(201).json(await db.toSessionDTO(session));
    } catch (err) {
      if (err.code === 'SLUG_TAKEN') return res.status(400).json({ error: 'VALIDATION', fields: { slug: 'already in use' } });
      throw err;
    }
  })
);

app.patch(
  '/api/admin/sessions/:id',
  ah(async (req, res) => {
    const body = req.body || {};
    if (body.startsAt && body.endsAt && new Date(body.endsAt) <= new Date(body.startsAt)) {
      return res.status(400).json({ error: 'VALIDATION', fields: { endsAt: 'must be after startsAt' } });
    }
    if (body.isRegistrable === false) {
      const count = await db.registrationCountForSession(req.params.id);
      if (count > 0 && !body.force) {
        return res.status(409).json({ error: 'HAS_REGISTRATIONS', count, message: `${count} attendee(s) are registered. Pass force:true to proceed.` });
      }
    }
    const session = await db.updateSession(req.params.id, body);
    if (!session) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(await db.toSessionDTO(session));
  })
);

app.delete(
  '/api/admin/sessions/:id',
  ah(async (req, res) => {
    const count = await db.registrationCountForSession(req.params.id);
    if (count > 0 && req.query.force !== 'true') {
      return res.status(409).json({ error: 'HAS_REGISTRATIONS', count, message: `${count} attendee(s) are registered for this session.` });
    }
    await db.deleteSession(req.params.id);
    res.status(204).end();
  })
);

app.get(
  '/api/admin/tracks',
  ah(async (req, res) => res.json(await db.listTracks()))
);
app.get(
  '/api/admin/rooms',
  ah(async (req, res) => res.json(await db.listRooms()))
);
app.get(
  '/api/admin/days',
  ah(async (req, res) => res.json(await db.listDays()))
);

app.get(
  '/api/admin/settings',
  ah(async (req, res) => res.json(await db.getSettings()))
);
app.patch(
  '/api/admin/settings',
  ah(async (req, res) => res.json(await db.updateSettings(req.body || {})))
);

app.get(
  '/api/admin/export/registrations.csv',
  ah(async (req, res) => {
    const csv = await db.exportRegistrationsCsv();
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="registrations.csv"');
    res.send(csv);
  })
);

// ===================== HEALTH =====================
app.get(
  '/api/health',
  ah(async (req, res) => {
    const sessions = await db.listSessions({ publishedOnly: false });
    res.json({ ok: true, sessions: sessions.length });
  })
);

// ===================== STATIC FRONT END =====================
const pub = (...p) => path.join(__dirname, 'public', ...p);

// Clean attendee URLs (no .html). Client-side JS handles auth redirects for
// pages that require a login (profile, my-schedule) by checking /api/auth/me.
app.get('/login', (req, res) => res.sendFile(pub('login.html')));
app.get('/register', (req, res) => res.sendFile(pub('register.html')));
app.get('/profile', (req, res) => res.sendFile(pub('profile.html')));
app.get('/my-schedule', (req, res) => res.sendFile(pub('my-schedule.html')));
app.get('/speakers', (req, res) => res.sendFile(pub('speakers.html')));
app.get('/speakers/:slug', (req, res) => res.sendFile(pub('speaker.html')));
app.get('/session/:slug', (req, res) => res.sendFile(pub('session.html')));
app.get('/auth/callback', (req, res) => res.sendFile(pub('auth-callback.html')));
app.get('/chat', (req, res) => res.sendFile(pub('chat.html')));
app.get('/chat/:roomId', (req, res) => res.sendFile(pub('chat.html')));
app.get('/directory', (req, res) => res.sendFile(pub('directory.html')));
app.get('/trending', (req, res) => res.sendFile(pub('trending.html')));

// Admin pages — server-side gated. The API is the real security boundary
// (requireAdminApi above); this just avoids exposing the shell UI to non-admins.
app.get('/admin', adminPageGuard, (req, res) => res.sendFile(pub('admin', 'index.html')));
app.get('/admin/users', adminPageGuard, (req, res) => res.sendFile(pub('admin', 'users.html')));
app.get('/admin/speakers', adminPageGuard, (req, res) => res.sendFile(pub('admin', 'speakers.html')));
app.get('/admin/sessions', adminPageGuard, (req, res) => res.sendFile(pub('admin', 'sessions.html')));
app.get('/admin/settings', adminPageGuard, (req, res) => res.sendFile(pub('admin', 'settings.html')));

app.use(express.static(path.join(__dirname, 'public')));

// ===================== ERROR HANDLER =====================
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`StartFEST listening on http://localhost:${PORT}`));
}

module.exports = app;
