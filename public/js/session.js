(function () {
  const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop());
  let authed = false;

  function notFoundHtml() {
    return `<div class="not-found">
      <h1>Session not found</h1>
      <p>We couldn't find that session.</p>
      <a class="btn btn--primary" href="/">Back to agenda</a>
    </div>`;
  }

  function renderAddControl(session) {
    if (!session.isRegistrable) return '';
    if (authed && session.isRegistered) {
      return `<button type="button" class="btn btn--outline" data-action="remove" data-session-id="${session.id}">Added &#10003; &middot; Remove</button>`;
    }
    const conflicts = session.conflictsWith || [];
    const hasConflict = authed && conflicts.length > 0;
    const btnClass = hasConflict ? 'btn--warn' : 'btn--primary';
    let html = `<button type="button" class="btn ${btnClass}" data-action="add" data-session-id="${session.id}">Add to my schedule</button>`;
    if (hasConflict) {
      html += `<div class="overlap-note">Overlaps ${App.escapeHtml(conflicts.map((c) => c.title).join(', '))}</div>`;
    }
    return html;
  }

  function renderSpeakers(speakers) {
    if (!speakers || !speakers.length) return '';
    return `<div class="detail-section">
      <h2>Speakers</h2>
      ${speakers
        .map((sp) => {
          const roleLine = [sp.title, sp.company].filter(Boolean).join(', ');
          return `<div class="speaker-row">
            ${App.initialsAvatar(sp.fullName, '#C4E538', 48)}
            <div class="info">
              <strong><a href="/speakers/${encodeURIComponent(sp.slug)}">${App.escapeHtml(sp.fullName)}</a></strong>
              ${roleLine ? `<span>${App.escapeHtml(roleLine)}</span>` : ''}
            </div>
          </div>`;
        })
        .join('')}
    </div>`;
  }

  function renderAttendees(attendees) {
    if (!attendees) return '';
    const { visible, privateCount, total } = attendees;
    if (!total) {
      return `<div class="detail-section"><h2>Who's going</h2><p class="attendee-empty">No one's added this yet. Be the first.</p></div>`;
    }
    const rows = (visible || [])
      .map((a) => `<div>${App.escapeHtml(a.fullName)}${a.company ? ` — ${App.escapeHtml(a.company)}` : ''}</div>`)
      .join('');
    return `<div class="detail-section">
      <h2>Who's going (${total})</h2>
      <div class="attendee-list">
        ${rows}
        ${privateCount > 0 ? `<div class="help-text">+${privateCount} private attendee${privateCount === 1 ? '' : 's'}</div>` : ''}
      </div>
    </div>`;
  }

  function renderCalendarActions(session) {
    const gcalUrl = App.gcalLink({
      title: session.title,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      details:
        (session.speakers || []).map((s) => s.fullName).join(', ') + '\n' + location.origin + '/session/' + session.slug,
      location: [session.roomName, window.__venueName].filter(Boolean).join(', '),
    });
    return `<div class="calendar-actions">
      <a class="btn btn--outline btn--sm" href="/api/calendar/session/${encodeURIComponent(session.slug)}.ics">Add to Calendar (.ics)</a>
      <a class="btn btn--outline btn--sm" target="_blank" rel="noopener" href="${gcalUrl}">Add to Google Calendar</a>
    </div>`;
  }

  function render(session, attendees) {
    const html = `
      <div class="card detail-card" data-session-id="${session.id}">
        <span class="pill" style="background:${App.escapeHtml(session.colorHex || '#C4E538')};color:${App.escapeHtml(
      session.textHex || '#12314F'
    )}">${App.escapeHtml(session.trackName || '')}</span>
        <h1>${App.escapeHtml(session.title)}</h1>
        <div class="session-meta">
          <span>${App.escapeHtml(session.roomName || '')}</span>
          <span>${App.formatTimeRange(session.startsAt, session.endsAt)}</span>
        </div>
        ${session.description ? `<p>${App.escapeHtml(session.description)}</p>` : ''}
        <div style="margin-top:12px;">${renderAddControl(session)}</div>
        ${renderSpeakers(session.speakers)}
        ${renderAttendees(attendees)}
        <div class="detail-section">
          <h2>Calendar</h2>
          ${renderCalendarActions(session)}
        </div>
        <div class="detail-section">
          <h2>Live Session Notes</h2>
          <div id="live-notes-root"></div>
        </div>
      </div>`;
    const container = document.getElementById('page-content');
    container.innerHTML = html;
    SessionCard.attachSessionCardHandlers(container, {
      authed,
      onChange: load,
      requireAuthRedirect: location.pathname,
    });
    Recorder.init(slug, authed);
  }

  async function load() {
    try {
      const session = await App.fetchJson(`/api/sessions/${encodeURIComponent(slug)}`);
      document.title = session.title + ' — StartFEST 2026';
      let attendees = null;
      try {
        attendees = await App.fetchJson(`/api/sessions/${encodeURIComponent(slug)}/attendees`);
      } catch (e) {
        attendees = null;
      }
      render(session, attendees);
    } catch (e) {
      if (e.status === 404) {
        document.getElementById('page-content').innerHTML = notFoundHtml();
      } else {
        App.toast("Couldn't load that session. Check your connection and try again.", 'error');
      }
    }
  }

  async function init() {
    App.renderNav('/');
    try {
      const settings = await App.fetchJson('/api/settings');
      window.__venueName = settings.venueName;
    } catch (e) {
      /* non-fatal */
    }
    const user = await App.currentUser();
    authed = !!user;
    await load();
  }

  init();
})();
