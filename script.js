// MP3 Player Application (with Delete Feature)
class MP3Player {
    constructor() {
        // DOM elements
        this.audioPlayer = document.getElementById('audio-player');
        this.playPauseBtn = document.getElementById('play-pause-btn');
        this.prevBtn = document.getElementById('prev-btn');
        this.nextBtn = document.getElementById('next-btn');
        this.repeatBtn = document.getElementById('repeat-btn');
        this.shuffleBtn = document.getElementById('shuffle-btn');
        this.currentSongName = document.getElementById('current-song-name');
        this.playlist = document.getElementById('playlist');
        this.mp3Input = document.getElementById('mp3-input');
        this.savePlaylistBtn = document.getElementById('save-playlist-btn');
        this.loadPlaylistBtn = document.getElementById('load-playlist-btn');
        this.clearPlaylistBtn = document.getElementById('clear-playlist-btn');
        this.noticeToggle = document.getElementById('notice-toggle');
        this.noticeContent = document.getElementById('notice-content');

        // Player state
        this.songs = []; // Array to store song objects
        this.currentSongIndex = -1;
        this.isPlaying = false;
        this.repeatMode = 'off'; // 'off', 'one', 'all'
        this.shuffleMode = false;
        this.shuffleOrder = []; // Array for shuffle order
        this.originalOrder = []; // Array for original order

        // Initialize the player
        this.init();
    }

    init() {
        // Bind event listeners
        this.bindEvents();

        // Load saved playlist if exists
        this.loadSavedPlaylist();

        // Update UI
        this.updateUI();
    }

    bindEvents() {
        // File input change event
        this.mp3Input.addEventListener('change', (e) => this.handleFileSelect(e));

        // Control button events
        this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        this.prevBtn.addEventListener('click', () => this.previousSong());
        this.nextBtn.addEventListener('click', () => this.nextSong());
        this.repeatBtn.addEventListener('click', () => this.toggleRepeat());
        this.shuffleBtn.addEventListener('click', () => this.toggleShuffle());

        // Memory control events
        this.savePlaylistBtn.addEventListener('click', () => this.savePlaylist());
        this.loadPlaylistBtn.addEventListener('click', () => this.loadPlaylist());
        this.clearPlaylistBtn.addEventListener('click', () => this.clearSavedPlaylist());

        // Notice toggle event
        this.noticeToggle.addEventListener('click', () => this.toggleNotice());

        // Audio player events
        this.audioPlayer.addEventListener('ended', () => this.handleSongEnd());
        this.audioPlayer.addEventListener('loadstart', () => this.handleLoadStart());
        this.audioPlayer.addEventListener('canplay', () => this.handleCanPlay());
        this.audioPlayer.addEventListener('error', (e) => this.handleAudioError(e));
    }

    handleFileSelect(event) {
        const files = Array.from(event.target.files);

        // Limit to 30 files
        const selectedFiles = files.slice(0, 30);

        if (files.length > 30) {
            alert('一度に読み込めるのは最初の30ファイルまでです。');
        }

        // Filter only MP3 files
        const mp3Files = selectedFiles.filter(file =>
            file.type === 'audio/mpeg' || file.name.toLowerCase().endsWith('.mp3')
        );

        if (mp3Files.length === 0) {
            alert('No valid MP3 files selected.');
            return;
        }

        // Clear current playlist
        this.cleanup(); // 既存のblob URLがあれば解放
        this.songs = [];
        this.currentSongIndex = -1;
        this.isPlaying = false;

        // Load new songs
        mp3Files.forEach((file, index) => {
            const song = {
                id: index,
                name: this.extractSongName(file.name),
                file: file,
                url: URL.createObjectURL(file)
            };
            this.songs.push(song);
        });

        // Reset shuffle order
        this.originalOrder = this.songs.map((_, index) => index);
        this.generateShuffleOrder();

        // Update UI
        this.renderPlaylist();
        this.updateUI();
        this.updateMemoryButtonStates();

        // Clear file input
        this.mp3Input.value = '';
    }

