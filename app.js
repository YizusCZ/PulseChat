/**
 * PulseChat v2 — Aplicación Principal
 * Autenticación JWT, Polling AJAX, @Menciones, Subida de Archivos
 */
(() => {
    'use strict';

    // ── Estado ──
    const state = {
        user: null,          // { id, username, avatar_color }
        token: '',
        salaActual: 'general',
        ultimoMsgId: 0,
        pollingInterval: null,
        heartbeatInterval: null,
        salas: [],
        isConnected: true,
        retryCount: 0,
        isScrolledToBottom: true,
        newMsgCount: 0,
        lastAuthor: '',
        mentionCount: 0,
        isPolling: false,
        pendingUpload: null,  // { file, tipo, previewUrl }
        mentionDropdownIndex: -1,
        mentionUsers: [],
        isSending: false,
    };

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);
    const AVATAR_COLORS = 8;

    const dom = {
        authScreen: $('#auth-screen'),
        authForm: $('#auth-form'),
        authUsername: $('#auth-username'),
        authPassword: $('#auth-password'),
        authBtn: $('#auth-btn'),
        authError: $('#auth-error'),
        tabLogin: $('#tab-login'),
        tabRegister: $('#tab-register'),
        app: $('#app'),
        roomsList: $('#rooms-list'),
        messagesContainer: $('#messages-container'),
        messageInput: $('#message-input'),
        sendBtn: $('#send-btn'),
        chatRoomTitle: $('#chat-room-title'),
        chatRoomIcon: $('#chat-room-icon'),
        chatRoomDesc: $('#chat-room-desc'),
        onlineCount: $('#online-count'),
        sidebarAvatar: $('#sidebar-avatar'),
        sidebarUsername: $('#sidebar-username'),
        logoutBtn: $('#logout-btn'),
        connectionStatus: $('#connection-status'),
        toastContainer: $('#toast-container'),
        newMsgIndicator: $('#new-msg-indicator'),
        mobileToggle: $('#mobile-toggle'),
        sidebar: $('#sidebar'),
        mentionsBtn: $('#mentions-btn'),
        mentionsBadge: $('#mentions-badge'),
        mentionsPanel: $('#mentions-panel'),
        mentionsList: $('#mentions-list'),
        mentionsClose: $('#mentions-close'),
        mentionsMarkAll: $('#mentions-mark-all'),
        winBtnPrev: $('#win-btn-prev'),
        winBtnNext: $('#win-btn-next'),
        winBtnClose: $('#win-btn-close'),
        mentionDropdown: $('#mention-dropdown'),
        btnUploadImage: $('#btn-upload-image'),
        btnUploadVideo: $('#btn-upload-video'),
        btnEmojiPicker: $('#btn-emoji-picker'),
        emojiPanel: $('#emoji-panel'),
        fileInputImage: $('#file-input-image'),
        fileInputVideo: $('#file-input-video'),
        uploadPreview: $('#upload-preview'),
        uploadPreviewImg: $('#upload-preview-img'),
        uploadPreviewVid: $('#upload-preview-vid'),
        uploadInfo: $('#upload-info'),
        uploadRemove: $('#upload-remove'),
        lightbox: $('#lightbox'),
        lightboxImg: $('#lightbox-img'),
    };

    // ── Utilidades ──
    function hashStr(s) { let h=0; for(let i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0;} return Math.abs(h); }
    function getAvatarColor(n) { return `avatar-color-${hashStr(n) % AVATAR_COLORS}`; }
    function getInitials(n) { return n.slice(0,2).toUpperCase(); }
    function escapeHtml(t) { const d=document.createElement('div'); d.textContent=t; return d.innerHTML; }
    function formatTime(d) {
        try { return new Date(d).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}); }
        catch(e) { return ''; }
    }
    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
        return (bytes/1048576).toFixed(1) + ' MB';
    }

    // ── Notificaciones flotantes ──
    function showToast(msg, icon='') {
        const t = document.createElement('div');
        t.className = 'toast';
        t.innerHTML = `${icon ? '<span>'+icon+'</span> ' : ''}${escapeHtml(msg)}`;
        dom.toastContainer.appendChild(t);
        setTimeout(() => { t.classList.add('out'); setTimeout(()=>t.remove(),300); }, 3500);
    }

    // ── Utilidad Iconos Salas ──
    function getRoomIconPath(roomId) {
        const mapped = ['gaming', 'musica', 'random', 'tecnologia', 'video', 'general'];
        if (mapped.includes(roomId)) return `iconos/${roomId}.png`;
        return 'iconos/Telegram.jpg';
    }

    // ── Estado de Conexión ──
    function setConnStatus(type, msg) {
        dom.connectionStatus.className = `connection-status ${type} visible`;
        dom.connectionStatus.textContent = msg;
        if (type === 'connected') setTimeout(() => dom.connectionStatus.classList.remove('visible'), 2000);
    }

    // ── API ──
    async function apiFetch(url, opts = {}) {
        try {
            const headers = { 'Content-Type': 'application/json', ...opts.headers };
            if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
            const res = await fetch(url, { ...opts, headers });
            const data = await res.json();
            
            if (res.status === 401) {
                // Token expirado o inválido
                handleLogout();
                throw new Error('Sesión expirada');
            }
            
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            
            if (!state.isConnected) { state.isConnected=true; state.retryCount=0; setConnStatus('connected','Conectado'); }
            return data;
        } catch(err) {
            if (err.message !== 'Sesión expirada') {
                state.isConnected = false;
                state.retryCount++;
                if (state.retryCount <= 3) setConnStatus('reconnecting','Reconectando...');
                else setConnStatus('error','Sin conexión');
            }
            throw err;
        }
    }

    async function apiUpload(file, tipo) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('tipo', tipo);
        const res = await fetch(`subir_archivo.php?token=${encodeURIComponent(state.token)}`, {
            method: 'POST',
            body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al subir');
        return data;
    }

    // ══════════════════════════════════════
    // AUTENTICACIÓN
    // ══════════════════════════════════════
    function setAuthMode(mode) {
        state.authMode = mode;
        dom.tabLogin.classList.toggle('active', mode === 'login');
        dom.tabRegister.classList.toggle('active', mode === 'register');
        dom.authBtn.textContent = mode === 'login' ? 'Ingresar' : 'Crear Cuenta';
        dom.authError.textContent = '';
    }

    async function handleAuth(e) {
        e.preventDefault();
        const username = dom.authUsername.value.trim();
        const password = dom.authPassword.value;
        dom.authError.textContent = '';
        dom.authBtn.disabled = true;

        try {
            const endpoint = state.authMode === 'login' ? 'login.php' : 'registro.php';
            const data = await apiFetch(endpoint, {
                method: 'POST',
                body: JSON.stringify({ username, password }),
            });

            if (data.ok) {
                state.token = data.token;
                state.user = data.user;
                localStorage.setItem('pulsechat_token', data.token);
                localStorage.setItem('pulsechat_user', JSON.stringify(data.user));
                enterApp();
            }
        } catch(err) {
            dom.authError.textContent = err.message || 'Error de conexión';
        }
        dom.authBtn.disabled = false;
    }

    function enterApp() {
        // Configurar UI de usuario
        dom.sidebarAvatar.className = `user-avatar avatar-color-${state.user.avatar_color}`;
        dom.sidebarAvatar.textContent = getInitials(state.user.username);
        dom.sidebarUsername.textContent = state.user.username;

        dom.authScreen.classList.add('hidden');
        setTimeout(() => {
            dom.authScreen.style.display = 'none';
            dom.app.classList.add('active');
            dom.messageInput.focus();
        }, 400);

        initChat();
    }

    function handleLogout() {
        clearInterval(state.pollingInterval);
        clearInterval(state.heartbeatInterval);
        state.token = '';
        state.user = null;
        state.salaActual = 'general';
        state.ultimoMsgId = 0;
        state.lastAuthor = '';
        state.newMsgCount = 0;
        state.mentionCount = 0;
        dom.messagesContainer.innerHTML = '';
        localStorage.removeItem('pulsechat_token');
        localStorage.removeItem('pulsechat_user');
        dom.app.classList.remove('active');
        dom.authScreen.style.display = '';
        setTimeout(() => dom.authScreen.classList.remove('hidden'), 50);
        dom.authUsername.value = '';
        dom.authPassword.value = '';
        dom.authError.textContent = '';
    }

    // ══════════════════════════════════════
    // SALAS
    // ══════════════════════════════════════
    async function loadRooms() {
        try {
            const data = await apiFetch('listar_salas.php');
            if (data.ok) { state.salas = data.salas; renderRooms(); }
        } catch(e) {}
    }

    function renderRooms() {
        dom.roomsList.innerHTML = '';
        state.salas.forEach(sala => {
            const el = document.createElement('div');
            el.className = `room-item${sala.id === state.salaActual ? ' active' : ''}`;
            el.dataset.roomId = sala.id;
            const users = sala.usuarios_activos || 0;
            const mentions = sala.menciones_no_leidas || 0;
            let badgeHtml = '';
            if (mentions > 0) badgeHtml = `<span class="room-badge mention">@${mentions}</span>`;
            
            const iconPath = getRoomIconPath(sala.id);

            el.innerHTML = `
                <img src="${iconPath}" alt="${sala.id}" style="width: 24px; height: 24px; object-fit: contain; flex-shrink: 0;">
                <div class="room-info">
                    <div class="room-name">${escapeHtml(sala.nombre)}</div>
                    <div class="room-meta">${users} en línea · ${sala.total_mensajes} msgs</div>
                </div>
                ${badgeHtml}
            `;
            el.addEventListener('click', () => switchRoom(sala.id));
            dom.roomsList.appendChild(el);
        });
    }

    function switchRoom(roomId) {
        if (roomId === state.salaActual) return;
        state.salaActual = roomId;
        state.ultimoMsgId = 0;
        state.lastAuthor = '';
        state.newMsgCount = 0;
        dom.messagesContainer.innerHTML = '';
        dom.newMsgIndicator.classList.remove('visible');
        const sala = state.salas.find(s => s.id === roomId);
        if (sala) {
            dom.chatRoomTitle.innerHTML = `<img src="${getRoomIconPath(sala.id)}" style="width:24px; height:24px; object-fit:contain; vertical-align:middle; margin-right:8px;"> ${escapeHtml(sala.nombre)}`;
            if(dom.chatRoomIcon) dom.chatRoomIcon.textContent = '';
            dom.chatRoomDesc.textContent = sala.descripcion || '';
        }
        $$('.room-item').forEach(el => el.classList.toggle('active', el.dataset.roomId === roomId));
        dom.sidebar.classList.remove('open');
        pollMessages();
        sendHeartbeat();
    }

    // ══════════════════════════════════════
    // MENSAJES
    // ══════════════════════════════════════
    async function pollMessages() {
        if (state.isPolling) return;
        state.isPolling = true;
        try {
            const data = await apiFetch(`nuevos_mensajes.php?desde=${state.ultimoMsgId}&sala=${encodeURIComponent(state.salaActual)}`);
            if (!data.ok) return;

            // Prevenir duplicados procesando solo los IDs que son estrictamente mayores
            const mensajesNuevos = data.mensajes.filter(msg => parseInt(msg.id) > state.ultimoMsgId);

            if (mensajesNuevos.length > 0) {
                mensajesNuevos.forEach(msg => {
                    const msgId = parseInt(msg.id);
                    if (msgId > state.ultimoMsgId) state.ultimoMsgId = msgId;
                });
                renderMessages(mensajesNuevos);

                // Notificar sobre mensajes nuevos de otros
                const others = mensajesNuevos.filter(m => m.username !== state.user.username);
                if (others.length > 0 && state.ultimoMsgId > mensajesNuevos.length) {
                    if (!state.isScrolledToBottom) {
                        state.newMsgCount += others.length;
                        dom.newMsgIndicator.textContent = `↓ ${state.newMsgCount} nuevo${state.newMsgCount>1?'s':''} mensaje${state.newMsgCount>1?'s':''}`;
                        dom.newMsgIndicator.classList.add('visible');
                    }
                }
            }

            if (data.usuarios_activos) {
                dom.onlineCount.textContent = `${data.usuarios_activos.length} en línea`;
            }

            // Actualizar placa de menciones
            if (data.menciones_no_leidas !== undefined) {
                state.mentionCount = data.menciones_no_leidas;
                updateMentionBadge();
            }
        } catch(e) {} finally {
            state.isPolling = false;
        }
    }

    function renderMessages(messages) {
        const wasAtBottom = isNearBottom();
        messages.forEach(msg => {
            const isOwn = msg.username === state.user.username;
            const isCompact = state.lastAuthor === msg.username;
            const el = document.createElement('div');
            el.className = `message${isOwn ? ' own' : ''}${isCompact ? ' compact' : ''}`;
            el.dataset.msgId = msg.id;

            const colorClass = `avatar-color-${msg.avatar_color || 0}`;
            const initials = getInitials(msg.username);

            let contentHtml = '';
            if (msg.tipo === 'image' && msg.archivo_url) {
                contentHtml = `<div class="msg-text">${formatMsgText(msg.mensaje)}</div>
                    <img class="msg-image" src="${escapeHtml(msg.archivo_url)}" alt="imagen" loading="lazy" onclick="document.getElementById('lightbox-img').src=this.src;document.getElementById('lightbox').classList.add('visible')">`;
            } else if (msg.tipo === 'video' && msg.archivo_url) {
                contentHtml = `<div class="msg-text">${formatMsgText(msg.mensaje)}</div>
                    <video class="msg-video" src="${escapeHtml(msg.archivo_url)}" controls preload="metadata"></video>`;
            } else {
                contentHtml = `<div class="msg-text">${formatMsgText(msg.mensaje)}</div>`;
            }

            el.innerHTML = `
                <div class="msg-avatar ${colorClass}">${initials}</div>
                <div class="msg-content">
                    <div class="msg-header">
                        <span class="msg-author">${escapeHtml(msg.username)}</span>
                        <span class="msg-time">${formatTime(msg.creado_en)}</span>
                    </div>
                    ${contentHtml}
                </div>
            `;
            dom.messagesContainer.appendChild(el);
            state.lastAuthor = msg.username;
        });
        if (wasAtBottom) scrollToBottom();
    }

    function formatMsgText(text) {
        if (!text) return '';
        let f = escapeHtml(text);
        // @menciones
        f = f.replace(/@([a-zA-Z0-9_\-]+)/g, '<span class="mention-tag">@$1</span>');
        // URLs
        f = f.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:var(--emerald-400);text-decoration:underline">$1</a>');
        // Negrita
        f = f.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // Cursiva
        f = f.replace(/\*(.+?)\*/g, '<em>$1</em>');
        // Código
        f = f.replace(/`(.+?)`/g, '<code style="background:var(--bg-elevated);padding:1px 5px;border-radius:3px;font-size:0.85em;font-family:var(--font-mono)">$1</code>');
        // Emojis retro
        f = f.replace(/\[emoji:([^\]]+)\]/g, '<img src="iconos/emojis retro/$1" class="retro-emoji" alt="$1">');
        return f;
    }

    // ── Enviar Mensaje ──
    async function sendMessage() {
        if (state.isSending) return;
        const text = dom.messageInput.value.trim();
        if (!text && !state.pendingUpload) return;

        state.isSending = true;
        dom.sendBtn.disabled = true;
        dom.messageInput.value = '';
        autoResize();

        try {
            let archivoUrl = null;
            let tipo = 'text';

            // Subir archivo primero si hay uno pendiente
            if (state.pendingUpload) {
                const upData = await apiUpload(state.pendingUpload.file, state.pendingUpload.tipo);
                archivoUrl = upData.url;
                tipo = state.pendingUpload.tipo;
                clearUploadPreview();
            }

            await apiFetch('enviar_mensaje.php', {
                method: 'POST',
                body: JSON.stringify({
                    mensaje: text || (tipo !== 'text' ? `[${tipo === 'image' ? 'Imagen' : 'Video'}]` : ''),
                    sala: state.salaActual,
                    tipo,
                    archivo_url: archivoUrl,
                }),
            });
            await pollMessages();
        } catch(e) {
            showToast('Error al enviar mensaje');
            dom.messageInput.value = text;
        } finally {
            state.isSending = false;
            dom.sendBtn.disabled = false;
            dom.messageInput.focus();
        }
    }

    // ── Latido de conexión ──
    async function sendHeartbeat() {
        try {
            await apiFetch('heartbeat.php', {
                method: 'POST',
                body: JSON.stringify({ sala: state.salaActual }),
            });
        } catch(e) {}
    }

    // ── Desplazamiento ──
    function isNearBottom() { const c=dom.messagesContainer; return c.scrollHeight-c.scrollTop-c.clientHeight<60; }
    function scrollToBottom(smooth=true) { dom.messagesContainer.scrollTo({top:dom.messagesContainer.scrollHeight,behavior:smooth?'smooth':'instant'}); }

    // ── Auto-ajustar Textarea ──
    function autoResize() {
        const el = dom.messageInput;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 100) + 'px';
    }

    // ══════════════════════════════════════
    // MENCIONES
    // ══════════════════════════════════════
    function updateMentionBadge() {
        if (state.mentionCount > 0) {
            dom.mentionsBadge.style.display = '';
            dom.mentionsBadge.textContent = state.mentionCount;
        } else {
            dom.mentionsBadge.style.display = 'none';
        }
    }

    async function loadMentions() {
        try {
            const data = await apiFetch('menciones.php');
            if (!data.ok) return;
            dom.mentionsList.innerHTML = '';
            if (data.menciones.length === 0) {
                dom.mentionsList.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:0.82rem">Sin menciones nuevas</div>';
                return;
            }
            data.menciones.forEach(m => {
                const el = document.createElement('div');
                el.className = 'mention-item';
                el.innerHTML = `
                    <div class="mention-item-author">@${escapeHtml(m.autor)} en #${escapeHtml(m.sala_id)}</div>
                    <div class="mention-item-text">${escapeHtml(m.mensaje)}</div>
                    <div class="mention-item-meta">${formatTime(m.mensaje_en)}</div>
                `;
                el.addEventListener('click', () => {
                    switchRoom(m.sala_id);
                    dom.mentionsPanel.classList.remove('visible');
                });
                dom.mentionsList.appendChild(el);
            });
        } catch(e) {}
    }

    async function markAllMentionsRead() {
        try {
            await apiFetch('menciones.php', {
                method: 'POST',
                body: JSON.stringify({ marcar_todas: true }),
            });
            state.mentionCount = 0;
            updateMentionBadge();
            dom.mentionsList.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:0.82rem">Sin menciones nuevas</div>';
        } catch(e) {}
    }

    // ── Autocompletado de menciones ──
    async function handleMentionInput() {
        const val = dom.messageInput.value;
        const cursor = dom.messageInput.selectionStart;
        const before = val.substring(0, cursor);
        const match = before.match(/@([a-zA-Z0-9_\-]*)$/);

        if (!match) {
            dom.mentionDropdown.classList.remove('visible');
            state.mentionUsers = [];
            return;
        }

        const search = match[1];
        if (search.length < 1) {
            dom.mentionDropdown.classList.remove('visible');
            return;
        }

        try {
            const data = await apiFetch(`menciones.php?search=${encodeURIComponent(search)}`);
            if (!data.ok || !data.usuarios.length) {
                dom.mentionDropdown.classList.remove('visible');
                return;
            }
            state.mentionUsers = data.usuarios;
            state.mentionDropdownIndex = 0;
            dom.mentionDropdown.innerHTML = '';
            data.usuarios.forEach((u, i) => {
                const opt = document.createElement('div');
                opt.className = `mention-option${i === 0 ? ' selected' : ''}`;
                opt.innerHTML = `<div class="mini-avatar avatar-color-${u.avatar_color}">${getInitials(u.username)}</div> ${escapeHtml(u.username)}`;
                opt.addEventListener('click', () => insertMention(u.username));
                dom.mentionDropdown.appendChild(opt);
            });
            dom.mentionDropdown.classList.add('visible');
        } catch(e) {}
    }

    function insertMention(username) {
        const val = dom.messageInput.value;
        const cursor = dom.messageInput.selectionStart;
        const before = val.substring(0, cursor);
        const after = val.substring(cursor);
        const newBefore = before.replace(/@[a-zA-Z0-9_\-]*$/, `@${username} `);
        dom.messageInput.value = newBefore + after;
        dom.messageInput.selectionStart = dom.messageInput.selectionEnd = newBefore.length;
        dom.mentionDropdown.classList.remove('visible');
        dom.messageInput.focus();
        dom.sendBtn.disabled = !dom.messageInput.value.trim();
    }

    // ══════════════════════════════════════
    // SUBIDA DE ARCHIVOS
    // ══════════════════════════════════════
    function handleFileSelect(file, tipo) {
        if (!file) return;
        const maxSize = tipo === 'image' ? 10*1024*1024 : 50*1024*1024;
        if (file.size > maxSize) {
            showToast(`Archivo demasiado grande (máx ${tipo==='image'?'10':'50'}MB)`);
            return;
        }
        state.pendingUpload = { file, tipo, previewUrl: URL.createObjectURL(file) };

        dom.uploadPreview.classList.add('visible');
        dom.uploadInfo.textContent = `${file.name} (${formatFileSize(file.size)})`;

        if (tipo === 'image') {
            dom.uploadPreviewImg.src = state.pendingUpload.previewUrl;
            dom.uploadPreviewImg.style.display = '';
            dom.uploadPreviewVid.style.display = 'none';
        } else {
            dom.uploadPreviewVid.src = state.pendingUpload.previewUrl;
            dom.uploadPreviewVid.style.display = '';
            dom.uploadPreviewImg.style.display = 'none';
        }
        dom.sendBtn.disabled = false;
    }

    function clearUploadPreview() {
        if (state.pendingUpload?.previewUrl) URL.revokeObjectURL(state.pendingUpload.previewUrl);
        state.pendingUpload = null;
        dom.uploadPreview.classList.remove('visible');
        dom.uploadPreviewImg.src = '';
        dom.uploadPreviewVid.src = '';
        dom.sendBtn.disabled = !dom.messageInput.value.trim();
    }

    // ══════════════════════════════════════
    // EMOJIS RETRO
    // ══════════════════════════════════════
    function initEmojiPicker() {
        const retroEmojis = [
            "Angry.ico", "Cool.ico", "Cry.ico", "Dissapointed.ico", "Just Eyes.ico", 
            "Laugh.ico", "Love.ico", "Money.ico", "Sad.ico", "Smiley.ico", 
            "Surprised.ico", "Wink.ico", "descarga.gif", 
            "sticker gif discord _ Discord Retra 3.gif"
        ];
        
        dom.emojiPanel.innerHTML = '';
        retroEmojis.forEach(filename => {
            const btn = document.createElement('button');
            btn.className = 'emoji-picker-btn';
            btn.title = filename.replace('.ico','').replace('.gif','');
            btn.innerHTML = `<img src="iconos/emojis retro/${filename}" alt="${filename}">`;
            btn.addEventListener('click', () => {
                const val = dom.messageInput.value;
                const cursor = dom.messageInput.selectionStart;
                const before = val.substring(0, cursor);
                const after = val.substring(cursor);
                const insert = `[emoji:${filename}]`;
                dom.messageInput.value = before + insert + after;
                dom.messageInput.focus();
                dom.messageInput.selectionStart = dom.messageInput.selectionEnd = before.length + insert.length;
                dom.emojiPanel.classList.remove('visible');
                dom.sendBtn.disabled = false;
            });
            dom.emojiPanel.appendChild(btn);
        });

        dom.btnEmojiPicker?.addEventListener('click', (e) => {
            e.stopPropagation();
            dom.emojiPanel.classList.toggle('visible');
            dom.mentionsPanel.classList.remove('visible');
            dom.mentionDropdown.classList.remove('visible');
        });

        // Ocultar al hacer clic fuera
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#emoji-panel') && !e.target.closest('#btn-emoji-picker')) {
                dom.emojiPanel?.classList.remove('visible');
            }
        });
    }

    // ══════════════════════════════════════
    // INICIO
    // ══════════════════════════════════════
    async function initChat() {
        await loadRooms();
        const sala = state.salas.find(s => s.id === state.salaActual);
        if (sala) {
            dom.chatRoomTitle.innerHTML = `<img src="${getRoomIconPath(sala.id)}" style="width:24px; height:24px; object-fit:contain; vertical-align:middle; margin-right:8px;"> ${escapeHtml(sala.nombre)}`;
            if (dom.chatRoomIcon) dom.chatRoomIcon.textContent = '';
            dom.chatRoomDesc.textContent = sala.descripcion || '';
        }
        await pollMessages();
        scrollToBottom(false);
        sendHeartbeat();

        state.pollingInterval = setInterval(pollMessages, 2000);
        state.heartbeatInterval = setInterval(sendHeartbeat, 10000);
        setInterval(loadRooms, 15000);

        showToast(`¡Bienvenido, ${state.user.username}!`);
    }

    // ══════════════════════════════════════
    // EVENTOS
    // ══════════════════════════════════════
    function setupEvents() {
        // Autenticación
        dom.tabLogin.addEventListener('click', () => setAuthMode('login'));
        dom.tabRegister.addEventListener('click', () => setAuthMode('register'));
        dom.authForm.addEventListener('submit', handleAuth);
        dom.logoutBtn.addEventListener('click', handleLogout);

        // Enviar
        dom.sendBtn.addEventListener('click', sendMessage);
        dom.messageInput.addEventListener('keydown', (e) => {
            // Navegación en el menú de menciones
            if (dom.mentionDropdown.classList.contains('visible')) {
                if (e.key === 'ArrowDown') { e.preventDefault(); navigateMentionDropdown(1); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); navigateMentionDropdown(-1); return; }
                if (e.key === 'Enter' || e.key === 'Tab') {
                    if (state.mentionUsers.length > 0 && state.mentionDropdownIndex >= 0) {
                        e.preventDefault();
                        insertMention(state.mentionUsers[state.mentionDropdownIndex].username);
                        return;
                    }
                }
                if (e.key === 'Escape') { dom.mentionDropdown.classList.remove('visible'); return; }
            }
            if (e.key === 'Enter' && !e.shiftKey) { 
                if (e.isComposing || e.keyCode === 229) return;
                e.preventDefault(); 
                sendMessage(); 
            }
        });

        dom.messageInput.addEventListener('input', () => {
            autoResize();
            dom.sendBtn.disabled = !dom.messageInput.value.trim() && !state.pendingUpload;
            handleMentionInput();
        });

        // Desplazamiento
        dom.messagesContainer.addEventListener('scroll', () => {
            state.isScrolledToBottom = isNearBottom();
            if (state.isScrolledToBottom) {
                state.newMsgCount = 0;
                dom.newMsgIndicator.classList.remove('visible');
            }
        });
        dom.newMsgIndicator.addEventListener('click', () => {
            scrollToBottom(); state.newMsgCount = 0; dom.newMsgIndicator.classList.remove('visible');
        });

        // Menú lateral móvil
        dom.mobileToggle.addEventListener('click', () => dom.sidebar.classList.toggle('open'));

        // Panel de menciones
        dom.mentionsBtn?.addEventListener('click', () => {
            const visible = dom.mentionsPanel.classList.toggle('visible');
            if (visible) loadMentions();
        });
        dom.mentionsClose?.addEventListener('click', () => dom.mentionsPanel.classList.remove('visible'));
        dom.mentionsMarkAll?.addEventListener('click', markAllMentionsRead);

        // Win95 Title Buttons
        dom.winBtnClose?.addEventListener('click', scrollToBottom);
        dom.winBtnPrev?.addEventListener('click', () => {
            const currentIndex = state.salas.findIndex(s => s.id === state.salaActual);
            if (currentIndex > 0) switchRoom(state.salas[currentIndex - 1].id);
        });
        dom.winBtnNext?.addEventListener('click', () => {
            const currentIndex = state.salas.findIndex(s => s.id === state.salaActual);
            if (currentIndex < state.salas.length - 1) switchRoom(state.salas[currentIndex + 1].id);
        });

        // Subida de archivos
        dom.btnUploadImage.addEventListener('click', () => dom.fileInputImage.click());
        dom.btnUploadVideo.addEventListener('click', () => dom.fileInputVideo.click());
        dom.fileInputImage.addEventListener('change', (e) => { handleFileSelect(e.target.files[0], 'image'); e.target.value=''; });
        dom.fileInputVideo.addEventListener('change', (e) => { handleFileSelect(e.target.files[0], 'video'); e.target.value=''; });
        dom.uploadRemove.addEventListener('click', clearUploadPreview);

        // Visor de imágenes
        dom.lightbox.addEventListener('click', () => dom.lightbox.classList.remove('visible'));

        // Arranque de picker
        initEmojiPicker();

        // Polling al hacer foco
        window.addEventListener('focus', () => { if (state.user) pollMessages(); });

        // Notificación en el título
        setInterval(() => {
            document.title = state.newMsgCount > 0 || state.mentionCount > 0
                ? `(${state.newMsgCount + state.mentionCount}) PulseChat`
                : 'PulseChat — Retro Cassette Chat';
        }, 1000);
    }

    function navigateMentionDropdown(dir) {
        const opts = dom.mentionDropdown.querySelectorAll('.mention-option');
        if (!opts.length) return;
        opts[state.mentionDropdownIndex]?.classList.remove('selected');
        state.mentionDropdownIndex = (state.mentionDropdownIndex + dir + opts.length) % opts.length;
        opts[state.mentionDropdownIndex]?.classList.add('selected');
        opts[state.mentionDropdownIndex]?.scrollIntoView({ block: 'nearest' });
    }

    // ── Auto-ingreso ──
    function checkSavedSession() {
        const token = localStorage.getItem('pulsechat_token');
        const userStr = localStorage.getItem('pulsechat_user');
        if (token && userStr) {
            try {
                state.token = token;
                state.user = JSON.parse(userStr);
                enterApp();
            } catch(e) {
                localStorage.removeItem('pulsechat_token');
                localStorage.removeItem('pulsechat_user');
            }
        }
    }

    // ── Arranque ──
    function boot() {
        setupEvents();
        checkSavedSession();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
