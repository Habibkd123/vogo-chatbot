// ============================================================================
// VOGO HUMAN OPERATOR DASHBOARD - Client-Side Logic
// Phase C: Real-time chat management for support staff
// ============================================================================
(function() {
  'use strict';

  // State
  let operatorToken = null;
  let operatorEmail = null;
  let operatorUserId = null;   // numeric user id (post_author value for operator's messages)
  let activeThreadId = null;
  let activeThreadPeerUserId = null;
  let discussions = [];
  let pollListTimer = null;
  let pollChatTimer = null;

  // Polling intervals (per client doc: list 10s, detail 5s)
  const LIST_POLL_MS = 10000;
  const CHAT_POLL_MS = 5000;

  // DOM references
  const loginScreen = document.getElementById('login-screen');
  const dashboard = document.getElementById('dashboard');
  const loginForm = document.getElementById('login-form');
  const loginBtn = document.getElementById('login-btn');
  const loginError = document.getElementById('login-error');
  const loginUsername = document.getElementById('login-username');
  const loginPassword = document.getElementById('login-password');
  const operatorNameEl = document.getElementById('operator-name');
  const logoutBtn = document.getElementById('logout-btn');
  const threadItemsEl = document.getElementById('thread-items');
  const refreshThreadsBtn = document.getElementById('refresh-threads-btn');
  const clearThreadsBtn = document.getElementById('clear-threads-btn');
  const chatArea = document.getElementById('chat-area');
  const chatActive = document.getElementById('chat-active');
  const chatUserName = document.getElementById('chat-user-name');
  const chatThreadIdEl = document.getElementById('chat-thread-id');
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const chatSendBtn = document.getElementById('chat-send-btn');
  const chatAttachBtn = document.getElementById('chat-attach-btn');
  const chatImageInput = document.getElementById('chat-image-input');

  // =========================================================================
  // SESSION RESTORE (from sessionStorage — survives page refresh)
  // =========================================================================
  (function restoreSession() {
    try {
      const saved = sessionStorage.getItem('vogo_op_session');
      if (!saved) return;
      const s = JSON.parse(saved);
      if (s.token) {
        operatorToken = s.token;
        operatorEmail = s.email || null;
        operatorUserId = s.userId || extractUserIdFromToken(s.token) || null;
        showDashboard();
      }
    } catch (e) {
      sessionStorage.removeItem('vogo_op_session');
    }
  })();

  // =========================================================================
  // LOGIN
  // =========================================================================
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = loginUsername.value.trim();
    const password = loginPassword.value.trim();
    if (!username || !password) return;

    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in...';
    loginError.style.display = 'none';

    try {
      // Step 1: Get bearer token
      const bearerRes = await fetch('/api/human-operator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'get_bearer' })
      });
      const bearerData = await bearerRes.json();
      if (!bearerData.success) throw new Error(bearerData.message || 'Failed to get bearer token');

      // Step 2: Login with credentials
      const loginRes = await fetch('/api/human-operator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'login', username, password, bearer: bearerData.bearer })
      });
      const loginData = await loginRes.json();
      if (!loginData.success) throw new Error(loginData.message || 'Login failed');

      // Success
      operatorToken = loginData.token;
      operatorEmail = loginData.userEmail || username;
      operatorUserId = loginData.userId ? String(loginData.userId) : (extractUserIdFromToken(loginData.token) || null);
      saveSession();
      showDashboard();

    } catch (err) {
      loginError.textContent = err.message;
      loginError.style.display = 'block';
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Sign In';
    }
  });

  function saveSession() {
    sessionStorage.setItem('vogo_op_session', JSON.stringify({
      token: operatorToken,
      email: operatorEmail,
      userId: operatorUserId
    }));
  }

  // =========================================================================
  // DASHBOARD
  // =========================================================================
  function showDashboard() {
    loginScreen.style.display = 'none';
    dashboard.style.display = 'flex';
    operatorNameEl.textContent = operatorEmail || '';

    loadDiscussions();

    clearInterval(pollListTimer);
    pollListTimer = setInterval(() => {
      if (!document.hidden) loadDiscussions();
    }, LIST_POLL_MS);
  }

  function doLogout() {
    operatorToken = null;
    operatorEmail = null;
    operatorUserId = null;
    activeThreadId = null;
    activeThreadPeerUserId = null;
    discussions = [];
    sessionStorage.removeItem('vogo_op_session');
    clearInterval(pollListTimer);
    clearInterval(pollChatTimer);
    pollListTimer = null;
    pollChatTimer = null;

    dashboard.style.display = 'none';
    loginScreen.style.display = 'flex';
    loginUsername.value = '';
    loginPassword.value = '';
    loginError.style.display = 'none';
  }

  logoutBtn.addEventListener('click', doLogout);
  refreshThreadsBtn.addEventListener('click', () => loadDiscussions());
  clearThreadsBtn.addEventListener('click', () => {
    if (!confirm('Hide all existing threads? New threads will still appear.')) return;
    // Store the highest thread ID — only threads with higher IDs will show
    const maxId = discussions.reduce((max, t) => {
      const id = Number(t.id || t.post_id || t.thread_id || 0);
      return id > max ? id : max;
    }, 0);
    sessionStorage.setItem('vogo_op_clear_after_id', String(maxId));
    activeThreadId = null;
    activeThreadPeerUserId = null;
    chatActive.style.display = 'none';
    chatArea.querySelector('.chat-placeholder').style.display = '';
    clearInterval(pollChatTimer);
    loadDiscussions();
  });

  // =========================================================================
  // THREAD LIST
  // =========================================================================
  async function loadDiscussions() {
    if (!operatorToken) return;
    try {
      const res = await fetch('/api/human-operator/discussions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: operatorToken, page: 1, perPage: 20 })
      });
      const data = await res.json();

      if (data.success && Array.isArray(data.discussions)) {
        discussions = data.discussions;
        renderThreadList();
      } else if (data.message && data.message.toLowerCase().includes('token')) {
        // Token expired — force re-login
        doLogout();
      }
    } catch (err) {
      console.error('Failed to load discussions:', err);
    }
  }

  function renderThreadList() {
    // Filter out threads hidden by "Clear All" (by thread ID)
    const clearAfterId = Number(sessionStorage.getItem('vogo_op_clear_after_id') || 0);
    let visible = discussions;
    if (clearAfterId > 0) {
      visible = discussions.filter(t => {
        const id = Number(t.id || t.post_id || t.thread_id || 0);
        return id > clearAfterId;
      });
    }

    if (visible.length === 0) {
      threadItemsEl.innerHTML = '<div class="thread-empty">No conversations yet</div>';
      return;
    }

    threadItemsEl.innerHTML = '';

    for (const thread of visible) {
      const id = thread.id || thread.post_id || thread.thread_id;
      const name = thread.username_chat || thread.author_name || thread.display_name || 'User';
      const preview = thread.post_content || thread.last_message || thread.mesaj || '';
      const time = thread.last_answer_datetime || thread.post_date || thread.created_at || '';
      const unread = Number(thread.nr_to_read || 0);

      const item = document.createElement('div');
      item.className = 'thread-item' + (id == activeThreadId ? ' active' : '');
      item.dataset.threadId = id;
      const peerUserId = thread.user_chat_id || thread.chat_user_id || thread.to_user_id || null;

      const initial = (name.charAt(0) || '?').toUpperCase();

      item.innerHTML =
        '<div class="thread-avatar">' + initial + '</div>' +
        '<div class="thread-info">' +
          '<div class="thread-name">' + escapeHtml(name) +
            (unread > 0 ? ' <span style="background:#667eea;color:#fff;border-radius:10px;padding:1px 6px;font-size:10px;margin-left:4px;">' + unread + '</span>' : '') +
          '</div>' +
          '<div class="thread-preview">' + escapeHtml(preview.substring(0, 60)) + '</div>' +
        '</div>' +
        '<div class="thread-time">' + formatTime(time) + '</div>';

      item.addEventListener('click', () => openThread(id, name, peerUserId));
      threadItemsEl.appendChild(item);
    }
  }

  // =========================================================================
  // OPEN THREAD / MESSAGES
  // =========================================================================
  function openThread(threadId, userName, peerUserId) {
    activeThreadId = threadId;
    activeThreadPeerUserId = peerUserId ? String(peerUserId) : null;

    document.querySelectorAll('.thread-item').forEach(el => {
      el.classList.toggle('active', el.dataset.threadId == threadId);
    });

    chatArea.querySelector('.chat-placeholder').style.display = 'none';
    chatActive.style.display = 'flex';
    chatUserName.textContent = userName || 'User';
    chatThreadIdEl.textContent = '#' + threadId;
    chatMessages.innerHTML = '';

    loadThreadMessages();

    clearInterval(pollChatTimer);
    pollChatTimer = setInterval(() => {
      if (!document.hidden && activeThreadId) loadThreadMessages();
    }, CHAT_POLL_MS);
  }

  async function loadThreadMessages() {
    if (!activeThreadId || !operatorToken) return;

    try {
      const res = await fetch('/api/human-operator/thread-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: operatorToken, threadId: activeThreadId, operatorUserId: operatorUserId, peerUserId: activeThreadPeerUserId })
      });
      const data = await res.json();

      if (data.success && Array.isArray(data.answers)) {
        if (data.operatorUserId) operatorUserId = String(data.operatorUserId);
        renderMessages(data.answers);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  }

  function renderMessages(answers) {
    const wasAtBottom = chatMessages.scrollTop + chatMessages.clientHeight >= chatMessages.scrollHeight - 40;

    chatMessages.innerHTML = '';

    for (const msg of answers) {
      const text = msg.mesaj || msg.comment_content || msg.message || '';
      const isOperator = typeof msg.isOperator === 'boolean' ? msg.isOperator : false;
      const isAgent = isOperator;
      const author = isOperator
        ? (operatorEmail || 'You')
        : (msg.username_chat || msg.author_name || 'User');
      const time = msg.created_at || msg.post_date || msg.date || msg.comment_date || '';

      const imageUrl = extractImageUrl(text);
      const cleanText = imageUrl ? removeImageMarkup(text) : text;

      const row = document.createElement('div');
      row.className = 'msg-row ' + (isOperator ? 'msg-operator' : 'msg-user');

      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble';
      
      if (cleanText) {
        const textNode = document.createElement('div');
        textNode.textContent = cleanText;
        if (imageUrl) textNode.style.marginBottom = '8px';
        bubble.appendChild(textNode);
      }
      
      if (imageUrl) {
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = 'Attached image';
        img.className = 'msg-image';
        img.onclick = () => openImageModal(imageUrl);
        bubble.appendChild(img);
      }
      
      const meta = document.createElement('div');
      meta.className = 'msg-meta';
      meta.textContent = escapeHtml(author) + ' &middot; ' + formatTime(time);
      
      const wrapper = document.createElement('div');
      wrapper.appendChild(bubble);
      wrapper.appendChild(meta);
      row.appendChild(wrapper);

      chatMessages.appendChild(row);
    }

    if (wasAtBottom || chatMessages.children.length <= 1) {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  function extractImageUrl(text) {
    const match = text.match(/\[image\](.*?)\[\/image\]/);
    return match ? match[1] : null;
  }

  function removeImageMarkup(text) {
    return text.replace(/\[image\].*?\[\/image\]/g, '').trim();
  }

  function openImageModal(imageUrl) {
    const modal = document.createElement('div');
    modal.className = 'operator-image-modal';
    modal.innerHTML = `
      <span class="operator-image-modal-close">&times;</span>
      <img class="operator-image-modal-content" src="${imageUrl}" />
    `;
    
    modal.querySelector('.operator-image-modal-close').onclick = () => modal.remove();
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };
    
    document.body.appendChild(modal);
  }

  // =========================================================================
  // SEND MESSAGE
  // =========================================================================
  chatSendBtn.addEventListener('click', sendReply);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendReply();
  });
  
  if (chatAttachBtn) {
    chatAttachBtn.addEventListener('click', () => chatImageInput.click());
    chatImageInput.addEventListener('change', (e) => handleOperatorImageSelect(e));
  }

  async function sendReply(imageUrl = null) {
    const text = chatInput.value.trim();
    if ((!text && !imageUrl) || !activeThreadId || !operatorToken) return;

    chatInput.value = '';
    chatSendBtn.disabled = true;

    try {
      const payload = { token: operatorToken, threadId: activeThreadId };
      if (text) payload.message = text;
      if (imageUrl) payload.imageUrl = imageUrl;
      
      const res = await fetch('/api/human-operator/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        await loadThreadMessages();
      } else {
        alert('Failed to send: ' + (data.message || 'Unknown error'));
      }
    } catch (err) {
      alert('Connection error: ' + err.message);
    } finally {
      chatSendBtn.disabled = false;
      chatInput.focus();
    }
  }

  async function handleOperatorImageSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (JPEG, PNG, GIF, WebP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image is too large. Maximum size is 5MB.');
      return;
    }

    const formData = new FormData();
    formData.append('image', file);

    try {
      if (chatAttachBtn) {
        chatAttachBtn.disabled = true;
        chatAttachBtn.textContent = '...';
      }
      
      const response = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      if (data.success) {
        await sendReply(data.imageUrl);
      } else {
        alert('Failed to upload image: ' + (data.message || 'Unknown error'));
      }
    } catch (error) {
      alert('Upload error: ' + error.message);
    } finally {
      if (chatAttachBtn) {
        chatAttachBtn.disabled = false;
        chatAttachBtn.textContent = '📎';
      }
      chatImageInput.value = '';
    }
  }

  // =========================================================================
  // HELPERS
  // =========================================================================
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function formatTime(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
             d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return dateStr;
    }
  }

  function extractUserIdFromToken(token) {
    try {
      if (!token || token.split('.').length < 2) return null;
      const payloadPart = token.split('.')[1];
      const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
      const payload = JSON.parse(atob(padded));
      const possibleId = payload.user_id || payload.id || payload.sub || null;
      return possibleId ? String(possibleId) : null;
    } catch (e) {
      return null;
    }
  }

  // Refresh when tab becomes visible again
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && operatorToken) {
      loadDiscussions();
      if (activeThreadId) loadThreadMessages();
    }
  });

})();
