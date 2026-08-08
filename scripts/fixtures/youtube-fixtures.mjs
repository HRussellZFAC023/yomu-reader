export function youtubePlayerResponse(videoId, { host = 'www', captionTracks = [{}], translationLanguages } = {}) {
    const renderer = {
        captionTracks: captionTracks.map(track => youtubeCaptionTrack(videoId, host, track)),
    };
    if (translationLanguages !== undefined) renderer.translationLanguages = translationLanguages;
    return {
        videoDetails: { videoId },
        captions: { playerCaptionsTracklistRenderer: renderer },
    };
}

function youtubeCaptionTrack(videoId, defaultHost, options) {
    const languageCode = options.languageCode ?? 'ja';
    const host = options.host ?? defaultHost;
    const track = {
        baseUrl: options.baseUrl ?? `https://${host}.youtube.com/api/timedtext?v=${videoId}&lang=${languageCode}`,
        languageCode,
    };
    const vssId = options.vssId === undefined ? `.${languageCode}` : options.vssId;
    if (vssId !== null) track.vssId = vssId;
    if (options.kind !== undefined) track.kind = options.kind;
    track.name = {
        simpleText: options.name ?? (languageCode === 'ja' ? 'Japanese' : 'English'),
    };
    return track;
}

export function youtubeTimedText(cues, { surroundingNewlines = true } = {}) {
    const body = cues
        .map(cue => {
            const segments = (cue.segments ?? [{ offset: 0, text: cue.text }])
                .map(segment => `<s t="${segment.offset}">${segment.text}</s>`)
                .join('');
            return `<p t="${cue.start}" d="${cue.duration}">${segments}</p>`;
        })
        .join('\n');
    const edge = surroundingNewlines ? '\n' : '';
    return `<timedtext><body>${edge}${body}${edge}</body></timedtext>`;
}

export function youtubeWatchHtml(options) {
    switch (options.fixture) {
        case 'keyless-jiten-detail':
            return keylessJitenDetailWatchHtml(options);
        case 'feature':
            return featureWatchHtml(options);
        case 'performance':
            return performanceWatchHtml(options);
        case 'auto-translation':
            return autoTranslationWatchHtml(options);
        case 'controls-wake':
            return options.mobile ? controlsWakeMobileWatchHtml(options) : controlsWakeDesktopWatchHtml(options);
        case 'sidebar-layout':
            return sidebarLayoutWatchHtml(options);
        case 'sidebar-resize':
            return sidebarResizeWatchHtml(options);
        case 'subtitle-e2e':
            return options.mobile ? subtitleE2eMobileWatchHtml(options) : subtitleE2eDesktopWatchHtml(options);
        default:
            throw new Error(`Unknown YouTube watch fixture: ${options.fixture}`);
    }
}

