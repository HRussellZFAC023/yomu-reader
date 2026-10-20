import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, webkit, devices } from 'playwright';
import sharp from 'sharp';
import { openRecordedPage } from './lib/recorded-page.mjs';
import { createReaderSmokeSettings, mockJpdbApiRequest } from './lib/smoke-harness.mjs';

// Built userscript + its declared @require/@resource graph, on a recorded
// YouTube page. Caption timings and modal controls are mechanism fixtures.
// Screenshots here are evidence of behavior/contrast, not product screenshots.
const out = 'artifacts/subtitle-stability';
mkdirSync(out, { recursive: true });
const vocabulary = [['日本語', '日本語', 'にほんご', 'Japanese', ['noun'], 1, ['new'], [0]]];
const ja = Array.from({ length: 10 }, (_, index) => index===4||index===9 ? '日本語を毎日読んでいる友達と日本語の本を図書館でゆっくり楽しく読みます。' : index % 2 ? 'かなだけです。' : '日本語です。');
const track = lang => ({ wireMagic:'pb3', events:ja.map((text, i) => ({ tStartMs:1000+i*2000, dDurationMs:2000,
    segs:[{ utf8:lang === 'en' ? (i===4||i===9 ? 'I read Japanese books slowly and happily at the library with a friend who reads Japanese every day.' : i % 2 ? 'This sentence is written using kana only.' : 'This sentence is written in Japanese.') : text }] })) });
