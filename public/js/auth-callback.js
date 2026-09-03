(function () {
  function showError(msg) {
    document.getElementById('callback-title').textContent = "That link didn't work";
    document.getElementById('callback-message').style.display = 'none';
    const errEl = document.getElementById('callback-error');
    errEl.textContent = msg || "That link didn't work — it may have expired.";
    errEl.style.display = 'block';
    document.getElementById('callback-retry').style.display = 'block';
  }

  async function init() {
    App.renderNav('/login');
    try {
      const sb = await App.getSupabaseClient();
      const {
        data: { session },
        error,
      } = await sb.auth.getSession();

      if (error || !session) {
        showError("That link didn't work — it may have expired.");
        return;
      }

      let result;
      try {
        result = await App.fetchJson('/api/auth/sync', {
          method: 'POST',
          body: { access_token: session.access_token },
        });
      } catch (err) {
        if (err.status === 403) {
          showError((err.data && err.data.message) || 'This account has been deactivated.');
        } else {
          showError("That link didn't work — it may have expired.");
        }
        return;
      }

      const user = result && result.user;
      // Deliberately do NOT call sb.auth.signOut() here — other in-progress
      // features (realtime chat/presence) depend on the Supabase session
      // staying alive in the browser alongside our own cookie session.
      window.location.href = user && user.role === 'admin' ? '/admin' : '/';
    } catch (err) {
      showError("That link didn't work — it may have expired.");
    }
  }

  init();
})();