function keylessJitenDetailWatchHtml({ title, description }) {
    return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>Keyless Jiten detail smoke</title>
  <style>
    html, body { margin: 0; background: #0f0f0f; color: #f1f1f1; font-family: Roboto, Arial, sans-serif; }
    #page { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 22px; padding: 64px 28px; }
    #movie_player { min-height: 330px; background: #050505; border-radius: 12px; }
    ytd-watch-metadata { display: block; margin-top: 22px; }
    ytd-watch-metadata h1 { margin: 0 0 16px; font-size: 28px; line-height: 1.45; }
    #description-inline-expander { padding: 14px 16px; border-radius: 10px; background: #272727; font-size: 18px; line-height: 1.55; }
    aside { display: grid; gap: 14px; align-content: start; }
    ytd-compact-video-renderer { display: block; min-height: 72px; padding: 12px; border-radius: 10px; background: #202020; }
  </style>
</head>
<body>
  <ytd-watch-flexy video-id="keyless-jiten-detail">
    <main id="page">
      <section id="primary">
        <div id="movie_player"></div>
        <ytd-watch-metadata>
          <h1><yt-formatted-string title="${title}">${title}</yt-formatted-string></h1>
          <div id="description-inline-expander">
            <yt-attributed-string id="attributed-snippet-text">${description}</yt-attributed-string>
          </div>
        </ytd-watch-metadata>
      </section>
      <aside id="secondary">
        <ytd-compact-video-renderer><a id="video-title" href="/watch?v=side">日本語の動画</a></ytd-compact-video-renderer>
      </aside>
    </main>
  </ytd-watch-flexy>
</body>
</html>`;
}

function featureWatchHtml({ playerResponse }) {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Feature YouTube Watch</title>
  <style>
    html, body { margin: 0; background: #0f0f0f; color: #f1f1f1; font-family: Roboto, Arial, sans-serif; }
    ytd-watch-flexy { display: block; }
    #page { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 24px; padding: 68px 24px 48px; box-sizing: border-box; }
    #movie_player { position: relative; min-height: 480px; aspect-ratio: 16 / 9; background: #000; }
    #movie_player video { display: block; width: 100%; height: 100%; background: #050505; }
    .ytp-caption-window-container { position: absolute; left: 0; right: 0; bottom: 72px; text-align: center; }
    .ytp-caption-segment { padding: 4px 10px; background: rgba(0,0,0,.76); color: white; font-size: 32px; text-shadow: 0 2px 4px black; }
    ytd-watch-metadata { display: block; margin-top: 20px; }
    ytd-watch-metadata h1 { font-size: 24px; margin: 0 0 16px; }
    #description-inline-expander { margin: 16px 0; padding: 14px 16px; border-radius: 10px; background: #272727; line-height: 1.5; }
    ytd-comment-view-model { display: block; margin-top: 18px; padding: 16px 0; border-top: 1px solid #333; }
    #content-text { display: block; line-height: 1.6; }
    ytd-live-chat-frame { display: block; margin-top: 18px; padding: 20px; border-radius: 18px; background: #272727; overflow: hidden; }
    ytd-live-chat-frame #header { margin-bottom: 18px; font-size: 22px; font-weight: 600; }
    ytd-live-chat-frame #panel-pages { display: block; }
    .live-chat-preview-row { display: flex; align-items: center; gap: 16px; min-width: 0; }
    .live-chat-card-icon { flex: 0 0 auto; width: 32px; height: 32px; border: 2px solid #f1f1f1; border-radius: 6px; }
    .live-chat-card-copy { flex: 1 1 auto; min-width: 0; line-height: 1.4; white-space: normal; }
    ytd-live-chat-frame #show-hide-button { flex: 0 0 auto; min-height: 36px; padding: 0 14px; border: 0; border-radius: 18px; background: #3f3f3f; color: #f1f1f1; font: inherit; white-space: nowrap; }
    aside { display: grid; gap: 16px; align-content: start; }
    ytd-compact-video-renderer { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 12px; min-height: 84px; }
    ytd-compact-video-renderer .thumb { border-radius: 8px; background: #333; }
    ytd-compact-video-renderer a { color: #f1f1f1; text-decoration: none; line-height: 1.35; font-weight: 600; }
  </style>
  <script>
    window.ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};
    customElements.define('ytd-watch-flexy', class extends HTMLElement {});
  </script>
</head>
<body>
  <ytd-watch-flexy video-id="feature123">
    <main id="page">
      <section id="primary">
        <div id="player"><div id="player-container-outer"><div id="player-container-inner">
          <div id="movie_player">
            <video controls muted></video>
            <div class="ytp-caption-window-container"><span class="ytp-caption-segment">先生いつもありがとうございました。</span></div>
          </div>
        </div></div></div>
        <ytd-watch-metadata>
          <h1><yt-formatted-string title="日本の習慣｜おばあちゃんが今も大切にしていること">日本の習慣｜おばあちゃんが今も大切にしていること</yt-formatted-string></h1>
          <div id="description-inline-expander">
            <yt-attributed-string id="attributed-snippet-text">復習用のPodcastでは、日本語で説明しています。</yt-attributed-string>
          </div>
        </ytd-watch-metadata>
        <section id="comments">
          <ytd-comment-view-model>
            <yt-attributed-string id="content-text">先生いつもありがとうございました。✨</yt-attributed-string>
            <span class="more-button style-scope ytd-comment-view-model" slot="more-button">詳細</span>
            <ytd-tri-state-button-view-model class="translate-button style-scope ytd-comment-view-model" state="untoggled">
              <tp-yt-paper-button noink class="style-scope ytd-tri-state-button-view-model" role="button" tabindex="0" aria-disabled="false">英語に翻訳</tp-yt-paper-button>
            </ytd-tri-state-button-view-model>
          </ytd-comment-view-model>
        </section>
        <yt-live-chat-app>
          <yt-live-chat-text-message-renderer>
            <span id="author-name">先生</span>
            <yt-formatted-string id="message">今日はライブで日本語を聞いています。</yt-formatted-string>
            <button type="button" aria-label="返信">返信</button>
          </yt-live-chat-text-message-renderer>
        </yt-live-chat-app>
        <ytd-live-chat-frame>
          <div id="header"><yt-formatted-string>チャット</yt-formatted-string></div>
          <div id="panel-pages">
            <div class="live-chat-preview-row">
              <span class="live-chat-card-icon" aria-hidden="true"></span>
              <yt-formatted-string id="message" class="live-chat-card-copy">会話に参加して、クリエイターや、このライブ配信を視聴している人たちと交流できます。</yt-formatted-string>
              <button id="show-hide-button" type="button"><yt-formatted-string>チャットを開く</yt-formatted-string></button>
            </div>
          </div>
        </ytd-live-chat-frame>
      </section>
      <aside id="secondary">
        <ytd-compact-video-renderer data-case="side-jp">
          <div class="thumb"></div><a id="video-title" href="/watch?v=side-jp">梅干しを貼る話、インパクト強すぎる</a>
        </ytd-compact-video-renderer>
        <ytd-compact-video-renderer data-case="side-en">
          <div class="thumb"></div><a id="video-title" href="/watch?v=side-en">Desk setup tour for focus</a>
        </ytd-compact-video-renderer>
      </aside>
    </main>
  </ytd-watch-flexy>
  <script>
    const player = document.querySelector('#movie_player');
    const video = document.querySelector('video');
    Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 10 });
    player.getVideoData = () => ({ video_id: 'feature123' });
    player.getAudioTrack = () => ({ captionTracks: window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks });
    player.getOption = () => window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
    player.setOption = () => {};
    player.loadModule = () => {};
    player.unloadModule = () => {};
    player.setSize = (width, height) => {
      player.style.width = width + 'px';
      player.style.height = height + 'px';
    };
  </script>
</body>
</html>`;
}

function performanceWatchHtml({ mobile, playerResponse, shortDescription, longDescription, commentsHtml, sidebarHtml }) {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>YouTube Performance Fixture</title>
  <style>
    html, body { margin: 0; background: #0f0f0f; color: #f1f1f1; font-family: Roboto, Arial, sans-serif; }
    #page { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 24px; padding: 72px 24px 48px; box-sizing: border-box; }
    ${mobile ? '#page { display: block; padding: 88px 12px 32px; } #secondary { display: none; } #movie_player { min-height: auto; }' : ''}
    #movie_player { position: relative; min-height: 480px; aspect-ratio: 16 / 9; background: #000; }
    #movie_player video { display: block; width: 100%; height: 100%; background: #050505; }
    .ytp-caption-window-container { position: absolute; left: 0; right: 0; bottom: 72px; text-align: center; }
    .ytp-caption-segment { padding: 4px 10px; background: rgba(0,0,0,.76); color: white; font-size: 32px; text-shadow: 0 2px 4px black; }
    ytd-watch-metadata { display: block; margin-top: 20px; }
    ytd-watch-metadata h1 { font-size: 24px; margin: 0 0 16px; }
    #description-inline-expander { margin: 16px 0; padding: 14px 16px; border-radius: 10px; background: #272727; line-height: 1.5; white-space: pre-wrap; }
    #description-expand { margin-top: 8px; padding: 8px 12px; border: 0; border-radius: 999px; background: #3f3f3f; color: #fff; }
    ytd-comment-view-model { display: block; margin-top: 18px; padding: 16px 0; border-top: 1px solid #333; }
    #content-text { display: block; line-height: 1.6; }
    #secondary { display: grid; gap: 14px; align-content: start; }
    ytd-compact-video-renderer { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 12px; min-height: 84px; }
    ytd-compact-video-renderer .thumb { border-radius: 8px; background: #333; }
    ytd-compact-video-renderer a { color: #f1f1f1; text-decoration: none; line-height: 1.35; font-weight: 600; }
    #profile-ocr-slot { position: fixed; left: 36px; top: 112px; z-index: 1; }
    #profile-ocr-slot img { width: 560px; height: 118px; object-fit: cover; opacity: .2; }
  </style>
  <script>
    window.ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};
    customElements.define('ytd-watch-flexy', class extends HTMLElement {});
  </script>
</head>
<body>
  <ytd-watch-flexy video-id="profile123">
    <main id="page">
      <section id="primary">
        <div id="player"><div id="player-container-outer"><div id="player-container-inner">
          <div id="movie_player">
            <video controls muted playsinline></video>
            <div class="ytp-caption-window-container"><span class="ytp-caption-segment">先生いつもありがとうございました。</span></div>
          </div>
        </div></div></div>
        <ytd-watch-metadata>
          <h1><yt-formatted-string title="日本語タイトル">日本語タイトル</yt-formatted-string></h1>
          <${mobile ? 'ytm-expandable-video-description-body-renderer' : 'div'} id="description-inline-expander" data-profile-volatile-text="${shortDescription}" data-profile-expanded-text="${longDescription}">
            <yt-attributed-string id="attributed-snippet-text">${shortDescription}</yt-attributed-string>
            <button id="description-expand" type="button">もっと見る</button>
          </${mobile ? 'ytm-expandable-video-description-body-renderer' : 'div'}>
        </ytd-watch-metadata>
        <section id="comments">
          ${commentsHtml}
        </section>
        <yt-live-chat-app>
          <yt-live-chat-text-message-renderer>
            <span id="author-name">先生</span>
            <yt-formatted-string id="message">今日はライブで日本語を聞いています。</yt-formatted-string>
          </yt-live-chat-text-message-renderer>
        </yt-live-chat-app>
      </section>
      <aside id="secondary">
        ${sidebarHtml}
      </aside>
    </main>
  </ytd-watch-flexy>
  <script>
    const player = document.querySelector('#movie_player');
    const video = document.querySelector('video');
    let currentTime = 0.4;
    let playbackTimer = 0;
    let rehydrateTimer = 0;
    const ocrLines = JSON.stringify([
      { text: 'でも今回はこれまでと日本語を読む', box: { left: 0.02, top: 0.18, width: 0.92, height: 0.58 } },
    ]);
    Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 12 });
    Object.defineProperty(video, 'paused', { configurable: true, get: () => playbackTimer === 0 });
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: value => { currentTime = Number(value) || 0; },
    });
    player.getVideoData = () => ({ video_id: 'profile123' });
    player.getAudioTrack = () => ({ captionTracks: window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks });
    player.getOption = () => window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
    player.setOption = () => {};
    player.loadModule = () => {};
    player.unloadModule = () => {};
    player.setSize = (width, height) => {
      player.style.width = width + 'px';
      player.style.height = height + 'px';
    };
    window.__yomuProfileHostRestores = 0;
    window.__yomuProfilePlaybackTickOnce = () => {
      currentTime = (currentTime + 0.25) % 10;
      video.dispatchEvent(new Event('timeupdate'));
    };
    window.__yomuProfileRehydrateOnce = () => {
      let restored = 0;
      document.querySelectorAll('[data-profile-volatile-text]').forEach(element => {
        element.textContent = element.getAttribute('data-profile-volatile-text') || '';
        restored += 1;
      });
      window.__yomuProfileHostRestores += restored;
      return restored;
    };
    window.__yomuProfileStartPlayback = () => {
      if (playbackTimer) return;
      playbackTimer = window.setInterval(window.__yomuProfilePlaybackTickOnce, 250);
      video.dispatchEvent(new Event('play'));
      video.dispatchEvent(new Event('playing'));
    };
    window.__yomuProfileStopPlayback = () => {
      if (!playbackTimer) return;
      window.clearInterval(playbackTimer);
      playbackTimer = 0;
      video.dispatchEvent(new Event('pause'));
    };
    window.__yomuProfileStartHostRehydrate = ({ intervalMs = 200 } = {}) => {
      if (rehydrateTimer) return;
      rehydrateTimer = window.setInterval(window.__yomuProfileRehydrateOnce, intervalMs);
    };
    window.__yomuProfileStopHostRehydrate = () => {
      window.clearInterval(rehydrateTimer);
      rehydrateTimer = 0;
    };
    window.__yomuProfileExpandDescription = () => {
      const description = document.querySelector('#description-inline-expander');
      if (!description) return;
      const text = description.getAttribute('data-profile-expanded-text') || '';
      description.setAttribute('data-profile-volatile-text', text);
      description.textContent = text;
      const button = document.createElement('button');
      button.id = 'description-expand';
      button.type = 'button';
      button.textContent = '一部を表示';
      description.append(document.createTextNode('\\n'), button);
    };
    document.querySelector('#description-expand')?.addEventListener('click', () => window.__yomuProfileExpandDescription());
    window.__yomuProfileInstallOcrImage = () => {
      if (document.querySelector('#profile-ocr-image')) return;
      const slot = document.createElement('div');
      slot.id = 'profile-ocr-slot';
      const image = document.createElement('img');
      image.id = 'profile-ocr-image';
      image.alt = '';
      image.dataset.yomuVideoFrame = 'true';
      image.dataset.ocrLines = ocrLines;
      image.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="560" height="118"%3E%3Crect width="560" height="118" fill="%23000"/%3E%3C/svg%3E';
      slot.append(image);
      document.body.append(slot);
    };
  </script>
</body>
</html>`;
}

function autoTranslationWatchHtml({ videoId, playerResponse, translatedText }) {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>YouTube Auto Translation Fixture</title>
  <style>
    html, body { margin: 0; background: #0f0f0f; color: #f1f1f1; font-family: Roboto, Arial, sans-serif; }
    #page { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 22px; padding: 72px 24px; box-sizing: border-box; }
    #movie_player { position: relative; min-height: 440px; aspect-ratio: 16 / 9; background: #000; }
    #movie_player video { display: block; width: 100%; height: 100%; background: #050505; }
    .ytp-caption-window-container { position: absolute; left: 0; right: 0; bottom: 72px; text-align: center; min-height: 48px; }
    .ytp-caption-segment { padding: 4px 10px; background: rgba(0,0,0,.76); color: white; font-size: 32px; text-shadow: 0 2px 4px black; }
    aside { color: #aaa; }
  </style>
  <script>
    window.ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};
    window.ytcfg = {
      get: key => ({
        HL: 'ja',
        INNERTUBE_CLIENT_NAME: 'WEB',
        INNERTUBE_CLIENT_VERSION: 'test-version',
      })[key] || '',
    };
  </script>
</head>
<body>
  <ytd-watch-flexy video-id="${videoId}">
    <main id="page">
      <section id="primary">
        <div id="player"><div id="player-container-outer"><div id="player-container-inner">
          <div id="movie_player">
            <video controls muted playsinline></video>
            <div class="ytp-caption-window-container"><span class="ytp-caption-segment"></span></div>
          </div>
        </div></div></div>
      </section>
      <aside>Auto-translated subtitle fixture</aside>
    </main>
  </ytd-watch-flexy>
  <script>
    const player = document.querySelector('#movie_player');
    const video = document.querySelector('video');
    const tracks = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
    window.__captionSetOptions = [];
    let currentTime = 1.2;
    Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 8 });
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: value => { currentTime = Number(value) || 0; },
    });
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    player.getVideoData = () => ({ video_id: '${videoId}' });
    player.getAudioTrack = () => ({ captionTracks: tracks });
    player.getOption = (_module, option) => option === 'tracklist' ? { captionTracks: tracks } : undefined;
    player.loadModule = () => {};
    player.unloadModule = () => {};
    player.setOption = (module, option, value) => {
      window.__captionSetOptions.push({ module, option, value });
      if (module === 'captions' && option === 'track' && value && value.translationLanguage) {
        document.querySelector('.ytp-caption-segment').textContent = '${translatedText}';
      }
    };
    player.setSize = (width, height) => {
      player.style.width = width + 'px';
      player.style.height = height + 'px';
    };
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('durationchange'));
    video.dispatchEvent(new Event('timeupdate'));
  </script>
</body>
</html>`;
}

function controlsWakeDesktopWatchHtml({ playerResponse }) {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Controls Wake Watch</title>
  <style>
    html, body { margin: 0; background: #0f0f0f; color: #f1f1f1; font-family: Roboto, Arial, sans-serif; }
    ytd-watch-flexy { display: block; }
    #page { display: grid; grid-template-columns: minmax(0, 1fr); padding: 60px 24px; }
    /* Responsive like YouTube's flexy player: width follows the viewport so a
       viewport nudge changes the docked player box (and the inset signature). */
    #movie_player { position: relative; width: min(960px, calc(100vw - 48px)); aspect-ratio: 16 / 9; background: #000; }
    #movie_player video { display: block; width: 100%; height: 100%; background: #050505; }
  </style>
  <script>
    window.ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};
    customElements.define('ytd-watch-flexy', class extends HTMLElement {});
  </script>
</head>
<body>
  <ytd-watch-flexy video-id="wake123">
    <main id="page">
      <section id="primary">
        <div id="player"><div id="player-container-outer"><div id="player-container-inner">
          <div id="movie_player">
            <video muted></video>
          </div>
        </div></div></div>
      </section>
      <p id="selection-proof">Ordinary YouTube page text remains selectable.</p>
    </main>
  </ytd-watch-flexy>
  <script>
    const player = document.querySelector('#movie_player');
    const video = document.querySelector('video');

    // ---- simulated playback ----
    let playing = false;
    let mediaTime = 0;
    let lastTick = performance.now();
    setInterval(() => {
      const now = performance.now();
      if (playing) mediaTime = Math.min(10, mediaTime + (now - lastTick) / 1000);
      lastTick = now;
    }, 100);
    Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 10 });
    Object.defineProperty(video, 'paused', { configurable: true, get: () => !playing });
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => mediaTime,
      set: (value) => { mediaTime = value; window.__wake.seeks++; wakeControls('seek'); video.dispatchEvent(new Event('seeking')); video.dispatchEvent(new Event('seeked')); },
    });
    video.play = () => { if (!playing) { playing = true; window.__wake.plays++; wakeControls('play'); video.dispatchEvent(new Event('play')); video.dispatchEvent(new Event('playing')); } return Promise.resolve(); };
    video.pause = () => { if (playing) { playing = false; window.__wake.pauses++; wakeControls('pause'); video.dispatchEvent(new Event('pause')); } };

    // ---- emulated YouTube control auto-hide ----
    window.__wake = { resizes: 0, syntheticResizes: 0, setSizes: 0, plays: 0, pauses: 0, seeks: 0, wakes: [], visibleSamples: 0, samples: 0, focusBlocks: 0 };
    let hideTimer;
    function focusedYomuPlayerControl() {
      const active = document.activeElement;
      return active instanceof Element
        && player.contains(active)
        && Boolean(active.closest('.jpdb-subtitle-player .jpdb-subtitle-rail'));
    }
    function hideControls() {
      if (!playing) return;
      if (focusedYomuPlayerControl()) {
        window.__wake.focusBlocks++;
        hideTimer = setTimeout(hideControls, 100);
        return;
      }
      player.classList.add('ytp-autohide');
    }
    function wakeControls(reason) {
      window.__wake.wakes.push({ reason, t: Math.round(performance.now()) });
      player.classList.remove('ytp-autohide');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hideControls, 3000);
    }
    window.addEventListener('resize', (e) => {
      window.__wake.resizes++;
      if (!e.isTrusted) window.__wake.syntheticResizes++;
      wakeControls('resize');
    });

    player.getVideoData = () => ({ video_id: 'wake123' });
    player.getAudioTrack = () => ({ captionTracks: window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks });
    player.getOption = () => window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
    player.setOption = () => {};
    player.loadModule = () => {};
    player.unloadModule = () => {};
    player.setSize = (width, height) => {
      window.__wake.setSizes++;
      wakeControls('setSize');
      player.style.width = width + 'px';
      player.style.height = height + 'px';
    };

    // sample controls visibility every 500ms while playing
    setInterval(() => {
      if (!playing) return;
      window.__wake.samples++;
      if (!player.classList.contains('ytp-autohide')) window.__wake.visibleSamples++;
    }, 500);
  </script>
