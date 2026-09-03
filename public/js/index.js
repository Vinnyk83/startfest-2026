(function () {
  const state = {
    day: null, // dayNumber, string
    track: null, // trackSlug or null
    room: '', // roomCode or ''
    q: '',
  };

  let cachedDays = [];
  let cachedTracks = [];
  let cachedRooms = [];
  let authed = false;
  let firstLoad = true;
  let pollTimer = null;

  function readUrlState() {
    const params = new URLSearchParams(window.location.search);
    state.day = params.get('day') || null;
    state.track = params.get('track') || null;
    state.room = params.get('room') || '';
    state.q = params.get('q') || '';
  }

  function writeUrlState() {
    const params = new URLSearchParams();
    if (state.day) params.set('day', state.day);
    if (state.track) params.set('track', state.track);
    if (state.room) params.set('room', state.room);
    if (state.q) params.set('q', state.q);
    const qs = params.toString();
    const url = window.location.pathname + (qs ? '?' + qs : '');
    window.history.replaceState(null, '', url);
  }

  function buildAgendaUrl() {
    const params = new URLSearchParams();
    if (state.day) params.set('day', state.day);
    if (state.track) params.set('track', state.track);
    if (state.room) params.set('room', state.room);
    if (state.q) params.set('q', state.q);
    return '/api/agenda?' + params.toString();
  }

  function renderHeader(settings) {
    if (!settings) return;
    document.getElementById('conf-name').textContent = settings.name || 'StartFEST 2026';
    document.getElementById('conf-tagline').textContent = settings.tagline || '';
    document.getElementById('conf-dates').textContent = settings.dateRangeLabel || '';
    document.title = (settings.name || 'StartFEST 2026') + ' — Agenda';
    const footer = document.getElementById('site-footer');
    footer.textContent = settings.footerNote || '';
  }

  function renderDaySwitcher() {
    const el = document.getElementById('day-switcher');
    if (!cachedDays.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = cachedDays
      .map((d) => {
        const active = String(d.dayNumber) === String(state.day);
        return `<button type="button" class="day-tab${active ? ' day-tab--active' : ''}" data-day="${d.dayNumber}">
          Day ${d.dayNumber} &middot; ${App.formatDayDate(d.date)}
        </button>`;
      })
      .join('');
    el.querySelectorAll('.day-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.day = btn.getAttribute('data-day');
        writeUrlState();
        renderDaySwitcher();
        loadAgenda();
      });
    });
  }

  function renderTrackChips() {
    const el = document.getElementById('track-chips');
    el.innerHTML = cachedTracks
      .map((t) => {
        const active = state.track === t.slug;
        const bg = active ? t.colorHex : '#ffffff';
        const color = active ? t.textHex : 'var(--ink)';
        return `<button type="button" class="chip${active ? ' chip--active' : ''}" style="background:${bg};color:${color}" data-track="${App.escapeHtml(
          t.slug
        )}">${App.escapeHtml(t.name)}</button>`;
      })
      .join('');
    el.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const slug = chip.getAttribute('data-track');
        state.track = state.track === slug ? null : slug;
        writeUrlState();
        renderTrackChips();
        loadAgenda();
      });
    });
  }

  function renderRoomSelect() {
    const sel = document.getElementById('room-select');
    const current = state.room;
    sel.innerHTML =
      '<option value="">All rooms</option>' +
      cachedRooms.map((r) => `<option value="${App.escapeHtml(r.code)}">${App.escapeHtml(r.name)}</option>`).join('');
    sel.value = current;
  }

  function emptyStateHtml(hasFilters) {
    return `<div class="empty-state">
      <p>No sessions match those filters.</p>
      ${hasFilters ? '<button type="button" class="btn btn--outline" id="empty-clear">Clear filters</button>' : ''}
    </div>`;
  }

  function renderBreakoutGrid(sessions) {
    const byRoom = new Map();
    for (const s of sessions) {
      if (!byRoom.has(s.roomId)) byRoom.set(s.roomId, []);
      byRoom.get(s.roomId).push(s);
    }
    const orderedRooms = cachedRooms.length
      ? cachedRooms.filter((r) => byRoom.has(r.id))
      : Array.from(byRoom.keys()).map((id) => ({ id, name: sessions.find((s) => s.roomId === id).roomName }));
    return `<div class="breakout-grid">${orderedRooms
      .map(
        (r) => `<div class="breakout-column">
          <div class="breakout-column-title">${App.escapeHtml(r.name)}</div>
          ${byRoom
            .get(r.id)
            .map((s) => SessionCard.renderSessionCard(s, { authed, showRoomLabel: false }))
            .join('')}
        </div>`
      )
      .join('')}</div>`;
  }

  function renderAgenda(sessions) {
    const container = document.getElementById('agenda-body');
    if (!sessions.length) {
      const hasFilters = !!(state.track || state.room || state.q);
      container.innerHTML = emptyStateHtml(hasFilters);
      const clearBtn = document.getElementById('empty-clear');
      if (clearBtn) clearBtn.addEventListener('click', clearFilters);
      return;
    }

    const buckets = new Map();
    for (const s of sessions) {
      const key = s.startsAt + '|' + s.endsAt;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(s);
    }
    const orderedKeys = Array.from(buckets.keys()).sort((a, b) => new Date(a.split('|')[0]) - new Date(b.split('|')[0]));

    let html = '';
    for (const key of orderedKeys) {
      const group = buckets.get(key);
      const breaks = group.filter((s) => s.sessionType === 'break');
      const plenaries = group.filter((s) => s.sessionType !== 'break' && SessionCard.isPlenarySession(s));
      const breakouts = group.filter((s) => s.sessionType !== 'break' && !SessionCard.isPlenarySession(s));

      breaks.forEach((b) => {
        html += SessionCard.renderBreakStrip(b);
      });
      if (plenaries.length) {
        html += `<div class="plenary-strip">${plenaries.map((s) => SessionCard.renderSessionCard(s, { authed, showRoomLabel: false })).join('')}</div>`;
      }
      if (breakouts.length) {
        html += renderBreakoutGrid(breakouts);
      }
    }
    container.innerHTML = html;
    SessionCard.attachSessionCardHandlers(container, {
      authed,
      onChange: loadAgenda,
      requireAuthRedirect: window.location.pathname + window.location.search,
    });
  }

  function showSkeleton() {
    const container = document.getElementById('agenda-body');
    container.innerHTML = `
      <div class="card skeleton skeleton-card"></div>
      <div class="card skeleton skeleton-card"></div>
      <div class="card skeleton skeleton-card"></div>`;
  }

  async function loadAgenda() {
    if (firstLoad) showSkeleton();
    try {
      const data = await App.fetchJson(buildAgendaUrl());
      if (data.days && data.days.length) cachedDays = data.days;
      if (data.tracks && data.tracks.length) cachedTracks = data.tracks;
      if (data.rooms && data.rooms.length) cachedRooms = data.rooms;
      if (!state.day && cachedDays.length) {
        // First load with no ?day= in the URL: the request we just made was
        // unfiltered (both days). Now that we know the day list, default to
        // day 1 and re-fetch filtered — don't render the unfiltered payload.
        state.day = String(cachedDays[0].dayNumber);
        writeUrlState();
        firstLoad = false;
        return loadAgenda();
      }
      renderHeader(data.settings);
      renderDaySwitcher();
      renderTrackChips();
      renderRoomSelect();
      renderAgenda(data.sessions || []);
    } catch (e) {
      App.toast("Couldn't load the agenda. Check your connection and try again.", 'error');
    }
    firstLoad = false;
  }

  function clearFilters() {
    state.track = null;
    state.room = '';
    state.q = '';
    document.getElementById('search-input').value = '';
    writeUrlState();
    renderTrackChips();
    renderRoomSelect();
    loadAgenda();
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function setupFilterListeners() {
    document.getElementById('room-select').addEventListener('change', (e) => {
      state.room = e.target.value;
      writeUrlState();
      loadAgenda();
    });
    const debouncedSearch = debounce(() => {
      writeUrlState();
      loadAgenda();
    }, 300);
    document.getElementById('search-input').addEventListener('input', (e) => {
      state.q = e.target.value;
      debouncedSearch();
    });
    document.getElementById('clear-filters').addEventListener('click', clearFilters);
  }

  function setupPolling() {
    pollTimer = setInterval(() => {
      if (document.hidden) return;
      loadAgenda();
    }, 15000);
    window.addEventListener('focus', () => loadAgenda());
    window.addEventListener('pagehide', () => {
      if (pollTimer) clearInterval(pollTimer);
    });
  }

  async function init() {
    readUrlState();
    document.getElementById('search-input').value = state.q || '';
    App.renderNav('/');
    const user = await App.currentUser();
    authed = !!user;
    setupFilterListeners();
    setupPolling();
    await loadAgenda();
  }

  init();
})();
