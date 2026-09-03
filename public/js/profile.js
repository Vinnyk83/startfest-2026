(function () {
  const SWATCHES = ['#C4E538', '#21C99A', '#4FB3F0', '#6B7BF7', '#A55BE0', '#E84BC9'];
  let selectedColor = SWATCHES[0];
  let currentUser = null;
  let hasSupabaseSession = false;
  const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

  function renderAvatarPreview(previewUrl) {
    const el = document.getElementById('avatar-preview');
    const url = previewUrl || (currentUser && currentUser.avatarUrl);
    if (url) {
      el.innerHTML = `<img class="avatar-img" src="${App.escapeHtml(url)}" alt="Your profile photo">`;
    } else {
      el.innerHTML = App.initialsAvatar(
        currentUser ? currentUser.fullName : '',
        currentUser ? currentUser.avatarColor : SWATCHES[0],
        64
      );
    }
  }

  function looksLikeUrl(value) {
    return !value || /^https?:\/\//i.test(value);
  }

  function checkUrlHint(fieldId) {
    const value = document.getElementById(fieldId).value.trim();
    const hint = document.getElementById(fieldId + '-hint');
    if (!hint) return;
    hint.style.display = looksLikeUrl(value) ? 'none' : 'block';
  }

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
    currentUser = user;
    document.getElementById('fullName').value = user.fullName || '';
    document.getElementById('jobTitle').value = user.jobTitle || '';
    document.getElementById('company').value = user.company || '';
    document.getElementById('bio').value = user.bio || '';
    document.getElementById('bio-count').textContent = (user.bio || '').length;
    document.getElementById('linkedinUrl').value = user.linkedinUrl || '';
    document.getElementById('twitterUrl').value = user.twitterUrl || '';
    document.getElementById('websiteUrl').value = user.websiteUrl || '';
    document.getElementById('shareAttendance').checked = !!user.shareAttendance;
    selectedColor = user.avatarColor && SWATCHES.includes(user.avatarColor) ? user.avatarColor : SWATCHES[0];
    renderSwatches();
    renderAvatarPreview();

    const feedUrl = `webcal://${location.host}/api/calendar/feed/${user.feedToken}.ics`;
    document.getElementById('feed-url').value = feedUrl;
  }

  async function setUpAvatarUpload() {
    const changeBtn = document.getElementById('change-photo-btn');
    const fileInput = document.getElementById('avatar-file-input');
    const helpEl = document.getElementById('avatar-help');

    let session = null;
    try {
      const sb = await App.getSupabaseClient();
      const result = await sb.auth.getSession();
      session = result.data && result.data.session;
    } catch (e) {
      session = null;
    }
    hasSupabaseSession = !!session;

    if (!hasSupabaseSession) {
      changeBtn.disabled = true;
      helpEl.textContent = 'Photo upload requires magic-link sign-in — log out and sign in again via the emailed link to enable this.';
      helpEl.style.display = 'block';
      return;
    }

    changeBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      fileInput.value = '';

      if (!file.type.startsWith('image/')) {
        App.toast('Please choose an image file.', 'error');
        return;
      }
      if (file.size > MAX_AVATAR_BYTES) {
        App.toast('Image is too large. Please choose a file under 5MB.', 'error');
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      renderAvatarPreview(previewUrl);
      changeBtn.disabled = true;

      try {
        const sb = await App.getSupabaseClient();
        const {
          data: { session: freshSession },
        } = await sb.auth.getSession();
        if (!freshSession) {
          App.toast('Your sign-in session has expired. Log in again via a magic link to upload a photo.', 'error');
          renderAvatarPreview();
          return;
        }
        const path = `${freshSession.user.id}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await sb.storage
          .from('avatars')
          .upload(path, file, { upsert: true, contentType: file.type });
        if (uploadError) {
          App.toast('Upload failed: ' + uploadError.message, 'error');
          renderAvatarPreview();
          return;
        }
        const {
          data: { publicUrl },
        } = sb.storage.from('avatars').getPublicUrl(path);
        const { user } = await App.fetchJson('/api/me', { method: 'PATCH', body: { avatarUrl: publicUrl } });
        currentUser = user;
        renderAvatarPreview();
        App.toast('Photo updated.', 'success');
      } catch (err) {
        App.toast("Couldn't save your photo. Check your connection and try again.", 'error');
        renderAvatarPreview();
      } finally {
        changeBtn.disabled = false;
        URL.revokeObjectURL(previewUrl);
      }
    });
  }

  async function onSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    try {
      const { user } = await App.fetchJson('/api/me', {
        method: 'PATCH',
        body: {
          fullName: document.getElementById('fullName').value.trim(),
          jobTitle: document.getElementById('jobTitle').value.trim(),
          company: document.getElementById('company').value.trim(),
          bio: document.getElementById('bio').value.trim(),
          linkedinUrl: document.getElementById('linkedinUrl').value.trim(),
          twitterUrl: document.getElementById('twitterUrl').value.trim(),
          websiteUrl: document.getElementById('websiteUrl').value.trim(),
          avatarColor: selectedColor,
          shareAttendance: document.getElementById('shareAttendance').checked,
        },
      });
      currentUser = user;
      renderAvatarPreview();
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
    ['linkedinUrl', 'twitterUrl', 'websiteUrl'].forEach((fieldId) => {
      document.getElementById(fieldId).addEventListener('blur', () => checkUrlHint(fieldId));
    });
    document.getElementById('copy-feed-btn').addEventListener('click', copyFeedLink);
    document.getElementById('logout-btn').addEventListener('click', App.logout);
    setUpAvatarUpload();
  }

  init();
})();