    extractSongName(filename) {
        // Remove .mp3 extension and clean up the name
        return filename.replace(/\.mp3$/i, '').replace(/[_-]/g, ' ').trim();
    }

    // === 追加: 曲の削除メソッド ===
    deleteSong(index) {
        if (index < 0 || index >= this.songs.length) return;

        const wasPlaying = this.isPlaying;
        const deletingCurrent = index === this.currentSongIndex;

        // メモリリーク回避: Object URL解放
        try {
            if (this.songs[index]?.url?.startsWith?.('blob:')) {
                URL.revokeObjectURL(this.songs[index].url);
            }
        } catch (_) {}

        // 配列から削除
        this.songs.splice(index, 1);

        // インデックス補正
        if (this.currentSongIndex > index) {
            this.currentSongIndex--;
        } else if (deletingCurrent) {
            // 再生中を消した場合は一旦停止・表示クリア
            this.audioPlayer.pause();
            this.isPlaying = false;
            this.audioPlayer.removeAttribute('src');

            // 残曲があるなら近いインデックスに合わせる（自動再生はしない）
            this.currentSongIndex = Math.min(index, this.songs.length - 1);
            if (this.currentSongIndex < 0) {
                this.currentSongIndex = -1;
            }
        }

        // 並び配列を再構築
        this.originalOrder = this.songs.map((_, i) => i);
        if (this.shuffleMode) this.generateShuffleOrder();

        // UI更新
        this.renderPlaylist();
        this.updateUI();
        this.updateMemoryButtonStates();

        // もし「削除前が再生中」かつ「曲が残っていて」かつ「現在曲未選択(-1)」なら、
        // 次に進む動作にしたい場合は下記をアンコメント（好みで）
        /*
        if (wasPlaying && this.songs.length > 0 && this.currentSongIndex === -1) {
            this.playSong(0);
        }
        */
    }

