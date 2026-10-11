import assert from 'node:assert/strict';
import sharp from 'sharp';
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
for (const pageZoom of [1, 1.6]) {
for (const [name, type] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await type.launch();
    try {
        const page = await browser.newPage(pageZoom===1 ? {viewport:{width:390,height:700},hasTouch:true} : {viewport:{width:760,height:980},hasTouch:true,isMobile:true,userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
        await page.route('http*/**', route=>route.abort());
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', event=>{ if(event.type()==='error') console.error(event.text()); });
        await page.setContent(`${pageZoom===1 ? '' : '<meta name="viewport" content="width=475">'}<style>${css}</style><style>
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
        await page.addStyleTag({content: '.jpdb-reader-puck-viewport > .jpdb-reader-fab { background:rgb(1,255,0)!important; opacity:1!important; border:0!important; box-shadow:none!important; transform:none!important; } .jpdb-reader-fab-state {display:none!important;}'});
        await paintPuck(page);
        const startPixels=await puckPixels(page);
        const fit=await page.evaluate(()=>outerWidth/innerWidth);
        const pinch = await page.evaluate(async () => {
            window.scrollTo(0,0);
            const button = document.querySelector('.jpdb-reader-fab');
            const raw=button.getBoundingClientRect();
            const startRatio=button.parentElement.getBoundingClientRect().width/button.parentElement.offsetWidth;
            const initialFit=outerWidth/innerWidth;
            const startScale=Math.abs(startRatio-1/initialFit)<Math.abs(startRatio-1)?initialFit:1;
            const start={x:raw.x*startScale,y:raw.y*startScale,width:raw.width*startScale,height:raw.height*startScale};
            const native=window.visualViewport;
            const fit=outerWidth/innerWidth;
            const visual = Object.assign(new EventTarget(), { width:innerWidth/2, height:(native?.height??innerHeight)/2, scale:fit*2, offsetLeft:35, offsetTop:60 });
            Object.defineProperty(window, 'visualViewport', { configurable:true, value:visual });
            // Remount so controller listeners own this fixture's event source.
            window.fixtureCleanup();
            const { FloatingButtonController, DEFAULT_SETTINGS } = window.YomuViewportFixture;
            const no = () => {};
            const puck = new FloatingButtonController();
            puck.install({ ...DEFAULT_SETTINGS, showFloatingButton:true }, no, { openSettings:no,openStudyPage:no,cyclePowerState:async()=>{},powerState:()=> 'on',isPaused:()=>false,toggleOcrMode:no,ocrMode:()=> 'off',toggleAutoPlayAudio:async()=>{},isAutoPlayAudioEnabled:()=>false,toggleJapaneseSiteLanguage:no,isYouTube:()=>false,toggleYoutubeFilter:no,isYoutubeFilterEnabled:()=>false,toggleAutoSubtitles:no,isAutoSubtitlesEnabled:()=>false,hasSubtitleVideo:()=>false });
            await new Promise(requestAnimationFrame);
            const read = () => {
                const button=document.querySelector('.jpdb-reader-fab');
                const r=button.getBoundingClientRect();
                const plane=button.parentElement;
                const ratio=plane.getBoundingClientRect().width/plane.offsetWidth;
                const rectScale=Math.abs(ratio-1/(fit*2))<Math.abs(ratio-1)?fit*2:1;
                return { x:r.x*rectScale-visual.offsetLeft*fit*2, y:r.y*rectScale-visual.offsetTop*fit*2, width:r.width*rectScale, height:r.height*rectScale };
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
            assert(Math.abs(pinch.zoomed[key]-pinch.start[key])<=1, `${name}: pinch changes puck ${key}: ${JSON.stringify(pinch)}`);
            assert(Math.abs(pinch.panned[key]-pinch.start[key])<=1, `${name}: pan changes puck ${key}`);
        }
        await paintPuck(page);
        const pannedPixels=await puckPixels(page);
        for (const key of ['x','y','width','height']) {
            const rendered=['x','y'].includes(key) ? (pannedPixels[key]-({x:90,y:110}[key])*fit)*2 : pannedPixels[key]*2;
            assert(Math.abs(rendered-startPixels[key])<=2, `${name}: rendered puck pixels drift for ${key}`);
        }
        await page.mouse.click((pannedPixels.x+pannedPixels.width/2)/fit,(pannedPixels.y+pannedPixels.height/2)/fit);
        await page.locator('.jpdb-reader-fab-radial.is-open').waitFor();
        // WebKit can start a staggered transition after the first paint. Wait
        // for the animation lifecycle, then independently assert physical bounds.
        await page.waitForFunction(() => {
            const items=[...document.querySelectorAll('.jpdb-reader-fab-radial-item')];
            return items.length>0 && items.every(item => item.getAnimations().every(animation => !animation.pending && animation.playState!=='running'));
        });
        const menu = await page.evaluate(() => {
            const v=window.pinchFixture.visual;
            const fit=outerWidth/innerWidth;
            const plane=document.querySelector('.jpdb-reader-puck-viewport');
            const ratio=plane.getBoundingClientRect().width/plane.offsetWidth;
                const rectScale=Math.abs(ratio-1/(fit*2))<Math.abs(ratio-1)?fit*2:1;
            return [...document.querySelectorAll('.jpdb-reader-fab-radial-item')].map(e=>{
                const r=e.getBoundingClientRect();
                const x=r.x*rectScale-v.offsetLeft*fit*2, y=r.y*rectScale-v.offsetTop*fit*2;
                const hit=document.elementFromPoint((r.x+r.width/2)*rectScale/(fit*2),(r.y+r.height/2)*rectScale/(fit*2));
                return {x,y,width:r.width*rectScale,height:r.height*rectScale,hit:hit?.closest('.jpdb-reader-fab-radial-item')===e};
            });
        });
        assert(menu.length>=5, `${name}: pinch menu did not open`);
        for (const item of menu) {
            assert(item.hit, `${name}: menu has an incorrect click target`);
            assert(item.width>=45 && item.width<=56, `${name}: pinch magnifies menu button: ${JSON.stringify(item)}`);
            assert(item.x>=0 && item.y>=0 && item.x+item.width<=startPixels.x+startPixels.width+15 && item.y+item.height<=startPixels.y+startPixels.height+15, `${name}: pinch menu leaves visible viewport`);
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
        console.log(`${name} page-fit=${pageZoom}: PASS one foreground OCR owner; synchronous scroll registration; rendered glyph scroll registration; pinch/pan puck and menu geometry/teardown`);
    } finally { await browser.close(); }
}

}

async function puckPixels(page) {
    const {data,info}=await sharp(await page.screenshot()).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let left=info.width,top=info.height,right=-1,bottom=-1;
    for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) {
        const i=(y*info.width+x)*4;
        if(data[i]<15&&data[i+1]>240&&data[i+2]<15) { left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y); }
    }
    if(right<left) console.error(await page.evaluate(()=>{const b=document.querySelector('.jpdb-reader-fab'),s=getComputedStyle(b);return {box:b.getBoundingClientRect().toJSON(),bg:s.backgroundColor,opacity:s.opacity,display:s.display,style:b.style.cssText}}));
    assert(right>=left,'Puck did not paint its fixture colour');
    return {x:left,y:top,width:right-left+1,height:bottom-top+1};
}

async function paintPuck(page) {
    await page.evaluate(()=>{
        const b=document.querySelector('.jpdb-reader-fab');
        for(const [key,value] of Object.entries({background:'rgb(1,255,0)',opacity:'1',border:'0', 'box-shadow':'none',transform:'none',transition:'none'})) b.style.setProperty(key,value,'important');
        b.querySelector('.jpdb-reader-fab-state').style.setProperty('display','none','important');
    });
}