const response = value => ({ status:200, contentType:'application/json', body:JSON.stringify(value) });
const parserSettings = {
    learningTargetChosen: true,
    activeLanguageProfileId: 'subtitle-stability-ja',
    languageProfiles: [{schemaVersion: 2, id: 'subtitle-stability-ja', outputLanguage: 'en', learnerLanguage: 'en',
        targetLanguage: 'ja', uiLocale: 'en', parserProvider: 'jpdb',
        dictionaries: {installed: [], enabled: [], order: []}, definitionTranslationProviderIds: []}],
};
const summaries = [];
for (const [name, engine] of [['webkit', webkit], ['chromium', chromium]]) {
    const browser = await engine.launch();
    const calls = [];
    let run;
    try {
        run = await openRecordedPage({ browser, slug:'youtube-watch', navigate:false,
            contextOptions:{ ...devices['iPad Pro 11'], viewport:{ width:834, height:1194 } },
            hostOptions:{ autoplay:false },
            settings:createReaderSmokeSettings({ ...parserSettings, parserProvider:'jpdb', subtitleOverlayVisible:true, subtitleOverlayVisibleChosen:true,
                subtitleSecondaryVisible:true, subtitleSecondaryVisibleChosen:true, subtitleNativeBlurred:false,
                subtitleControlsMode:'always', subtitleKaraokeMode:false, subtitleHoverPause:false, subtitleTextColor:'#ffffff',
                subtitleTextColorSource:'off', wordTextColorSource:'off', wordUnderlineColorSource:'off', wordHighlightColorSource:'off' }),
            onGmRequest: async request => {
                if (request.url.includes('/api/timedtext')) return response(track(new URL(request.url).searchParams.get('tlang')));
                if (request.url.includes('/api/v1/parse')) await new Promise(resolve=>setTimeout(resolve, 200));
                const mock = mockJpdbApiRequest(request, calls, vocabulary);
                return mock ? { status:mock.status ?? 200, contentType:mock.contentType ?? 'application/json', body:mock.responseText } : undefined;
            },
        });
        const { page, context } = run;
        page.setDefaultTimeout(60_000);
        // The supplied cues are manual fixtures, not ASR rollup snapshots.
        // Feed the same stream and metadata to the native player mechanism.
        await context.addInitScript(nativeTrack => {
            let install;
            Object.defineProperty(window, '__yomuRecordedYouTubePlayer', {
                configurable: true,
                set: value => { install = value; },
                get: () => config => {
                    const list = config.player.captions.playerCaptionsTracklistRenderer;
                    list.captionTracks = list.captionTracks.map(({ kind, ...track }) => ({ ...track,
                        baseUrl: track.baseUrl.replace(/&(kind|caps)=asr/g, ''), vssId: '.ja', name: { simpleText: 'Japanese' } }));
                    return install.call(window, { ...config, nativeTrack });
                },
            });
        }, track('ja'));
        await context.route('**/api/timedtext?**', route => route.fulfill(response(track(new URL(route.request().url()).searchParams.get('tlang')))));
        await page.goto(run.recording.manifest.url,{waitUntil:'domcontentloaded'});
        // The recording redacted the viewport grammar along with page text.
        // Restore this structural metadata before mobile touch/pixel checks.
        await page.locator('meta[name="viewport"]').evaluate(meta => { meta.content = 'width=device-width, initial-scale=1'; });
        await page.waitForFunction(() => Math.abs((visualViewport?.scale ?? 1) - 1) < .001);
        // The saved page contains an open site dialog. Use controlled modal
        // fixtures below so baseline and pixel checks have uncovered text.
        await page.evaluate(()=>document.querySelectorAll('[role=dialog],tp-yt-paper-dialog,ytd-popup-container,tp-yt-iron-dropdown,tp-yt-iron-overlay-backdrop').forEach(e=>{if(!e.closest('[data-jpdb-reader-root]'))e.remove();}));
        await page.waitForSelector('video');
        await page.evaluate(() => { const v=document.querySelector('video');v.pause();v.currentTime=1.3; });
        await page.waitForSelector('.jpdb-subtitle-primary .jpdb-reader-furi', { timeout:60_000 });
        const typography=await page.evaluate(()=>{
            const primary=getComputedStyle(document.querySelector('.jpdb-subtitle-primary'));
            const secondary=getComputedStyle(document.querySelector('.jpdb-subtitle-secondary'));
            const native=document.querySelector('.ytp-caption-segment')??document.querySelector('.caption-visual-line')??document.querySelector('.captions-text');
            return{main:parseFloat(primary.fontSize),translation:parseFloat(secondary.fontSize),weight:Number(secondary.fontWeight),native:native?parseFloat(getComputedStyle(native).fontSize):null};
        });
        assert(typography.translation>=typography.main*.75&&typography.weight>=700,`${name}: small or thin translation ${JSON.stringify(typography)}`);
        await page.evaluate(()=>{
            window.captionNativeClicks=0;
            document.querySelector('#movie_player').addEventListener('click',()=>window.captionNativeClicks++);
        });
        await page.locator('.jpdb-subtitle-primary .jpdb-reader-word').first().tap();
        await page.waitForSelector('.jpdb-reader-popover');
        assert.equal(await page.evaluate(()=>window.captionNativeClicks),0,`${name}: lookup tap reached native playback`);
        const lookupPoint=await page.locator('.jpdb-subtitle-primary .jpdb-reader-word').first().evaluate(e=>{const r=e.getBoundingClientRect();return{x:r.left+r.width/2,y:r.bottom-4};});
        const popupStack=await page.locator('.jpdb-reader-popover').evaluate((popover,{x,y})=>{
            const saved=popover.style.cssText;
            try {
                for(const [key,value] of Object.entries({position:'fixed',inset:'auto',left:`${x-100}px`,top:`${y-70}px`,width:'220px',height:'130px',transform:'none'})) popover.style.setProperty(key,value,'important');
                const scope=popover.getRootNode();
                const hit=scope.elementFromPoint(x,y);
                let outer=popover;
                while(outer.getRootNode() instanceof ShadowRoot) outer=outer.getRootNode().host;
                const documentHit=document.elementFromPoint(x,y);
                return{above:popover.contains(hit)&&(outer.contains(documentHit)||outer===documentHit),
                    root:scope instanceof ShadowRoot?'shadow':'document',rect:popover.getBoundingClientRect().toJSON(),
                    hit:documentHit?.tagName,z:getComputedStyle(popover).zIndex};
            } finally {popover.style.cssText=saved;}
        },lookupPoint);
        assert(popupStack.above,`${name}: caption covers its lookup popover ${JSON.stringify(popupStack)}`);
        await page.keyboard.press('Escape');
        await page.waitForSelector('.jpdb-reader-popover',{state:'hidden'});
        // Return to the video after the independent lookup interaction.
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.evaluate(() => {
            window.captionFrames=[];
            const sample=()=>{
                const primary=document.querySelector('.jpdb-subtitle-primary');
                const video=document.querySelector('video');
                if(primary && video.currentTime>=1.1 && video.currentTime<20.9) {
                    const walker=document.createTreeWalker(primary,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement.closest('rt,.jpdb-reader-furi')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
                    const bottoms=[];let mainText='';
                    while(walker.nextNode()){const r=document.createRange();r.selectNodeContents(walker.currentNode);const rects=[...r.getClientRects()];if(rects.length)mainText+=walker.currentNode.textContent;bottoms.push(...rects.map(r=>r.bottom));}
                    window.captionFrames.push({ time:video.currentTime, text:primary.textContent,mainText,lineCount:new Set(bottoms.map(bottom=>Math.round(bottom*100)/100)).size,bottom:Math.max(...bottoms),
                        colors:[...primary.querySelectorAll('.jpdb-reader-furi')].map(rt=>({reading:getComputedStyle(rt).color,base:getComputedStyle(rt.parentElement.querySelector('.jpdb-reader-ruby-base')??rt.closest('.jpdb-reader-word')).color})) });
                } else if(video.currentTime>=1.1 && video.currentTime<20.9) window.captionFrames.push({time:video.currentTime,text:''});
                window.captionFrame=requestAnimationFrame(sample);
            }; sample();
        });
        await page.evaluate(()=>document.querySelector('video').play());
        await page.waitForFunction(()=>document.querySelector('video').currentTime>=21, null, { timeout:60_000 }).catch(async error=>{
            const state=await page.evaluate(()=>{const v=document.querySelector('video');return{time:v.currentTime,paused:v.paused,ended:v.ended,ready:v.readyState,network:v.networkState,error:v.error?.message,visibility:document.visibilityState,hover:document.querySelector('.jpdb-subtitle-primary')?.matches(':hover')};});
            throw new Error(`${name}: playback did not reach the final cue ${JSON.stringify(state)}`,{cause:error});
        });
        const frames = await page.evaluate(()=>{cancelAnimationFrame(window.captionFrame);document.querySelector('video').pause();return window.captionFrames;});
        writeFileSync(`${out}/${name}-frames.json`,JSON.stringify(frames));
        assert(frames.length>50, `${name}: too few observed frames`);
        assert(frames.every(frame=>frame.text), `${name}: blank frame at abutting cues`);
        const bottoms = [...new Set(frames.map(frame=>Math.round(frame.bottom*100)/100))];
        assert(Math.max(...bottoms)-Math.min(...bottoms)<=1, `${name}: baseline moved ${JSON.stringify(bottoms)}`);
        assert(frames.flatMap(frame=>frame.colors).every(({reading,base})=>reading===base), `${name}: reading colour differs`);
        assert(new Set(frames.map(frame=>Math.floor((frame.time-1)/2))).size===10, `${name}: did not observe ten cue windows`);
        for(let index=0;index<ja.length;index++) assert(frames.some(frame=>frame.time>=1+index*2+.35&&frame.time<3+index*2&&frame.mainText===ja[index]),`${name}: cue ${index+1} did not paint`);
        const lineCounts=[...new Set(frames.map(frame=>frame.lineCount))].sort();
        assert(lineCounts.includes(1)&&lineCounts.includes(2),`${name}: did not observe both one- and two-line cues ${lineCounts}`);
        console.log(JSON.stringify({engine:name,frames:frames.length,baseline:bottoms,lineCounts,blankFrames:0}));
        await page.evaluate(()=>{const v=document.querySelector('video');v.currentTime=1.3;});
        await page.waitForFunction(expected=>document.querySelector('.jpdb-subtitle-primary .jpdb-reader-word')?.dataset.sentence===expected,ja[0]);
        const point = await page.locator('.jpdb-subtitle-primary .jpdb-reader-word').first().evaluate(e=>{const r=e.getBoundingClientRect();return{x:r.left+r.width/2,y:r.bottom-4};});
        await page.evaluate(({x,y})=>{
            const dialog=document.createElement('div');dialog.id='caption-test-dialog';dialog.setAttribute('role','dialog');
            dialog.style.cssText=`position:fixed;left:${x-100}px;top:${y-60}px;width:220px;height:130px;background:white;color:black;z-index:2020`;
            dialog.textContent='A site dialog over the video';document.body.append(dialog);
        }, point);
        assert(await page.evaluate(({x,y})=>Boolean(document.elementFromPoint(x,y)?.closest('#caption-test-dialog')),point), `${name}: caption above dialog`);
        await page.screenshot({path:`${out}/${name}-dialog-fixture.png`});
        await page.locator('#caption-test-dialog').evaluate(e=>e.remove());
        assert(await page.evaluate(({x,y})=>Boolean(document.elementFromPoint(x,y)?.closest('.jpdb-subtitle-primary')),point), `${name}: caption missing after dialog closes`);
        // Native chrome stays below captions; its settings menu stays above.
        const tiers = await page.evaluate(({x,y})=>{
            const player=document.querySelector('#movie_player');const rect=player.getBoundingClientRect();
            const chrome=player.querySelector('.ytp-chrome-bottom');
            const native=document.createElement('div');native.id='caption-test-native';
            const tier=Number.parseInt(getComputedStyle(chrome).zIndex)||0;
            native.style.cssText=`position:absolute;left:${x-rect.left-25}px;top:${y-rect.top-25}px;width:50px;height:50px;background:yellow;z-index:${tier}`;
            player.append(native);const menu=player.querySelector('.ytp-settings-menu');
            return{chrome:tier,caption:Number.parseInt(getComputedStyle(document.querySelector('.jpdb-subtitle-player')).zIndex),menu:menu?Number.parseInt(getComputedStyle(menu).zIndex):NaN};
        },point);
        assert(tiers.caption>tiers.chrome, `${name}: caption is not above native chrome`);
        assert(Number.isFinite(tiers.menu)&&tiers.caption<tiers.menu,`${name}: caption is not below the native settings tier ${JSON.stringify(tiers)}`);
        assert(await page.evaluate(({x,y})=>Boolean(document.elementFromPoint(x,y)?.closest('.jpdb-subtitle-primary')),point), `${name}: chrome covers caption`);
        await page.locator('#caption-test-native').evaluate((e,tier)=>{e.style.zIndex=String(tier);e.setAttribute('role','menu');},tiers.menu);
        assert(await page.evaluate(({x,y})=>Boolean(document.elementFromPoint(x,y)?.closest('#caption-test-native')),point), `${name}: caption covers a native menu`);
        await page.locator('#caption-test-native').evaluate(e=>e.remove());
        // Late reading insertion keeps the same baseline too.
        const hydration=await page.evaluate(()=>{
            const base=document.querySelector('.jpdb-subtitle-primary .jpdb-reader-ruby-base');
            const bottom=()=>{const r=document.createRange();r.selectNodeContents(base);return r.getBoundingClientRect().bottom;};
            const rt=base.parentElement.querySelector('rt');const before=bottom();rt.remove();const plain=bottom();base.after(rt);
            return{before,plain,after:bottom()};
        });
        assert.equal(hydration.before,hydration.plain,`${name}: removing a reading moved the base`);
        assert.equal(hydration.before,hydration.after,`${name}: late reading moved the base`);
        // Contrast uses rendered panel pixels, first over bright video, then
        // over white page content after moving the line with its real control.
        const contrast=[];
        for (const background of ['rgb(255, 255, 100)','white']) {
            if(background==='white'){
                const handle=page.locator('[data-subtitle-drag-handle]');
                const grip=await handle.boundingBox();
                const frame=await page.locator('#movie_player').boundingBox();
                const footer=await page.locator('.jpdb-subtitle-secondary').boundingBox();
                const delta=Math.max(12,frame.y+frame.height-footer.y-footer.height+12);
                await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);
                await page.mouse.down();
                await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2+delta,{steps:12});
                await page.mouse.up();
                await page.waitForFunction(()=>document.querySelector('.jpdb-subtitle-player').parentElement===document.body);
                const partial=await page.locator('.jpdb-subtitle-primary .jpdb-reader-word').first().evaluate(e=>{const r=e.getBoundingClientRect();return{x:r.left+r.width/2,y:r.bottom-4};});
                assert(await page.evaluate(({y})=>y<document.querySelector('#movie_player').getBoundingClientRect().bottom,partial),`${name}: partial drag did not leave main text on video`);
                await page.evaluate(({x,y})=>{
                    for(let index=0;index<2;index++){
                        const dialog=document.createElement('div');dialog.dataset.subtitleNativePopupFixture='true';dialog.setAttribute('role','dialog');
                        dialog.style.cssText=`position:fixed;left:${x-100+index*20}px;top:${y-60+index*15}px;width:220px;height:120px;background:white;z-index:2300`;
                        document.querySelector('#movie_player').append(dialog);
                    }
                },partial);
                await page.waitForFunction(({x,y})=>Boolean(document.elementFromPoint(x,y)?.closest('[data-subtitle-native-popup-fixture]')),partial);
                assert(await page.locator('.jpdb-subtitle-player').evaluate(e=>Boolean(e.style.clipPath)),`${name}: floated caption has no popup exclusion`);
                await page.evaluate(()=>document.querySelectorAll('[data-subtitle-native-popup-fixture]').forEach(e=>e.remove()));
                await page.waitForFunction(({x,y})=>Boolean(document.elementFromPoint(x,y)?.closest('.jpdb-subtitle-primary')),partial);
                for(let step=0;step<8;step++) await handle.press('PageDown');
                await page.waitForFunction(()=>document.querySelector('.jpdb-subtitle-player').parentElement===document.body);
                await page.evaluate(()=>{
                    const root=document.querySelector('.jpdb-subtitle-player');
                    const paper=document.createElement('div');paper.id='caption-white-paper';
                    paper.style.cssText=`position:fixed;inset:0;background:white;pointer-events:none;z-index:${getComputedStyle(root).zIndex}`;
                    document.body.insertBefore(paper,root);
                });
                const dragged=await page.locator('.jpdb-subtitle-lines').boundingBox();
                const player=await page.locator('#movie_player').boundingBox();
                assert(dragged.y>player.y+player.height,`${name}: caption did not move below player`);
                const spot=await page.locator('.jpdb-subtitle-lines').evaluate(e=>{const r=e.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};});
                await page.evaluate(({x,y})=>{const dialog=document.createElement('div');dialog.id='caption-drag-dialog';dialog.setAttribute('role','dialog');dialog.style.cssText=`position:fixed;left:${x-100}px;top:${y-50}px;width:200px;height:100px;background:white;z-index:2020`;document.body.append(dialog);},spot);
                assert(await page.evaluate(({x,y})=>Boolean(document.elementFromPoint(x,y)?.closest('#caption-drag-dialog')),spot),`${name}: dragged caption covers a page dialog`);
                await page.screenshot({path:`${out}/${name}-dragged-dialog-fixture.png`});
                await page.locator('#caption-drag-dialog').evaluate(e=>e.remove());
            }
            await page.evaluate(background=>{
                let frame=document.getElementById('caption-bright-frame');
                if(!frame){frame=document.createElement('div');frame.id='caption-bright-frame';document.querySelector('#movie_player').append(frame);}
                const tier=Number.parseInt(getComputedStyle(document.querySelector('.jpdb-subtitle-player')).zIndex)-1;
                frame.style.cssText=`position:absolute;inset:0;z-index:${tier};pointer-events:none;background:${background}`;
            },background);
            const secondary=await page.locator('.jpdb-subtitle-secondary').evaluate(e=>({rect:e.getBoundingClientRect().toJSON(),height:e.clientHeight,scrollHeight:e.scrollHeight,width:e.clientWidth,scrollWidth:e.scrollWidth}));
            assert(secondary.scrollHeight<=secondary.height+1&&secondary.scrollWidth<=secondary.width+1,`${name}: translation is clipped ${JSON.stringify(secondary)}`);
            const playerBox=await page.locator('#movie_player').evaluate(e=>e.getBoundingClientRect().toJSON());
            if(background!=='white') assert(secondary.rect.bottom<=playerBox.y+playerBox.height+1,`${name}: translation leaves the player ${JSON.stringify({secondary,playerBox,text:await page.locator('.jpdb-subtitle-secondary').textContent(),viewport:await page.evaluate(()=>({top:visualViewport.offsetTop,height:visualViewport.height,scrollY,scale:visualViewport.scale})),root:await page.locator('.jpdb-subtitle-player').getAttribute('style')})}`);
            // Playwright boxes use the visual viewport; DOMRects above use
            // layout coordinates. Sample one viewport PNG in visual pixels.
            const box=await page.locator('.jpdb-subtitle-lines').boundingBox();
            const secondaryPixels=await page.locator('.jpdb-subtitle-secondary').boundingBox();
            const png=await page.screenshot();
            writeFileSync(`${out}/${name}-${background==='white'?'white':'bright'}-fixture.png`,png);
            const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
            const scale=info.width/page.viewportSize().width;
            const sample=(x,y)=>{
                const px=Math.floor(x*scale),py=Math.floor(y*scale);
                assert(px>=0&&py>=0&&px<info.width&&py<info.height,`${name}: pixel sample outside viewport`);
                const offset=(py*info.width+px)*4;
                return[...data.subarray(offset,offset+3)];
            };
            const underlay=sample(box.x-12,box.y+3);
            const expected=background==='white'?[255,255,255]:[255,255,100];
            assert(underlay.every((c,i)=>Math.abs(c-expected[i])<=2),`${name}: incorrect contrast underlay ${JSON.stringify({background,underlay,box,playerBox})}`);
            const bg=sample(box.x+10,box.y+3);
            const ink=await page.locator('.jpdb-subtitle-lines').evaluate(e=>[...e.querySelectorAll('.jpdb-subtitle-primary,.jpdb-reader-ruby-base,.jpdb-reader-furi,.jpdb-subtitle-secondary')].map(e=>getComputedStyle(e).color));
            const lum=rgb=>rgb.map(c=>c/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((s,c,i)=>s+c*[.2126,.7152,.0722][i],0);
            // The exposed right padding stays clear of the movable control rail.
            const translationBg=sample(secondaryPixels.x+secondaryPixels.width-10,secondaryPixels.y+secondaryPixels.height-3);
            const ratios=ink.flatMap(color=>{const fg=color.match(/[\d.]+/g).slice(0,3).map(Number);return[bg,translationBg].map(backdrop=>(lum(fg)+.05)/(lum(backdrop)+.05));});
            assert(ratios.every(r=>r>=4.5), `${name}: contrast ${background}: ${JSON.stringify({bg,ink,ratios})}`);
            contrast.push({background,viewport:page.viewportSize(),underlay,bg,translationBg,minimum:Math.min(...ratios)});
        }
        writeFileSync(`${out}/${name}-captions.json`,JSON.stringify({engine:name,frames:frames.length,bottoms,lineCounts,blankFrames:0,hydration,typography,tiers,popupStack,contrast},null,2));
        console.log(JSON.stringify({engine:name,contrast}));
        // Page-reader ink is checked on a real recorded prose page. YouTube's
        // site Adapter intentionally does not scan arbitrary injected prose.
        await run.close();
        run=await openRecordedPage({browser,slug:'ja-wikipedia-nihongo',waitUntil:'domcontentloaded',
            contextOptions:{...devices['iPad Pro 11'],viewport:{width:834,height:1194}},
            settings:createReaderSmokeSettings({...parserSettings,parserProvider:'jpdb',wordTextColorSource:'off',wordHighlightColorSource:'off',wordUnderlineColorSource:'off'}),
            onGmRequest:request=>{
                const mock=mockJpdbApiRequest(request,calls,vocabulary);
                return mock?{status:mock.status??200,contentType:'application/json',body:mock.responseText}:undefined;
            }});
        const readerPage=run.page;
        await readerPage.locator('.mw-parser-output p').filter({hasText:'日本語'}).first().scrollIntoViewIfNeeded();
        await readerPage.waitForSelector('.jpdb-reader-word .jpdb-reader-furi',{state:'attached',timeout:60_000});
        const pageColour=await readerPage.locator('.jpdb-reader-word .jpdb-reader-furi').first().evaluate(rt=>({reading:getComputedStyle(rt).color,base:getComputedStyle(rt.parentElement.querySelector('.jpdb-reader-ruby-base')??rt.closest('.jpdb-reader-word')).color}));
        assert.equal(pageColour.reading,pageColour.base,`${name}: page reading colour differs from word`);
        assert.notEqual(pageColour.reading,'rgba(0, 0, 0, 0)',`${name}: transparent page reading`);
        summaries.push({engine:name,frames:frames.length,bottoms,lineCounts,blankFrames:0,hydration,pageColour,typography,contrast});
    } catch(error) { console.error(`${name}: ${error.message}`); throw error; }
    finally { await run?.close(); await browser.close(); }
}
writeFileSync(`${out}/result.json`, JSON.stringify(summaries,null,2));
console.log(JSON.stringify(summaries,null,2));