    renderPlaylist() {
        if (this.songs.length === 0) {
            this.playlist.innerHTML = '<p class="empty-playlist">No songs loaded. Click "Load MP3 Files" to get started.</p>';
            return;
        }

        this.playlist.innerHTML = '';

        this.songs.forEach((song, index) => {
            const songItem = document.createElement('div');
            songItem.className = 'song-item';
            songItem.dataset.index = index;

            if (index === this.currentSongIndex) {
                songItem.classList.add('playing');
            }

            songItem.innerHTML = `
                <span class="song-name" title="${song.name}">${song.name}</span>
                <span class="song-status">${index === this.currentSongIndex ? (this.isPlaying ? 'Playing' : 'Paused') : ''}</span>
                <button class="delete-btn" title="Delete this track" aria-label="Delete track">
                    <i data-feather="x"></i>
                </button>
            `;

            // 行のクリック → 再生（ただし削除ボタンは除外）
            songItem.addEventListener('click', (e) => {
                if (e.target.closest('.delete-btn')) return;
                this.playSong(index);
            });

            // 削除ボタン
            const delBtn = songItem.querySelector('.delete-btn');
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteSong(index);
            });

            this.playlist.appendChild(songItem);
        });

        // 動的に追加したアイコンを更新
        if (window.feather && typeof window.feather.replace === 'function') {
            window.feather.replace();
        }
    }

    playSong(index) {
        if (index < 0 || index >= this.songs.length) {
            return;
        }

        const song = this.songs[index];
        this.currentSongIndex = index;

        // Load and play the song
        this.audioPlayer.src = song.url;
        this.audioPlayer.load();

        this.audioPlayer.play().then(() => {
            this.isPlaying = true;
            this.updateUI();
        }).catch(error => {
            console.error('Error playing audio:', error);
            this.handleAudioError(error);
        });
    }

    togglePlayPause() {
        if (this.currentSongIndex === -1 && this.songs.length > 0) {
            // No song selected, play the first song
            this.playSong(0);
            return;
        }

        if (this.currentSongIndex === -1) {
            // No songs loaded
            alert('Please load MP3 files first.');
            return;
        }

        if (this.isPlaying) {
            this.audioPlayer.pause();
            this.isPlaying = false;
        } else {
            this.audioPlayer.play().then(() => {
                this.isPlaying = true;
                this.updateUI();
            }).catch(error => {
                console.error('Error playing audio:', error);
                this.handleAudioError(error);
            });
        }

        this.updateUI();
    }

    previousSong() {
        if (this.songs.length === 0) return;

        let nextIndex;

        if (this.shuffleMode) {
            const currentShuffleIndex = this.shuffleOrder.indexOf(this.currentSongIndex);
            const prevShuffleIndex = currentShuffleIndex > 0 ? currentShuffleIndex - 1 : this.shuffleOrder.length - 1;
            nextIndex = this.shuffleOrder[prevShuffleIndex];
        } else {
            nextIndex = this.currentSongIndex > 0 ? this.currentSongIndex - 1 : this.songs.length - 1;
        }

        this.playSong(nextIndex);
    }

    nextSong() {
        if (this.songs.length === 0) return;

        let nextIndex;

        if (this.shuffleMode) {
            const currentShuffleIndex = this.shuffleOrder.indexOf(this.currentSongIndex);
            const nextShuffleIndex = currentShuffleIndex < this.shuffleOrder.length - 1 ? currentShuffleIndex + 1 : 0;
            nextIndex = this.shuffleOrder[nextShuffleIndex];
        } else {
            nextIndex = this.currentSongIndex < this.songs.length - 1 ? this.currentSongIndex + 1 : 0;
        }

        this.playSong(nextIndex);
    }

    toggleRepeat() {
        // Cycle through repeat modes: off -> one -> all -> off
        switch (this.repeatMode) {
            case 'off':
                this.repeatMode = 'one';
                break;
            case 'one':
                this.repeatMode = 'all';
                break;
            case 'all':
                this.repeatMode = 'off';
                break;
        }

        this.updateUI();
    }

    toggleShuffle() {
        this.shuffleMode = !this.shuffleMode;

        if (this.shuffleMode) {
            this.generateShuffleOrder();
        }

        this.updateUI();
    }

    generateShuffleOrder() {
        // Create a shuffled array of indices
        this.shuffleOrder = [...this.originalOrder];

        // Fisher-Yates shuffle algorithm
        for (let i = this.shuffleOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.shuffleOrder[i], this.shuffleOrder[j]] = [this.shuffleOrder[j], this.shuffleOrder[i]];
        }
    }

    handleSongEnd() {
        if (this.repeatMode === 'one') {
            // Repeat current song
            this.audioPlayer.currentTime = 0;
            this.audioPlayer.play();
        } else if (this.repeatMode === 'all' || this.currentSongIndex < this.songs.length - 1 || this.shuffleMode) {
            // Play next song
            this.nextSong();
        } else {
            // Stop playing
            this.isPlaying = false;
            this.updateUI();
        }
    }

    handleLoadStart() {
        // Song is loading
        this.updateCurrentSongDisplay('Loading...');
    }

    handleCanPlay() {
        // Song is ready to play
        this.updateUI();
    }

    handleAudioError(error) {
        console.error('Audio error:', error);
        alert('Error playing audio file. The file may be corrupted or unsupported.');
        this.isPlaying = false;
        this.updateUI();
    }

    updateUI() {
        // Update play/pause button
        const playIcon = this.playPauseBtn.querySelector('i');
        if (playIcon) {
            if (this.isPlaying) {
                playIcon.setAttribute('data-feather', 'pause');
            } else {
                playIcon.setAttribute('data-feather', 'play');
            }
        }

        // Update repeat button
        this.repeatBtn.className = 'control-btn';
        const repeatIndicator = this.repeatBtn.querySelector('.repeat-indicator');
        switch (this.repeatMode) {
            case 'off':
                repeatIndicator.textContent = 'OFF';
                this.repeatBtn.title = 'Repeat Off';
                break;
            case 'one':
                this.repeatBtn.classList.add('repeat-one');
                repeatIndicator.textContent = '1';
                this.repeatBtn.title = 'Repeat One';
                break;
            case 'all':
                this.repeatBtn.classList.add('repeat-all');
                repeatIndicator.textContent = 'ALL';
                this.repeatBtn.title = 'Repeat All';
                break;
        }

        // Update shuffle button
        this.shuffleBtn.className = 'control-btn';
        const shuffleIndicator = this.shuffleBtn.querySelector('.shuffle-indicator');
        if (this.shuffleMode) {
            this.shuffleBtn.classList.add('shuffle-active');
            shuffleIndicator.textContent = 'ON';
            this.shuffleBtn.title = 'Shuffle On';
        } else {
            shuffleIndicator.textContent = 'OFF';
            this.shuffleBtn.title = 'Shuffle Off';
        }

        // Update current song display
        this.updateCurrentSongDisplay();

        // Update playlist
        this.renderPlaylist();

        // Re-render feather icons
        if (window.feather && typeof window.feather.replace === 'function') {
            window.feather.replace();
        }
    }

    updateCurrentSongDisplay(customText = null) {
        if (customText) {
            this.currentSongName.textContent = customText;
        } else if (this.currentSongIndex >= 0 && this.songs[this.currentSongIndex]) {
            this.currentSongName.textContent = this.songs[this.currentSongIndex].name;
        } else {
            this.currentSongName.textContent = 'No song selected';
        }
    }

    toggleNotice() {
        const isExpanded = this.noticeContent.classList.contains('expanded');

        if (isExpanded) {
            this.noticeContent.classList.remove('expanded');
            this.noticeToggle.classList.remove('expanded');
        } else {
            this.noticeContent.classList.add('expanded');
            this.noticeToggle.classList.add('expanded');
        }

        // Re-render feather icons after DOM change
        if (window.feather && typeof window.feather.replace === 'function') {
            window.feather.replace();
        }
    }

    // Memory management methods
    savePlaylist() {
        if (this.songs.length === 0) {
            alert('プレイリストが空です。まずMP3ファイルを読み込んでください。');
            return;
        }

        try {
            // Save only essential song data (not the actual file objects)
            const playlistData = {
                songs: this.songs.map(song => ({
                    id: song.id,
                    name: song.name,
                    fileName: song.file.name,
                    fileSize: song.file.size,
                    fileType: song.file.type
                })),
                timestamp: new Date().toISOString()
            };

            localStorage.setItem('mp3player_saved_playlist', JSON.stringify(playlistData));
            alert('プレイリストを保存しました！');
            this.updateMemoryButtonStates();
        } catch (error) {
            console.error('Error saving playlist:', error);
            alert('プレイリストの保存に失敗しました。容量不足の可能性があります。');
        }
    }

    loadPlaylist() {
        try {
            const savedData = localStorage.getItem('mp3player_saved_playlist');
            if (!savedData) {
                alert('保存されたプレイリストがありません。');
                return;
            }

            const playlistData = JSON.parse(savedData);
            const savedDate = new Date(playlistData.timestamp).toLocaleDateString('ja-JP');

            const confirmLoad = confirm(
                `保存されたプレイリスト（${playlistData.songs.length}曲、${savedDate}保存）を読み込みますか？\n\n注意：ファイルの実体は保存されていないため、同じファイルを再度選択する必要があります。`
            );

            if (!confirmLoad) return;

            // Show file selection dialog with instructions
            alert('保存されたプレイリストの曲名が表示されるので、同じファイルを選択してください。');
            this.showSavedPlaylistInfo(playlistData);

        } catch (error) {
            console.error('Error loading playlist:', error);
            alert('プレイリストの読み込みに失敗しました。');
        }
    }

    showSavedPlaylistInfo(playlistData) {
        // Create a temporary display of saved songs
        const tempDiv = document.createElement('div');
        tempDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border: 2px solid #333;
            border-radius: 8px;
            padding: 20px;
            max-width: 500px;
            max-height: 400px;
            overflow-y: auto;
            z-index: 1000;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        `;

        tempDiv.innerHTML = `
            <h3 style="margin-top: 0;">保存されたプレイリスト</h3>
            <p style="margin-bottom: 15px; font-size: 14px; color: #666;">
                以下の曲と同じファイルを選択してください：
            </p>
            <div style="margin-bottom: 15px; max-height: 200px; overflow-y: auto;">
                ${playlistData.songs.map(song => `
                    <div style="padding: 5px; border-bottom: 1px solid #eee;">
                        <strong>${song.name}</strong><br>
                        <small style="color: #666;">ファイル名: ${song.fileName}</small>
                    </div>
                `).join('')}
            </div>
            <div style="text-align: center;">
                <button id="temp-load-files" style="padding: 8px 16px; margin-right: 10px; background: #000; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    ファイルを選択
                </button>
                <button id="temp-cancel" style="padding: 8px 16px; background: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">
                    キャンセル
                </button>
            </div>
        `;

        document.body.appendChild(tempDiv);

        // Add event listeners
        document.getElementById('temp-load-files').addEventListener('click', () => {
            this.mp3Input.click();
            document.body.removeChild(tempDiv);
        });

        document.getElementById('temp-cancel').addEventListener('click', () => {
            document.body.removeChild(tempDiv);
        });
    }

    clearSavedPlaylist() {
        try {
            const savedData = localStorage.getItem('mp3player_saved_playlist');
            if (!savedData) {
                alert('保存されたプレイリストがありません。');
                return;
            }

            const confirmClear = confirm('保存されたプレイリストを削除しますか？この操作は取り消せません。');
            if (!confirmClear) return;

            localStorage.removeItem('mp3player_saved_playlist');
            alert('保存されたプレイリストを削除しました。');
            this.updateMemoryButtonStates();
        } catch (error) {
            console.error('Error clearing saved playlist:', error);
            alert('プレイリストの削除に失敗しました。');
        }
    }

    loadSavedPlaylist() {
        // Check if there's a saved playlist on startup
        this.updateMemoryButtonStates();
    }

    updateMemoryButtonStates() {
        const hasSavedPlaylist = localStorage.getItem('mp3player_saved_playlist') !== null;
        const hasCurrentPlaylist = this.songs.length > 0;

        // Update button states
        this.savePlaylistBtn.disabled = !hasCurrentPlaylist;
        this.loadPlaylistBtn.disabled = !hasSavedPlaylist;
        this.clearPlaylistBtn.disabled = !hasSavedPlaylist;

        // Update button text to show status
        if (hasSavedPlaylist) {
            try {
                const savedData = JSON.parse(localStorage.getItem('mp3player_saved_playlist'));
                const savedDate = new Date(savedData.timestamp).toLocaleDateString('ja-JP');
                this.loadPlaylistBtn.title = `保存されたプレイリストを読み込む (${savedData.songs.length}曲、${savedDate}保存)`;
                this.clearPlaylistBtn.title = `保存されたプレイリストを削除 (${savedData.songs.length}曲、${savedDate}保存)`;
            } catch (error) {
                this.loadPlaylistBtn.title = '保存されたプレイリストを読み込む';
                this.clearPlaylistBtn.title = '保存されたプレイリストを削除';
            }
        } else {
            this.loadPlaylistBtn.title = '保存されたプレイリストがありません';
            this.clearPlaylistBtn.title = '保存されたプレイリストがありません';
        }
    }

    // Cleanup method to revoke object URLs when needed
    cleanup() {
        this.songs.forEach(song => {
            if (song.url && song.url.startsWith('blob:')) {
                try { URL.revokeObjectURL(song.url); } catch (_) {}
            }
        });
    }
}

// Initialize the MP3 Player when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const player = new MP3Player();

    // Cleanup URLs when the page is about to unload
    window.addEventListener('beforeunload', () => {
        player.cleanup();
    });
});


