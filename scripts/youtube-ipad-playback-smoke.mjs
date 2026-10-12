import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { chromium, webkit } from 'playwright';

// Stream-free behavior fixture. Real controllers, annotation implementation,
// browser layout and native fullscreen; it does not prove physical iPad heat.
const bundle = await build({
    stdin: { contents: `import './src/reader/companions/annotations';
      import './src/reader/companions/register-aggregate-runtime-companions';
      import './src/reader/companions/register-aggregate-runtime-modules';
      export { ReaderApp } from './src/reader/app/main';
      export { collectSiteScanTargets } from './src/reader/app/site-parsers';
      export { SubtitlePlayerController } from './src/reader/subtitles/controller';
      export { DEFAULT_SETTINGS } from './src/reader/settings';
      export { collectFragmentTextTargetsIn, applyTokensToScanTarget, projectAdditiveTextMirrors } from './src/reader/dom';
      export { applyStableYouTubePlayerVideoSize, clearStableYouTubePlayerVideoSize } from './src/reader/subtitles/subtitle-video-inset';`,
      resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, format: 'iife', globalName: 'YomuPlaybackFixture', platform: 'browser',
    define: { 'import.meta.env': '{}', '__YOMU_VERSION__':'"fixture"', '__YOMU_NEWTAB_BUILD__':'false', '__YOMU_EXTENSION_BUILD__':'false' }, logLevel: 'silent',
});
const css = readFileSync('dist/yomu.css', 'utf8');
const artifacts = 'artifacts/youtube-ipad-playback';
mkdirSync(artifacts, { recursive: true });
const html = `<meta charset="utf-8"><style>${css}</style><style>
body { margin:0; background:#111; color:white; font:16px Arial,sans-serif; }
#movie_player { position:relative; width:880px; height:450px; background:#243341; }
.html5-video-container, video { position:absolute; width:100%; height:100%; }
.ytp-chrome-top { position:absolute; top:0; width:100%; height:48px; pointer-events:none; }
.ytp-title { padding:12px; }
.ytp-chrome-bottom { position:absolute; left:12px; bottom:0; height:44px; }
.ytp-progress-bar-container { height:12px; background:#c15; }
.ytp-settings-menu { position:absolute; right:30px; top:100px; width:300px; background:#222; }
[role=menuitem] { display:flex; justify-content:space-between; line-height:44px; padding:0 12px; }
button { font:inherit; padding:14px; }
ytd-watch-metadata { display:flex; gap:12px; padding-top:30px; }
.ytSpecButtonShapeNextButtonTextContent { display:block; }
</style><div id="movie_player" class="html5-video-player">
<div class="html5-video-container"><video></video></div>
<div class="ytp-chrome-top"><div class="ytp-title">A wide fullscreen video title that the よむ toolbar must not overlap</div></div>
<div class="ytp-caption-window-container">English native caption</div>
<div class="ytp-chrome-bottom" style="width:380px"><div class="ytp-progress-bar-container" style="width:356px"></div><button class="ytp-play-button">Play</button></div>
<div class="ytp-settings-menu"><div role="menuitem"><span class="ytp-menuitem-label">再生速度</span><span class="ytp-menuitem-content">標準</span></div>
<div role="menuitem"><span class="ytp-menuitem-label">画質</span><span class="ytp-menuitem-content">自動</span></div></div>
</div><ytd-watch-metadata><button><span class="ytSpecButtonShapeNextButtonTextContent">保存</span></button>
<button><span class="ytSpecButtonShapeNextButtonTextContent">質問する</span></button>
<button><span class="ytSpecButtonShapeNextButtonTextContent">チャンネル登録</span></button></ytd-watch-metadata>
<button id="fullscreen">Fullscreen fixture</button>`;

for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch();
    try {
        const page = await browser.newPage({ viewport: { width:1024, height:768 }, hasTouch:true });
        const errors = [];
        page.on('pageerror', error => { errors.push(error.message); console.error(`${engineName}: ${error.message}`); });
        await page.route('**/*', route => route.request().url().startsWith('https://www.youtube.com/watch?')
            ? route.fulfill({ contentType:'text/html', body:html }) : route.abort());
        await page.goto('https://www.youtube.com/watch?v=fixture123');
        await page.addScriptTag({ content:bundle.outputFiles[0].text });
        await page.evaluate(() => {
            const f = window.YomuPlaybackFixture;
            const settings = { ...f.DEFAULT_SETTINGS, interfaceLanguage:'en', annotationsPaused:true,
                subtitlePlayerEnabled:true, subtitleOverlayVisible:true, subtitleTranscriptVisible:false,
                subtitleControlsMode:'always', localDictionariesEnabled:false, apiKey:'' };
            const controller = new f.SubtitlePlayerController({ getSettings:()=>settings, parseJapanese:async()=>[], onSettingsChange:()=>{} });
            controller.install();
            controller.abortController = new AbortController();
            controller.bindInteractionEvents();
            const video = document.querySelector('video');
            Object.defineProperties(video, { currentTime:{ configurable:true, value:5 }, paused:{ configurable:true, value:true } });
            controller.video = video;
            controller.cues = [{ start:0, end:100, text:'英語の動画にも字幕を表示します。', transcriptEligible:true }];
            controller.currentCue = controller.cues[0];
            controller.refresh();
            document.querySelector('.ytp-progress-bar-container').addEventListener('click', event => {
                const box = event.currentTarget.getBoundingClientRect();
                window.seekFraction = (event.clientX-box.left)/box.width;
            });
            window.fixture = { controller, settings, video };
        });
        await page.waitForFunction(() => document.querySelector('.jpdb-subtitle-lines')?.textContent.includes('英語の動画'));
        const ownership = await page.evaluate(() => {
            const { controller, settings } = window.fixture;
            const visibleOwned = document.documentElement.classList.contains('jpdb-subtitle-yomu-captions-active');
            settings.subtitleOverlayVisible = false;
            controller.openLinesPanel();
            controller.refresh();
            return { visibleOwned, hiddenOwned:document.documentElement.classList.contains('jpdb-subtitle-yomu-captions-active'),
                nativeVisible:getComputedStyle(document.querySelector('.ytp-caption-window-container')).display !== 'none',
                transcriptVisible:!document.querySelector('.jpdb-subtitle-list').hidden };
        });
        assert(ownership.visibleOwned && !ownership.hiddenOwned && ownership.nativeVisible && ownership.transcriptVisible,
            `${engineName}: hidden overlay stole native captions ${JSON.stringify(ownership)}`);
        await page.evaluate(() => { window.fixture.controller.closeTranscriptPanel(); window.fixture.settings.subtitleOverlayVisible=true; window.fixture.controller.refresh(); });
        await page.waitForFunction(()=>!document.querySelector('.jpdb-subtitle-panel-closing'));

        for (const size of [420, 700, 880, null]) {
            await page.evaluate(size => {
                const f = window.YomuPlaybackFixture;
                if (size === null) f.clearStableYouTubePlayerVideoSize();
                else {
                    f.applyStableYouTubePlayerVideoSize(window.fixture.video, size, 450);
                    const observer=new MutationObserver(()=>{});
                    observer.observe(document.documentElement, {attributes:true, attributeFilter:['class']});
                    for(let i=0;i<100;i++) f.applyStableYouTubePlayerVideoSize(window.fixture.video, size, 450);
                    const records=observer.takeRecords();
                    observer.disconnect();
                    if(records.length) throw Error('Stationary player sizing rewrote its document class');
                }
            }, size);
            const boxes = await page.evaluate(() => {
                const player = document.querySelector('#movie_player').getBoundingClientRect();
                const bar = document.querySelector('.ytp-progress-bar-container').getBoundingClientRect();
                return { player:player.width, bar:bar.width, x:bar.left+bar.width*.9, y:bar.top+bar.height/2 };
            });
            assert(Math.abs(boxes.bar-(boxes.player-24)) < 1, `${engineName}: stale seek width ${JSON.stringify(boxes)}`);
            await page.touchscreen.tap(boxes.x, boxes.y);
            const seek = await page.evaluate(({x,y})=>({ fraction:window.seekFraction, hit:document.elementFromPoint(x,y)?.outerHTML.slice(0,300), width:document.querySelector('.ytp-progress-bar-container').getBoundingClientRect().width }), boxes);
            assert(Math.abs(seek.fraction-.9) < .02, `${engineName}: right side of seekbar was not tappable ${JSON.stringify({boxes,seek})}`);
        }

        await page.evaluate(() => {
            const f = window.YomuPlaybackFixture;
            const readings = { 保存:'ほぞん', 質問する:'しつもんする', チャンネル登録:'とうろく', 再生速度:'さいせいそくど', 標準:'ひょうじゅん', 画質:'がしつ', 自動:'じどう' };
            const settings = { ...f.DEFAULT_SETTINGS, annotationsPaused:false, showFurigana:true, furiganaMode:'all' };
            const targets = f.collectSiteScanTargets(80, location.href) ?? [];
            window.actionCounts = {};
            for (const target of targets) {
                const text = target.text;
                if (!readings[text]) continue;
                const card = { vid:1, sid:1, rid:0, spelling:text, reading:readings[text], meanings:[{glosses:['fixture'],partOfSpeech:['n']}],
                    frequencyRank:null, partOfSpeech:['n'], cardState:['not-in-deck'], pitchAccent:[], wordWithReading:null };
                f.applyTokensToScanTarget({ ...target, nonDestructive:true, passiveInteraction:true },
                    [{ card, start:0, end:text.length, length:text.length, rubies:[], pitchClass:'unknown', sentence:text }], settings);
            }
            for (const control of document.querySelectorAll('ytd-watch-metadata button, [role=menuitem]')) {
                const text = [...control.childNodes].filter(node=>!node.classList?.contains('jpdb-reader-text-mirror')).map(node=>node.textContent).join('');
                control.dataset.nativeAction = text;
                control.addEventListener('click', ()=>window.actionCounts[text]=(window.actionCounts[text]??0)+1);
            }
            const app=new f.ReaderApp();
            app.settings={...settings, interfaceLanguage:'en', popupMode:'sheet'};
            app.subtitles=window.fixture.controller;
            app.bindEvents();
            window.fixture.app=app;
            f.projectAdditiveTextMirrors(document);
            document.querySelector('#fullscreen').onclick = () => document.querySelector('#movie_player').requestFullscreen();
        });
        await page.waitForFunction(() => [...document.querySelectorAll('[data-yomu-projected-reading]')].some(e=>getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden'));
        for (const label of ['保存', '質問する', 'チャンネル登録']) {
            const button = page.locator('ytd-watch-metadata button').filter({ has:page.locator('.ytSpecButtonShapeNextButtonTextContent', { hasText:label }) });
            assert(await button.locator('.jpdb-reader-word').count() > 0, `${engineName}: missing ${label} annotations`);
            await button.tap();
        }
        await page.locator('#fullscreen').click();
        await page.waitForFunction(() => Boolean(document.fullscreenElement));
        await page.waitForFunction(()=>document.fullscreenElement.contains(document.querySelector('.jpdb-subtitle-player')));
        const railPlacement = await page.evaluate(()=>{
            const rail=document.querySelector('.jpdb-subtitle-rail').getBoundingClientRect();
            const title=document.querySelector('.ytp-title').getBoundingClientRect();
            return { rail:rail.toJSON(), title:title.toJSON(), overlap:rail.right>title.left && title.right>rail.left && rail.bottom>title.top && title.bottom>rail.top };
        });
        assert(!railPlacement.overlap, `${engineName}: fullscreen toolbar covers title ${JSON.stringify(railPlacement)}`);
        await page.waitForFunction(() => {
            const fullscreen = document.fullscreenElement;
            return [...fullscreen.querySelectorAll('[data-yomu-projected-reading]')].some(e=>getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden');
        });
        const fullscreenProbe = await page.evaluate(() => {
            const readings = [...document.fullscreenElement.querySelectorAll('[data-yomu-projected-reading]')].filter(e=>getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden');
            return readings.map(e=>{
                const base = [...document.querySelectorAll('.ytp-menuitem-label, .ytp-menuitem-content')].find(label=>label.querySelector('.jpdb-reader-detached-furi')?.textContent===e.textContent);
                const range = document.createRange();
                range.selectNodeContents(base.firstChild);
                return { text:e.textContent, size:parseFloat(getComputedStyle(e).fontSize), parentInFullscreen:document.fullscreenElement.contains(e),
                    transform:getComputedStyle(e).transform, rect:e.getBoundingClientRect().toJSON(), base:range.getBoundingClientRect().toJSON() };
            });
        });
        assert(fullscreenProbe.some(reading=>reading.text==='さいせいそくど'), `${engineName}: fullscreen menu lost furigana`);
        assert.deepEqual(fullscreenProbe.map(reading=>reading.text).sort(), ['さいせいそくど','ひょうじゅん','がしつ','じどう'].sort(), `${engineName}: fullscreen menu lost a reading`);
        assert(fullscreenProbe.every(reading=>reading.size>=10), `${engineName}: unreadable tiny reading`);
        for (const reading of fullscreenProbe) {
            const { rect, base } = reading;
            assert(rect.width>0 && rect.height>=9 && rect.left>=0 && rect.right<=1024 && rect.top>=0,
                `${engineName}: clipped or invisible reading ${JSON.stringify(reading)}`);
            assert(rect.bottom<=base.top+3.5 && Math.abs((rect.left+rect.right)-(base.left+base.right))<8,
                `${engineName}: reading overlaps or drifts from label ${JSON.stringify(reading)}`);
            const scaleX = reading.transform==='none' ? 1 : Number(reading.transform.match(/^matrix\(([^,]+)/)?.[1]);
            assert(scaleX>=.8, `${engineName}: reading condensed below legibility floor`);
        }
        await page.locator('[role=menuitem]').filter({ has:page.locator('.ytp-menuitem-label', { hasText:'再生速度' }) }).tap();
        await page.screenshot({ path:`${artifacts}/${engineName}-fullscreen-fixture.png` });
        await page.evaluate(()=>document.exitFullscreen());
        await page.waitForFunction(()=>!document.fullscreenElement);
        await page.waitForFunction(()=>!document.querySelector('#movie_player .jpdb-reader-detached-reading-scroll-layer'));
        const counts = await page.evaluate(()=>window.actionCounts);
        assert(Object.values(counts).every(count=>count===1) && Object.keys(counts).length===4, `${engineName}: native taps changed ${JSON.stringify(counts)}`);
        await page.evaluate(()=>{
            const { video, controller, settings } = window.fixture;
            let paused = false;
            window.videoPlays=0;
            window.videoPauses=0;
            Object.defineProperties(video, {
                paused:{ configurable:true, get:()=>paused },
                play:{ configurable:true, value:async()=>{paused=false;window.videoPlays++;video.dispatchEvent(new Event('play'));} },
                pause:{ configurable:true, value:()=>{paused=true;window.videoPauses++;video.dispatchEvent(new Event('pause'));} },
            });
            const app = window.fixture.app;
            app.settings = { ...settings, popupMode:'sheet', subtitleMiningPause:true, subtitleHoverPause:true };
            app.subtitles = controller;
            const word = document.createElement('span');
            word.className='jpdb-reader-word';
            word.textContent='読む';
            document.querySelector('.jpdb-subtitle-lines').append(word);
            const popover=document.createElement('div');
            popover.className='jpdb-reader-popover';
            popover.textContent='Dictionary fixture';
            app.mountPopover(popover, word, {mode:'modal', focusOnMount:false});
            const range=document.createRange();
            range.selectNodeContents(word);
            document.getSelection().addRange(range);
            document.querySelector('.ytp-play-button').onclick=()=>video.paused ? void video.play() : video.pause();
            window.fixture.app=app;
        });
        assert.equal(await page.evaluate(()=>window.videoPauses), 1, `${engineName}: lookup did not pause`);
        await page.locator('.ytp-play-button').tap();
        const play = await page.evaluate(()=>({paused:window.fixture.video.paused, plays:window.videoPlays, pauses:window.videoPauses, popup:document.querySelector('.jpdb-reader-popover')!==null}));
        assert.deepEqual(play, {paused:false, plays:1, pauses:1, popup:false}, `${engineName}: native play was toggled twice or re-paused`);
        await page.evaluate(()=>window.fixture.app.destroy());
        assert.equal(await page.locator('html.jpdb-subtitle-youtube-fluid-controls').count(), 0, `${engineName}: fluid layout leaked after teardown`);
        assert.deepEqual(errors, [], `${engineName}: browser errors`);
        console.log(`${engineName}: caption ownership, fluid seek width/taps, watch labels and fullscreen readings passed`);
    } finally { await browser.close(); }
}
