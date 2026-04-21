'use strict';

class MusicPlayer {
    constructor() {
        this.audio = document.getElementById('audio');
        this.songs = [];
        this.currentIndex = -1;
        this.isPlaying = false;
        this.repeatMode = 'off'; // 'off' | 'one' | 'all'
        this.shuffleOn = false;
        this.shuffleOrder = [];
        this.isSeeking = false;
        this.isMuted = false;
        this.prevVolume = 80;

        this._bindAll();
        this._initVolume();
    }

    // ─── Bind DOM events ───────────────────────────────────────────────────────
    _bindAll() {
        // File input
        document.getElementById('mp3-input')
            .addEventListener('change', e => this._onFileSelect(e));

        // Transport controls
        document.getElementById('play-btn').addEventListener('click', () => this._togglePlay());
        document.getElementById('prev-btn').addEventListener('click', () => this._prevSong());
        document.getElementById('next-btn').addEventListener('click', () => this._nextSong());
        document.getElementById('shuffle-btn').addEventListener('click', () => this._toggleShuffle());
        document.getElementById('repeat-btn').addEventListener('click', () => this._toggleRepeat());

        // Progress bar
        const progressWrap = document.getElementById('progress-wrap');
        progressWrap.addEventListener('mousedown', e => this._startSeek(e));
        progressWrap.addEventListener('touchstart', e => this._startSeek(e), { passive: true });
        document.addEventListener('mousemove', e => this._doSeek(e));
        document.addEventListener('touchmove', e => this._doSeek(e), { passive: true });
        document.addEventListener('mouseup', () => this._endSeek());
        document.addEventListener('touchend', () => this._endSeek());

        // Volume
        document.getElementById('volume-slider')
            .addEventListener('input', e => this._setVolume(+e.target.value));
        document.getElementById('mute-btn')
            .addEventListener('click', () => this._toggleMute());

        // Audio events
        this.audio.addEventListener('timeupdate', () => this._onTimeUpdate());
        this.audio.addEventListener('ended', () => this._onEnded());
        this.audio.addEventListener('loadedmetadata', () => this._onMetadata());
        this.audio.addEventListener('error', () => this._onError());

        // Notice modal
        document.getElementById('notice-btn')
            .addEventListener('click', () => this._openModal());
        document.getElementById('modal-close')
            .addEventListener('click', () => this._closeModal());
        document.getElementById('modal-overlay')
            .addEventListener('click', e => { if (e.target === e.currentTarget) this._closeModal(); });

        // Keyboard shortcuts
        document.addEventListener('keydown', e => this._onKeyDown(e));

        // Cleanup on unload
        window.addEventListener('beforeunload', () => this._cleanup());
    }

    _initVolume() {
        const vol = 80;
        this.audio.volume = vol / 100;
        this._updateVolumeUI(vol);
    }

    // ─── File loading ──────────────────────────────────────────────────────────
    _onFileSelect(e) {
        const raw = Array.from(e.target.files);
        const files = raw
            .filter(f => f.type === 'audio/mpeg' || f.name.toLowerCase().endsWith('.mp3'))
            .slice(0, 50);

        if (files.length === 0) return;
        if (raw.length > 50) {
            this._toast('最初の50ファイルを読み込みました');
        }

        this._cleanup();
        this.songs = files.map((f, i) => ({
            id: i,
            name: f.name.replace(/\.mp3$/i, '').replace(/[_-]+/g, ' ').trim(),
            file: f,
            url: URL.createObjectURL(f),
            duration: null,
        }));
        this.currentIndex = -1;
        this.isPlaying = false;
        this.audio.removeAttribute('src');
        this._buildShuffleOrder();
        this._renderPlaylist();
        this._updatePlayerUI();
        e.target.value = '';
    }

    // ─── Playback ──────────────────────────────────────────────────────────────
    _playSong(index) {
        if (index < 0 || index >= this.songs.length) return;
        this.currentIndex = index;
        const song = this.songs[index];
        this.audio.src = song.url;
        this.audio.load();
        this.audio.play()
            .then(() => {
                this.isPlaying = true;
                this._updatePlayerUI();
                this._scrollToActive();
            })
            .catch(err => {
                console.error(err);
                this.isPlaying = false;
                this._updatePlayerUI();
            });
    }

