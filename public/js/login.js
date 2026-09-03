(function () {
  function showError(msg) {
    const el = document.getElementById('form-error');
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  }

  async function onSubmit(e) {
    e.preventDefault();
    showError('');
    const identifier = document.getElementById('identifier').value.trim();
    const password = document.getElementById('password').value;
    if (!identifier || !password) {
      showError('Enter your email/username and password.');
      return;
    }
    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    try {
      const { user } = await App.fetchJson('/api/auth/login', { method: 'POST', body: { identifier, password } });
      const params = new URLSearchParams(window.location.search);
      const next = params.get('next');
      if (next) {
        window.location.href = next;
      } else if (user && user.role === 'admin') {
        window.location.href = '/admin';
      } else {
        window.location.href = '/';
      }
    } catch (err) {
      btn.disabled = false;
      if (err.status === 401) {
        showError((err.data && err.data.message) || 'Incorrect email/username or password.');
      } else if (err.status === 429) {
        showError((err.data && err.data.message) || 'Too many attempts. Try again in a moment.');
      } else {
        showError("Couldn't log in. Check your connection and try again.");
      }
    }
  }

  function showMagicLinkError(msg) {
    const el = document.getElementById('magic-link-error');
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  }

  async function onMagicLinkSubmit(e) {
    e.preventDefault();
    showMagicLinkError('');
    const email = document.getElementById('magic-email').value.trim();
    if (!email) {
      showMagicLinkError('Enter your email address.');
      return;
    }
    const btn = document.getElementById('magic-link-btn');
    btn.disabled = true;
    try {
      const sb = await App.getSupabaseClient();
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + '/auth/callback' },
      });
      if (error) {
        App.toast(error.message, 'error');
        btn.disabled = false;
        return;
      }
      const form = document.getElementById('magic-link-form');
      form.style.display = 'none';
      const sent = document.getElementById('magic-link-sent');
      sent.textContent = `Check your email — we sent a sign-in link to ${email}.`;
      sent.style.display = 'block';
    } catch (err) {
      App.toast(err.message || "Couldn't send the sign-in link.", 'error');
      btn.disabled = false;
    }
  }

  async function init() {
    App.renderNav('/login');
    document.getElementById('login-form').addEventListener('submit', onSubmit);
    document.getElementById('magic-link-form').addEventListener('submit', onMagicLinkSubmit);
  }

  init();
})();
