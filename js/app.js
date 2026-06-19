// ===== MusicFlow App =====
// PWA Music Player using Jamendo API (free, legal music)

(function() {
  'use strict';

  // ===== STATE =====
  const state = {
    currentTrack: null,
    queue: [],
    queueIndex: -1,
    isPlaying: false,
    shuffle: false,
    repeat: 0, // 0=off, 1=all, 1=one
    volume: 0.8,
    liked: JSON.parse(localStorage.getItem('mf_liked') || '[]'),
    playlists: JSON.parse(localStorage.getItem('mf_playlists') || '[]'),
    recent: JSON.parse(localStorage.getItem('mf_recent') || '[]'),
    searchQuery: '',
    contextTrack: null
  };

  // Jamendo API (free, no auth needed for basic use)
  const JAMENDO_API = 'https://api.jamendo.com/v3.0';
  const CLIENT_ID = '2c9a11b9'; // public demo client

  // ===== DOM REFS =====
  const $ = id => document.getElementById(id);
  const audio = $('audio');
  const miniPlayer = $('mini-player');
  const fullPlayer = $('full-player');

  // ===== HELPERS =====
  function formatTime(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function showToast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('visible');
    clearTimeout(t._timeout);
    t._timeout = setTimeout(() => t.classList.remove('visible'), 2000);
  }

  function saveState() {
    localStorage.setItem('mf_liked', JSON.stringify(state.liked));
    localStorage.setItem('mf_playlists', JSON.stringify(state.playlists));
    localStorage.setItem('mf_recent', JSON.stringify(state.recent));
  }

  function trackId(t) {
    return t.id || t.audio || t.name;
  }

  function isTrackLiked(track) {
    return state.liked.some(l => trackId(l) === trackId(track));
  }

  // ===== NAVIGATION =====
  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $('screen-' + name).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => {
      n.classList.toggle('active', n.dataset.screen === name);
    });
    if (name === 'library') renderLibrary();
    if (name === 'playlists') renderPlaylists();
  }

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.screen));
  });

  // ===== API =====
  async function jamendoFetch(endpoint, params = {}) {
    const url = new URL(`${JAMENDO_API}${endpoint}`);
    url.searchParams.set('client_id', CLIENT_ID);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '20');
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url);
    return res.json();
  }

  async function loadPopular() {
    try {
      const data = await jamendoFetch('/tracks/', {
        order: 'popularity_total_desc',
        audioformat: 'mp32'
      });
      if (data.results && data.results.length) {
        renderTrackCards('popular-tracks', data.results.slice(0, 10));
      }
    } catch (e) {
      console.error('Popular load error:', e);
      $('popular-tracks').innerHTML = '<div class="empty-state"><p>Ошибка загрузки</p></div>';
    }
  }

  async function loadNewReleases() {
    try {
      const data = await jamendoFetch('/tracks/', {
        order: 'date_desc',
        audioformat: 'mp32'
      });
      if (data.results && data.results.length) {
        renderTrackList('new-tracks', data.results.slice(0, 15));
      }
    } catch (e) {
      console.error('New releases error:', e);
      $('new-tracks').innerHTML = '<div class="empty-state"><p>Ошибка загрузки</p></div>';
    }
  }

  async function searchTracks(query) {
    if (!query.trim()) return [];
    try {
      const data = await jamendoFetch('/tracks/', {
        search: query,
        order: 'popularity_total_desc',
        audioformat: 'mp32'
      });
      return data.results || [];
    } catch (e) {
      console.error('Search error:', e);
      return [];
    }
  }

  async function loadGenreTracks(genre) {
    try {
      const data = await jamendoFetch('/tracks/', {
        tags: genre,
        order: 'popularity_total_desc',
        audioformat: 'mp32',
        limit: '30'
      });
      return data.results || [];
    } catch (e) {
      console.error('Genre error:', e);
      return [];
    }
  }

  // ===== RENDERING =====
  function renderTrackCards(containerId, tracks) {
    const container = $(containerId);
    if (!tracks.length) {
      container.innerHTML = '<div class="empty-state"><p>Ничего не найдено</p></div>';
      return;
    }
    container.innerHTML = tracks.map(t => `
      <div class="album-card" data-track-id="${t.id}">
        <div class="album-cover">
          ${t.image ? `<img src="${t.image}" alt="${t.name}" loading="lazy">` : `<div class="placeholder-cover"><svg viewBox="0 0 24 24" fill="white"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>`}
        </div>
        <div class="album-info">
          <div class="title">${escapeHtml(t.name)}</div>
          <div class="artist">${escapeHtml(t.artist_name)}</div>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.album-card').forEach(card => {
      card.addEventListener('click', () => {
        const track = tracks.find(t => t.id == card.dataset.trackId);
        if (track) playTrack(track, tracks);
      });
    });
  }

  function renderTrackList(containerId, tracks, options = {}) {
    const container = $(containerId);
    if (!tracks.length) {
      container.innerHTML = '<div class="empty-state"><p>Ничего не найдено</p></div>';
      return;
    }
    container.innerHTML = tracks.map((t, i) => {
      const isLiked = isTrackLiked(t);
      const isCurrent = state.currentTrack && trackId(state.currentTrack) === trackId(t);
      return `
        <div class="track-item ${isCurrent ? 'playing' : ''}" data-idx="${i}" data-track-id="${t.id}">
          <div class="track-thumb">
            ${t.image ? `<img src="${t.image}" alt="" loading="lazy">` : ''}
          </div>
          <div class="track-details">
            <div class="track-name">${escapeHtml(t.name)}</div>
            <div class="track-artist">${escapeHtml(t.artist_name)}</div>
          </div>
          <span class="track-duration">${t.duration ? formatTime(t.duration) : ''}</span>
          <div class="track-actions">
            <button class="track-action-btn like-btn" data-track-id="${t.id}" title="Нравится">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="${isLiked ? 'var(--accent-light)' : 'none'}" stroke="${isLiked ? 'var(--accent-light)' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </button>
            <button class="track-action-btn more-btn" data-track-id="${t.id}" title="Ещё">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Track click = play
    container.querySelectorAll('.track-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.track-action-btn')) return;
        const idx = parseInt(item.dataset.idx);
        playTrack(tracks[idx], tracks, idx);
      });
    });

    // Like buttons
    container.querySelectorAll('.like-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const track = tracks.find(t => t.id == btn.dataset.trackId);
        if (track) toggleLike(track);
      });
    });

    // More buttons
    container.querySelectorAll('.more-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const track = tracks.find(t => t.id == btn.dataset.trackId);
        if (track) showContextMenu(track, e);
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ===== PLAYER =====
  function playTrack(track, queue = [track], index = 0) {
    state.currentTrack = track;
    state.queue = queue;
    state.queueIndex = index;

    // Add to recent
    state.recent = [track, ...state.recent.filter(t => trackId(t) !== trackId(track))].slice(0, 50);
    saveState();

    // Set audio
    audio.src = track.audio;
    audio.volume = state.volume;
    audio.play().then(() => {
      state.isPlaying = true;
      updatePlayerUI();
    }).catch(e => {
      console.error('Play error:', e);
      showToast('Ошибка воспроизведения');
    });

    // Show mini player
    miniPlayer.classList.add('visible');
    updateAllTrackLists();
  }

  function togglePlay() {
    if (!state.currentTrack) return;
    if (audio.paused) {
      audio.play();
      state.isPlaying = true;
    } else {
      audio.pause();
      state.isPlaying = false;
    }
    updatePlayerUI();
  }

  function playNext() {
    if (!state.queue.length) return;
    let nextIdx;
    if (state.shuffle) {
      nextIdx = Math.floor(Math.random() * state.queue.length);
    } else if (state.repeat === 2) {
      nextIdx = state.queueIndex;
    } else {
      nextIdx = state.queueIndex + 1;
      if (nextIdx >= state.queue.length) {
        if (state.repeat === 1) nextIdx = 0;
        else return;
      }
    }
    playTrack(state.queue[nextIdx], state.queue, nextIdx);
  }

  function playPrev() {
    if (!state.queue.length) return;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    let prevIdx = state.queueIndex - 1;
    if (prevIdx < 0) prevIdx = state.repeat === 1 ? state.queue.length - 1 : 0;
    playTrack(state.queue[prevIdx], state.queue, prevIdx);
  }

  function updatePlayerUI() {
    const t = state.currentTrack;
    if (!t) return;

    // Mini player
    $('mini-title').textContent = t.name || '—';
    $('mini-artist').textContent = t.artist_name || '—';
    if (t.image) {
      $('mini-img').src = t.image;
      $('mini-img').style.display = '';
    } else {
      $('mini-img').style.display = 'none';
    }

    // Full player
    $('player-title').textContent = t.name || '—';
    $('player-artist').textContent = t.artist_name || '—';
    if (t.image) {
      $('player-img').src = t.image;
      $('player-img').style.display = '';
      $('player-bg').style.backgroundImage = `url(${t.image})`;
    } else {
      $('player-img').style.display = 'none';
      $('player-bg').style.backgroundImage = '';
    }

    // Play/pause icons
    const playIconPath = state.isPlaying
      ? 'M6 4h4v16H6zM14 4h4v16h-4z'
      : 'M8 5v14l11-7z';
    $('play-icon').innerHTML = `<path d="${playIconPath}"/>`;
    $('mini-play-icon').innerHTML = `<path d="${playIconPath}"/>`;

    updateAllTrackLists();
  }

  function updateAllTrackLists() {
    document.querySelectorAll('.track-item').forEach(item => {
      const trackId_val = item.dataset.trackId;
      const isCurrent = state.currentTrack && state.currentTrack.id == trackId_val;
      item.classList.toggle('playing', !!isCurrent);
    });
  }

  // ===== AUDIO EVENTS =====
  audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    $('progress-fill').style.width = pct + '%';
    $('mini-progress-bar').style.width = pct + '%';
    $('current-time').textContent = formatTime(audio.currentTime);
    $('total-time').textContent = formatTime(audio.duration);
  });

  audio.addEventListener('ended', () => {
    playNext();
  });

  audio.addEventListener('error', () => {
    showToast('Ошибка загрузки трека');
  });

  // Progress bar seek
  $('progress-container').addEventListener('click', (e) => {
    if (!audio.duration) return;
    const rect = $('progress-container').getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * audio.duration;
  });

  // Volume
  $('volume-slider').addEventListener('input', (e) => {
    state.volume = e.target.value / 100;
    audio.volume = state.volume;
  });

  // Player controls
  $('play-btn').addEventListener('click', togglePlay);
  $('mini-play').addEventListener('click', (e) => { e.stopPropagation(); togglePlay(); });
  $('next-btn').addEventListener('click', playNext);
  $('mini-next').addEventListener('click', (e) => { e.stopPropagation(); playNext(); });
  $('prev-btn').addEventListener('click', playPrev);
  $('mini-prev').addEventListener('click', (e) => { e.stopPropagation(); playPrev(); });

  // Shuffle
  $('shuffle-btn').addEventListener('click', () => {
    state.shuffle = !state.shuffle;
    $('shuffle-btn').style.color = state.shuffle ? 'var(--accent-light)' : '';
    showToast(state.shuffle ? 'Случайный порядок включён' : 'Случайный порядок выключен');
  });

  // Repeat
  $('repeat-btn').addEventListener('click', () => {
    state.repeat = (state.repeat + 1) % 3;
    const colors = ['', 'var(--accent-light)', 'var(--accent-light)'];
    $('repeat-btn').style.color = colors[state.repeat];
    const msgs = ['Повтор выключен', 'Повтор всего списка', 'Повтор одного трека'];
    showToast(msgs[state.repeat]);
  });

  // Mini player opens full player
  miniPlayer.addEventListener('click', (e) => {
    if (e.target.closest('.mini-controls') || e.target.closest('.mini-btn')) return;
    openFullPlayer();
  });

  function openFullPlayer() {
    fullPlayer.classList.add('active');
  }

  $('player-close').addEventListener('click', () => {
    fullPlayer.classList.remove('active');
  });

  // ===== SEARCH =====
  let searchTimeout;
  function setupSearch(inputId, resultsContainer, emptyContainer) {
    const input = $(inputId);
    input.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      const q = input.value.trim();
      if (!q) {
        $(resultsContainer).style.display = 'none';
        if (emptyContainer) $(emptyContainer).style.display = '';
        return;
      }
      searchTimeout = setTimeout(async () => {
        const tracks = await searchTracks(q);
        if (tracks.length) {
          renderTrackList(resultsContainer, tracks);
          $(resultsContainer).style.display = '';
          if (emptyContainer) $(emptyContainer).style.display = 'none';
        } else {
          $(resultsContainer).innerHTML = '<div class="empty-state"><p>Ничего не найдено</p></div>';
          $(resultsContainer).style.display = '';
          if (emptyContainer) $(emptyContainer).style.display = 'none';
        }
      }, 400);
    });
  }

  setupSearch('search-input', 'search-results', 'search-results-section');
  setupSearch('search-input-2', 'search-screen-list', 'search-empty');

  // Home search shows results section
  $('search-input').addEventListener('input', () => {
    const q = $('search-input').value.trim();
    $('search-results-section').style.display = q ? '' : 'none';
  });

  // ===== GENRES =====
  document.querySelectorAll('#genres-list .album-card').forEach(card => {
    card.addEventListener('click', async () => {
      const genre = card.dataset.genre;
      showScreen('search');
      $('search-input-2').value = genre;
      const tracks = await loadGenreTracks(genre);
      renderTrackList('search-screen-list', tracks);
      $('search-screen-list').style.display = '';
      $('search-empty').style.display = 'none';
    });
  });

  // ===== LIKES =====
  function toggleLike(track) {
    const idx = state.liked.findIndex(l => trackId(l) === trackId(track));
    if (idx >= 0) {
      state.liked.splice(idx, 1);
      showToast('Удалено из понравившихся');
    } else {
      state.liked.push(track);
      showToast('Добавлено в понравившиеся ❤️');
    }
    saveState();
    updateAllTrackLists();
    renderLibrary();
  }

  // ===== CONTEXT MENU =====
  function showContextMenu(track, event) {
    state.contextTrack = track;
    const menu = $('context-menu');
    const isLiked = isTrackLiked(track);
    $('ctx-like-text').textContent = isLiked ? 'Убрать из понравившихся' : 'Нравится';

    // Position
    const x = Math.min(event.clientX, window.innerWidth - 220);
    const y = Math.min(event.clientY, window.innerHeight - 200);
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.classList.add('active');
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#context-menu')) {
      $('context-menu').classList.remove('active');
    }
  });

  $('ctx-like').addEventListener('click', () => {
    if (state.contextTrack) toggleLike(state.contextTrack);
    $('context-menu').classList.remove('active');
  });

  $('ctx-add-to-playlist').addEventListener('click', () => {
    $('context-menu').classList.remove('active');
    if (state.contextTrack) showAddToPlaylistModal(state.contextTrack);
  });

  $('ctx-play-next').addEventListener('click', () => {
    $('context-menu').classList.remove('active');
    if (state.contextTrack) {
      // Insert after current
      const idx = state.queueIndex + 1;
      state.queue.splice(idx, 0, state.contextTrack);
      showToast('Добавлено в очередь');
    }
  });

  // ===== PLAYLISTS =====
  function renderPlaylists() {
    const container = $('playlists-list');
    if (!state.playlists.length) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          <h3>Нет плейлистов</h3>
          <p>Создай свой первый плейлист</p>
        </div>`;
      return;
    }
    container.innerHTML = state.playlists.map((pl, i) => `
      <div class="track-item" data-playlist-idx="${i}">
        <div class="track-thumb" style="background:linear-gradient(135deg,#6c5ce7,#a29bfe);display:flex;align-items:center;justify-content:center;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white" opacity="0.7"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        </div>
        <div class="track-details">
          <div class="track-name">${escapeHtml(pl.name)}</div>
          <div class="track-artist">${pl.tracks.length} треков</div>
        </div>
        <button class="track-action-btn delete-playlist-btn" data-idx="${i}" title="Удалить">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    `).join('');

    container.querySelectorAll('.track-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.delete-playlist-btn')) return;
        const idx = parseInt(item.dataset.playlistIdx);
        openPlaylist(idx);
      });
    });

    container.querySelectorAll('.delete-playlist-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        if (confirm('Удалить плейлист "' + state.playlists[idx].name + '"?')) {
          state.playlists.splice(idx, 1);
          saveState();
          renderPlaylists();
          showToast('Плейлист удалён');
        }
      });
    });
  }

  function openPlaylist(idx) {
    const pl = state.playlists[idx];
    if (!pl || !pl.tracks.length) {
      showToast('Плейлист пуст');
      return;
    }
    showScreen('search');
    $('search-input-2').value = pl.name;
    renderTrackList('search-screen-list', pl.tracks);
    $('search-screen-list').style.display = '';
    $('search-empty').style.display = 'none';
  }

  // Create playlist modal
  $('create-playlist-btn').addEventListener('click', () => {
    $('playlist-modal').classList.add('active');
    $('playlist-name-input').value = '';
    setTimeout(() => $('playlist-name-input').focus(), 100);
  });

  $('playlist-cancel').addEventListener('click', () => {
    $('playlist-modal').classList.remove('active');
  });

  $('playlist-confirm').addEventListener('click', () => {
    const name = $('playlist-name-input').value.trim();
    if (!name) return;
    state.playlists.push({ name, tracks: [], created: Date.now() });
    saveState();
    $('playlist-modal').classList.remove('active');
    renderPlaylists();
    showToast('Плейлист "' + name + '" создан');
  });

  // Add to playlist modal
  function showAddToPlaylistModal(track) {
    if (!state.playlists.length) {
      showToast('Сначала создай плейлист');
      return;
    }
    const container = $('add-to-playlist-list');
    container.innerHTML = state.playlists.map((pl, i) => `
      <div class="context-item" data-idx="${i}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        <span>${escapeHtml(pl.name)}</span>
      </div>
    `).join('');

    container.querySelectorAll('.context-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.idx);
        const pl = state.playlists[idx];
        if (!pl.tracks.some(t => trackId(t) === trackId(track))) {
          pl.tracks.push(track);
          saveState();
          showToast('Добавлено в "' + pl.name + '"');
        } else {
          showToast('Трек уже в плейлисте');
        }
        $('add-to-playlist-modal').classList.remove('active');
      });
    });

    $('add-to-playlist-modal').classList.add('active');
  }

  $('add-to-cancel').addEventListener('click', () => {
    $('add-to-playlist-modal').classList.remove('active');
  });

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('active');
    });
  });

  // ===== LIBRARY =====
  function renderLibrary() {
    $('lib-liked-count').textContent = state.liked.length;
    $('lib-playlist-count').textContent = state.playlists.length;

    // Liked tracks
    const likedContainer = $('liked-tracks');
    if (state.liked.length) {
      renderTrackList('liked-tracks', state.liked);
    } else {
      likedContainer.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <h3>Пока пусто</h3>
          <p>Нажми ❤️ на треке, чтобы добавить сюда</p>
        </div>`;
    }

    // Recent tracks
    const recentContainer = $('recent-tracks');
    if (state.recent.length) {
      renderTrackList('recent-tracks', state.recent.slice(0, 20));
    } else {
      recentContainer.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <h3>Пока пусто</h3>
          <p>Здесь появятся треки, которые ты слушал</p>
        </div>`;
    }
  }

  // ===== QUEUE =====
  $('queue-btn').addEventListener('click', () => {
    const container = $('queue-list');
    if (!state.queue.length) {
      container.innerHTML = '<div class="empty-state"><p>Очередь пуста</p></div>';
    } else {
      container.innerHTML = state.queue.map((t, i) => `
        <div class="queue-item ${i === state.queueIndex ? 'current' : ''}" data-q-idx="${i}">
          <span class="queue-num">${i === state.queueIndex ? '▶' : i + 1}</span>
          <span class="queue-name">${escapeHtml(t.name)}</span>
          <span class="queue-artist">${escapeHtml(t.artist_name)}</span>
        </div>
      `).join('');

      container.querySelectorAll('.queue-item').forEach(item => {
        item.addEventListener('click', () => {
          const idx = parseInt(item.dataset.qIdx);
          playTrack(state.queue[idx], state.queue, idx);
        });
      });
    }
    $('queue-modal').classList.add('active');
  });

  // Close queue on overlay
  $('queue-modal').addEventListener('click', (e) => {
    if (e.target === $('queue-modal')) $('queue-modal').classList.remove('active');
  });

  // ===== PWA INSTALL =====
  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Could show install button here
  });

  // ===== SERVICE WORKER =====
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // ===== INIT =====
  function init() {
    audio.volume = state.volume;
    loadPopular();
    loadNewReleases();
    showScreen('home');
  }

  init();

})();