    _togglePlay() {
        if (this.songs.length === 0) return;

        if (this.currentIndex === -1) {
            this._playSong(0);
            return;
        }

        if (this.isPlaying) {
            this.audio.pause();
            this.isPlaying = false;
        } else {
            this.audio.play().then(() => { this.isPlaying = true; this._updatePlayerUI(); });
        }
        this._updatePlayerUI();
    }

    _prevSong() {
        if (this.songs.length === 0) return;
        if (this.audio.currentTime > 3) {
            this.audio.currentTime = 0;
            return;
        }
        const next = this._getPrevIndex();
        this._playSong(next);
    }

    _nextSong() {
        if (this.songs.length === 0) return;
        const next = this._getNextIndex(false);
        if (next === -1) {
            this.isPlaying = false;
            this._updatePlayerUI();
            return;
        }
        this._playSong(next);
    }

    _getPrevIndex() {
        if (this.shuffleOn) {
            const pos = this.shuffleOrder.indexOf(this.currentIndex);
            const prev = pos <= 0 ? this.shuffleOrder.length - 1 : pos - 1;
            return this.shuffleOrder[prev];
        }
        return this.currentIndex > 0 ? this.currentIndex - 1 : this.songs.length - 1;
    }

    _getNextIndex(fromEnd = false) {
        if (this.shuffleOn) {
            const pos = this.shuffleOrder.indexOf(this.currentIndex);
            const next = pos < this.shuffleOrder.length - 1 ? pos + 1 : 0;
            return this.shuffleOrder[next];
        }
        const next = this.currentIndex + 1;
        if (next >= this.songs.length) {
            return (this.repeatMode === 'all' || fromEnd) ? 0 : -1;
        }
        return next;
    }

    _onEnded() {
        if (this.repeatMode === 'one') {
            this.audio.currentTime = 0;
            this.audio.play();
            return;
        }
        if (this.repeatMode === 'all' || this.shuffleOn || this.currentIndex < this.songs.length - 1) {
            const next = this._getNextIndex(true);
            if (next !== -1) { this._playSong(next); return; }
        }
        this.isPlaying = false;
        this._updatePlayerUI();
    }

    _onMetadata() {
        const dur = this.audio.duration;
        if (this.currentIndex >= 0 && isFinite(dur)) {
            this.songs[this.currentIndex].duration = dur;
            const el = document.querySelector(`.song-item[data-index="${this.currentIndex}"] .song-dur`);
            if (el) el.textContent = this._fmt(dur);
        }
        document.getElementById('time-total').textContent = isFinite(dur) ? this._fmt(dur) : '—:——';
    }

    _onError() {
        this.isPlaying = false;
        this._updatePlayerUI();
        this._toast('再生エラー: ファイルが読み込めませんでした');
    }

    // ─── Seeking ───────────────────────────────────────────────────────────────
    _startSeek(e) {
        if (!this.audio.duration) return;
        this.isSeeking = true;
        this._applySeek(e);
    }

    _doSeek(e) {
        if (!this.isSeeking) return;
        this._applySeek(e);
    }

    _endSeek() {
        this.isSeeking = false;
    }

    _applySeek(e) {
        const wrap = document.getElementById('progress-wrap');
        const rect = wrap.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const time = ratio * this.audio.duration;
        if (isFinite(time)) {
            this.audio.currentTime = time;
            this._setProgressUI(ratio * 100);
            document.getElementById('time-current').textContent = this._fmt(time);
        }
    }

    _onTimeUpdate() {
        if (this.isSeeking) return;
        const cur = this.audio.currentTime;
        const dur = this.audio.duration;
        if (!dur) return;
        this._setProgressUI((cur / dur) * 100);
        document.getElementById('time-current').textContent = this._fmt(cur);
    }

    _setProgressUI(pct) {
        document.getElementById('progress-fill').style.width = pct + '%';
    }

    // ─── Volume ────────────────────────────────────────────────────────────────
    _setVolume(val) {
        this.isMuted = val === 0;
        this.audio.volume = val / 100;
        if (val > 0) this.prevVolume = val;
        this._updateVolumeUI(val);
    }

    _toggleMute() {
        if (this.isMuted) {
            this._setVolume(this.prevVolume);
            document.getElementById('volume-slider').value = this.prevVolume;
        } else {
            this.prevVolume = +document.getElementById('volume-slider').value || 80;
            this._setVolume(0);
            document.getElementById('volume-slider').value = 0;
        }
    }

