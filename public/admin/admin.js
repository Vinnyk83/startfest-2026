// Shared admin back-office script: renders the sidebar/header nav and provides
// a fetch wrapper that redirects to /login if a session expires mid-use.
// Depends on window.App from /js/app.js — include that script first.
(function () {
  const NAV_ITEMS = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/users', label: 'Users' },
    { href: '/admin/speakers', label: 'Speakers' },
    { href: '/admin/sessions', label: 'Sessions' },
    { href: '/admin/settings', label: 'Settings' },
  ];

  function normalizedPath() {
    const p = window.location.pathname;
    return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
  }

  function isActive(href) {
    const path = normalizedPath();
    if (href === '/admin') return path === '/admin';
    return path === href;
  }

  function redirectToLogin() {
    window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname);
  }

  // Wraps App.fetchJson so any 401/403 from /api/admin/* (session expired,
  // permissions changed mid-use) bounces the admin to /login instead of
  // silently failing or throwing into the void.
  async function api(url, options) {
    try {
      return await App.fetchJson(url, options);
    } catch (err) {
      if (err && (err.status === 401 || err.status === 403)) {
        redirectToLogin();
        // Never resolve — we're navigating away.
        return new Promise(() => {});
      }
      throw err;
    }
  }

  function renderShell(user) {
    const sidebar = document.getElementById('admin-sidebar');
    if (!sidebar) return;
    const navHtml = NAV_ITEMS.map(
      (item) =>
        `<a href="${item.href}" class="admin-nav-link${isActive(item.href) ? ' admin-nav-link--active' : ''}">${App.escapeHtml(
          item.label
        )}</a>`
    ).join('');
    sidebar.innerHTML = `
      <div class="admin-brand">StartFEST <span>Admin</span></div>
      <nav class="admin-nav">${navHtml}</nav>
      <div class="admin-sidebar-footer">
        ${App.initialsAvatar(user.fullName, user.avatarColor, 32)}
        <div class="admin-user-info">
          <strong>${App.escapeHtml(user.fullName)}</strong>
          <span>${App.escapeHtml(user.email)}</span>
        </div>
      </div>
      <div class="admin-sidebar-links">
        <a href="/" target="_blank" rel="noopener">View public site &#8599;</a>
        <button type="button" id="admin-logout-btn" class="btn btn--ghost btn--sm">Log out</button>
      </div>`;
    const logoutBtn = document.getElementById('admin-logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => App.logout());
  }

  // Call once per page, before doing anything else. Resolves with the current
  // admin user, or redirects to /login and never resolves if there isn't one.
  // (The server already gates page loads and API calls — this is just the
  // client-side belt-and-suspenders so the shell never flashes for a
  // logged-out visitor who hit the HTML directly from cache.)
  async function init() {
    const user = await App.currentUser();
    if (!user || user.role !== 'admin') {
      redirectToLogin();
      return new Promise(() => {});
    }
    renderShell(user);
    return user;
  }

  window.AdminApp = { init, api, redirectToLogin, NAV_ITEMS };
})();
