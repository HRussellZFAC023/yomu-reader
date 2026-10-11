import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { chromium, webkit } from 'playwright';

// Behavioral fixture: real engines and production controllers/CSS; no OCR upload.
// A synchronous scroll probe runs before scroll handlers can repair geometry.
const bundle = await build({
    stdin: { contents: `export { ImageOcrController } from './src/reader/ocr/controller';
      export { FloatingButtonController } from './src/reader/ui/floating-button';
      export { DEFAULT_SETTINGS } from './src/reader/settings';`, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, format: 'iife', globalName: 'YomuViewportFixture', platform: 'browser', define: { 'import.meta.env': '{}' }, logLevel:'silent',
});
const css = readFileSync('dist/yomu.css', 'utf8');
for (const [name, type] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await type.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 700 }, hasTouch: true });
        await page.route('http*/**', route=>route.abort());
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', event=>{ if(event.type()==='error') console.error(event.text()); });
        await page.setContent(`<style>${css}</style><style>
          body { margin:0; padding-top:100px; min-height:2400px; }
          .media { position:relative; width:330px; height:260px; margin:0 30px; }
          img { position:absolute; width:330px; height:260px; }
          #backdrop { transform:scale(1.2); filter:blur(24px); opacity:.3; }
        </style><div class="media"><img id="backdrop"><img id="foreground"></div>`);
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
        await page.evaluate(() => {
            const { DEFAULT_SETTINGS, ImageOcrController, FloatingButtonController } = window.YomuViewportFixture;
            const settings = { ...DEFAULT_SETTINGS, ocrEnabled:true, ocrAutoScanImages:true,
                ocrMinImageArea:1, ocrShowTextOverlay:true, ocrProvider:'google-lens', showFloatingButton:true };
            for (const image of document.images) {
                image.dataset.ocrLines = JSON.stringify([{ text:'日本語を読む', box:{ left:.1, top:.2, width:.7, height:.15 } }]);
                image.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="660" height="520"><rect width="660" height="520" fill="white"/></svg>');
            }
            const ocr = new ImageOcrController({ getSettings:()=>settings, parseJapanese:async(text)=>{ window.ocrParses=(window.ocrParses??0)+1; return [{ card:{vid:1,sid:1,rid:0,spelling:text,reading:'にほんごをよむ',meanings:[{glosses:['read Japanese'],partOfSpeech:['n']}],frequencyRank:null,partOfSpeech:['n'],cardState:['not-in-deck'],pitchAccent:[],wordWithReading:null},start:0,end:text.length,length:text.length,rubies:[],pitchClass:'unknown',sentence:text }]; }, onToast:()=>{}, shouldAutoScan:()=>true });
            ocr.init();
            const puck = new FloatingButtonController();
            const no = () => {};
            puck.install(settings, no, { openSettings:no, openStudyPage:no, cyclePowerState:async()=>{}, powerState:()=> 'on', isPaused:()=>false,
                toggleOcrMode:no, ocrMode:()=> 'auto', toggleAutoPlayAudio:async()=>{}, isAutoPlayAudioEnabled:()=>false,
                toggleJapaneseSiteLanguage:no, isYouTube:()=>false, toggleYoutubeFilter:no, isYoutubeFilterEnabled:()=>false,
                toggleAutoSubtitles:no, isAutoSubtitlesEnabled:()=>false, hasSubtitleVideo:()=>false });
            window.fixtureCleanup = () => { ocr.destroy(); puck.destroy(); };
        });
        try { await page.locator('.jpdb-ocr-video-frame-status:not([hidden])').waitFor({timeout:5000}); } catch (error) {
            console.error(name, errors, await page.evaluate(()=>({images:[...document.images].map(e=>({naturalWidth:e.naturalWidth,attempt:e.dataset.ocrAttemptKey})),layers:[...document.querySelectorAll('.jpdb-ocr-layer')].map(e=>e.outerHTML)})));
            throw error;
        }
        await page.locator('.jpdb-ocr-layer:not([hidden]) .jpdb-ocr-line').click();
        await page.locator('.jpdb-ocr-layer:not([hidden]) .jpdb-ocr-line-text').waitFor();
        const before = await page.evaluate(() => {
            const dots = [...document.querySelectorAll('.jpdb-ocr-video-frame-status')].filter(e=>!e.hidden);
            const layers = [...document.querySelectorAll('.jpdb-ocr-layer')].filter(e=>!e.hidden);
            const image = document.querySelector('#foreground').getBoundingClientRect();
            return { dots:dots.length, layers:layers.length, offset:dots[0].getBoundingClientRect().top-image.top,
                text:layers[0].querySelector('.jpdb-ocr-line').dataset.ocrText, glyphTop:layers[0].querySelector('.jpdb-ocr-line-text').getBoundingClientRect().top-image.top,
                modes: [...dots,...layers].map(e=>getComputedStyle(e).position), height:document.documentElement.scrollHeight };
        });
        assert.equal(before.dots, 1, `${name}: blurred backdrop owns a duplicate dot`);
        assert(before.text.includes('日本語を読む'), `${name}: no rendered OCR glyphs`);
        assert.equal(before.layers, 1, `${name}: blurred backdrop owns duplicate text`);
        assert(before.modes.every(mode=>mode==='absolute'), `${name}: ordinary OCR is viewport tracked`);
        const shifted = await page.evaluate(() => {
            window.scrollTo(0, 180);
            const image = document.querySelector('#foreground').getBoundingClientRect();
            const dot = document.querySelector('.jpdb-ocr-video-frame-status:not([hidden])').getBoundingClientRect();
            const layer = document.querySelector('.jpdb-ocr-layer:not([hidden])').getBoundingClientRect();
            const glyph=document.querySelector('.jpdb-ocr-layer:not([hidden]) .jpdb-ocr-line-text').getBoundingClientRect();
            return { glyphTop:glyph.top-image.top, dotOffset:dot.top-image.top, layerOffset:layer.top-image.top, height:document.documentElement.scrollHeight };
        });
        assert(Math.abs(shifted.dotOffset-before.offset)<.5, `${name}: dot drifts before scroll callback`);
        assert(Math.abs(shifted.layerOffset)<.5, `${name}: OCR text drifts before scroll callback`);
        assert(Math.abs(shifted.glyphTop-before.glyphTop)<.5, `${name}: rendered glyphs drift before scroll callback`);
        assert.equal(shifted.height, before.height, `${name}: overlay changes document extent`);
        const parseCount=await page.evaluate(()=>window.ocrParses);
        await page.waitForFunction(()=>!document.querySelector('.jpdb-ocr-video-frame-status'));
        await page.locator('#foreground').click({position:{x:300,y:200}});
        await page.waitForTimeout(100);
        const reused=await page.evaluate(()=>({parses:window.ocrParses,dots:document.querySelectorAll('.jpdb-ocr-video-frame-status').length}));
        assert.equal(reused.parses,parseCount, `${name}: tap re-parses scanned image`);
        assert.equal(reused.dots,0, `${name}: tap resurrects ready dot`);
        // Deterministic pinch metrics, since Playwright WebKit cannot drive a real iOS pinch.
        // Applying those metrics exercises the real rendering/containing block, not just arithmetic.
        const pinch = await page.evaluate(async () => {
            window.scrollTo(0,0);
            const button = document.querySelector('.jpdb-reader-fab');
            const start = button.getBoundingClientRect();
            const visual = Object.assign(new EventTarget(), { width:195, height:350, scale:2, offsetLeft:35, offsetTop:60 });
            Object.defineProperty(window, 'visualViewport', { configurable:true, value:visual });
            // Remount so controller listeners own this fixture's event source.
            window.fixtureCleanup();
            const { FloatingButtonController, DEFAULT_SETTINGS } = window.YomuViewportFixture;
            const no = () => {};
            const puck = new FloatingButtonController();
            puck.install({ ...DEFAULT_SETTINGS, showFloatingButton:true }, no, { openSettings:no,openStudyPage:no,cyclePowerState:async()=>{},powerState:()=> 'on',isPaused:()=>false,toggleOcrMode:no,ocrMode:()=> 'off',toggleAutoPlayAudio:async()=>{},isAutoPlayAudioEnabled:()=>false,toggleJapaneseSiteLanguage:no,isYouTube:()=>false,toggleYoutubeFilter:no,isYoutubeFilterEnabled:()=>false,toggleAutoSubtitles:no,isAutoSubtitlesEnabled:()=>false,hasSubtitleVideo:()=>false });
            await new Promise(requestAnimationFrame);
            const read = () => {
                const r = document.querySelector('.jpdb-reader-fab').getBoundingClientRect();
                return { x:(r.x-visual.offsetLeft)*visual.scale, y:(r.y-visual.offsetTop)*visual.scale, width:r.width*visual.scale, height:r.height*visual.scale };
            };
            const zoomed = read();
            Object.assign(visual,{ offsetLeft:90,offsetTop:110 });
            visual.dispatchEvent(new Event('scroll'));
            await new Promise(requestAnimationFrame);
            const panned = read();
            window.pinchFixture={ visual,puck };
            return { start:{ x:start.x,y:start.y,width:start.width,height:start.height }, zoomed,panned, roots:document.querySelectorAll('.jpdb-reader-puck-viewport').length };
        });
        for (const key of ['x','y','width','height']) {
            assert(Math.abs(pinch.zoomed[key]-pinch.start[key])<.5, `${name}: pinch changes puck ${key}: ${JSON.stringify(pinch)}`);
            assert(Math.abs(pinch.panned[key]-pinch.start[key])<.5, `${name}: pan changes puck ${key}`);
        }
        await page.locator('.jpdb-reader-fab').click();
        await page.locator('.jpdb-reader-fab-radial.is-open').waitFor();
        // WebKit can start a staggered transition after the first paint. Wait
        // for the animation lifecycle, then independently assert physical bounds.
        await page.waitForFunction(() => {
            const items=[...document.querySelectorAll('.jpdb-reader-fab-radial-item')];
            return items.length>0 && items.every(item => item.getAnimations().every(animation => !animation.pending && animation.playState!=='running'));
        });
        const menu = await page.evaluate(() => {
            const v=window.pinchFixture.visual;
            return [...document.querySelectorAll('.jpdb-reader-fab-radial-item')].map(e=>{
                const r=e.getBoundingClientRect();
                return { x:(r.x-v.offsetLeft)*v.scale, y:(r.y-v.offsetTop)*v.scale, width:r.width*v.scale,height:r.height*v.scale };
            });
        });
        assert(menu.length>=5, `${name}: pinch menu did not open`);
        for (const item of menu) {
            assert(item.width>=45 && item.width<=56, `${name}: pinch magnifies menu button: ${JSON.stringify(item)}`);
            assert(item.x>=0 && item.y>=0 && item.x+item.width<=391 && item.y+item.height<=701, `${name}: pinch menu leaves visible viewport`);
        }
        const cleanup = await page.evaluate(() => {
            const { visual,puck }=window.pinchFixture;
            visual.offsetLeft+=10;
            visual.dispatchEvent(new Event('scroll'));
            const closing=document.querySelector('.jpdb-reader-fab-radial')?.classList.contains('is-closing');
            puck.destroy();
            return { closing, roots:document.querySelectorAll('.jpdb-reader-puck-viewport').length, menus:document.querySelectorAll('.jpdb-reader-fab-radial').length };
        });
        assert(cleanup.closing, `${name}: menu remains open during pinch pan`);
        assert.equal(cleanup.roots,0, `${name}: puck viewport leaks after teardown`);
        assert.equal(cleanup.menus,0, `${name}: menu leaks after teardown`);
        const sheetVisibility = await page.evaluate(() => {
            const root=document.createElement('div');
            root.className='jpdb-subtitle-player jpdb-subtitle-fullscreen jpdb-subtitle-has-video-frame';
            root.innerHTML='<div class="jpdb-subtitle-text"><button class="jpdb-subtitle-drag-handle">Move</button></div><div class="jpdb-subtitle-rail"><button>Next</button></div>';
            document.body.append(root);
            document.documentElement.classList.add('jpdb-subtitle-yt-sheet-open');
            const covered=[...root.children].map(e=>getComputedStyle(e).display);
            document.documentElement.classList.remove('jpdb-subtitle-yt-sheet-open');
            const restored=[...root.children].map(e=>getComputedStyle(e).display);
            root.remove();
            return {covered,restored};
        });
        assert(sheetVisibility.covered.every(display=>display==='none'), `${name}: Shorts controls cover comments`);
        assert(sheetVisibility.restored.every(display=>display!=='none'), `${name}: Shorts controls fail to return`);
        assert.deepEqual(errors, [], `${name}: browser errors`);
        console.log(`${name}: PASS one foreground OCR owner; synchronous scroll registration; rendered glyph scroll registration; pinch/pan puck and menu geometry/teardown`);
    } finally { await browser.close(); }
}
