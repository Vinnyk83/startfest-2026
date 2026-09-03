(function () {
  let debounceTimer = null;
  let lastQuery = '';

  function truncateBio(bio) {
    const text = String(bio || '').trim();
    if (!text) return '';
    if (text.length <= 120) return text;
    return text.slice(0, 120).trimEnd() + '…';
  }

  function socialLinks(a) {
    const links = [];
    if (a.linkedinUrl) links.push({ href: a.linkedinUrl, label: 'LinkedIn' });
    if (a.twitterUrl) links.push({ href: a.twitterUrl, label: 'X' });
    if (a.websiteUrl) links.push({ href: a.websiteUrl, label: 'Website' });
    if (!links.length) return '';
    return `<div class="attendee-card-links">${links
      .map(
        (l) =>
          `<a class="attendee-link-pill" href="${App.escapeHtml(l.href)}" target="_blank" rel="noopener noreferrer">${l.label}</a>`
      )
      .join('')}</div>`;
  }

  function attendeeCard(a) {
    const avatar = a.avatarUrl
      ? `<img src="${App.escapeHtml(a.avatarUrl)}" alt="${App.escapeHtml(a.fullName)}">`
      : App.initialsAvatar(a.fullName, a.avatarColor, 56);
    const roleLine = [a.jobTitle, a.company].filter(Boolean).join(' · ');
    const bio = truncateBio(a.bio);
    return `<div class="card attendee-card">
      <div class="attendee-card-top">
        ${avatar}
        <div>
          <div class="attendee-card-name">${App.escapeHtml(a.fullName)}</div>
          ${roleLine ? `<div class="attendee-card-role">${App.escapeHtml(roleLine)}</div>` : ''}
        </div>
      </div>
      ${bio ? `<p class="attendee-card-bio">${App.escapeHtml(bio)}</p>` : ''}
      ${socialLinks(a)}
    </div>`;
  }

  function emptyStateHtml(hasQuery) {
    if (hasQuery) {
      return `<div class="empty-state">
        <p>No attendees match that search.</p>
        <button type="button" class="btn btn--outline" id="directory-clear-search">Clear search</button>
      </div>`;
    }
    return `<div class="empty-state"><p>No one's opted into the directory yet.</p></div>`;
  }

  function showSkeleton() {
    const grid = document.getElementById('directory-grid');
    grid.className = 'directory-grid';
    grid.innerHTML = Array(4)
      .fill('<div class="card skeleton skeleton-attendee-card"></div>')
      .join('');
  }

  async function loadDirectory(q) {
    showSkeleton();
    const grid = document.getElementById('directory-grid');
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      const qs = params.toString();
      const attendees = await App.fetchJson('/api/directory' + (qs ? '?' + qs : ''));
      if (!attendees.length) {
        grid.className = '';
        grid.innerHTML = emptyStateHtml(!!q);
        const clearBtn = document.getElementById('directory-clear-search');
        if (clearBtn) {
          clearBtn.addEventListener('click', () => {
            document.getElementById('directory-search').value = '';
            lastQuery = '';
            loadDirectory('');
          });
        }
        return;
      }
      grid.className = 'directory-grid';
      grid.innerHTML = attendees.map(attendeeCard).join('');
    } catch (e) {
      App.toast("Couldn't load the directory. Check your connection and try again.", 'error');
      grid.className = '';
      grid.innerHTML = '<div class="empty-state"><p>Something went wrong loading the directory.</p></div>';
    }
  }

  function setupSearch() {
    const input = document.getElementById('directory-search');
    input.addEventListener('input', (e) => {
      const q = e.target.value;
      lastQuery = q;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (q === lastQuery) loadDirectory(q);
      }, 300);
    });
  }

  async function init() {
    App.renderNav('/directory');
    setupSearch();
    await loadDirectory('');
  }

  init();
})();
