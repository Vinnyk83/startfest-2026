(function () {
  let registrationsById = new Map();

  function renderBanner(conflictCount) {
    const el = document.getElementById('conflict-banner');
    if (!conflictCount) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = `<div class="conflict-banner">${conflictCount} session${
      conflictCount === 1 ? '' : 's'
    } overlap. Review your schedule.</div>`;
  }

  function conflictTitles(reg) {
    return (reg.conflicts || [])
      .map((id) => (registrationsById.get(id) ? registrationsById.get(id).title : null))
      .filter(Boolean);
  }

  function renderRow(reg) {
    const hasConflict = reg.conflicts && reg.conflicts.length > 0;
    const titles = conflictTitles(reg);
    const spLine = (reg.speakers || []).map((s) => s.fullName).join(' · ');
    return `<div class="card session-card schedule-row${hasConflict ? ' has-conflict' : ''}" data-session-id="${reg.id}">
      <div class="session-top">
        <span class="pill" style="background:${App.escapeHtml(reg.colorHex || '#C4E538')};color:${App.escapeHtml(
      reg.textHex || '#12314F'
    )}">${App.escapeHtml(reg.trackName || '')}</span>
      </div>
      <h3><a href="/session/${encodeURIComponent(reg.slug)}">${App.escapeHtml(reg.title)}</a></h3>
      ${spLine ? `<div class="session-speakers">${App.escapeHtml(spLine)}</div>` : ''}
      <div class="session-meta">
        <span>${App.escapeHtml(reg.roomName || '')}</span>
        <span>${App.formatTimeRange(reg.startsAt, reg.endsAt)}</span>
      </div>
      ${hasConflict ? `<div class="conflict-inline">Overlaps ${App.escapeHtml(titles.join(', ') || 'another session')}</div>` : ''}
      <div class="session-bottom">
        <div></div>
        <button type="button" class="btn btn--outline btn--sm" data-action="remove" data-session-id="${reg.id}">Remove</button>
      </div>
    </div>`;
  }

  function render(data) {
    registrationsById = new Map((data.registrations || []).map((r) => [r.id, r]));
    renderBanner(data.conflictCount || 0);
    const body = document.getElementById('schedule-body');
    if (!data.registrations || !data.registrations.length) {
      body.innerHTML = `<div class="empty-state">
        <p>Nothing on your schedule yet. Browse the agenda and add the sessions you want.</p>
        <a class="btn btn--primary" href="/">Browse the agenda</a>
      </div>`;
      return;
    }
    const byDay = new Map();
    for (const reg of data.registrations) {
      const key = reg.dayNumber;
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(reg);
    }
    const dayKeys = Array.from(byDay.keys()).sort((a, b) => a - b);
    body.innerHTML = dayKeys
      .map((dayNumber) => {
        const sessions = byDay.get(dayNumber).slice().sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
        return `<div class="day-group">
          <h2>Day ${dayNumber}</h2>
          ${sessions.map(renderRow).join('')}
        </div>`;
      })
      .join('');
  }

  async function onRemoveClick(e) {
    const btn = e.target.closest('[data-action="remove"]');
    if (!btn) return;
    btn.disabled = true;
    const result = await SessionActions.unregister(btn.getAttribute('data-session-id'));
    if (result.ok) {
      load();
    } else {
      btn.disabled = false;
    }
  }

  function setupSubscribe(user) {
    const url = `webcal://${location.host}/api/calendar/feed/${user.feedToken}.ics`;
    const input = document.getElementById('subscribe-url');
    input.value = url;
    document.getElementById('webcal-link').setAttribute('href', url);
    document.getElementById('copy-link-btn').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        App.toast('Link copied', 'success');
      } catch (e) {
        try {
          input.removeAttribute('readonly');
          input.select();
          document.execCommand('copy');
          input.setAttribute('readonly', 'true');
          App.toast('Link copied', 'success');
        } catch (e2) {
          App.toast("Couldn't copy the link. Select and copy it manually.", 'error');
        }
      }
    });
  }

  async function load() {
    try {
      const data = await App.fetchJson('/api/me/schedule');
      render(data);
    } catch (e) {
      App.toast("Couldn't load your schedule. Check your connection and try again.", 'error');
    }
  }

  async function init() {
    const user = await App.requireAuthOrRedirect('/my-schedule');
    if (!user) return;
    App.renderNav('/my-schedule');
    setupSubscribe(user);
    document.getElementById('schedule-body').addEventListener('click', onRemoveClick);
    await load();
  }

  init();
})();
