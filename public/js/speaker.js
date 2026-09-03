(function () {
  const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop());
  let authed = false;

  function notFoundHtml() {
    return `<div class="not-found">
      <h1>Speaker not found</h1>
      <p>We couldn't find that speaker.</p>
      <a class="btn btn--primary" href="/speakers">Back to speakers</a>
    </div>`;
  }

  function renderLinks(sp) {
    const links = [];
    if (sp.linkedinUrl) links.push(`<a class="btn btn--outline btn--sm" target="_blank" rel="noopener" href="${App.escapeHtml(sp.linkedinUrl)}">LinkedIn</a>`);
    if (sp.websiteUrl) links.push(`<a class="btn btn--outline btn--sm" target="_blank" rel="noopener" href="${App.escapeHtml(sp.websiteUrl)}">Website</a>`);
    return links.length ? `<div class="speaker-links">${links.join('')}</div>` : '';
  }

  function render(sp) {
    const avatar = sp.headshotUrl
      ? `<img src="${App.escapeHtml(sp.headshotUrl)}" alt="${App.escapeHtml(sp.fullName)}">`
      : App.initialsAvatar(sp.fullName, '#C4E538', 110);
    const roleLine = [sp.title, sp.company].filter(Boolean).join(', ');
    const sessions = sp.sessions || [];
    const html = `
      <div class="card detail-card">
        <div class="speaker-header">
          ${avatar}
          <div>
            <h1 style="margin:0 0 4px;">${App.escapeHtml(sp.fullName)}</h1>
            ${roleLine ? `<p style="margin:0;color:var(--ink-soft);">${App.escapeHtml(roleLine)}</p>` : ''}
            ${renderLinks(sp)}
          </div>
        </div>
        ${sp.bio ? `<p style="margin-top:16px;">${App.escapeHtml(sp.bio)}</p>` : ''}
        <div class="detail-section">
          <h2>Sessions</h2>
          ${
            sessions.length
              ? sessions.map((s) => SessionCard.renderSessionCard(s, { authed })).join('')
              : '<p class="attendee-empty">No sessions scheduled yet.</p>'
          }
        </div>
      </div>`;
    const container = document.getElementById('page-content');
    container.innerHTML = html;
    SessionCard.attachSessionCardHandlers(container, {
      authed,
      onChange: load,
      requireAuthRedirect: location.pathname,
    });
  }

  async function load() {
    try {
      const sp = await App.fetchJson(`/api/speakers/${encodeURIComponent(slug)}`);
      document.title = sp.fullName + ' — StartFEST 2026';
      render(sp);
    } catch (e) {
      if (e.status === 404) {
        document.getElementById('page-content').innerHTML = notFoundHtml();
      } else {
        App.toast("Couldn't load that speaker. Check your connection and try again.", 'error');
      }
    }
  }

  async function init() {
    App.renderNav('/speakers');
    const user = await App.currentUser();
    authed = !!user;
    await load();
  }

  init();
})();
