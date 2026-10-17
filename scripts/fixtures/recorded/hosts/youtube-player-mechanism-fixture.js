// MECHANISM FIXTURE — hand-written, not recorded. A recorded YouTube page is a
// frozen DOM without YouTube's scripts, so this puts back only what the player
// observably does and the product depends on:
//   - plays a video (a blank clip of the recorded track's length) in the
//     page's own <video>, so requestVideoFrameCallback fires as on the site;
//   - exposes the movie_player methods the product calls;
//   - draws YouTube's own captions into .ytp-caption-window-container from the
//     recorded json3 events (every event active at the current time, words
//     rolling in at their tOffsetMs, as YouTube shows auto-generated tracks),
//     which is the surface a caption-ownership gate watches;
//   - updates the progress bar and time text at 4 Hz, the host churn every
//     playback CPU measurement has to pay for.
// No YouTube code or asset is used. Injected by scripts/lib/recorded-hosts.mjs.
window.__yomuRecordedYouTubePlayer = function installRecordedYouTubePlayer(config) {
    window.ytInitialPlayerResponse = config.player;
    const host = { captionsOn: Boolean(config.captions), captionWrites: 0, ticks: 0 };
    window.__yomuRecordedHost = host;
    const captionTracks = config.player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    let currentTrack = captionTracks[0] ?? null;

    const ready = () => {
        const player = document.querySelector('#movie_player');
        const video = player?.querySelector('video');
        if (!player || !video) return;
        installPlayerApi(player, video);
        startVideo(video);
        startCaptions(player, video);
        startChromeChurn(player, video);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
    else ready();

    function installPlayerApi(player, video) {
        const videoDetails = config.player?.videoDetails ?? {};
        Object.assign(player, {
            getVideoData: () => ({ video_id: videoDetails.videoId, title: videoDetails.title, author: videoDetails.author }),
            getAudioTrack: () => ({ captionTracks }),
            getOption: (module, option) => {
                if (module !== 'captions') return null;
                if (option === 'tracklist') return captionTracks;
                return option === 'track' ? (host.captionsOn ? currentTrack ?? {} : {}) : null;
            },
            setOption: (module, option, value) => {
                if (module !== 'captions' || option !== 'track') return;
                if (value && value.languageCode) {
                    currentTrack = captionTracks.find(track => track.languageCode === value.languageCode) ?? currentTrack;
                    host.captionsOn = true;
                } else {
                    host.captionsOn = false;
                }
            },
            loadModule: module => { if (module === 'captions') host.captionsOn = true; },
            unloadModule: module => { if (module === 'captions') host.captionsOn = false; },
            toggleCaptions: () => { host.captionsOn = !host.captionsOn; },
            getPlayerState: () => (video.ended ? 0 : video.paused ? 2 : 1),
            getCurrentTime: () => video.currentTime,
            getDuration: () => video.duration || Number(videoDetails.lengthSeconds) || 0,
            seekTo: seconds => { video.currentTime = Number(seconds) || 0; },
            pauseVideo: () => video.pause(),
            playVideo: () => video.play().catch(() => undefined),
            setSize: () => undefined,
            isMuted: () => video.muted,
        });
        const button = player.querySelector('.ytp-subtitles-button');
        button?.addEventListener('click', () => { host.captionsOn = !host.captionsOn; });
    }

    function startVideo(video) {
        video.removeAttribute('src');
        for (const source of video.querySelectorAll('source')) source.remove();
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.src = config.clipUrl;
        if (config.startSeconds) video.currentTime = config.startSeconds;
        if (config.autoplay) video.play().catch(() => undefined);
    }

    function startCaptions(player, video) {
        // The captions module creates this window when it loads; a page frozen before
        // that has none yet.
        const container = player.querySelector('.ytp-caption-window-container') ?? createCaptionContainer(player);
        const events = (config.nativeTrack?.events ?? []).filter(event => Array.isArray(event.segs) && !event.aAppend);
        let shown = null;
        const render = () => {
            const button = player.querySelector('.ytp-subtitles-button');
            button?.setAttribute('aria-pressed', String(host.captionsOn));
            const now = video.currentTime * 1000;
            const lines = host.captionsOn
                ? events
                    .filter(event => now >= event.tStartMs && now < event.tStartMs + (event.dDurationMs ?? 0))
                    .map(event => event.segs.filter(seg => (seg.tOffsetMs ?? 0) <= now - event.tStartMs).map(seg => seg.utf8 ?? '').join('').replace(/\n/gu, ''))
                    .filter(Boolean)
                : [];
            const text = lines.join('\n');
            if (text === shown) return;
            shown = text;
            host.captionWrites += 1;
            // YouTube rebuilds the caption window rather than patching its text.
            container.replaceChildren();
            if (!text) return;
            const captionWindow = document.createElement('div');
            captionWindow.className = 'caption-window ytp-caption-window-bottom ytp-caption-window-rollup';
            captionWindow.id = 'caption-window-1';
            captionWindow.setAttribute('lang', 'ja');
            captionWindow.style.cssText = 'position:absolute;left:50%;bottom:2%;transform:translateX(-50%);text-align:center;';
            const captions = document.createElement('span');
            captions.className = 'captions-text';
            for (const line of lines) {
                const visual = document.createElement('span');
                visual.className = 'caption-visual-line';
                visual.style.display = 'block';
                const segment = document.createElement('span');
                segment.className = 'ytp-caption-segment';
                segment.style.cssText = 'display:inline-block;background:rgba(8,8,8,.75);color:#fff;font-size:22px;padding:0 4px;';
                segment.textContent = line;
                visual.append(segment);
                captions.append(visual);
            }
            captionWindow.append(captions);
            container.append(captionWindow);
        };
        container.replaceChildren();
        setInterval(render, 100);
        video.addEventListener('seeked', render);
    }

    function createCaptionContainer(player) {
        const container = document.createElement('div');
        container.className = 'ytp-caption-window-container';
        container.id = 'ytp-caption-window-container';
        container.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
        player.append(container);
        return container;
    }

    function startChromeChurn(player, video) {
        const progress = player.querySelector('.ytp-play-progress');
        const bar = player.querySelector('.ytp-progress-bar');
        const current = player.querySelector('.ytp-time-current');
        setInterval(() => {
            if (video.paused) return;
            host.ticks += 1;
            const fraction = video.duration ? video.currentTime / video.duration : 0;
            if (progress) progress.style.transform = `scaleX(${fraction.toFixed(4)})`;
            bar?.setAttribute('aria-valuenow', String(Math.floor(video.currentTime)));
            const seconds = Math.floor(video.currentTime);
            if (current) current.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
        }, 250);
        video.addEventListener('play', () => player.classList.remove('paused-mode'));
        video.addEventListener('pause', () => player.classList.add('paused-mode'));
    }
};
