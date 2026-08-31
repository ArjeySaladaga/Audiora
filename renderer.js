(() => {
  'use strict';

  // ---------- State ----------
  const STORAGE_KEY = 'audiora:state:v1';

  /** @type {{id:string, filePath:string, fileUrl:string, title:string, artist:string}[]} */
  let playlist = [];
  let filteredIndices = null; // null = no filter active
  let currentIndex = -1;
  let isPlaying = false;
  let isShuffle = false;
  let repeatMode = 'off'; // 'off' | 'all' | 'one'
  let shuffleOrder = [];
  let shufflePos = -1;
  let audioCtxStarted = false;

  // ---------- Elements ----------
  const audio = document.getElementById('audio');
  const playlistEl = document.getElementById('playlist');
  const emptyState = document.getElementById('emptyState');
  const trackCountEl = document.getElementById('trackCount');
  const searchInput = document.getElementById('searchInput');

  const trackTitleEl = document.getElementById('trackTitle');
  const trackArtistEl = document.getElementById('trackArtist');
  const albumArtEl = document.getElementById('albumArt');

  const seekBar = document.getElementById('seekBar');
  const currentTimeEl = document.getElementById('currentTime');
  const durationEl = document.getElementById('duration');

  const playBtn = document.getElementById('playBtn');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const rewindBtn = document.getElementById('rewindBtn');
  const shuffleBtn = document.getElementById('shuffleBtn');
  const repeatBtn = document.getElementById('repeatBtn');
  const repeatOneDot = document.getElementById('repeatOneDot');

  const volumeBar = document.getElementById('volumeBar');
  const openFilesBtn = document.getElementById('openFilesBtn');
  const openFolderBtn = document.getElementById('openFolderBtn');
  const clearBtn = document.getElementById('clearBtn');
  const canvas = document.getElementById('visualizer');
  const ctx = canvas.getContext('2d');

  // ---------- Persistence ----------
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        playlist,
        currentIndex,
        volume: audio.volume,
        isShuffle,
        repeatMode
      }));
    } catch (e) { /* ignore quota errors */ }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data.playlist)) playlist = data.playlist;
      if (typeof data.volume === 'number') audio.volume = data.volume;
      isShuffle = !!data.isShuffle;
      repeatMode = data.repeatMode || 'off';
      currentIndex = -1; // don't auto-load a track path validity is uncertain
    } catch (e) { /* ignore */ }
  }

  // ---------- Rendering ----------
  function renderPlaylist() {
    playlistEl.querySelectorAll('.track-item').forEach(n => n.remove());
    trackCountEl.textContent = `${playlist.length} track${playlist.length === 1 ? '' : 's'}`;

    const query = searchInput.value.trim().toLowerCase();
    const indices = [];

    playlist.forEach((track, i) => {
      if (query && !`${track.title} ${track.artist}`.toLowerCase().includes(query)) return;
      indices.push(i);
    });
    filteredIndices = query ? indices : null;

    emptyState.style.display = playlist.length === 0 ? 'flex' : 'none';

    const toRender = filteredIndices || playlist.map((_, i) => i);
    const frag = document.createDocumentFragment();

    toRender.forEach((i, pos) => {
      const track = playlist[i];
      const li = document.createElement('li');
      li.className = 'track-item' + (i === currentIndex ? ' active' : '');
      li.dataset.index = String(i);

      const leading = document.createElement('div');
      if (i === currentIndex && isPlaying) {
        leading.className = 'track-eq';
        leading.innerHTML = '<span></span><span></span><span></span>';
      } else {
        leading.className = 'track-index';
        leading.textContent = String(pos + 1);
      }

      const info = document.createElement('div');
      info.className = 'track-info';
      const titleEl = document.createElement('div');
      titleEl.className = 'track-title';
      titleEl.textContent = track.title;
      const artistEl = document.createElement('div');
      artistEl.className = 'track-artist';
      artistEl.textContent = track.artist;
      info.appendChild(titleEl);
      info.appendChild(artistEl);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'track-remove';
      removeBtn.title = 'Remove';
      removeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeTrack(i);
      });

      li.appendChild(leading);
      li.appendChild(info);
      li.appendChild(removeBtn);

      li.addEventListener('click', () => playTrack(i));
      frag.appendChild(li);
    });

    playlistEl.appendChild(frag);
  }

  function updateNowPlaying() {
    const track = playlist[currentIndex];
    if (!track) {
      trackTitleEl.textContent = 'No track selected';
      trackArtistEl.textContent = 'Add some music to begin';
      albumArtEl.classList.remove('playing');
      document.title = 'Audiora';
      return;
    }
    trackTitleEl.textContent = track.title;
    trackArtistEl.textContent = track.artist;
    document.title = `${track.title} — Audiora`;
  }

  function updatePlayButton() {
    playIcon.style.display = isPlaying ? 'none' : 'block';
    pauseIcon.style.display = isPlaying ? 'block' : 'none';
    albumArtEl.classList.toggle('playing', isPlaying);
  }

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function updateSliderFill(el) {
    const pct = ((el.value - el.min) / (el.max - el.min)) * 100;
    el.style.setProperty('--fill', `${pct}%`);
  }

  // ---------- Playback ----------
  function buildShuffleOrder() {
    shuffleOrder = playlist.map((_, i) => i);
    for (let i = shuffleOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffleOrder[i], shuffleOrder[j]] = [shuffleOrder[j], shuffleOrder[i]];
    }
    shufflePos = shuffleOrder.indexOf(currentIndex);
  }

  function playTrack(index) {
    if (index < 0 || index >= playlist.length) return;
    currentIndex = index;
    const track = playlist[index];
    audio.src = track.fileUrl;
    resetVisualizerState();
    audio.play().then(() => {
      isPlaying = true;
      updatePlayButton();
    }).catch(() => {
      isPlaying = false;
      updatePlayButton();
    });
    ensureAudioContext();
    updateNowPlaying();
    renderPlaylist();
    if (isShuffle) buildShuffleOrder();
    saveState();
  }

  function togglePlay() {
    if (currentIndex === -1) {
      if (playlist.length > 0) playTrack(0);
      return;
    }
    ensureAudioContext();
    if (isPlaying) {
      audio.pause();
      isPlaying = false;
    } else {
      audio.play();
      isPlaying = true;
    }
    updatePlayButton();
    renderPlaylist();
  }

  function nextTrack(auto = false) {
    if (playlist.length === 0) return;

    if (auto && repeatMode === 'one') {
      audio.currentTime = 0;
      audio.play();
      return;
    }

    if (isShuffle) {
      shufflePos++;
      if (shufflePos >= shuffleOrder.length) {
        if (repeatMode === 'all') {
          buildShuffleOrder();
          shufflePos = 0;
        } else {
          isPlaying = false;
          updatePlayButton();
          return;
        }
      }
      playTrack(shuffleOrder[shufflePos]);
      return;
    }

    let next = currentIndex + 1;
    if (next >= playlist.length) {
      if (repeatMode === 'all') next = 0;
      else { isPlaying = false; updatePlayButton(); return; }
    }
    playTrack(next);
  }

  function prevTrack() {
    if (playlist.length === 0) return;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    if (isShuffle) {
      shufflePos = Math.max(0, shufflePos - 1);
      playTrack(shuffleOrder[shufflePos]);
      return;
    }
    let prev = currentIndex - 1;
    if (prev < 0) prev = repeatMode === 'all' ? playlist.length - 1 : 0;
    playTrack(prev);
  }

  function rewind10() {
    if (currentIndex === -1) return;
    audio.currentTime = Math.max(0, audio.currentTime - 10);
  }

  function removeTrack(index) {
    playlist.splice(index, 1);
    if (index === currentIndex) {
      audio.pause();
      audio.removeAttribute('src');
      isPlaying = false;
      currentIndex = -1;
      updatePlayButton();
      updateNowPlaying();
    } else if (index < currentIndex) {
      currentIndex--;
    }
    renderPlaylist();
    saveState();
  }

  function addTracks(newTracks) {
    if (!newTracks || newTracks.length === 0) return;
    const existing = new Set(playlist.map(t => t.filePath));
    const additions = newTracks.filter(t => !existing.has(t.filePath));
    playlist = playlist.concat(additions);
    renderPlaylist();
    saveState();
  }

  // ---------- Visualizer ----------
  let audioCtx, analyser, sourceNode, freqData;
  let beatPulse = 0;
  let beatHold = 0;
  let lastBeatTime = 0;
  let lastEnergy = 0;
  let smoothedEnergy = 0;

  function ensureAudioContext() {
    if (audioCtxStarted) {
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {
          console.warn('AudioContext resume failed (may be expected)');
        });
      }
      return;
    }
    
    try {
      audioCtxStarted = true;
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      sourceNode = audioCtx.createMediaElementSource(audio);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      freqData = new Uint8Array(analyser.frequencyBinCount);
      sourceNode.connect(analyser);
      analyser.connect(audioCtx.destination);
    } catch (e) {
      console.error('Failed to initialize audio context:', e);
      audioCtxStarted = false;
    }
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const newWidth = Math.max(1, Math.round(rect.width * dpr));
    const newHeight = Math.max(1, Math.round(rect.height * dpr));

    if (canvas.width !== newWidth || canvas.height !== newHeight) {
      canvas.width = newWidth;
      canvas.height = newHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  function resetVisualizerState() {
    beatPulse = 0;
    beatHold = 0;
    lastBeatTime = 0;
    lastEnergy = 0;
    smoothedEnergy = 0;
  }

  function drawVisualizer() {
    requestAnimationFrame(drawVisualizer);

    if (!analyser || !isPlaying || !audio.src) {
      const w = canvas.clientWidth || canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.clientHeight || canvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, w, h);
      ctx.shadowBlur = 0;
      resetVisualizerState();
      return;
    }

    if (canvas.width === 0) {
      resizeCanvas();
    }

    analyser.getByteFrequencyData(freqData);
    const w = canvas.clientWidth || canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.clientHeight || canvas.height / (window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, w, h);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0)';
    ctx.fillRect(0, 0, w, h);

    const freqLength = freqData.length || 1;
    const bassCutoff = Math.max(2, Math.floor(freqLength * 0.08));
    let bassEnergy = 0;
    let midEnergy = 0;
    let totalEnergy = 0;

    for (let i = 0; i < freqLength; i++) {
      const value = freqData[i] / 255;
      totalEnergy += value;
      if (i < bassCutoff) bassEnergy += value;
      else if (i < freqLength * 0.33) midEnergy += value;
    }

    bassEnergy /= Math.max(1, bassCutoff);
    midEnergy /= Math.max(1, Math.floor(freqLength * 0.33) - bassCutoff);
    totalEnergy /= freqLength;

    const now = performance.now();
    const energyRise = bassEnergy - lastEnergy;
    if (isPlaying && bassEnergy > 0.35 && energyRise > 0.12 && now - lastBeatTime > 260) {
      beatPulse = 0.6;
      beatHold = 6;
      lastBeatTime = now;
    }

    beatPulse *= 0.78;
    beatHold = Math.max(0, beatHold - 1);
    smoothedEnergy = smoothedEnergy * 0.8 + (bassEnergy * 1.05 + midEnergy * 0.6 + totalEnergy * 0.2) * 0.2;
    lastEnergy = bassEnergy;

    const barCount = 22;
    const centerY = h / 2;
    const barWidth = 4;
    const gap = 3;
    const maxBarHeight = h * 0.48;
    const minBarHeight = 5;
    const beatBoost = 1 + beatPulse * (beatHold > 0 ? 0.65 : 0.12);
    const leftPad = (w - (barCount * barWidth + (barCount - 1) * gap)) / 2;

    for (let i = 0; i < barCount; i++) {
      const sampleIndex = Math.min(freqLength - 1, Math.max(0, Math.floor((i / barCount) * freqLength)));
      const value = freqData[sampleIndex] / 255;
      const distanceFromCenter = Math.abs(i - barCount / 2) / (barCount / 2);
      const bassBias = i < barCount * 0.3 ? 1.08 : 1;
      const waveform = Math.min(1, (value * 0.6 + smoothedEnergy * 0.32) * beatBoost * bassBias * (1.08 - distanceFromCenter * 0.2));
      const barHeight = Math.max(minBarHeight, waveform * maxBarHeight);
      const x = leftPad + i * (barWidth + gap);
      const y = centerY - barHeight / 2;

      const glow = 2 + waveform * 7;
      const alpha = 0.22 + waveform * 0.42;
      ctx.save();
      ctx.shadowColor = 'rgba(255,255,255,0.7)';
      ctx.shadowBlur = glow;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      roundRect(x, y, barWidth, barHeight, barWidth / 2 + 1);
      ctx.restore();
    }

    ctx.shadowBlur = 0;
  }

  function roundRect(x, y, w, h, r) {
    if (h < r) r = h;
    if (w < r) r = w;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }

  // ---------- Event wiring ----------
  audio.addEventListener('loadedmetadata', () => {
    seekBar.max = String(audio.duration || 0);
    durationEl.textContent = formatTime(audio.duration);
  });

  audio.addEventListener('timeupdate', () => {
    if (!seekBar.matches(':active')) {
      seekBar.value = String(audio.currentTime);
      updateSliderFill(seekBar);
    }
    currentTimeEl.textContent = formatTime(audio.currentTime);
  });

  audio.addEventListener('ended', () => nextTrack(true));
  
  audio.addEventListener('error', (e) => {
    console.error('Audio loading error:', {
      error: audio.error?.message || 'Unknown error',
      code: audio.error?.code,
      networkState: audio.networkState,
      readyState: audio.readyState
    });
    isPlaying = false;
    updatePlayButton();
  });
  
  audio.addEventListener('play', () => { isPlaying = true; resetVisualizerState(); updatePlayButton(); renderPlaylist(); });
  audio.addEventListener('pause', () => { isPlaying = false; resetVisualizerState(); updatePlayButton(); renderPlaylist(); });

  seekBar.addEventListener('input', () => {
    updateSliderFill(seekBar);
  });
  seekBar.addEventListener('change', () => {
    audio.currentTime = parseFloat(seekBar.value);
  });

  volumeBar.addEventListener('input', () => {
    audio.volume = volumeBar.value / 100;
    updateSliderFill(volumeBar);
    saveState();
  });

  playBtn.addEventListener('click', togglePlay);
  nextBtn.addEventListener('click', () => nextTrack(false));
  prevBtn.addEventListener('click', prevTrack);
  rewindBtn.addEventListener('click', rewind10);

  shuffleBtn.addEventListener('click', () => {
    isShuffle = !isShuffle;
    shuffleBtn.classList.toggle('active', isShuffle);
    if (isShuffle) buildShuffleOrder();
    saveState();
  });

  repeatBtn.addEventListener('click', () => {
    repeatMode = repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off';
    repeatBtn.classList.toggle('active', repeatMode !== 'off');
    repeatOneDot.style.display = repeatMode === 'one' ? 'block' : 'none';
    saveState();
  });

  openFilesBtn.addEventListener('click', async () => {
    const tracks = await window.audiora.selectFiles();
    addTracks(tracks);
  });

  openFolderBtn.addEventListener('click', async () => {
    const tracks = await window.audiora.selectFolder();
    addTracks(tracks);
  });

  clearBtn.addEventListener('click', () => {
    audio.pause();
    audio.removeAttribute('src');
    playlist = [];
    currentIndex = -1;
    isPlaying = false;
    updatePlayButton();
    updateNowPlaying();
    renderPlaylist();
    saveState();
  });

  searchInput.addEventListener('input', renderPlaylist);

  window.addEventListener('keydown', (e) => {
    if (document.activeElement === searchInput) {
      if (e.key === 'Escape') searchInput.blur();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.code === 'ArrowRight') {
      audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
    } else if (e.code === 'ArrowLeft') {
      audio.currentTime = Math.max(0, audio.currentTime - 5);
    } else if (e.code === 'ArrowUp') {
      e.preventDefault();
      volumeBar.value = String(Math.min(100, Number(volumeBar.value) + 5));
      audio.volume = volumeBar.value / 100;
      updateSliderFill(volumeBar);
    } else if (e.code === 'ArrowDown') {
      e.preventDefault();
      volumeBar.value = String(Math.max(0, Number(volumeBar.value) - 5));
      audio.volume = volumeBar.value / 100;
      updateSliderFill(volumeBar);
    }
  });

  // Handle window resize with canvas update
  window.addEventListener('resize', () => {
    resizeCanvas();
  });

  // Allow dropping files/folders straight onto the window
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || [])
      .filter(f => /\.(mp3|wav|ogg|m4a|flac|aac|opus)$/i.test(f.name))
      .map(f => {
        const filePath = f.path;
        const base = filePath.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
        const parts = base.split(' - ');
        const title = parts.length >= 2 ? parts.slice(1).join(' - ').trim() : base;
        const artist = parts.length >= 2 ? parts[0].trim() : 'Unknown Artist';
        return {
          id: filePath,
          filePath,
          fileUrl: 'file://' + encodeURI(filePath.replace(/\\/g, '/')),
          title,
          artist
        };
      });
    addTracks(files);
  });

  // ---------- Init ----------
  function init() {
    loadState();
    volumeBar.value = String(Math.round(audio.volume * 100 || 80));
    if (!audio.volume) audio.volume = 0.8;
    updateSliderFill(volumeBar);
    updateSliderFill(seekBar);
    shuffleBtn.classList.toggle('active', isShuffle);
    repeatBtn.classList.toggle('active', repeatMode !== 'off');
    repeatOneDot.style.display = repeatMode === 'one' ? 'block' : 'none';
    renderPlaylist();
    updateNowPlaying();
    resizeCanvas();
    requestAnimationFrame(drawVisualizer);
  }

  init();
})();