    _updateVolumeUI(val) {
        this.isMuted = val === 0;
        document.getElementById('vol-value').textContent = val;
        const full = document.querySelector('.icon-vol-full');
        const mute = document.querySelector('.icon-vol-mute');
        if (full && mute) {
            full.style.display = this.isMuted ? 'none' : '';
            mute.style.display = this.isMuted ? '' : 'none';
        }
        // Update slider gradient
        const slider = document.getElementById('volume-slider');
        slider.style.background = `linear-gradient(to right, var(--accent) 0%, var(--accent) ${val}%, var(--surface2) ${val}%, var(--surface2) 100%)`;
    }

    // ─── Shuffle & Repeat ──────────────────────────────────────────────────────
    _toggleShuffle() {
        this.shuffleOn = !this.shuffleOn;
        if (this.shuffleOn) this._buildShuffleOrder();
        const btn = document.getElementById('shuffle-btn');
        btn.classList.toggle('active', this.shuffleOn);
    }

    _buildShuffleOrder() {
        this.shuffleOrder = this.songs.map((_, i) => i);
        for (let i = this.shuffleOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.shuffleOrder[i], this.shuffleOrder[j]] = [this.shuffleOrder[j], this.shuffleOrder[i]];
        }
    }

    _toggleRepeat() {
        const modes = ['off', 'one', 'all'];
        const cur = modes.indexOf(this.repeatMode);
        this.repeatMode = modes[(cur + 1) % 3];

        const btn = document.getElementById('repeat-btn');
        btn.classList.toggle('active', this.repeatMode !== 'off');

        const iconRepeat = btn.querySelector('.icon-repeat');
        const iconRepeatOne = btn.querySelector('.icon-repeat-one');
        if (iconRepeat && iconRepeatOne) {
            iconRepeat.style.display = this.repeatMode !== 'one' ? '' : 'none';
            iconRepeatOne.style.display = this.repeatMode === 'one' ? '' : 'none';
        }

        const titles = { off: 'リピートOFF', one: 'リピート1曲', all: 'リピートALL' };
        btn.title = titles[this.repeatMode];
    }

    // ─── Delete ────────────────────────────────────────────────────────────────
    _deleteSong(index) {
        if (index < 0 || index >= this.songs.length) return;
        const isCurrentSong = index === this.currentIndex;

        const song = this.songs[index];
        if (song.url && song.url.startsWith('blob:')) {
            try { URL.revokeObjectURL(song.url); } catch (_) {}
        }

        this.songs.splice(index, 1);

        if (this.currentIndex > index) {
            this.currentIndex--;
        } else if (isCurrentSong) {
            this.audio.pause();
            this.audio.removeAttribute('src');
            this.isPlaying = false;
            this.currentIndex = Math.min(index, this.songs.length - 1);
            if (this.songs.length === 0) this.currentIndex = -1;
        }

        this._buildShuffleOrder();
        this._renderPlaylist();
        this._updatePlayerUI();
    }

    // ─── Render ────────────────────────────────────────────────────────────────
    _renderPlaylist() {
        const list = document.getElementById('playlist');
        const empty = document.getElementById('playlist-empty');
        const count = document.getElementById('track-count');

        count.textContent = `${this.songs.length}曲`;

        if (this.songs.length === 0) {
            list.innerHTML = '';
            list.style.display = 'none';
            empty.style.display = 'flex';
            return;
        }

        list.style.display = '';
        empty.style.display = 'none';
        list.innerHTML = '';

        this.songs.forEach((song, i) => {
            const isActive = i === this.currentIndex;
            const isPaused = isActive && !this.isPlaying;
            const div = document.createElement('div');
            div.className = `song-item${isActive ? ' playing' : ''}${isPaused ? ' paused' : ''}`;
            div.dataset.index = i;
            div.innerHTML = `
                <div class="song-num">${i + 1}</div>
                <div class="playing-anim" aria-hidden="true">
                    <span></span><span></span><span></span>
                </div>
                <div class="song-thumb">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                </div>
                <div class="song-info-col">
                    <span class="song-name" title="${this._esc(song.name)}">${this._esc(song.name)}</span>
                    <span class="song-dur">${song.duration ? this._fmt(song.duration) : '—:——'}</span>
                </div>
                <button class="song-del" title="削除" aria-label="削除">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            `;

            div.addEventListener('click', e => {
                if (e.target.closest('.song-del')) return;
                this._playSong(i);
            });

            div.querySelector('.song-del').addEventListener('click', e => {
                e.stopPropagation();
                this._deleteSong(i);
            });

            list.appendChild(div);
        });
    }

    _updatePlayerUI() {
        const song = this.currentIndex >= 0 ? this.songs[this.currentIndex] : null;

        // Song title & meta
        document.getElementById('song-title').textContent = song ? song.name : '曲を選択してください';
        document.getElementById('song-meta').textContent = song ? `Track ${this.currentIndex + 1} of ${this.songs.length}` : '— —';

        // Play/pause icons
        document.querySelector('.icon-play').style.display = this.isPlaying ? 'none' : '';
        document.querySelector('.icon-pause').style.display = this.isPlaying ? '' : 'none';

        // Disc spin
        const disc = document.getElementById('disc');
        const albumArt = document.getElementById('album-art');
        const visualizer = document.getElementById('visualizer');
        disc.classList.toggle('spinning', this.isPlaying);
        albumArt.classList.toggle('spinning', this.isPlaying);
        visualizer.classList.toggle('active', this.isPlaying);

        // Progress reset if no song
        if (!song) {
            this._setProgressUI(0);
            document.getElementById('time-current').textContent = '0:00';
            document.getElementById('time-total').textContent = '0:00';
        }

        // Re-render playlist items (only class updates, no full rebuild to avoid flicker)
        const items = document.querySelectorAll('.song-item');
        items.forEach(item => {
            const idx = +item.dataset.index;
            const active = idx === this.currentIndex;
            const paused = active && !this.isPlaying;
            item.classList.toggle('playing', active);
            item.classList.toggle('paused', paused);
        });
    }

    _scrollToActive() {
        const el = document.querySelector('.song-item.playing');
        if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    // ─── Modal ─────────────────────────────────────────────────────────────────
    _openModal() {
        document.getElementById('modal-overlay').classList.add('open');
    }

    _closeModal() {
        document.getElementById('modal-overlay').classList.remove('open');
    }

    // ─── Keyboard ──────────────────────────────────────────────────────────────
    _onKeyDown(e) {
        if (e.target.tagName === 'INPUT') return;
        switch (e.code) {
            case 'Space':
                e.preventDefault();
                this._togglePlay();
                break;
            case 'ArrowRight':
                if (e.shiftKey) { this._nextSong(); } else { this.audio.currentTime += 5; }
                break;
            case 'ArrowLeft':
                if (e.shiftKey) { this._prevSong(); } else { this.audio.currentTime -= 5; }
                break;
            case 'ArrowUp': {
                const s = document.getElementById('volume-slider');
                const v = Math.min(100, +s.value + 5);
                s.value = v;
                this._setVolume(v);
                break;
            }
            case 'ArrowDown': {
                const s = document.getElementById('volume-slider');
                const v = Math.max(0, +s.value - 5);
                s.value = v;
                this._setVolume(v);
                break;
            }
            case 'KeyM':
                this._toggleMute();
                break;
        }
    }

    // ─── Toast ─────────────────────────────────────────────────────────────────
    _toast(msg) {
        let el = document.getElementById('toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'toast';
            el.style.cssText = `
                position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(16px);
                background:#1a1a24;border:1px solid rgba(255,255,255,0.1);color:#f0eeff;
                padding:10px 20px;border-radius:40px;font-size:0.82rem;
                opacity:0;transition:opacity 0.3s,transform 0.3s;z-index:200;white-space:nowrap;
            `;
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.style.opacity = '1';
        el.style.transform = 'translateX(-50%) translateY(0)';
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateX(-50%) translateY(8px)';
        }, 2500);
    }

    // ─── Helpers ───────────────────────────────────────────────────────────────
    _fmt(sec) {
        if (!isFinite(sec)) return '—:——';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    _esc(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    _cleanup() {
        this.songs.forEach(s => {
            if (s.url && s.url.startsWith('blob:')) {
                try { URL.revokeObjectURL(s.url); } catch (_) {}
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => { new MusicPlayer(); });
