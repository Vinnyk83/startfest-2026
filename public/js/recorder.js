// Live Session Notes recorder — mounts into a #live-notes-root element on the
// session detail page. Owns: checking/polling recording status, capturing
// audio locally (MediaRecorder) when this browser is the one that started the
// recording, an in-page retry queue for uploading chunks, and rendering the
// section's HTML. Talks to the backend described in the Live Session Notes
// API (see server.js "LIVE SESSION NOTES" routes).
//
// Honesty note (see project brief): there is no Background Sync here on
// purpose — iOS Safari doesn't support it and it isn't reliable cross-browser.
// This only keeps recording/queuing/retrying while the tab stays open, and
// says so plainly in the UI rather than promising more.
(function () {
  const MAX_CHUNK_ATTEMPTS = 8;
  const CHUNK_TIMESLICE_MS = 10000;
  const ACTIVE_POLL_MS = 10000;
  const RECORDING_POLL_MS = 5000;
  const RETRY_WALK_MS = 4000;
  const STOP_FLUSH_TIMEOUT_MS = 5000;

  const state = {
    slug: null,
    authed: false,
    mounted: false, // timers/listeners started?
    loading: true, // waiting on the first /active check
    recording: null, // last known recording object, or null
    capture: null, // set only when THIS browser is actively capturing audio
    stopping: false,
    micError: null,
    deepgramNoticeShown: false,
  };

  function root() {
    return document.getElementById('live-notes-root');
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isActiveStatus(rec) {
    return !!rec && (rec.status === 'recording' || rec.status === 'processing');
  }

  // /active only ever returns rows with status === 'recording', so once a
  // recording moves to processing/complete/failed we must stop letting the
  // /active poll null it back out from under us.
  function isTrackedPastActive(rec) {
    return !!rec && (rec.status === 'processing' || rec.status === 'complete' || rec.status === 'failed');
  }

  // ---------- rendering ----------
  function renderUI() {
    const el = root();
    if (!el) return;
    el.innerHTML = buildHtml();
  }

  function buildHtml() {
    if (!state.authed) return notLoggedInHtml();
    if (state.loading) return `<p class="help-text">Checking for live notes…</p>`;
    if (state.stopping) return wrappingUpHtml();

    const rec = state.recording;
    if (isActiveStatus(rec)) return liveHtml(rec);
    if (rec && (rec.status === 'complete' || rec.status === 'failed')) return completeHtml(rec);
    return noRecordingHtml();
  }

  function notLoggedInHtml() {
    const next = encodeURIComponent(location.pathname);
    return `
      <div class="rec-locked">
        <p class="help-text">Log in to record session notes.</p>
        <a class="btn btn--outline btn--sm" href="/login?next=${next}">Log in</a>
      </div>`;
  }

  function noRecordingHtml() {
    return `
      <p class="help-text">No one is recording this session right now.</p>
      <button type="button" class="btn btn--primary" data-recorder-action="start">🎙 Start Recording</button>
      ${state.micError ? `<p class="error-text">${App.escapeHtml(state.micError)}</p>` : ''}`;
  }

  function wrappingUpHtml() {
    return `
      <div class="rec-live">
        <span class="rec-dot rec-dot--live" aria-hidden="true"></span>
        <strong>Wrapping up notes…</strong>
      </div>
      <p class="help-text">Generating a summary and action items — this can take a few seconds.</p>`;
  }

  function liveHtml(rec) {
    const capturing = !!(state.capture && state.capture.recordingId === rec.id && !state.capture.stopped);
    const processing = rec.status === 'processing';
    let syncLine;
    if (capturing) {
      const c = state.capture;
      const pending = c.queue.filter((q) => !q.failed).length;
      const failed = c.queue.filter((q) => q.failed).length;
      syncLine = `<div class="help-text rec-sync">Recording &middot; ${c.uploadedCount} chunk${
        c.uploadedCount === 1 ? '' : 's'
      } uploaded, ${pending} pending${failed ? `, ${failed} failed` : ''}</div>`;
      if (failed) {
        syncLine += `<div class="error-text">${failed} chunk${
          failed === 1 ? '' : 's'
        } failed to upload — some notes may be incomplete.</div>`;
      }
    } else {
      syncLine = `<div class="help-text">Live notes are being captured by another attendee's device.</div>`;
    }
    return `
      <div class="rec-live">
        <span class="rec-dot rec-dot--live" aria-hidden="true"></span>
        <strong>${processing ? 'Wrapping up…' : '● Recording'}</strong>
      </div>
      ${syncLine}
      ${
        state.deepgramNoticeShown
          ? `<div class="error-text">Transcription isn't configured on the server right now — recording continues, but won't be transcribed until that's fixed.</div>`
          : ''
      }
      <p class="help-text" style="margin-top:8px;">Notes keep recording and retrying while this tab stays open — closing the tab or losing the browser won't finish the upload for you.</p>
      <div style="margin-top:10px;">
        <button type="button" class="btn btn--danger" data-recorder-action="stop">⏹ Stop Recording</button>
      </div>`;
  }

  function completeHtml(rec) {
    const failed = rec.status === 'failed';
    const items = rec.actionItems || [];
    const itemsHtml = items.length
      ? `<ul>${items.map((i) => `<li>${App.escapeHtml(i)}</li>`).join('')}</ul>`
      : `<p class="help-text">No specific action items identified.</p>`;
    const shareBtn = rec.shared
      ? `<button type="button" class="btn btn--outline" disabled>✓ Shared</button>`
      : `<button type="button" class="btn btn--primary" data-recorder-action="share" data-recording-id="${rec.id}">Share to session chat</button>`;
    return `
      ${
        failed
          ? `<p class="error-text">This recording didn't finish cleanly — showing whatever notes were captured.</p>`
          : ''
      }
      <h3 class="rec-subhead">Summary</h3>
      <p>${App.escapeHtml(rec.summary || '(no summary available)')}</p>
      <h3 class="rec-subhead">Action items</h3>
      ${itemsHtml}
      <details class="rec-transcript">
        <summary>Show full transcript</summary>
        <pre>${App.escapeHtml(rec.transcript || '(no transcript captured)')}</pre>
      </details>
      <div style="margin-top:12px;">${shareBtn}</div>`;
  }

  // ---------- networking / polling ----------
  async function pollActive() {
    if (!state.slug || !state.authed) return;
    try {
      const data = await App.fetchJson(`/api/sessions/${encodeURIComponent(state.slug)}/recordings/active`);
      state.loading = false;
      if (data.recording) {
        state.recording = data.recording;
      } else if (!isTrackedPastActive(state.recording)) {
        // Nothing recording right now. Before falling back to the plain
        // "Start Recording" state, check whether a recording already
        // finished (or was stopped by someone else between polls) so a
        // fresh page load — or this poll — doesn't hide a real summary.
        try {
          const latest = await App.fetchJson(
            `/api/sessions/${encodeURIComponent(state.slug)}/recordings/latest`
          );
          state.recording = latest.recording || null;
        } catch (e2) {
          state.recording = null;
        }
      }
    } catch (e) {
      state.loading = false;
    }
    renderUI();
  }

  async function pollRecording(force) {
    const rec = state.recording;
    if (!rec || !rec.id) return;
    if (!force && !isActiveStatus(rec)) return;
    try {
      const data = await App.fetchJson(`/api/recordings/${rec.id}`);
      state.recording = data;
    } catch (e) {
      /* transient poll failure — try again next tick */
    }
    renderUI();
  }

  function startHeartbeats() {
    setInterval(() => {
      if (!isActiveStatus(state.recording)) pollActive();
    }, ACTIVE_POLL_MS);
    setInterval(() => {
      if (isActiveStatus(state.recording)) pollRecording();
    }, RECORDING_POLL_MS);
  }

  // ---------- local capture (only when THIS browser started the recording) ----------
  function pickMimeType() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return null;
    return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((c) => MediaRecorder.isTypeSupported(c)) || null;
  }

  async function beginLocalCapture(recordingId) {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      state.micError =
        'Microphone access is required to record session notes. Please allow microphone access and try again.';
      App.toast('Microphone access was denied or unavailable.', 'error');
      // A recording row already exists server-side with nothing to capture —
      // end it now so it doesn't sit open forever with no one recording.
      try {
        const res = await fetch(`/api/recordings/${recordingId}/stop`, { method: 'POST', credentials: 'same-origin' });
        const finalRec = await res.json().catch(() => null);
        if (finalRec) state.recording = finalRec;
      } catch (e2) {
        /* best-effort cleanup only */
      }
      renderUI();
      return;
    }

    let mediaRecorder;
    try {
      const mimeType = pickMimeType();
      mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch (e) {
      App.toast('Recording audio is not supported in this browser.', 'error');
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    const capture = {
      recordingId,
      mediaRecorder,
      stream,
      queue: [],
      nextSeq: 0,
      uploadedCount: 0,
      retryTimer: null,
      walking: false,
      stopped: false,
    };
    state.capture = capture;

    mediaRecorder.addEventListener('dataavailable', (e) => {
      if (!e.data || !e.data.size) return;
      capture.queue.push({ seq: capture.nextSeq++, blob: e.data, attempts: 0, failed: false, uploading: false });
      renderUI();
    });
    mediaRecorder.addEventListener('error', () => {
      App.toast('A recording error occurred — some audio may be missing.', 'error');
    });

    mediaRecorder.start(CHUNK_TIMESLICE_MS);
    capture.retryTimer = setInterval(() => walkQueue(capture), RETRY_WALK_MS);
    renderUI();
  }

  async function walkQueue(capture) {
    if (capture.walking) return;
    capture.walking = true;
    try {
      const items = capture.queue.filter((c) => !c.failed && !c.uploading);
      for (const item of items) {
        if (capture.stopped) break;
        item.uploading = true;
        try {
          const form = new FormData();
          form.append('seq', String(item.seq));
          form.append('audio', item.blob, `chunk-${item.seq}.webm`);
          const res = await fetch(`/api/recordings/${capture.recordingId}/chunks`, {
            method: 'POST',
            body: form,
            credentials: 'same-origin',
          });
          if (res.status === 201) {
            capture.queue = capture.queue.filter((q) => q !== item);
            capture.uploadedCount++;
          } else {
            const data = await res.json().catch(() => null);
            const code = data && data.error;
            if (code === 'NOT_RECORDING') {
              capture.queue = capture.queue.filter((q) => q !== item);
              await handleRecordingEndedExternally(capture);
            } else if (code === 'DEEPGRAM_NOT_CONFIGURED') {
              if (!state.deepgramNoticeShown) {
                state.deepgramNoticeShown = true;
                App.toast(
                  'Transcription is not configured on the server — recording continues, but notes will not be transcribed.',
                  'error'
                );
              }
              item.uploading = false;
              item.failed = true; // not transient — no point retrying until the server is configured
            } else {
              item.uploading = false;
              item.attempts++;
              if (item.attempts >= MAX_CHUNK_ATTEMPTS) item.failed = true;
            }
          }
        } catch (e) {
          item.uploading = false;
          item.attempts++;
          if (item.attempts >= MAX_CHUNK_ATTEMPTS) item.failed = true;
        }
      }
    } finally {
      capture.walking = false;
      renderUI();
    }
  }

  async function handleRecordingEndedExternally(capture) {
    if (capture.stopped) return;
    capture.stopped = true;
    try {
      capture.mediaRecorder.stop();
    } catch (e) {
      /* ignore */
    }
    try {
      capture.stream.getTracks().forEach((t) => t.stop());
    } catch (e) {
      /* ignore */
    }
    clearInterval(capture.retryTimer);
    if (state.capture === capture) state.capture = null;
    await pollRecording(true);
  }

  // ---------- user actions ----------
  async function startRecording() {
    state.micError = null;
    let res;
    let body;
    try {
      res = await fetch(`/api/sessions/${encodeURIComponent(state.slug)}/recordings`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      body = await res.json().catch(() => null);
    } catch (e) {
      App.toast("Couldn't start recording — check your connection.", 'error');
      return;
    }
    if (!res.ok) {
      if (res.status === 401) {
        window.location.href = '/login?next=' + encodeURIComponent(location.pathname);
        return;
      }
      App.toast("Couldn't start recording. Try again.", 'error');
      return;
    }
    const iInitiated = res.status === 201; // 200 means someone else already had one active — we just joined it
    state.recording = body;
    renderUI();
    if (!iInitiated) {
      App.toast('Someone already started recording this session — showing it live.', 'info');
      return;
    }
    await beginLocalCapture(body.id);
  }

  async function stopRecording() {
    if (state.stopping) return;
    state.stopping = true;
    renderUI();

    const capture = state.capture;
    const recordingId = (state.recording && state.recording.id) || (capture && capture.recordingId);
    if (!recordingId) {
      state.stopping = false;
      renderUI();
      return;
    }

    if (capture && !capture.stopped) {
      capture.stopped = true;
      try {
        capture.mediaRecorder.stop();
      } catch (e) {
        /* ignore */
      }
      await sleep(300); // give the final dataavailable a moment to land in the queue
      clearInterval(capture.retryTimer);
      const deadline = Date.now() + STOP_FLUSH_TIMEOUT_MS;
      while (capture.queue.some((q) => !q.failed) && Date.now() < deadline) {
        await walkQueue(capture);
        if (capture.queue.some((q) => !q.failed)) await sleep(400);
      }
      try {
        capture.stream.getTracks().forEach((t) => t.stop());
      } catch (e) {
        /* ignore */
      }
      if (state.capture === capture) state.capture = null;
    }

    try {
      const res = await fetch(`/api/recordings/${recordingId}/stop`, { method: 'POST', credentials: 'same-origin' });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        state.recording = data;
      } else {
        App.toast("Couldn't finalize the recording — it may still show as recording for other viewers.", 'error');
      }
    } catch (e) {
      App.toast("Couldn't reach the server to stop the recording.", 'error');
    }
    state.stopping = false;
    renderUI();
  }

  async function shareRecording(recordingId) {
    try {
      const data = await App.fetchJson(`/api/recordings/${recordingId}/share`, {
        method: 'PATCH',
        body: { shared: true },
      });
      state.recording = data;
      renderUI();
      App.toast('Shared with everyone in this session.', 'success');
    } catch (e) {
      App.toast("Couldn't share the summary. Try again.", 'error');
    }
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-recorder-action]');
    const el = root();
    if (!btn || !el || !el.contains(btn)) return;
    const action = btn.getAttribute('data-recorder-action');
    if (action === 'start') startRecording();
    else if (action === 'stop') stopRecording();
    else if (action === 'share') shareRecording(btn.getAttribute('data-recording-id'));
  });

  window.addEventListener('online', () => {
    if (state.capture) walkQueue(state.capture);
  });

  // init() is safe to call repeatedly (e.g. session.js re-renders the page
  // after an unrelated add/remove-to-schedule action) — it always re-paints
  // the current in-memory state into the (possibly brand-new) DOM node, but
  // only starts polling/timers once so recording state survives re-renders.
  function init(slug, authed) {
    state.slug = slug;
    state.authed = authed;
    renderUI();
    if (!authed || state.mounted) return;
    state.mounted = true;
    pollActive();
    startHeartbeats();
  }

  window.Recorder = { init };
})();
