/**
 * FILE: chat.js
 *
 * Everything for the team chat sidebar lives here: open/close UI, display name, rooms, groups, invites,
 * attachments, and the gentle rhythm of polling the server for new messages. It is built for offline-first
 * LAN use — no WebSockets, just fetch and timers — so it behaves predictably when the network is just your
 * local web server. app.js only needs to call init() once; this module reaches for config and identity on
 * window when it needs them.
 *
 * Core responsibilities:
 *   - Wire chat sidebar DOM, toggles, modals (members, invite), and notification sound / title badges
 *   - Poll REST endpoints under /api/chat/* for messages, rooms, groups, uploads, and presence
 *   - Sync display name and room id with localStorage, sessionStorage, and server (/api/chat/me)
 *   - Respect role-based flags from identity (who may read/write) and global chat enable/disable
 *
 * Dependencies:
 *   - Chat markup and ids from app.html; fetch, localStorage, sessionStorage, browser audio APIs
 *   - window.AppConfig.CHAT_CONFIG (room, poll interval, current user, allowed roles)
 *   - window.AppIdentity (getCurrentUserRole, isChatGloballyEnabled, isChatOnline)
 *
 * Bridge name: window.AppChat
 */
(function () {
    'use strict';

    function init() {
        // Resolved from pre-loaded modules
        const CHAT_CONFIG = window.AppConfig.CHAT_CONFIG;
        const { getCurrentUserRole, isChatGloballyEnabled, isChatOnline } = window.AppIdentity;

        // --- Chat sidebar (Supabase-backed, polling-based) ---
        const chatToggleBtn = document.getElementById('chat-toggle-btn');
        const chatSidebar = document.getElementById('chat-sidebar');
        const chatCloseBtn = document.getElementById('chat-close-btn');
        const chatUserNameEl = document.getElementById('chat-user-name');
        const chatSetNameBtn = document.getElementById('chat-set-name-btn');
        const chatMessagesEl = document.getElementById('chat-messages');
        const chatInputEl = document.getElementById('chat-input');
        const chatSendBtn = document.getElementById('chat-send-btn');
        const chatStatusEl = document.getElementById('chat-status');
        const chatFormEl = document.getElementById('chat-form');
        const chatAttachBtn = document.getElementById('chat-attach-btn');
        const chatFileInputEl = document.getElementById('chat-file-input');
        const CHAT_ROOM_STORAGE_KEY = 'nato-chat-room-id';
        const CHAT_PUBLIC_ROOM = 'default-ops-room';
        const CHAT_NOTIFY_SOUND_KEY = 'nato-chat-notify-sound';
        const chatRoomSelect = document.getElementById('chat-room-select');
        const chatNewGroupBtn = document.getElementById('chat-new-group-btn');
        const chatJoinCodeBtn = document.getElementById('chat-join-code-btn');
        const chatPrivateActionsEl = document.getElementById('chat-private-actions');
        const chatShowInviteBtn = document.getElementById('chat-show-invite-btn');
        const chatLeaveGroupBtn = document.getElementById('chat-leave-group-btn');
        const chatDeleteGroupBtn = document.getElementById('chat-delete-group-btn');
        const chatViewMembersBtn = document.getElementById('chat-view-members-btn');
        const chatMembersModal = document.getElementById('chat-members-modal');
        const chatMembersBackdrop = document.getElementById('chat-members-backdrop');
        const chatMembersClose = document.getElementById('chat-members-close');
        const chatMembersList = document.getElementById('chat-members-list');
        const chatInviteModal = document.getElementById('chat-invite-modal');
        const chatInviteBackdrop = document.getElementById('chat-invite-backdrop');
        const chatInviteClose = document.getElementById('chat-invite-close');
        const chatInviteCurrentDisplay = document.getElementById('chat-invite-current-display');
        const chatInviteNewInput = document.getElementById('chat-invite-new-input');
        const chatInviteSaveBtn = document.getElementById('chat-invite-save-btn');
        const chatInviteCopyBtn = document.getElementById('chat-invite-copy-btn');
        const chatInviteModalError = document.getElementById('chat-invite-modal-error');
        const chatNotifyToggleBtn = document.getElementById('chat-notify-toggle');
        try {
            const savedRoom = localStorage.getItem(CHAT_ROOM_STORAGE_KEY);
            if (savedRoom && typeof savedRoom === 'string') CHAT_CONFIG.roomId = savedRoom;
        } catch {}

        function syncChatUserName() {
            if (chatUserNameEl) chatUserNameEl.textContent = CHAT_CONFIG.currentUser?.name || 'Unknown';
        }
        syncChatUserName();

        // Server-side fallback: fetch saved identity when localStorage was empty (fixes refresh revert)
        fetch('/api/chat/me', { credentials: 'include' })
            .then(r => r.status === 204 ? {} : r.json().catch(() => ({})))
            .then(serverUser => {
                if (serverUser && (serverUser.name || serverUser.id)) {
                    const id = serverUser.id || CHAT_CONFIG.currentUser.id;
                    const name = (serverUser.name && String(serverUser.name).trim()) || CHAT_CONFIG.currentUser.name;
                    const role = serverUser.role || CHAT_CONFIG.currentUser.role;
                    CHAT_CONFIG.currentUser = { id, name, role };
                    const toSave = JSON.stringify({ id, name, role });
                    try {
                        localStorage.setItem('nato-chat-user', toSave);
                        sessionStorage.setItem('nato-chat-user', toSave);
                    } catch {}
                    syncChatUserName();
                }
            })
            .catch(() => {});

        chatSetNameBtn?.addEventListener('click', async () => {
            const current = CHAT_CONFIG.currentUser?.name || 'Planner 1';
            const name = (await customPrompt('Your display name:', current))?.trim();
            if (!name) return;
            const id = CHAT_CONFIG.currentUser?.id || ('user-' + Math.random().toString(36).slice(2, 10));
            const role = CHAT_CONFIG.currentUser?.role || 'planner';
            CHAT_CONFIG.currentUser = { id, name, role };
            const toSave = JSON.stringify({ id, name, role });
            try {
                localStorage.setItem('nato-chat-user', toSave);
                sessionStorage.setItem('nato-chat-user', toSave);
                await fetch('/api/chat/me', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: toSave
                });
            } catch (e) {
                console.warn('Could not save display name:', e);
            }
            syncChatUserName();
        });

        const chatState = {
            pollingTimer: null,
            lastFetchedAt: null,
            messages: [],
            privateGroupMeta: {},
            knownChatMessageIds: new Set(),
            chatNotifyBaselinePending: true,
            audioCtx: null,
            docTitleBase: null
        };

        function isChatAlertSoundEnabled() {
            try {
                return localStorage.getItem(CHAT_NOTIFY_SOUND_KEY) !== '0';
            } catch {
                return true;
            }
        }

        function setChatAlertSoundEnabled(on) {
            try {
                if (on) localStorage.removeItem(CHAT_NOTIFY_SOUND_KEY);
                else localStorage.setItem(CHAT_NOTIFY_SOUND_KEY, '0');
            } catch { /* ignore */ }
            syncChatNotifyToggleButton();
        }

        function syncChatNotifyToggleButton() {
            if (!chatNotifyToggleBtn) return;
            const on = isChatAlertSoundEnabled();
            chatNotifyToggleBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
            chatNotifyToggleBtn.textContent = on ? '🔔' : '🔕';
            chatNotifyToggleBtn.title = on
                ? (typeof window.t === 'function' ? window.t('chat-notify-mute-title') : 'Mute new-message sound')
                : (typeof window.t === 'function' ? window.t('chat-notify-unmute-title') : 'Unmute new-message sound');
        }

        function playChatNotifySound() {
            try {
                const Ctx = window.AudioContext || window.webkitAudioContext;
                if (!Ctx) return;
                if (!chatState.audioCtx) chatState.audioCtx = new Ctx();
                const ctx = chatState.audioCtx;
                if (ctx.state === 'suspended') void ctx.resume();
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.type = 'sine';
                o.frequency.value = 880;
                o.connect(g);
                g.connect(ctx.destination);
                const t0 = ctx.currentTime;
                g.gain.setValueAtTime(0.0001, t0);
                g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
                o.start(t0);
                o.stop(t0 + 0.15);
            } catch {
                /* ignore */
            }
        }

        function stripChatTextForNotify(text) {
            const s = String(text || '').replace(/\s+/g, ' ').trim();
            if (/\/uploads\/[^\s]+/.test(s)) {
                return typeof window.t === 'function' ? window.t('chat-notify-attachment') : 'Sent a file';
            }
            return s;
        }

        function notifyIncomingChatMessages(newMsgs) {
            if (!newMsgs.length) return;
            const sidebarOpen = chatSidebar && !chatSidebar.classList.contains('collapsed');
            if (isChatAlertSoundEnabled()) {
                playChatNotifySound();
            }
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
                const last = newMsgs[newMsgs.length - 1];
                const author = last.userName || last.userId || '—';
                const preview = stripChatTextForNotify(last.text);
                const body =
                    newMsgs.length === 1
                        ? (preview ? `${author}: ${preview}` : author)
                        : typeof window.t === 'function'
                          ? window.t('chat-notify-multiple', String(newMsgs.length))
                          : `${newMsgs.length} new messages`;
                const title = typeof window.t === 'function' ? window.t('chat-notify-title') : 'Team chat';
                try {
                    new Notification(title, {
                        body,
                        tag: `nato-chat-${CHAT_CONFIG.roomId || CHAT_PUBLIC_ROOM}`,
                        silent: true
                    });
                } catch {
                    /* ignore */
                }
            }
            if (!sidebarOpen) {
                chatToggleBtn?.classList.add('chat-toggle--unread');
                if (!chatState.docTitleBase) chatState.docTitleBase = document.title.replace(/^\(\d+\)\s+/, '');
                document.title = `(1) ${chatState.docTitleBase}`;
            }
        }

        async function refreshChatRoomOptions() {
            if (!chatRoomSelect) return;
            try {
                const res = await fetch('/api/chat/groups/mine', { credentials: 'include' });
                if (!res.ok) return;
                const data = await res.json();
                const groups = Array.isArray(data.groups) ? data.groups : [];
                const saved = (() => {
                    try {
                        return localStorage.getItem(CHAT_ROOM_STORAGE_KEY) || CHAT_CONFIG.roomId || CHAT_PUBLIC_ROOM;
                    } catch {
                        return CHAT_CONFIG.roomId || CHAT_PUBLIC_ROOM;
                    }
                })();
                const validIds = [CHAT_PUBLIC_ROOM, ...groups.map(g => g.id)];
                chatState.privateGroupMeta = {};
                groups.forEach(g => {
                    if (g && g.id) {
                        chatState.privateGroupMeta[g.id] = { isCreator: !!g.isCreator };
                    }
                });
                chatRoomSelect.innerHTML = '';
                const optMain = document.createElement('option');
                optMain.value = CHAT_PUBLIC_ROOM;
                optMain.setAttribute('data-i18n-option', 'chat-room-main');
                optMain.textContent = typeof window.t === 'function' ? window.t('chat-room-main') : 'Main room (everyone)';
                chatRoomSelect.appendChild(optMain);
                groups.forEach(g => {
                    const o = document.createElement('option');
                    o.value = g.id;
                    o.textContent = g.name || g.id;
                    chatRoomSelect.appendChild(o);
                });
                const pick = validIds.includes(saved) ? saved : CHAT_PUBLIC_ROOM;
                chatRoomSelect.value = pick;
                CHAT_CONFIG.roomId = pick;
                try {
                    localStorage.setItem(CHAT_ROOM_STORAGE_KEY, pick);
                } catch {}
                if (typeof window.applyLanguage === 'function') window.applyLanguage();
                updateChatPrivateActionsVisibility();
            } catch {
                /* ignore */
            }
        }

        function updateChatPrivateActionsVisibility() {
            if (!chatPrivateActionsEl) return;
            const rid = CHAT_CONFIG.roomId || CHAT_PUBLIC_ROOM;
            const isPrivate = rid.startsWith('grp-');
            if (!isPrivate) {
                chatPrivateActionsEl.classList.add('hidden');
                return;
            }
            chatPrivateActionsEl.classList.remove('hidden');
            if (chatDeleteGroupBtn) {
                const meta = chatState.privateGroupMeta[rid];
                chatDeleteGroupBtn.style.display = meta && meta.isCreator ? '' : 'none';
            }
        }

        function setChatStatus(text, variant) {
            if (!chatStatusEl) return;
            chatStatusEl.textContent = text;
            chatStatusEl.classList.remove('chat-status--error', 'chat-status--offline', 'chat-status--role-blocked');
            if (variant) chatStatusEl.classList.add(variant);
        }

        function formatChatMessageText(text) {
            if (!text) return '';
            const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const parts = text.split(/(\/uploads\/[^\s]+)/g);
            return parts.map((part) => {
                if (part.match(/^\/uploads\/[^\s]+$/)) {
                    const baseName = decodeURIComponent(part.split('/').pop() || 'file');
                    const segs = baseName.split('_');
                    const downloadName = segs.length >= 3 ? segs.slice(2).join('_') : baseName;
                    return `<a href="${part.replace(/"/g, '&quot;')}" download="${escape(downloadName)}" class="chat-file-link">${escape(downloadName)}</a>`;
                }
                return escape(part).replace(/\n/g, '<br>');
            }).join('');
        }

        function renderChatMessages() {
            if (!chatMessagesEl) return;
            chatMessagesEl.innerHTML = '';
            const currentUserId = CHAT_CONFIG.currentUser?.id;
            chatState.messages.forEach(msg => {
                const wrapper = document.createElement('div');
                wrapper.className = 'chat-message' + (msg.userId === currentUserId ? ' chat-message-self' : '');

                const meta = document.createElement('div');
                meta.className = 'chat-message-meta';
                const authorSpan = document.createElement('span');
                authorSpan.className = 'chat-message-author';
                authorSpan.textContent = msg.userName || msg.userId || 'Unknown';
                const timeSpan = document.createElement('span');
                timeSpan.className = 'chat-message-time';
                const d = msg.timestamp ? new Date(msg.timestamp) : null;
                timeSpan.textContent = d && !isNaN(d.getTime()) ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                meta.appendChild(authorSpan);
                meta.appendChild(timeSpan);

                const body = document.createElement('div');
                body.className = 'chat-message-text';
                body.innerHTML = formatChatMessageText(msg.text || '');

                wrapper.appendChild(meta);
                wrapper.appendChild(body);
                chatMessagesEl.appendChild(wrapper);
            });
            chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
        }

        function chatMembersT(key) {
            return typeof window.t === 'function' ? window.t(key) : key;
        }

        function renderChatMembersList(data) {
            if (!chatMembersList) return;
            chatMembersList.innerHTML = '';
            const members = data.members || [];
            if (!members.length) {
                const empty = document.createElement('div');
                empty.className = 'chat-members-empty';
                empty.textContent = chatMembersT('chat-members-empty');
                chatMembersList.appendChild(empty);
                return;
            }
            members.forEach(m => {
                const row = document.createElement('div');
                row.className = 'chat-member-row';
                row.setAttribute('role', 'listitem');
                const main = document.createElement('div');
                main.className = 'chat-member-main';
                const nameEl = document.createElement('span');
                nameEl.className = 'chat-member-name';
                nameEl.textContent = m.name || m.userId || '—';
                main.appendChild(nameEl);
                if (m.role) {
                    const roleEl = document.createElement('span');
                    roleEl.className = 'chat-member-role';
                    roleEl.textContent = m.role;
                    main.appendChild(roleEl);
                }
                if (m.isCreator) {
                    const badge = document.createElement('span');
                    badge.className = 'chat-member-badge';
                    badge.textContent = chatMembersT('chat-members-creator');
                    main.appendChild(badge);
                }
                const status = document.createElement('span');
                status.className = 'chat-member-status' + (m.online ? ' chat-member-status--on' : '');
                status.textContent = m.online
                    ? chatMembersT('chat-members-active')
                    : (data.isPrivateGroup ? chatMembersT('chat-members-away') : chatMembersT('chat-members-seen-chat'));
                row.appendChild(main);
                row.appendChild(status);
                chatMembersList.appendChild(row);
            });
        }

        async function loadChatMembersIntoModal() {
            if (!chatMembersList) return;
            chatMembersList.innerHTML = '';
            const loadEl = document.createElement('div');
            loadEl.className = 'chat-members-loading';
            loadEl.textContent = chatMembersT('chat-members-loading');
            chatMembersList.appendChild(loadEl);
            try {
                const base = CHAT_CONFIG.apiBaseUrl || '';
                const url = new URL(`${base}/api/chat/rooms/members`, window.location.origin);
                url.searchParams.set('roomId', CHAT_CONFIG.roomId || CHAT_PUBLIC_ROOM);
                const res = await fetch(url.toString(), { credentials: 'include' });
                if (res.status === 403) { chatMembersList.textContent = chatMembersT('chat-members-error-403'); return; }
                if (res.status === 404) { chatMembersList.textContent = chatMembersT('chat-members-error-404'); return; }
                if (!res.ok) { chatMembersList.textContent = chatMembersT('chat-members-error'); return; }
                let data;
                try { data = await res.json(); } catch { chatMembersList.textContent = chatMembersT('chat-members-error'); return; }
                renderChatMembersList(data);
            } catch (e) {
                chatMembersList.textContent = chatMembersT('chat-members-error-network');
            }
        }

        function pingChatPresence() {
            if (!isChatGloballyEnabled() || !isChatOnline()) return;
            const user = CHAT_CONFIG.currentUser || {};
            const base = CHAT_CONFIG.apiBaseUrl || '';
            const url = new URL(`${base}/api/chat/presence`, window.location.origin);
            fetch(url.toString(), {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId: CHAT_CONFIG.roomId || CHAT_PUBLIC_ROOM, name: user.name || '' })
            }).catch(() => {});
        }

        function openChatMembersModal() {
            if (!chatMembersModal) return;
            chatMembersModal.classList.remove('hidden');
            chatMembersModal.setAttribute('aria-hidden', 'false');
            pingChatPresence();
            void loadChatMembersIntoModal();
        }

        function closeChatMembersModal() {
            if (!chatMembersModal) return;
            chatMembersModal.classList.add('hidden');
            chatMembersModal.setAttribute('aria-hidden', 'true');
        }

        function hideChatInviteModalError() {
            if (!chatInviteModalError) return;
            chatInviteModalError.classList.add('hidden');
            chatInviteModalError.textContent = '';
        }

        function showChatInviteModalError(msg) {
            if (!chatInviteModalError) return;
            chatInviteModalError.textContent = msg;
            chatInviteModalError.classList.remove('hidden');
        }

        function closeChatInviteModal() {
            if (!chatInviteModal) return;
            chatInviteModal.classList.add('hidden');
            chatInviteModal.setAttribute('aria-hidden', 'true');
            hideChatInviteModalError();
            if (chatInviteNewInput) chatInviteNewInput.value = '';
            delete chatInviteModal.dataset.groupId;
        }

        function openChatInviteModal(groupId, inviteCode) {
            if (!chatInviteModal || !chatInviteCurrentDisplay) return;
            chatInviteModal.dataset.groupId = groupId;
            chatInviteCurrentDisplay.textContent = inviteCode || '—';
            if (chatInviteNewInput) chatInviteNewInput.value = '';
            hideChatInviteModalError();
            chatInviteModal.classList.remove('hidden');
            chatInviteModal.setAttribute('aria-hidden', 'false');
            requestAnimationFrame(() => { chatInviteNewInput?.focus(); chatInviteNewInput?.select?.(); });
        }

        async function fetchChatMessages() {
            if (!isChatGloballyEnabled() || !isChatOnline()) return;
            try {
                const base = CHAT_CONFIG.apiBaseUrl || '';
                const url = new URL(`${base}/api/chat/messages`, window.location.origin);
                const params = url.searchParams;
                params.set('roomId', CHAT_CONFIG.roomId || CHAT_PUBLIC_ROOM);
                const res = await fetch(url.toString(), { method: 'GET', credentials: 'include' });
                if (res.status === 403) {
                    setChatStatus(typeof window.t === 'function' ? window.t('chat-room-denied') : 'No access to this chat room', 'chat-status--error');
                    chatState.knownChatMessageIds = new Set();
                    chatState.chatNotifyBaselinePending = true;
                    if ((CHAT_CONFIG.roomId || '') !== CHAT_PUBLIC_ROOM) {
                        CHAT_CONFIG.roomId = CHAT_PUBLIC_ROOM;
                        try { localStorage.setItem(CHAT_ROOM_STORAGE_KEY, CHAT_PUBLIC_ROOM); } catch {}
                        if (chatRoomSelect) chatRoomSelect.value = CHAT_PUBLIC_ROOM;
                        await refreshChatRoomOptions();
                    }
                    return;
                }
                if (!res.ok) throw new Error(`Chat fetch failed (${res.status})`);
                const data = await res.json();
                const incoming = (data || []).map(row => ({
                    id: row.id, userId: row.userId, userName: row.userName || row.userId,
                    role: row.role, text: row.text, timestamp: row.timestamp
                }));
                const currentUserId = CHAT_CONFIG.currentUser?.id;
                if (chatState.chatNotifyBaselinePending) {
                    chatState.chatNotifyBaselinePending = false;
                    chatState.knownChatMessageIds = new Set();
                    incoming.forEach(m => { if (m.id) chatState.knownChatMessageIds.add(m.id); });
                } else {
                    const newFromOthers = incoming.filter(m => m.id && !chatState.knownChatMessageIds.has(m.id) && m.userId !== currentUserId);
                    incoming.forEach(m => { if (m.id) chatState.knownChatMessageIds.add(m.id); });
                    if (newFromOthers.length > 0) notifyIncomingChatMessages(newFromOthers);
                }
                chatState.messages = incoming;
                renderChatMessages();
                setChatStatus('Connected', null);
                pingChatPresence();
                if (chatMembersModal && !chatMembersModal.classList.contains('hidden')) void loadChatMembersIntoModal();
            } catch (e) {
                setChatStatus('Chat error', 'chat-status--error');
            }
        }

        async function sendChatMessage(text) {
            if (!text || !isChatGloballyEnabled() || !isChatOnline()) return;
            const user = CHAT_CONFIG.currentUser || {};
            const payload = {
                roomId: CHAT_CONFIG.roomId,
                userId: user.id || 'unknown',
                userName: user.name || '',
                role: user.role || getCurrentUserRole() || '',
                text
            };
            try {
                const base = CHAT_CONFIG.apiBaseUrl || '';
                const url = new URL(`${base}/api/chat/messages`, window.location.origin);
                const res = await fetch(url.toString(), {
                    method: 'POST', credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.status === 403) { setChatStatus(typeof window.t === 'function' ? window.t('chat-room-denied') : 'No access to this chat room', 'chat-status--error'); return; }
                if (!res.ok) throw new Error(`Chat send failed (${res.status})`);
                const row = await res.json();
                const msg = {
                    id: row?.id || String(Date.now()),
                    userId: row.userId || payload.userId,
                    userName: row.userName || payload.userName || payload.userId,
                    role: row.role || payload.role,
                    text: row.text || payload.text,
                    timestamp: row.timestamp || new Date().toISOString()
                };
                chatState.messages.push(msg);
                if (CHAT_CONFIG.maxMessages && chatState.messages.length > CHAT_CONFIG.maxMessages) {
                    chatState.messages = chatState.messages.slice(-CHAT_CONFIG.maxMessages);
                }
                renderChatMessages();
                setChatStatus('Connected', null);
            } catch (e) {
                setChatStatus('Chat error', 'chat-status--error');
            }
        }

        async function uploadChatFile(file) {
            if (!file || !isChatGloballyEnabled() || !isChatOnline()) return null;
            const safeName = file.name || 'file';
            const base = CHAT_CONFIG.apiBaseUrl || '';
            const url = new URL(`${base}/api/chat/upload`, window.location.origin);
            url.searchParams.set('roomId', CHAT_CONFIG.roomId || CHAT_PUBLIC_ROOM);
            url.searchParams.set('filename', safeName);
            try {
                const res = await fetch(url.toString(), { method: 'POST', credentials: 'include', body: file });
                if (!res.ok) throw new Error(`Upload failed (${res.status})`);
                const data = await res.json();
                return data.url || null;
            } catch (e) {
                setChatStatus('File upload error', 'chat-status--error');
                return null;
            }
        }

        function startChatPolling() {
            if (chatState.pollingTimer || !isChatGloballyEnabled()) return;
            setChatStatus(isChatOnline() ? 'Connecting…' : 'Offline', isChatOnline() ? null : 'chat-status--offline');
            fetchChatMessages();
            chatState.pollingTimer = setInterval(() => {
                if (!isChatOnline()) { setChatStatus('Offline', 'chat-status--offline'); return; }
                fetchChatMessages();
            }, CHAT_CONFIG.pollIntervalMs || 4000);
        }

        function openChatSidebar() {
            if (!chatSidebar) return;
            chatToggleBtn?.classList.remove('chat-toggle--unread');
            if (chatState.docTitleBase) document.title = chatState.docTitleBase;
            const role = getCurrentUserRole();
            const perms = CHAT_CONFIG.allowedRoles?.[role];
            if (!perms || !perms.canRead) {
                setChatStatus('Chat not available for this role', 'chat-status--role-blocked');
            } else if (!isChatGloballyEnabled()) {
                setChatStatus('Chat not configured', 'chat-status--error');
            } else if (!isChatOnline()) {
                setChatStatus('Offline', 'chat-status--offline');
            } else {
                setChatStatus('Connecting…', null);
            }
            chatSidebar.classList.remove('collapsed');
            if (chatToggleBtn) chatToggleBtn.setAttribute('aria-expanded', 'true');
            const canSend = !!(perms && perms.canSend);
            if (chatInputEl) chatInputEl.disabled = !canSend;
            if (chatSendBtn) chatSendBtn.disabled = !canSend;
            if (perms && perms.canRead && isChatGloballyEnabled()) {
                if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
                    void Notification.requestPermission();
                }
                void refreshChatRoomOptions().then(() => startChatPolling());
            }
        }

        function closeChatSidebar() {
            if (!chatSidebar) return;
            chatSidebar.classList.add('collapsed');
            if (chatToggleBtn) chatToggleBtn.setAttribute('aria-expanded', 'false');
        }

        if (chatToggleBtn && chatSidebar) {
            chatToggleBtn.addEventListener('click', () => {
                if (chatSidebar.classList.contains('collapsed')) { openChatSidebar(); } else { closeChatSidebar(); }
            });
        }
        chatCloseBtn?.addEventListener('click', closeChatSidebar);

        chatRoomSelect?.addEventListener('change', () => {
            CHAT_CONFIG.roomId = chatRoomSelect.value || CHAT_PUBLIC_ROOM;
            try { localStorage.setItem(CHAT_ROOM_STORAGE_KEY, CHAT_CONFIG.roomId); } catch {}
            chatState.knownChatMessageIds = new Set();
            chatState.chatNotifyBaselinePending = true;
            chatState.messages = [];
            renderChatMessages();
            updateChatPrivateActionsVisibility();
            closeChatMembersModal();
            closeChatInviteModal();
            void fetchChatMessages();
        });

        chatViewMembersBtn?.addEventListener('click', () => { openChatMembersModal(); });
        chatMembersBackdrop?.addEventListener('click', closeChatMembersModal);
        chatMembersClose?.addEventListener('click', closeChatMembersModal);

        chatShowInviteBtn?.addEventListener('click', async () => {
            const gid = CHAT_CONFIG.roomId;
            if (!gid || !gid.startsWith('grp-')) return;
            try {
                const base = CHAT_CONFIG.apiBaseUrl || '';
                const url = new URL(`${base}/api/chat/groups/invite`, window.location.origin);
                url.searchParams.set('groupId', gid);
                const res = await fetch(url.toString(), { credentials: 'include' });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) { setChatStatus(data.error || 'Could not load code', 'chat-status--error'); return; }
                openChatInviteModal(gid, data.inviteCode || '');
            } catch (e) { console.warn(e); setChatStatus('Chat error', 'chat-status--error'); }
        });

        chatInviteBackdrop?.addEventListener('click', closeChatInviteModal);
        chatInviteClose?.addEventListener('click', closeChatInviteModal);

        chatInviteCopyBtn?.addEventListener('click', async () => {
            const text = chatInviteCurrentDisplay?.textContent?.trim();
            if (!text || text === '—') return;
            try {
                await navigator.clipboard.writeText(text);
                setChatStatus(chatMembersT('chat-invite-copied'), null);
            } catch { setChatStatus('Could not copy', 'chat-status--error'); }
        });

        async function saveChatInviteCodeFromModal() {
            const gid = chatInviteModal?.dataset.groupId;
            if (!gid) return;
            const newCode = chatInviteNewInput?.value?.trim() || '';
            hideChatInviteModalError();
            if (!newCode) { showChatInviteModalError(chatMembersT('chat-invite-empty')); return; }
            try {
                const base = CHAT_CONFIG.apiBaseUrl || '';
                const res = await fetch(`${base}/api/chat/groups/invite-code`, {
                    method: 'POST', credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ groupId: gid, inviteCode: newCode })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    let errMsg = data.error;
                    if (!errMsg) {
                        if (res.status === 404) errMsg = chatMembersT('chat-invite-error-404');
                        else errMsg = typeof window.t === 'function' ? window.t('chat-invite-error-http', String(res.status)) : `Could not save (HTTP ${res.status})`;
                    }
                    showChatInviteModalError(errMsg);
                    return;
                }
                if (chatInviteCurrentDisplay) chatInviteCurrentDisplay.textContent = data.inviteCode || newCode;
                if (chatInviteNewInput) chatInviteNewInput.value = '';
                setChatStatus(chatMembersT('chat-invite-saved'), null);
            } catch (e) { showChatInviteModalError(chatMembersT('chat-members-error-network')); }
        }

        chatInviteSaveBtn?.addEventListener('click', () => { void saveChatInviteCodeFromModal(); });
        chatInviteNewInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void saveChatInviteCodeFromModal(); } });

        chatLeaveGroupBtn?.addEventListener('click', async () => {
            const gid = CHAT_CONFIG.roomId;
            if (!gid || !gid.startsWith('grp-')) return;
            const msg = typeof window.t === 'function' ? window.t('chat-leave-confirm') : 'Leave this group?';
            if (!confirm(msg)) return;
            try {
                const base = CHAT_CONFIG.apiBaseUrl || '';
                const res = await fetch(`${base}/api/chat/groups/leave`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groupId: gid }) });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) { setChatStatus(data.error || 'Could not leave group', 'chat-status--error'); return; }
                CHAT_CONFIG.roomId = CHAT_PUBLIC_ROOM;
                try { localStorage.setItem(CHAT_ROOM_STORAGE_KEY, CHAT_PUBLIC_ROOM); } catch {}
                if (chatRoomSelect) chatRoomSelect.value = CHAT_PUBLIC_ROOM;
                chatState.knownChatMessageIds = new Set();
                chatState.chatNotifyBaselinePending = true;
                chatState.messages = [];
                renderChatMessages();
                await refreshChatRoomOptions();
                void fetchChatMessages();
            } catch (e) { console.warn(e); setChatStatus('Chat error', 'chat-status--error'); }
        });

        chatDeleteGroupBtn?.addEventListener('click', async () => {
            const gid = CHAT_CONFIG.roomId;
            if (!gid || !gid.startsWith('grp-')) return;
            const msg = typeof window.t === 'function' ? window.t('chat-delete-confirm') : 'Delete this group for everyone?';
            if (!confirm(msg)) return;
            try {
                const base = CHAT_CONFIG.apiBaseUrl || '';
                const res = await fetch(`${base}/api/chat/groups/delete`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groupId: gid }) });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) { setChatStatus(data.error || 'Could not delete group', 'chat-status--error'); return; }
                CHAT_CONFIG.roomId = CHAT_PUBLIC_ROOM;
                try { localStorage.setItem(CHAT_ROOM_STORAGE_KEY, CHAT_PUBLIC_ROOM); } catch {}
                if (chatRoomSelect) chatRoomSelect.value = CHAT_PUBLIC_ROOM;
                chatState.knownChatMessageIds = new Set();
                chatState.chatNotifyBaselinePending = true;
                chatState.messages = [];
                renderChatMessages();
                await refreshChatRoomOptions();
                void fetchChatMessages();
            } catch (e) { console.warn(e); setChatStatus('Chat error', 'chat-status--error'); }
        });

        chatNewGroupBtn?.addEventListener('click', async () => {
            const defPrompt = 'Name for the new private group:';
            const name = (await customPrompt(typeof window.t === 'function' ? window.t('chat-new-group-prompt') : defPrompt, ''))?.trim();
            if (!name) return;
            try {
                const base = CHAT_CONFIG.apiBaseUrl || '';
                const res = await fetch(`${base}/api/chat/groups/create`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) { setChatStatus(data.error || 'Could not create group', 'chat-status--error'); return; }
                const inviteMsg = typeof window.t === 'function' ? window.t('chat-invite-copy') : 'Invite code (share with others on LAN):';
                alert(inviteMsg + '\n\n' + (data.inviteCode || ''));
                await refreshChatRoomOptions();
                if (chatRoomSelect && data.groupId) {
                    chatRoomSelect.value = data.groupId;
                    CHAT_CONFIG.roomId = data.groupId;
                    try { localStorage.setItem(CHAT_ROOM_STORAGE_KEY, data.groupId); } catch {}
                    chatState.knownChatMessageIds = new Set();
                    chatState.chatNotifyBaselinePending = true;
                    chatState.messages = [];
                    renderChatMessages();
                    void fetchChatMessages();
                }
            } catch (e) { console.warn(e); setChatStatus('Chat error', 'chat-status--error'); }
        });

        chatJoinCodeBtn?.addEventListener('click', async () => {
            const defPrompt = 'Enter the invite code:';
            const code = (await customPrompt(typeof window.t === 'function' ? window.t('chat-join-prompt') : defPrompt, ''))?.trim();
            if (!code) return;
            try {
                const base = CHAT_CONFIG.apiBaseUrl || '';
                const res = await fetch(`${base}/api/chat/groups/join`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inviteCode: code }) });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) { setChatStatus(data.error || 'Invalid invite code', 'chat-status--error'); return; }
                await refreshChatRoomOptions();
                if (chatRoomSelect && data.groupId) {
                    chatRoomSelect.value = data.groupId;
                    CHAT_CONFIG.roomId = data.groupId;
                    try { localStorage.setItem(CHAT_ROOM_STORAGE_KEY, data.groupId); } catch {}
                    chatState.knownChatMessageIds = new Set();
                    chatState.chatNotifyBaselinePending = true;
                    chatState.messages = [];
                    renderChatMessages();
                    void fetchChatMessages();
                }
            } catch (e) { console.warn(e); setChatStatus('Chat error', 'chat-status--error'); }
        });

        if (chatFormEl && chatInputEl) {
            chatFormEl.addEventListener('submit', (e) => {
                e.preventDefault();
                const text = chatInputEl.value.trim();
                if (!text) return;
                sendChatMessage(text);
                chatInputEl.value = '';
            });
        }

        if (chatAttachBtn && chatFileInputEl) {
            chatAttachBtn.addEventListener('click', () => { chatFileInputEl.click(); });
            chatFileInputEl.addEventListener('change', async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (!isChatGloballyEnabled() || !isChatOnline()) {
                    setChatStatus('Offline or chat not configured', 'chat-status--offline');
                    chatFileInputEl.value = '';
                    return;
                }
                setChatStatus('Uploading file…', null);
                const url = await uploadChatFile(file);
                if (url) {
                    const baseText = chatInputEl?.value?.trim?.() || '';
                    const text = (baseText ? baseText + '\n' : '') + `File: ${url}`;
                    await sendChatMessage(text);
                    if (chatInputEl) chatInputEl.value = '';
                }
                chatFileInputEl.value = '';
            });
        }

        window.addEventListener('online', () => {
            if (chatSidebar && !chatSidebar.classList.contains('collapsed')) setChatStatus('Connecting…', null);
            if (isChatGloballyEnabled()) {
                const role = getCurrentUserRole();
                if (CHAT_CONFIG.allowedRoles?.[role]?.canRead && !chatState.pollingTimer) {
                    void refreshChatRoomOptions().then(() => startChatPolling());
                }
            }
        });
        window.addEventListener('offline', () => {
            if (chatSidebar && !chatSidebar.classList.contains('collapsed')) setChatStatus('Offline', 'chat-status--offline');
        });

        syncChatNotifyToggleButton();
        if (!chatState.docTitleBase) {
            chatState.docTitleBase = document.title.replace(/^\(\d+\)\s+/, '');
        }
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && chatState.docTitleBase) document.title = chatState.docTitleBase;
        });
        const prevOnLanguageChange = window.onLanguageChange;
        window.onLanguageChange = () => {
            prevOnLanguageChange?.();
            syncChatNotifyToggleButton();
        };
        chatNotifyToggleBtn?.addEventListener('click', () => {
            setChatAlertSoundEnabled(!isChatAlertSoundEnabled());
        });
        if (isChatGloballyEnabled() && isChatOnline()) {
            const role = getCurrentUserRole();
            if (CHAT_CONFIG.allowedRoles?.[role]?.canRead) {
                void refreshChatRoomOptions().then(() => startChatPolling());
            }
        }
    }

    window.AppChat = { init };
})();