</body>
</html>`;
}

function controlsWakeMobileWatchHtml({ playerResponse }) {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Controls Wake Mobile Watch</title>
  <style>
    html, body { margin: 0; background: #0f0f0f; color: #f1f1f1; font-family: Roboto, Arial, sans-serif; }
    ytm-app { display: block; }
    ytm-player { display: block; position: relative; width: 100vw; aspect-ratio: 16 / 9; background: #000; }
    #movie_player { position: absolute; inset: 0; }
    #movie_player video { display: block; width: 100%; height: 100%; background: #050505; }
    #player-control-overlay { position: absolute; inset: 0; opacity: 0; transition: opacity .15s; pointer-events: none; }
    #player-control-overlay.fadein { opacity: 1; pointer-events: auto; }
    main { min-height: 1600px; }
  </style>
  <script>
    window.ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};
  </script>
</head>
<body>
  <ytm-app>
    <main>
      <ytm-player>
        <div id="movie_player">
          <video muted playsinline></video>
          <div id="player-control-overlay" class="fadein"><button aria-label="Play">play</button></div>
        </div>
      </ytm-player>
      <p id="selection-proof">Ordinary YouTube page text remains selectable.</p>
      <ytm-slim-video-metadata-renderer><h2>モバイル字幕テスト</h2></ytm-slim-video-metadata-renderer>
    </main>
  </ytm-app>
  <script>
    const player = document.querySelector('#movie_player');
    const overlay = document.querySelector('#player-control-overlay');
    const video = document.querySelector('video');

    let playing = false;
    let mediaTime = 0;
    let lastTick = performance.now();
    setInterval(() => {
      const now = performance.now();
      if (playing) mediaTime = Math.min(10, mediaTime + (now - lastTick) / 1000);
      lastTick = now;
    }, 100);
    Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 10 });
    Object.defineProperty(video, 'paused', { configurable: true, get: () => !playing });
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => mediaTime,
      set: (value) => { mediaTime = value; window.__wake.seeks++; wakeControls('seek'); video.dispatchEvent(new Event('seeking')); video.dispatchEvent(new Event('seeked')); },
    });
    video.play = () => { if (!playing) { playing = true; window.__wake.plays++; wakeControls('play'); video.dispatchEvent(new Event('play')); video.dispatchEvent(new Event('playing')); } return Promise.resolve(); };
    video.pause = () => { if (playing) { playing = false; window.__wake.pauses++; wakeControls('pause'); video.dispatchEvent(new Event('pause')); } };

    window.__wake = { resizes: 0, syntheticResizes: 0, setSizes: 0, plays: 0, pauses: 0, seeks: 0, wakes: [], visibleSamples: 0, samples: 0, focusBlocks: 0 };
    let hideTimer;
    function focusedYomuPlayerControl() {
      const active = document.activeElement;
      return active instanceof Element
        && player.contains(active)
        && Boolean(active.closest('.jpdb-subtitle-player .jpdb-subtitle-rail'));
    }
    function hideControls() {
      if (!playing) return;
      if (focusedYomuPlayerControl()) {
        window.__wake.focusBlocks++;
        hideTimer = setTimeout(hideControls, 100);
        return;
      }
      overlay.classList.remove('fadein');
    }
    function wakeControls(reason) {
      window.__wake.wakes.push({ reason, t: Math.round(performance.now()) });
      overlay.classList.add('fadein');
      clearTimeout(hideTimer);
      // m.youtube.com keeps controls while paused; only fades while playing
      hideTimer = setTimeout(hideControls, 3000);
    }
    window.addEventListener('resize', (e) => {
      window.__wake.resizes++;
      if (!e.isTrusted) window.__wake.syntheticResizes++;
      wakeControls('resize');
    });

    player.getVideoData = () => ({ video_id: 'wake123' });
    player.getAudioTrack = () => ({ captionTracks: window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks });
    player.getOption = () => window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
    player.setOption = () => {};
    player.loadModule = () => {};
    player.unloadModule = () => {};
    player.setSize = (width, height) => { window.__wake.setSizes++; wakeControls('setSize'); };
    player.pauseVideo = () => { video.pause(); };
    player.playVideo = () => { video.play(); };

    setInterval(() => {
      if (!playing) return;
      window.__wake.samples++;
      if (overlay.classList.contains('fadein')) window.__wake.visibleSamples++;
    }, 500);
    // initial state: user just tapped play
    setTimeout(() => wakeControls('initial'), 0);
  </script>
</body>
</html>`;
}

