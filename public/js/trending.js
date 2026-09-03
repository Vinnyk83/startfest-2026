(function () {
  let pollTimer = null;
  let prevRankById = new Map();

  function trendingRow(session, rank) {
    const isTop = rank <= 3;
    const timeRange = App.formatTimeRange(session.startsAt, session.endsAt);
    const meta = [session.roomName, timeRange].filter(Boolean).join(' · ');
    return `<div class="card trending-row${isTop ? ' trending-row--top' : ''}" data-session-id="${App.escapeHtml(session.id)}">
      <div class="trending-rank">${isTop ? '🔥 ' + rank : rank}</div>
      <div class="trending-body">
        <a class="trending-title" href="/session/${encodeURIComponent(session.slug)}">${App.escapeHtml(session.title)}</a>
        <div class="trending-meta">${App.escapeHtml(meta)}</div>
      </div>
      <div class="trending-stats">
        <span class="recent-count">${session.recentRegistrations} registered in the last 20 min</span>
        <span class="total-count">${session.totalRegistrations} total registered</span>
      </div>
    </div>`;
  }

  function emptyStateHtml() {
    return `<div class="empty-state">
      <p>Nothing trending yet — registrations will show up here as attendees add sessions to their schedule.</p>
    </div>`;
  }

  function showSkeleton() {
    const list = document.getElementById('trending-list');
    list.innerHTML = Array(3)
      .fill('<div class="card skeleton skeleton-trending-row"></div>')
      .join('');
  }

  function renderTrending(sessions, isFirstLoad) {
    const list = document.getElementById('trending-list');
    if (!sessions.length) {
      list.innerHTML = emptyStateHtml();
      prevRankById = new Map();
      return;
    }

    list.innerHTML = sessions.map((s, i) => trendingRow(s, i + 1)).join('');

    if (!isFirstLoad) {
      sessions.forEach((s, i) => {
        const rank = i + 1;
        const prevRank = prevRankById.get(s.id);
        if (prevRank !== undefined && prevRank !== rank) {
          const row = list.querySelector(`[data-session-id="${CSS.escape(s.id)}"]`);
          if (row) {
            row.classList.add('flash');
            setTimeout(() => row.classList.remove('flash'), 1200);
          }
        }
      });
    }

    prevRankById = new Map(sessions.map((s, i) => [s.id, i + 1]));
  }

  async function loadTrending(isFirstLoad) {
    if (isFirstLoad) showSkeleton();
    try {
      const sessions = await App.fetchJson('/api/trending');
      renderTrending(sessions, isFirstLoad);
    } catch (e) {
      App.toast("Couldn't load trending sessions. Check your connection and try again.", 'error');
    }
  }

  function setupPolling() {
    pollTimer = setInterval(() => {
      if (document.hidden) return;
      loadTrending(false);
    }, 15000);
    window.addEventListener('focus', () => loadTrending(false));
    window.addEventListener('pagehide', () => {
      if (pollTimer) clearInterval(pollTimer);
    });
  }

  async function init() {
    App.renderNav('/trending');
    setupPolling();
    await loadTrending(true);
  }

  init();
})();
