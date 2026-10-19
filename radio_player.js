/**
 * PulseChat Radio — Reproductor Global Sincronizado con YouTube (API IFrame)
 */
(() => {
    'use strict';

    const radioState = {
        isPlaying: false,
        isMuted: false,
        volume: 75,
        listeners: 0,
        syncInterval: null,
        
        currentSongId: null,
        currentYoutubeId: null,
        serverTimeDiff: 0, // hora_local - hora_servidor
        
        ytPlayer: null,
        ytReady: false
    };

    const r$ = (sel) => document.querySelector(sel);
    let rdom = {};

    function initRadio() {
        rdom = {
            btnPlay: r$('#radio-btn-play'),
            btnMute: r$('#radio-btn-mute'),
            playIcon: r$('#radio-play-icon'),
            trackThumb: r$('#radio-track-thumb'),
            trackTitle: r$('#radio-track-title'),
            trackArtist: r$('#radio-track-artist'),
            progressBar: r$('#radio-progress-bar'),
            progressFill: r$('#radio-progress-fill'),
            currentTime: r$('#radio-current-time'),
            totalTime: r$('#radio-total-time'),
            volumeBar: r$('#radio-volume-bar'),
            volumeFill: r$('#radio-volume-fill'),
            playlistContainer: r$('#radio-playlist'),
            trackCount: r$('#radio-track-count'),
            toggleBtn: r$('#radio-toggle-btn'),
            panel: r$('#radio-panel'),
            
            searchInput: r$('#radio-search-input'),
            searchBtn: r$('#radio-search-btn'),
            searchResults: r$('#radio-search-results'),
        };

        if (!rdom.btnPlay) return;

        setupRadioEvents();
        
        // Restaurar volumen guardado
        const saved = localStorage.getItem('pulsechat_radio_vol');
        if (saved) {
            radioState.volume = parseInt(saved, 10);
            if (rdom.volumeFill) rdom.volumeFill.style.width = `${radioState.volume}%`;
        }

        // Cargar API de YouTube
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        
        // Iniciar bucle de sincronización
        syncRadioState();
        radioState.syncInterval = setInterval(syncRadioState, 3000);
        
        // Bucle de actualización visual del tiempo
        setInterval(updateTimeUI, 1000);
    }

    // Callback de la API de YouTube
    window.onYouTubeIframeAPIReady = function() {
        radioState.ytPlayer = new YT.Player('youtube-player', {
            height: '1',
            width: '1',
            videoId: '',
            playerVars: {
                'playsinline': 1,
                'controls': 0,
                'disablekb': 1,
                'fs': 0,
                'rel': 0,
                'origin': window.location.origin
            },
            events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange
            }
        });
    };

    function onPlayerReady(event) {
        radioState.ytReady = true;
        event.target.setVolume(radioState.volume);
        
        if (radioState.currentYoutubeId && radioState.isPlaying) {
            playYoutube();
        }
    }

    function onPlayerStateChange(event) {
        if (event.data === YT.PlayerState.PLAYING) {
            radioState.isPlaying = true;
            updatePlayUI();
        } else if (event.data === YT.PlayerState.PAUSED) {
            radioState.isPlaying = false;
            updatePlayUI();
        } else if (event.data === YT.PlayerState.ENDED) {
            // Keep isPlaying = true so syncRadioState automatically starts the next song
            updatePlayUI();
        }
    }

    async function apiFetchRadio(url, opts = {}) {
        const token = localStorage.getItem('pulsechat_token');
        const headers = { 'Content-Type': 'application/json', ...opts.headers };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        const res = await fetch(url, { ...opts, headers });
        const data = await res.json();
        
        if (res.status === 401 && typeof handleLogout === 'function') {
            handleLogout();
            throw new Error('Sesión expirada');
        }
        
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        return data;
    }

    // ── 1. ESTADO DE SINCRONIZACIÓN ──
    async function syncRadioState() {
        try {
            const data = await apiFetchRadio('radio_api.php?action=state');
            if (!data.ok) return;

            // Calcular diferencia de tiempo
            const now = Math.floor(Date.now() / 1000);
            radioState.serverTimeDiff = now - data.server_time;

            updateQueueUI(data.queue);

            if (data.current) {
                // La canción ha cambiado
                if (radioState.currentSongId !== data.current.id) {
                    radioState.currentSongId = data.current.id;
                    radioState.currentYoutubeId = data.current.youtube_id;
                    
                    if (rdom.trackTitle) rdom.trackTitle.textContent = data.current.title;
                    if (rdom.trackArtist) rdom.trackArtist.textContent = `Pedida por: ${data.current.requester}`;
                    if (rdom.totalTime) rdom.totalTime.textContent = formatTime(data.current.duration);
                    if (rdom.trackThumb) {
                        rdom.trackThumb.src = `https://i.ytimg.com/vi/${data.current.youtube_id}/mqdefault.jpg`;
                        rdom.trackThumb.style.display = 'block';
                    }

                    if (radioState.isPlaying && radioState.ytReady) {
                        playYoutube(data.current);
                    }
                }

                // Sincronizar posición si está reproduciendo
                if (radioState.isPlaying && radioState.ytReady && radioState.ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) {
                    const serverNow = Math.floor(Date.now() / 1000) - radioState.serverTimeDiff;
                    const expectedPos = serverNow - data.current.start_time;
                    
                    const actualPos = radioState.ytPlayer.getCurrentTime();
                    
                    // Si el desfase es mayor a 3 segundos, resincronizar
                    if (Math.abs(actualPos - expectedPos) > 3) {
                        if (expectedPos > 0 && expectedPos < data.current.duration) {
                            radioState.ytPlayer.seekTo(expectedPos, true);
                        }
                    }
                }
            } else {
                // Nada reproduciéndose
                if (radioState.currentSongId !== null) {
                    radioState.currentSongId = null;
                    radioState.currentYoutubeId = null;
                    if (radioState.ytReady) radioState.ytPlayer.stopVideo();
                    
                    if (rdom.trackTitle) rdom.trackTitle.textContent = 'PulseWave Radio';
                    if (rdom.trackArtist) rdom.trackArtist.textContent = 'Buscador listo';
                    if (rdom.totalTime) rdom.totalTime.textContent = '0:00';
                    if (rdom.currentTime) rdom.currentTime.textContent = '0:00';
                    if (rdom.progressFill) rdom.progressFill.style.width = '0%';
                    if (rdom.trackThumb) {
                        rdom.trackThumb.src = '';
                        rdom.trackThumb.style.display = 'none';
                    }
                }
            }

        } catch (e) {
            console.warn('Fallo en sincronización de radio:', e);
        }
    }

    function updateTimeUI() {
        if (radioState.isPlaying && radioState.ytReady && radioState.ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) {
            const currentTime = radioState.ytPlayer.getCurrentTime();
            const duration = radioState.ytPlayer.getDuration();
            
            if (duration > 0) {
                const pct = (currentTime / duration) * 100;
                if (rdom.progressFill) rdom.progressFill.style.width = `${pct}%`;
                if (rdom.currentTime) rdom.currentTime.textContent = formatTime(currentTime);
            }
        }
    }

    // ── 2. COLA Y UI ──
    function updateQueueUI(queue) {
        if (!rdom.playlistContainer) return;
        rdom.playlistContainer.innerHTML = '';
        if (rdom.trackCount) rdom.trackCount.textContent = `${queue.length} en cola`;

        if (queue.length === 0) {
            rdom.playlistContainer.innerHTML = '<div style="padding:10px;text-align:center;color:#5e5c6e;font-size:0.8rem">La cola está vacía. ¡Añade música!</div>';
            return;
        }

        queue.forEach((song, idx) => {
            const el = document.createElement('div');
            el.className = 'radio-track-item';
            el.innerHTML = `
                <img class="queue-thumb" src="https://i.ytimg.com/vi/${escapeHtml(song.youtube_id || '')}/default.jpg" alt="">
                <div class="radio-track-info">
                    <div class="radio-track-name">${escapeHtml(song.title)}</div>
                    <div class="radio-track-artist">Pedida por: ${escapeHtml(song.requester)}</div>
                </div>
                <span class="radio-track-dur">${formatTime(song.duration)}</span>
            `;
            rdom.playlistContainer.appendChild(el);
        });
    }

    // ── 3. BÚSQUEDA Y ENCOLAR ──
    async function searchYoutube() {
        const q = rdom.searchInput.value.trim();
        if (!q) return;

        rdom.searchBtn.disabled = true;
        rdom.searchBtn.textContent = 'Cargando';
        rdom.searchResults.style.display = 'flex';
        rdom.searchResults.innerHTML = '<div style="text-align:center;font-size:0.8rem;color:#9896a8;">Buscando...</div>';

        try {
            const data = await apiFetchRadio(`radio_api.php?action=search&q=${encodeURIComponent(q)}`);
            rdom.searchResults.innerHTML = '';
            
            if (!data.results || data.results.length === 0) {
                rdom.searchResults.innerHTML = '<div style="text-align:center;font-size:0.8rem;color:#f43f5e;">Sin resultados</div>';
            } else {
                data.results.forEach(res => {
                    const el = document.createElement('div');
                    el.className = 'search-result-item';
                    el.innerHTML = `
                        <img src="https://i.ytimg.com/vi/${escapeHtml(res.id)}/default.jpg" style="width:40px;height:30px;object-fit:cover;border-radius:2px;margin-right:8px;">
                        <div class="search-result-title">${escapeHtml(res.title)}</div>
                        <div class="search-result-dur">${formatTime(res.duration)}</div>
                    `;
                    el.addEventListener('click', () => enqueueSong(res.id, el));
                    rdom.searchResults.appendChild(el);
                });
            }
        } catch (e) {
            rdom.searchResults.innerHTML = '<div style="text-align:center;font-size:0.8rem;color:#f43f5e;">Error al buscar</div>';
        }

        rdom.searchBtn.disabled = false;
        rdom.searchBtn.textContent = 'Buscar';
    }

    async function enqueueSong(youtubeId, el) {
        el.style.opacity = '0.5';
        el.style.pointerEvents = 'none';
        el.innerHTML += ' <span style="font-size:0.7rem;color:#fbbf24">Encolando...</span>';

        try {
            const data = await apiFetchRadio('radio_api.php?action=enqueue', {
                method: 'POST',
                body: JSON.stringify({ youtube_id: youtubeId })
            });

            if (data.ok) {
                rdom.searchInput.value = '';
                rdom.searchResults.style.display = 'none';
                rdom.searchResults.innerHTML = '';
                // Forzar sincronización inmediata
                syncRadioState();
                
                // Mostrar notificación
                const toastContainer = document.getElementById('toast-container');
                if (toastContainer) {
                    const t = document.createElement('div');
                    t.className = 'toast';
                    t.innerHTML = `Añadida a la cola`;
                    toastContainer.appendChild(t);
                    setTimeout(() => { t.classList.add('out'); setTimeout(()=>t.remove(),300); }, 3500);
                }
            }
        } catch (e) {
            alert(e.message);
            el.style.opacity = '1';
            el.style.pointerEvents = 'auto';
            el.innerHTML = el.innerHTML.replace(' <span style="font-size:0.7rem;color:#fbbf24">Encolando...</span>', '');
        }
    }


    // ── 4. CONTROLES DE REPRODUCCIÓN ──
    function playYoutube(songData = null) {
        if (!radioState.ytReady || !radioState.currentYoutubeId) return;
        
        radioState.isPlaying = true;
        
        // Cargar video si no está cargado
        const currentUrl = radioState.ytPlayer.getVideoUrl();
        if (!currentUrl || !currentUrl.includes(radioState.currentYoutubeId)) {
            radioState.ytPlayer.loadVideoById(radioState.currentYoutubeId);
        } else {
            radioState.ytPlayer.playVideo();
        }
        
        updatePlayUI();
        // Forzar sincronización inmediata
        setTimeout(syncRadioState, 500);
    }

    function togglePlay() {
        if (!radioState.currentYoutubeId) return;
        
        radioState.isPlaying = !radioState.isPlaying;
        
        if (radioState.isPlaying) {
            playYoutube();
        } else {
            if (radioState.ytReady) radioState.ytPlayer.pauseVideo();
            updatePlayUI();
        }
    }
    
    function updatePlayUI() {
        if (rdom.playIcon) {
            rdom.playIcon.innerHTML = `<img src="iconos/${radioState.isPlaying ? 'pausar.ico' : 'play.ico'}" alt="Play/Pausa">`;
        }
        const footer = document.querySelector('.radio-footer');
        if (footer) {
            if (radioState.isPlaying) footer.classList.add('playing');
            else footer.classList.remove('playing');
        }
    }

    // ── VARIOS ──
    function formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    function escapeHtml(t) { const d=document.createElement('div'); d.textContent=t; return d.innerHTML; }

    function setupRadioEvents() {
        rdom.btnPlay?.addEventListener('click', togglePlay);

        rdom.btnMute?.addEventListener('click', () => {
            radioState.isMuted = !radioState.isMuted;
            if (radioState.ytReady) {
                if (radioState.isMuted) {
                    radioState.ytPlayer.mute();
                } else {
                    radioState.ytPlayer.unMute();
                }
            }
            if (rdom.btnMute) {
                rdom.btnMute.innerHTML = `<img src="iconos/${radioState.isMuted ? 'muteado.png' : 'volumen.png'}" alt="Vol" id="radio-vol-img">`;
            }
        });

        // Control de volumen
        rdom.volumeBar?.addEventListener('click', (e) => {
            const rect = rdom.volumeBar.getBoundingClientRect();
            let pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            
            const vol = Math.round(pct * 100);
            radioState.volume = vol;
            if (radioState.ytReady) {
                radioState.ytPlayer.setVolume(vol);
                radioState.ytPlayer.unMute();
            }
            
            if (rdom.volumeFill) rdom.volumeFill.style.width = `${vol}%`;
            radioState.isMuted = false;
            if (rdom.btnMute) {
                rdom.btnMute.innerHTML = `<img src="iconos/${vol === 0 ? 'muteado.png' : 'volumen.png'}" alt="Vol" id="radio-vol-img">`;
            }
            localStorage.setItem('pulsechat_radio_vol', vol.toString());
        });

        // Alternar panel de radio
        rdom.toggleBtn?.addEventListener('click', () => {
            rdom.panel?.classList.toggle('expanded');
            rdom.toggleBtn.classList.toggle('active');
        });

        // Eventos de búsqueda
        rdom.searchBtn?.addEventListener('click', searchYoutube);
        rdom.searchInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchYoutube();
            }
        });
    }

    // Inicio
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRadio);
    } else {
        initRadio();
    }

})();
