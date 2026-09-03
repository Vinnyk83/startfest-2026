(function () {
  function speakerCard(sp) {
    const avatar = sp.headshotUrl
      ? `<img src="${App.escapeHtml(sp.headshotUrl)}" alt="${App.escapeHtml(sp.fullName)}">`
      : `<div class="avatar-lg">${App.initialsAvatar(sp.fullName, '#C4E538', 84)}</div>`;
    const roleLine = [sp.title, sp.company].filter(Boolean).join(', ');
    return `<a class="card speaker-card" href="/speakers/${encodeURIComponent(sp.slug)}">
      ${sp.headshotUrl ? avatar : App.initialsAvatar(sp.fullName, '#C4E538', 84)}
      <strong>${App.escapeHtml(sp.fullName)}</strong>
      ${roleLine ? `<span>${App.escapeHtml(roleLine)}</span>` : ''}
    </a>`;
  }

  async function init() {
    App.renderNav('/speakers');
    try {
      const speakers = await App.fetchJson('/api/speakers');
      const keynotes = speakers.filter((s) => s.isKeynote).sort((a, b) => a.fullName.localeCompare(b.fullName));
      const rest = speakers.filter((s) => !s.isKeynote).sort((a, b) => a.fullName.localeCompare(b.fullName));

      const keynoteSection = document.getElementById('keynote-section');
      if (keynotes.length) {
        keynoteSection.innerHTML = `
          <h2 class="section-title">Keynote Speakers</h2>
          <div class="container">
            <div class="speaker-grid">${keynotes.map(speakerCard).join('')}</div>
          </div>`;
      } else {
        keynoteSection.innerHTML = '';
      }

      document.getElementById('all-speakers-title').style.display = rest.length ? '' : 'none';
      document.getElementById('speaker-grid').innerHTML =
        rest.map(speakerCard).join('') ||
        (keynotes.length ? '' : '<div class="empty-state"><p>No speakers announced yet.</p></div>');
    } catch (e) {
      App.toast("Couldn't load speakers. Check your connection and try again.", 'error');
    }
  }

  init();
})();
