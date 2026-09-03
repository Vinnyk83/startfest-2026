// Shared registration/conflict-modal logic used by the agenda, session detail, and my-schedule pages.
(function () {
  function showConflictModal({ message, conflicts, onSwap, onKeepBoth }) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="conflict-modal-title">
        <h2 id="conflict-modal-title">That overlaps something you're already going to.</h2>
        <p>${App.escapeHtml(message || "This overlaps a session already on your schedule.")}</p>
        <ul>
          ${(conflicts || [])
            .map(
              (c) =>
                `<li><strong>${App.escapeHtml(c.title)}</strong>${
                  c.startsAt && c.endsAt ? ` — ${App.formatTimeRange(c.startsAt, c.endsAt)}` : ''
                }${c.roomName ? ` · ${App.escapeHtml(c.roomName)}` : ''}</li>`
            )
            .join('')}
        </ul>
        <div class="modal-actions">
          <button type="button" class="btn btn--primary" id="conflict-swap-btn">Swap</button>
          <button type="button" class="btn btn--outline" id="conflict-keep-btn">Keep both</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);

    function close() {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });

    const swapBtn = backdrop.querySelector('#conflict-swap-btn');
    const keepBtn = backdrop.querySelector('#conflict-keep-btn');
    swapBtn.addEventListener('click', async () => {
      close();
      await onSwap();
    });
    keepBtn.addEventListener('click', async () => {
      close();
      await onKeepBoth();
    });
    swapBtn.focus();
  }

  async function register(sessionId) {
    try {
      await App.fetchJson('/api/registrations', { method: 'POST', body: { sessionId } });
      App.toast('Added to your schedule.', 'success');
      return { ok: true };
    } catch (e) {
      if (e.status === 409 && e.data && e.data.error === 'TIME_CONFLICT') {
        return new Promise((resolve) => {
          showConflictModal({
            message: e.data.message,
            conflicts: e.data.conflicts || [],
            onSwap: async () => {
              try {
                for (const c of e.data.conflicts || []) {
                  await App.fetchJson(`/api/registrations/${c.id}`, { method: 'DELETE' });
                }
                await App.fetchJson('/api/registrations', { method: 'POST', body: { sessionId } });
                App.toast('Swapped — added to your schedule.', 'success');
                resolve({ ok: true });
              } catch (err) {
                App.toast("Couldn't update your schedule. Check your connection and try again.", 'error');
                resolve({ ok: false });
              }
            },
            onKeepBoth: async () => {
              try {
                await App.fetchJson('/api/registrations', {
                  method: 'POST',
                  body: { sessionId, acknowledgeConflict: true },
                });
                App.toast('Added — keeping both sessions.', 'success');
                resolve({ ok: true });
              } catch (err) {
                App.toast("Couldn't update your schedule. Check your connection and try again.", 'error');
                resolve({ ok: false });
              }
            },
          });
        });
      }
      if (e.status === 400 && e.data && e.data.error === 'NOT_REGISTRABLE') {
        App.toast("That session can't be added to your schedule.", 'error');
        return { ok: false };
      }
      App.toast("Couldn't save that. Check your connection and try again.", 'error');
      return { ok: false };
    }
  }

  async function unregister(sessionId) {
    try {
      await App.fetchJson(`/api/registrations/${sessionId}`, { method: 'DELETE' });
      App.toast('Removed from your schedule.', 'success');
      return { ok: true };
    } catch (e) {
      App.toast("Couldn't remove that. Check your connection and try again.", 'error');
      return { ok: false };
    }
  }

  window.SessionActions = { register, unregister, showConflictModal };
})();