function sidebarLayoutWatchHtml({ playerResponse }) {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>YouTube P0-44 fixture</title>
  <style>
    html, body { margin: 0; background: #0f0f0f; color: #f1f1f1; font-family: Roboto, Arial, sans-serif; overflow-x: hidden; }
    ytd-watch-flexy { display: block; }
    #columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 360px); gap: 24px; max-width: 1720px; margin: 0 auto; padding: 72px 24px 32px; box-sizing: border-box; align-items: start; }
    #primary, #primary-inner { min-width: 0; box-sizing: border-box; }
    #player, #player-container-outer, #player-container-inner, ytd-player { display: block; min-width: 0; }
    #movie_player { position: relative; width: 100%; aspect-ratio: 16 / 9; min-height: 320px; background: #000; overflow: hidden; }
    #movie_player .html5-video-container { position: absolute; inset: 0; width: 100%; height: 100%; }
    #movie_player video { position: absolute; display: block; width: 100%; height: 100%; background: linear-gradient(135deg, #111, #252525); }
    .ytp-caption-window-container { position: absolute; left: 20%; right: 20%; bottom: 64px; text-align: center; font-size: 28px; text-shadow: 0 2px 4px #000; }
    ytd-watch-metadata { display: block; min-width: 0; padding-top: 18px; }
    ytd-watch-metadata h1 { margin: 0 0 14px; font-size: 24px; line-height: 1.28; font-weight: 650; overflow-wrap: anywhere; }
    #actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; min-width: 0; }
    #actions button { border: 0; border-radius: 18px; padding: 8px 14px; color: #f1f1f1; background: #272727; font: inherit; }
    #description { max-width: 100%; box-sizing: border-box; border-radius: 8px; padding: 12px 14px; background: #272727; color: #ddd; line-height: 1.5; overflow-wrap: anywhere; }
    #secondary { display: grid; gap: 14px; min-width: 0; color: #ddd; }
    ytd-compact-video-renderer { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 10px; min-width: 0; }
    .thumb { min-height: 78px; border-radius: 8px; background: #303030; }
    ytd-compact-video-renderer a { color: #f1f1f1; text-decoration: none; line-height: 1.35; }
    @media (max-width: 699px) {
      #columns { display: block; padding: 56px 12px 24px; }
      #secondary { margin-top: 18px; }
      #movie_player { min-height: 210px; }
    }
  </style>
  <script>
    window.ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};
    for (const name of ['ytd-watch-flexy', 'ytd-player', 'ytd-watch-metadata', 'ytd-compact-video-renderer']) {
      if (!customElements.get(name)) customElements.define(name, class extends HTMLElement {});
    }
  </script>
</head>
<body>
  <ytd-watch-flexy video-id="p044fixture">
    <main id="columns">
      <section id="primary">
        <div id="primary-inner">
          <div id="player"><div id="player-container-outer"><div id="player-container-inner"><ytd-player>
            <div id="movie_player">
              <div class="html5-video-container" style="width:1008px;height:567px">
                <video class="html5-main-video" controls muted playsinline style="left:0;top:0;width:1008px;height:567px;object-fit:cover"></video>
              </div>
              <div class="ytp-caption-window-container"><span class="ytp-caption-segment">今日は日本語字幕を確認します</span></div>
            </div>
          </ytd-player></div></div></div>
          <ytd-watch-metadata>
            <h1>日本語タイトルと説明を確認するための動画</h1>
            <div id="actions">
              <button type="button">Like</button><button type="button">Share</button><button type="button">Save</button><button type="button">Clip</button>
            </div>
            <div id="description">これは説明欄です。下側の文字起こしパネルでも横幅が異常に広がらず、ボタンやタイトルと同じ列に収まります。</div>
          </ytd-watch-metadata>
        </div>
      </section>
      <aside id="secondary">
        ${Array.from({ length: 8 }, (_, index) => `<ytd-compact-video-renderer><div class="thumb"></div><a href="/watch?v=${index}">おすすめ動画 ${index + 1} と日本語の説明</a></ytd-compact-video-renderer>`).join('')}
      </aside>
    </main>
  </ytd-watch-flexy>
  <script>
    const player = document.querySelector('#movie_player');
    const video = document.querySelector('video');
    globalThis.__yomuSetSizeCalls = [];
    globalThis.__yomuResizeEvents = 0;
    window.addEventListener('resize', () => { globalThis.__yomuResizeEvents += 1; });
    Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 12 });
    Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 1.4 });
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1920 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 });
    let fixturePaused = false;
    Object.defineProperty(video, 'paused', { configurable: true, get: () => fixturePaused });
    Object.defineProperty(video, 'ended', { configurable: true, value: false });
    video.play = () => {
      fixturePaused = false;
      video.dispatchEvent(new Event('play'));
      video.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    };
    video.pause = () => {
      fixturePaused = true;
      video.dispatchEvent(new Event('pause'));
    };
    player.getVideoData = () => ({ video_id: 'p044fixture' });
    player.getAudioTrack = () => ({ captionTracks: window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks });
    player.getOption = () => window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
    player.setOption = () => {};
    player.loadModule = () => {};
    player.unloadModule = () => {};
    player.setSize = (width, height) => {
      globalThis.__yomuSetSizeCalls.push({ width, height, at: performance.now() });
      player.style.width = width + 'px';
      player.style.height = height + 'px';
    };
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('loadeddata'));
    video.dispatchEvent(new Event('play'));
    video.dispatchEvent(new Event('playing'));
  </script>
