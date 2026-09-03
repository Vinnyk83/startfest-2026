// Chat page: room list sidebar + open-room message pane.
// Realtime (Supabase) is the primary live-update mechanism, backed by a
// low-frequency poll as a safety net (works even without a Supabase auth
// session, and covers any realtime hiccup).
(function () {
  const POLL_MS = 9000;
  const ROOM_LIST_POLL_MS = 17000;
  const PAGE_SIZE = 50;

  const state = {
    currentUser: null,
    roomsById: new Map(),
    currentRoomId: null,
    messagesById: new Map(),
    hasMoreOlder: false,
    pollInterval: null,
    roomListPollInterval: null,
    realtimeClient: null,
    realtimeChannel: null,
  };

  function parseRoomIdFromPath() {
    const m = location.pathname.match(/^\/chat\/([^/]+)\/?$/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  // ---------- room list ----------

  function roomRowHtml(r) {
    const active = r.id === state.currentRoomId ? ' room-row--active' : '';
    const badge = r.unread > 0 ? `<span class="unread-badge">${r.unread > 99 ? '99+' : r.unread}</span>` : '';
    const icon = r.kind === 'lounge' ? '💬 ' : '';
    return `<div class="room-row${active}" data-room-id="${App.escapeHtml(r.id)}">
      <div class="room-row-name">${icon}${App.escapeHtml(r.name)}</div>
      ${badge}
    </div>`;
  }

  function renderRoomList(rooms) {
    const listEl = document.getElementById('room-list');
    if (!rooms.length) {
      listEl.innerHTML = '<div style="color:var(--ink-soft);padding:16px 8px;font-size:14px;">No rooms yet.</div>';
      return;
    }
    let html = '';
    let lastDay = null;
    for (const r of rooms) {
      if (r.kind === 'session') {
        if (r.dayNumber !== lastDay) {
          html += `<div class="room-day-label">Day ${App.escapeHtml(String(r.dayNumber))}</div>`;
          lastDay = r.dayNumber;
        }
      }
      html += roomRowHtml(r);
    }
    listEl.innerHTML = html;
  }

  async function loadRoomList() {
    try {
      const rooms = await App.fetchJson('/api/chat/rooms');
      state.roomsById = new Map(rooms.map((r) => [r.id, r]));
      renderRoomList(rooms);
      if (state.currentRoomId) {
        const room = state.roomsById.get(state.currentRoomId);
        if (room) document.getElementById('chat-room-title').textContent = room.name;
      }
    } catch (e) {
      document.getElementById('room-list').innerHTML =
        '<div style="color:var(--ink-soft);padding:16px 8px;font-size:14px;">Could not load rooms.</div>';
    }
  }

  function highlightActiveRoomRow(roomId) {
    document.querySelectorAll('.room-row').forEach((el) => {
      el.classList.toggle('room-row--active', el.getAttribute('data-room-id') === roomId);
    });
  }

  function startRoomListPolling() {
    if (state.roomListPollInterval) clearInterval(state.roomListPollInterval);
    state.roomListPollInterval = setInterval(loadRoomList, ROOM_LIST_POLL_MS);
  }

  // ---------- message rendering ----------

  function isNearBottom() {
    const el = document.getElementById('chat-messages');
    return el.scrollHeight - el.scrollTop - el.clientHeight < 150;
  }

  function scrollToBottom() {
    const el = document.getElementById('chat-messages');
    el.scrollTop = el.scrollHeight;
  }

  function avatarHtml(m) {
    if (m.avatarUrl) {
      return `<img src="${App.escapeHtml(m.avatarUrl)}" alt="" class="avatar-img" style="width:32px;height:32px;">`;
    }
    return App.initialsAvatar(m.fullName, m.avatarColor, 32);
  }

  function messageHtml(m, grouped) {
    return `<div class="chat-msg${grouped ? ' chat-msg--grouped' : ''}">
      ${avatarHtml(m)}
      <div class="chat-msg-body-wrap">
        <div class="chat-msg-header">
          <span class="chat-msg-name">${App.escapeHtml(m.fullName || 'Attendee')}</span>
          <span class="chat-msg-time">${App.escapeHtml(App.formatTime(m.createdAt))}</span>
        </div>
        <div class="chat-msg-body">${App.escapeHtml(m.body)}</div>
      </div>
    </div>`;
  }

  function sortedMessages() {
    return Array.from(state.messagesById.values()).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  function renderMessages(opts) {
    opts = opts || {};
    const list = sortedMessages();
    const container = document.getElementById('chat-messages-list');
    if (!list.length) {
      container.innerHTML = '<div class="chat-empty-messages">No messages yet. Say hello!</div>';
      document.getElementById('chat-load-older').hidden = true;
      return;
    }
    let lastUserId = null;
    let lastCreatedAt = null;
    container.innerHTML = list
      .map((m) => {
        const grouped =
          m.userId === lastUserId && lastCreatedAt && new Date(m.createdAt) - new Date(lastCreatedAt) < 5 * 60 * 1000;
        lastUserId = m.userId;
        lastCreatedAt = m.createdAt;
        return messageHtml(m, grouped);
      })
      .join('');
    document.getElementById('chat-load-older').hidden = !state.hasMoreOlder;
    if (opts.stickToBottom) scrollToBottom();
  }

  // Adds messages, dedupes by id, re-renders if anything new arrived.
  // Returns true if any new message was added.
  function addMessages(newMsgs) {
    let added = false;
    for (const m of newMsgs) {
      if (!state.messagesById.has(m.id)) {
        state.messagesById.set(m.id, m);
        added = true;
      }
    }
    if (added) {
      const stick = isNearBottom() || state.messagesById.size === newMsgs.length;
      renderMessages({ stickToBottom: stick });
    }
    return added;
  }

  async function loadOlder() {
    const roomId = state.currentRoomId;
    const oldest = sortedMessages()[0];
    if (!oldest) return;
    const btn = document.getElementById('load-older-btn');
    btn.disabled = true;
    btn.textContent = 'Loading…';
    const messagesEl = document.getElementById('chat-messages');
    const prevScrollHeight = messagesEl.scrollHeight;
    const prevScrollTop = messagesEl.scrollTop;
    try {
      const data = await App.fetchJson(
        `/api/chat/rooms/${encodeURIComponent(roomId)}/messages?before=${encodeURIComponent(oldest.createdAt)}&limit=${PAGE_SIZE}`
      );
      if (state.currentRoomId !== roomId) return;
      state.hasMoreOlder = data.messages.length === PAGE_SIZE;
      if (data.messages.length) {
        for (const m of data.messages) state.messagesById.set(m.id, m);
        renderMessages();
        messagesEl.scrollTop = messagesEl.scrollHeight - prevScrollHeight + prevScrollTop;
      } else {
        document.getElementById('chat-load-older').hidden = true;
      }
    } catch (e) {
      App.toast('Could not load older messages.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Load older messages';
    }
  }

  // ---------- read receipts ----------

  async function markRead(roomId) {
    if (!state.currentUser) return;
    try {
      await App.fetchJson(`/api/chat/rooms/${encodeURIComponent(roomId)}/read`, { method: 'POST' });
      const room = state.roomsById.get(roomId);
      if (room && room.unread) {
        room.unread = 0;
        renderRoomList(Array.from(state.roomsById.values()));
      }
    } catch (e) {
      // not authenticated or transient network issue — next poll will retry
    }
  }

  // ---------- live updates: realtime + polling backstop ----------

  async function refreshLatestMessages(roomId) {
    try {
      const data = await App.fetchJson(`/api/chat/rooms/${encodeURIComponent(roomId)}/messages?limit=${PAGE_SIZE}`);
      if (state.currentRoomId !== roomId) return;
      const added = addMessages(data.messages);
      if (added) markRead(roomId);
    } catch (e) {
      // silent — this is a backstop poll, avoid spamming the user with toasts
    }
  }

  function startPolling(roomId) {
    stopPolling();
    state.pollInterval = setInterval(() => refreshLatestMessages(roomId), POLL_MS);
  }

  function stopPolling() {
    if (state.pollInterval) {
      clearInterval(state.pollInterval);
      state.pollInterval = null;
    }
  }

  async function subscribeRealtime(roomId) {
    try {
      const sb = await App.getSupabaseClient();
      const channel = sb
        .channel(`room:${roomId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
          () => {
            if (state.currentRoomId === roomId) refreshLatestMessages(roomId);
          }
        )
        .subscribe();
      state.realtimeClient = sb;
      state.realtimeChannel = channel;
    } catch (e) {
      // Supabase unavailable — the polling backstop still covers us.
      console.warn('Chat realtime subscribe failed, relying on polling fallback', e);
    }
  }

  function teardownRoomLive() {
    stopPolling();
    if (state.realtimeChannel && state.realtimeClient) {
      state.realtimeClient.removeChannel(state.realtimeChannel);
    }
    state.realtimeChannel = null;
  }

  // ---------- composer ----------

  function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  function renderComposer(roomId) {
    const el = document.getElementById('chat-composer');
    if (!state.currentUser) {
      el.innerHTML = `<div class="chat-composer-login">Log in to join the conversation. <a href="/login?next=${encodeURIComponent(
        '/chat/' + roomId
      )}">Log in</a></div>`;
      return;
    }
    el.innerHTML = `<div class="chat-composer-row">
      <textarea id="chat-input" rows="1" maxlength="1000" placeholder="Message..."></textarea>
      <button type="button" class="btn btn--primary" id="chat-send-btn">Send</button>
    </div>`;
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    input.addEventListener('input', () => autoGrow(input));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    sendBtn.addEventListener('click', sendMessage);
  }

  async function sendMessage() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const body = input.value.trim();
    if (!body) return;
    const roomId = state.currentRoomId;
    const sendBtn = document.getElementById('chat-send-btn');
    input.disabled = true;
    sendBtn.disabled = true;
    try {
      const msg = await App.fetchJson(`/api/chat/rooms/${encodeURIComponent(roomId)}/messages`, {
        method: 'POST',
        body: { body },
      });
      input.value = '';
      autoGrow(input);
      state.messagesById.set(msg.id, msg);
      renderMessages({ stickToBottom: true });
      markRead(roomId);
    } catch (e) {
      if (e.status === 400 && e.data && e.data.fields && e.data.fields.body) {
        App.toast(e.data.fields.body, 'error');
      } else if (e.status === 401) {
        App.toast('Please log in to send messages.', 'error');
      } else {
        App.toast('Failed to send message. Try again.', 'error');
      }
    } finally {
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  // ---------- room open/close ----------

  function showEmptyRoomState() {
    document.getElementById('chat-room-empty').hidden = false;
    document.getElementById('chat-room-active').hidden = true;
  }

  function showActiveRoomView() {
    document.getElementById('chat-room-empty').hidden = true;
    document.getElementById('chat-room-active').hidden = false;
  }

  async function openRoom(roomId, opts) {
    opts = opts || {};
    if (!roomId) {
      showEmptyRoomState();
      return;
    }
    teardownRoomLive();
    state.currentRoomId = roomId;
    state.messagesById = new Map();
    state.hasMoreOlder = false;

    if (opts.pushState) {
      history.pushState({ roomId }, '', `/chat/${encodeURIComponent(roomId)}`);
    }
    document.body.classList.add('chat-mobile-room-open');
    showActiveRoomView();
    highlightActiveRoomRow(roomId);
    renderComposer(roomId);

    const room = state.roomsById.get(roomId);
    document.getElementById('chat-room-title').textContent = room ? room.name : roomId;
    document.getElementById('chat-messages-list').innerHTML = Array(4)
      .fill('<div class="skeleton" style="height:40px;border-radius:8px;margin-bottom:10px;"></div>')
      .join('');
    document.getElementById('chat-load-older').hidden = true;

    try {
      const data = await App.fetchJson(`/api/chat/rooms/${encodeURIComponent(roomId)}/messages?limit=${PAGE_SIZE}`);
      if (state.currentRoomId !== roomId) return;
      state.hasMoreOlder = data.messages.length === PAGE_SIZE;
      for (const m of data.messages) state.messagesById.set(m.id, m);
      renderMessages({ stickToBottom: true });
    } catch (e) {
      document.getElementById('chat-messages-list').innerHTML =
        '<div class="chat-empty-messages">Could not load messages for this room.</div>';
    }

    markRead(roomId);
    subscribeRealtime(roomId);
    startPolling(roomId);
  }

  function onPopState() {
    const roomId = parseRoomIdFromPath();
    if (roomId) {
      openRoom(roomId, { pushState: false });
    } else {
      teardownRoomLive();
      state.currentRoomId = null;
      document.body.classList.remove('chat-mobile-room-open');
      showEmptyRoomState();
    }
  }

  // ---------- wiring ----------

  function onRoomRowClick(e) {
    const row = e.target.closest('.room-row');
    if (!row) return;
    const roomId = row.getAttribute('data-room-id');
    if (roomId === state.currentRoomId) {
      document.body.classList.add('chat-mobile-room-open');
      return;
    }
    openRoom(roomId, { pushState: true });
  }

  async function init() {
    App.renderNav('/chat');
    state.currentUser = await App.currentUser();

    document.getElementById('room-list').addEventListener('click', onRoomRowClick);
    document.getElementById('chat-back-btn').addEventListener('click', () => {
      document.body.classList.remove('chat-mobile-room-open');
    });
    document.getElementById('load-older-btn').addEventListener('click', loadOlder);
    window.addEventListener('popstate', onPopState);

    await loadRoomList();
    startRoomListPolling();

    const initialRoomId = parseRoomIdFromPath();
    if (initialRoomId) {
      await openRoom(initialRoomId, { pushState: false });
    } else {
      showEmptyRoomState();
    }
  }

  init();
})();
