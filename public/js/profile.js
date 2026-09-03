(function () {
  const SWATCHES = ['#C4E538', '#21C99A', '#4FB3F0', '#6B7BF7', '#A55BE0', '#E84BC9'];
  let selectedColor = SWATCHES[0];

  function renderSwatches() {
    const el = document.getElementById('color-swatches');
    el.innerHTML = SWATCHES.map(
      (hex) =>
        `<button type="button" class="swatch${hex === selectedColor ? ' swatch--selected' : ''}" style="background:${hex}" data-hex="${hex}" aria-label="Avatar color ${hex}"></button>`
    ).join('');
    el.querySelectorAll('.swatch').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedColor = btn.getAttribute('data-hex');
        renderSwatches();
      });
    });
  }

  function fillForm(user) {
    document.getElementById('fullName').value = user.fullName || '';
    document.getElementById('jobTitle').value = user.jobTitle || '';
    document.getElementById('company').value = user.company || '';
    document.getElementById('bio').value = user.bio || '';
    document.getElementById('bio-count').textContent = (user.bio || '').length;
    document.getElementById('linkedinUrl').value = user.linkedinUrl || '';
    document.getElementById('shareAttendance').checked = !!user.shareAttendance;
    selectedColor = user.avatarColor && SWATCHES.includes(user.avatarColor) ? user.avatarColor : SWATCHES[0];
    renderSwatches();

    const feedUrl = `webcal://${location.host}/api/calendar/feed/${user.feedToken}.ics`;
    document.getElementById('feed-url').value = feedUrl;
  }

  async function onSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    try {
      await App.fetchJson('/api/me', {
        method: 'PATCH',
        body: {
          fullName: document.getElementById('fullName').value.trim(),
          jobTitle: document.getElementById('jobTitle').value.trim(),
          company: document.getElementById('company').value.trim(),
          bio: document.getElementById('bio').value.trim(),
          linkedinUrl: document.getElementById('linkedinUrl').value.trim(),
          avatarColor: selectedColor,
          shareAttendance: document.getElementById('shareAttendance').checked,
        },
      });
      App.toast('Profile saved.', 'success');
    } catch (err) {
      App.toast("Couldn't save that. Check your connection and try again.", 'error');
    }
    btn.disabled = false;
  }

  async function copyFeedLink() {
    const url = document.getElementById('feed-url').value;
    try {
      await navigator.clipboard.writeText(url);
      App.toast('Link copied', 'success');
    } catch (e) {
      try {
        const input = document.getElementById('feed-url');
        input.removeAttribute('readonly');
        input.select();
        document.execCommand('copy');
        input.setAttribute('readonly', 'true');
        App.toast('Link copied', 'success');
      } catch (e2) {
        App.toast("Couldn't copy the link. Select and copy it manually.", 'error');
      }
    }
  }

  async function init() {
    const user = await App.requireAuthOrRedirect('/profile');
    if (!user) return;
    App.renderNav('/profile');
    fillForm(user);
    document.getElementById('profile-form').addEventListener('submit', onSubmit);
    document.getElementById('bio').addEventListener('input', (e) => {
      document.getElementById('bio-count').textContent = e.target.value.length;
    });
    document.getElementById('copy-feed-btn').addEventListener('click', copyFeedLink);
    document.getElementById('logout-btn').addEventListener('click', App.logout);
  }

  init();
})();