</body>
</html>`;
}

function sidebarResizeWatchHtml({ mobile, playerResponse }) {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>YouTube sidebar resize fixture</title>
  <style>
    html, body { margin: 0; background: #0f0f0f; color: #f1f1f1; font-family: Roboto, Arial, sans-serif; overflow-x: hidden; }
    ytd-watch-flexy, ytm-watch { display: block; }
    #columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 360px); gap: 24px; max-width: 1720px; margin: 0 auto; padding: 72px 24px 32px; box-sizing: border-box; align-items: start; }
    #primary, #primary-inner { min-width: 0; box-sizing: border-box; }
    #player, #player-container-outer, #player-container-inner, ytd-player { display: block; min-width: 0; }
    #movie_player { position: relative; width: 100%; aspect-ratio: 16 / 9; min-height: 320px; background: #000; overflow: hidden; }
    #movie_player .html5-video-container { position: absolute; inset: 0; width: 100%; height: 100%; }
    #movie_player video { position: absolute; display: block; width: 100%; height: 100%; background: linear-gradient(135deg, #111, #252525); }
    .ytp-caption-window-container { position: absolute; left: 20%; right: 20%; bottom: 64px; text-align: center; font-size: 28px; text-shadow: 0 2px 4px #000; }
    ytd-watch-metadata, ytm-slim-video-metadata-renderer { display: block; min-width: 0; padding-top: 18px; }
    ytd-watch-metadata h1, ytm-slim-video-metadata-renderer h2 { margin: 0 0 14px; font-size: 24px; line-height: 1.28; font-weight: 650; overflow-wrap: anywhere; }
    #actions, ytm-slim-video-action-bar-renderer { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; min-width: 0; }
    #actions button, ytm-slim-video-action-bar-renderer button { border: 0; border-radius: 18px; padding: 8px 14px; color: #f1f1f1; background: #272727; font: inherit; }
    #description, ytm-expandable-video-description-body-renderer { display: block; max-width: 100%; box-sizing: border-box; border-radius: 8px; padding: 12px 14px; background: #272727; color: #ddd; line-height: 1.5; overflow-wrap: anywhere; }
    #secondary { display: grid; gap: 14px; min-width: 0; color: #ddd; }
    ytd-compact-video-renderer { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 10px; min-width: 0; }
    .thumb { min-height: 78px; border-radius: 8px; background: #303030; }
    ytd-compact-video-renderer a { color: #f1f1f1; text-decoration: none; line-height: 1.35; }
    @media (max-width: 699px) {
      #columns { display: block; padding: 56px 12px 24px; }
      #secondary { margin-top: 18px; }
      #movie_player { min-height: 210px; }
      ytd-watch-metadata h1, ytm-slim-video-metadata-renderer h2 { font-size: 19px; }
    }
  </style>
  <script>
    window.ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};
    for (const name of ['ytd-watch-flexy', 'ytm-watch', 'ytd-player', 'ytd-watch-metadata', 'ytm-slim-video-metadata-renderer', 'ytm-slim-video-action-bar-renderer', 'ytm-expandable-video-description-body-renderer', 'ytd-compact-video-renderer']) {
      if (!customElements.get(name)) customElements.define(name, class extends HTMLElement {});
    }
  </script>
</head>
<body>
  <${mobile ? 'ytm-watch' : 'ytd-watch-flexy'} video-id="p044fixture">
    <main id="columns">
      <section id="primary">
        <div id="primary-inner">
          <div id="player"><div id="player-container-outer"><div id="player-container-inner"><ytd-player>
            <div id="movie_player">
              <div class="html5-video-container" style="width:1008px;height:567px">
                <video class="html5-main-video" controls muted playsinline style="left:0;top:0;width:1008px;height:567px;object-fit:cover"></video>
              </div>
              <div class="ytp-caption-window-container"><span class="ytp-caption-segment">今日は日本語字幕を確認します</span></div>
            </div>
          </ytd-player></div></div></div>
          <${mobile ? 'ytm-slim-video-metadata-renderer' : 'ytd-watch-metadata'}>
            <${mobile ? 'h2' : 'h1'}>日本語タイトルと説明を確認するための動画</${mobile ? 'h2' : 'h1'}>
            <${mobile ? 'ytm-slim-video-action-bar-renderer' : 'div'} id="actions">
              <button type="button">Like</button><button type="button">Share</button><button type="button">Save</button><button type="button">Clip</button>
            </${mobile ? 'ytm-slim-video-action-bar-renderer' : 'div'}>
            <${mobile ? 'ytm-expandable-video-description-body-renderer' : 'div'} id="description">これは説明欄です。下側の文字起こしパネルでも横幅が異常に広がらず、ボタンやタイトルと同じ列に収まります。</${mobile ? 'ytm-expandable-video-description-body-renderer' : 'div'}>
          </${mobile ? 'ytm-slim-video-metadata-renderer' : 'ytd-watch-metadata'}>
        </div>
      </section>
      <aside id="secondary">
        ${Array.from({ length: 24 }, (_, index) => `<ytd-compact-video-renderer><div class="thumb"></div><a href="/watch?v=${index}">おすすめ動画 ${index + 1} と日本語の説明</a></ytd-compact-video-renderer>`).join('')}
      </aside>
    </main>
  </${mobile ? 'ytm-watch' : 'ytd-watch-flexy'}>
  <script>
    const player = document.querySelector('#movie_player');
    const video = document.querySelector('video');
    globalThis.__yomuSetSizeCalls = [];
    Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(video, 'duration', { configurable: true, value: 12 });
    Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 1.4 });
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1920 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 });
    player.getVideoData = () => ({ video_id: 'p044fixture' });
    player.getAudioTrack = () => ({ captionTracks: window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks });
    player.getOption = () => window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
    player.setOption = () => {};
    player.loadModule = () => {};
    player.unloadModule = () => {};
    player.setSize = (width, height) => {
      globalThis.__yomuSetSizeCalls.push({ width, height, at: performance.now() });
      player.style.width = width + 'px';
      player.style.height = height + 'px';
    };
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('loadeddata'));
  </script>
</body>
</html>`;
}

