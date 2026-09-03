// Shared session card renderer + event delegation, used by index.html, session.html, speaker.html, my-schedule.html.
(function () {
  const PLENARY_TYPES = ['ceremony', 'keynote', 'panel', 'mainstage'];

  function isPlenarySession(s) {
    return s.sessionType !== 'break' && (s.isBreakoutRoom === false || PLENARY_TYPES.includes(s.sessionType));
  }

  function speakerLine(speakers) {
    if (!speakers || !speakers.length) return '';
    return speakers
      .map((sp) => {
        const bits = [sp.fullName];
        const rolePart = [sp.title, sp.company].filter(Boolean).join(', ');
        if (rolePart) bits.push(`(${rolePart})`);
        return App.escapeHtml(bits.join(' '));
      })
      .join(' · ');
  }

  function truncate(str, max) {
    if (!str) return '';
    if (str.length <= max) return str;
    return str.slice(0, max - 1).trimEnd() + '…';
  }

  function renderAttendeeRow(session) {
    if (!session.attendeeCount) {
      return '<span class="attendee-empty">No one\'s added this yet. Be the first.</span>';
    }
    const visible = session.attendeesVisible || [];
    const shown = visible.slice(0, 4);
    const remainingVisible = Math.max(0, visible.length - 4);
    const more = remainingVisible + (session.attendeesPrivateCount || 0);
    let html = '<div class="avatar-stack">' + shown.map((a) => App.initialsAvatar(a.fullName, a.avatarColor, 28)).join('') + '</div>';
    if (more > 0) {
      html += `<span class="avatar-stack-more">+${more}</span>`;
    }
    return html;
  }

  function renderAddControl(session, authed) {
    if (!session.isRegistrable) return '';
    if (authed && session.isRegistered) {
      return `<button type="button" class="btn btn--outline btn--sm" data-action="remove" data-session-id="${session.id}">Added &#10003; &middot; Remove</button>`;
    }
    const conflicts = session.conflictsWith || [];
    const hasConflict = authed && conflicts.length > 0;
    const btnClass = hasConflict ? 'btn--warn' : 'btn--primary';
    const titleAttr = hasConflict
      ? ` title="Overlaps: ${App.escapeHtml(conflicts.map((c) => c.title).join(', '))}"`
      : '';
    let html = `<button type="button" class="btn ${btnClass} btn--sm" data-action="add" data-session-id="${session.id}"${titleAttr}>Add</button>`;
    if (hasConflict) {
      html += `<div class="overlap-note">Overlaps ${App.escapeHtml(conflicts.map((c) => c.title).join(', '))}</div>`;
    }
    return html;
  }

  function renderSessionCard(session, opts) {
    opts = opts || {};
    const authed = !!opts.authed;
    const showRoomLabel = opts.showRoomLabel !== false;
    const showDescription = opts.showDescription !== false;
    const spLine = speakerLine(session.speakers);
    return `
      <div class="card session-card" data-session-id="${session.id}">
        ${showRoomLabel ? `<div class="room-label">${App.escapeHtml(session.roomName || '')}</div>` : ''}
        <div class="session-top">
          <span class="pill" style="background:${App.escapeHtml(session.colorHex || '#C4E538')};color:${App.escapeHtml(
      session.textHex || '#12314F'
    )}">${App.escapeHtml(session.trackName || '')}</span>
        </div>
        <h3><a href="/session/${encodeURIComponent(session.slug)}">${App.escapeHtml(session.title)}</a></h3>
        ${spLine ? `<div class="session-speakers">${spLine}</div>` : ''}
        <div class="session-meta">
          <span>${App.escapeHtml(session.roomName || '')}</span>
          <span>${App.formatTimeRange(session.startsAt, session.endsAt)}</span>
        </div>
        ${showDescription && session.description ? `<p class="session-desc">${App.escapeHtml(truncate(session.description, 160))}</p>` : ''}
        <div class="session-bottom">
          <div class="attendee-row">${renderAttendeeRow(session)}</div>
          ${renderAddControl(session, authed)}
        </div>
      </div>`;
  }

  function renderBreakStrip(session) {
    return `<div class="break-strip" data-session-id="${session.id}">
      <span>${App.formatTimeRange(session.startsAt, session.endsAt)}</span>
      <span>${App.escapeHtml(session.title)}</span>
    </div>`;
  }

  // Delegated click handling for add/remove buttons rendered by renderSessionCard.
  // onChange is called after any successful mutation so the caller can refetch.
  function attachSessionCardHandlers(container, { authed, onChange, requireAuthRedirect }) {
    container.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const sessionId = btn.getAttribute('data-session-id');
      const action = btn.getAttribute('data-action');
      if (!authed) {
        window.location.href = '/login?next=' + encodeURIComponent(requireAuthRedirect || window.location.pathname + window.location.search);
        return;
      }
      btn.disabled = true;
      let result;
      if (action === 'add') {
        result = await SessionActions.register(sessionId);
      } else if (action === 'remove') {
        result = await SessionActions.unregister(sessionId);
      }
      btn.disabled = false;
      if (result && result.ok && typeof onChange === 'function') {
        onChange();
      }
    });
  }

  window.SessionCard = {
    isPlenarySession,
    renderSessionCard,
    renderBreakStrip,
    attachSessionCardHandlers,
  };
})();
