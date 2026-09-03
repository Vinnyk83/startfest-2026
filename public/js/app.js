// Shared front-end helpers used by every page (attendee + admin).
// Everything hangs off window.App so plain <script> tags can share it with no build step.
(function () {
  const DEFAULT_TZ = 'America/Denver';

  async function fetchJson(url, options = {}) {
    const hasBody = options.body !== undefined;
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin',
    });
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = null;
      }
    }
    if (!res.ok) {
      const err = new Error((data && (data.message || data.error)) || res.statusText || 'Request failed');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function toast(message, type = 'info') {
    let host = document.getElementById('toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toast-host';
      host.className = 'toast-host';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = message;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast--visible'));
    setTimeout(() => {
      el.classList.remove('toast--visible');
      setTimeout(() => el.remove(), 250);
    }, 4200);
  }

  function formatTime(iso, tz) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz || DEFAULT_TZ,
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  }

  function formatTimeRange(startIso, endIso, tz) {
    return `${formatTime(startIso, tz)} – ${formatTime(endIso, tz)}`;
  }

  // dateStr: 'YYYY-MM-DD'
  function formatDayDate(dateStr, tz) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz || DEFAULT_TZ,
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    }).format(new Date(`${dateStr}T12:00:00Z`));
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function initials(fullName) {
    return String(fullName || '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase();
  }

  function initialsAvatar(fullName, colorHex, size) {
    const px = size || 32;
    const fontPx = Math.round(px * 0.4);
    return `<div class="avatar" style="width:${px}px;height:${px}px;font-size:${fontPx}px;background:${escapeHtml(
      colorHex || '#C4E538'
    )}" title="${escapeHtml(fullName)}">${escapeHtml(initials(fullName))}</div>`;
  }

  function icsDateUtc(iso) {
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return (
      d.getUTCFullYear() +
      p(d.getUTCMonth() + 1) +
      p(d.getUTCDate()) +
      'T' +
      p(d.getUTCHours()) +
      p(d.getUTCMinutes()) +
      p(d.getUTCSeconds()) +
      'Z'
    );
  }

  function gcalLink({ title, startsAt, endsAt, details, location, tz }) {
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title || '',
      dates: `${icsDateUtc(startsAt)}/${icsDateUtc(endsAt)}`,
      details: details || '',
      location: location || '',
      ctz: tz || DEFAULT_TZ,
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  async function currentUser() {
    try {
      const { user } = await fetchJson('/api/auth/me');
      return user;
    } catch (e) {
      return null;
    }
  }

  async function requireAuthOrRedirect(nextPath) {
    const user = await currentUser();
    if (!user) {
      window.location.href = '/login?next=' + encodeURIComponent(nextPath || window.location.pathname);
      return null;
    }
    return user;
  }

  async function logout() {
    await fetchJson('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  }

  // Renders the shared top nav into any element with id="site-nav".
  async function renderNav(activePath) {
    const el = document.getElementById('site-nav');
    if (!el) return;
    const user = await currentUser();
    const link = (href, label) =>
      `<a href="${href}" class="nav-link${activePath === href ? ' nav-link--active' : ''}">${label}</a>`;
    let right;
    if (user) {
      right = `
        ${link('/my-schedule', 'My Schedule')}
        ${link('/profile', 'Profile')}
        ${user.role === 'admin' ? link('/admin', 'Admin') : ''}
        <button class="btn btn--ghost" id="nav-logout">Log out</button>`;
    } else {
      right = `${link('/login', 'Log in')}<a href="/register" class="btn btn--primary btn--sm">Sign up</a>`;
    }
    el.innerHTML = `
      <a href="/" class="brand">StartFEST</a>
      <nav class="nav-links">
        ${link('/', 'Agenda')}
        ${link('/speakers', 'Speakers')}
        ${right}
      </nav>`;
    const logoutBtn = document.getElementById('nav-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
  }

  window.App = {
    fetchJson,
    toast,
    formatTime,
    formatTimeRange,
    formatDayDate,
    escapeHtml,
    initials,
    initialsAvatar,
    icsDateUtc,
    gcalLink,
    currentUser,
    requireAuthOrRedirect,
    logout,
    renderNav,
    DEFAULT_TZ,
  };
})();