function subtitleE2eDesktopWatchHtml({ playerResponse, fixtureVideoUrl }) {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>YouTube fixture</title>
  <style>
    html, body { margin: 0; background: #0f0f0f; color: white; font-family: Roboto, Arial, sans-serif; }
    #columns { display: grid; grid-template-columns: minmax(0, 1fr) 390px; gap: 22px; padding: 56px 24px 24px; box-sizing: border-box; }
    #movie_player { position: relative; background: #000; aspect-ratio: 16 / 9; min-height: 420px; }
    #movie_player video { width: 100%; height: 100%; display: block; background: #050505; }
    .caption-window { position: absolute; left: 20%; right: 20%; bottom: 76px; font-size: 32px; text-align: center; text-shadow: 0 2px 4px black; }
    aside { color: #aaa; }
  </style>
  <script>
    window.ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};
    customElements.define('ytd-watch-flexy', class extends HTMLElement {});
  </script>
</head>
<body>
  <ytd-watch-flexy>
    <div id="columns">
      <div id="primary">
        <div id="player"><div id="player-container-outer"><div id="player-container-inner">
          <div id="movie_player">
            <video controls muted ${fixtureVideoUrl ? `src="${fixtureVideoUrl}"` : ''}></video>
            <div class="caption-window"><span class="ytp-caption-segment">ルーターと同じ</span></div>
          </div>
        </div></div></div>
      </div>
      <aside id="secondary"><div id="secondary-inner"><h2>Recommended</h2><p>Sidebar content</p></div></aside>
    </div>
  </ytd-watch-flexy>
  <script>
    const player = document.querySelector('#movie_player');
    player.getVideoData = () => ({ video_id: 'TAorfFcb8_g' });
    player.getAudioTrack = () => ({ captionTracks: window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks });
    player.setOption = () => {};
    player.getOption = () => window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
    player.loadModule = () => {};
    player.unloadModule = () => {};
    player.setSize = (width, height) => { player.style.width = width + 'px'; player.style.height = height + 'px'; };
  </script>
</body>
</html>`;
}

function subtitleE2eMobileWatchHtml({ playerResponse, fixtureVideoUrl }) {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Mobile YouTube fixture</title>
  <style>
    html, body { margin: 0; background: #0f0f0f; color: white; font-family: Roboto, Arial, sans-serif; }
    .mobile-watch { width: 390px; min-height: 900px; padding-top: 48px; background: #0f0f0f; }
    #movie_player { position: relative; width: 390px; height: 219px; background: #000; }
    #movie_player video { width: 100%; height: 100%; display: block; background: #050505; }
    .caption-window { position: absolute; left: 12%; right: 12%; bottom: 42px; font-size: 22px; text-align: center; text-shadow: 0 2px 4px black; }
    .metadata { padding: 16px 20px; font-size: 16px; line-height: 1.45; }
  </style>
  <script>
    window.ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};
  </script>
</head>
<body>
  <main class="mobile-watch">
    <div id="player"><div id="player-container-outer"><div id="player-container-inner">
      <div id="movie_player">
        <video controls muted ${fixtureVideoUrl ? `src="${fixtureVideoUrl}"` : ''}></video>
        <div class="caption-window"><span class="ytp-caption-segment">今から体を描きます。</span></div>
      </div>
    </div></div></div>
    <section class="metadata">
      <h1>Body Parts | Complete Beginner Japanese Comprehensible Input</h1>
      <p>にほんごのじかん</p>
    </section>
  </main>
  <script>
    const player = document.querySelector('#movie_player');
    player.getVideoData = () => ({ video_id: '_fXQ8TquRWo' });
    player.getAudioTrack = () => ({ captionTracks: window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks });
    player.setOption = () => {};
    player.getOption = () => window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
    player.loadModule = () => {};
    player.unloadModule = () => {};
    player.setSize = (width, height) => { player.style.width = width + 'px'; player.style.height = height + 'px'; };
  </script>
</body>
</html>`;
}
