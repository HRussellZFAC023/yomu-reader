import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

// Layout regression checks on the built product and recorded YouTube shell.
// The long cue and tap counters belong to the stability smoke's mechanism track.
export async function assertCaptionGeometry(page, engine, out, longCue, popupMode = 'auto') {
    await page.evaluate(() => {
        if (typeof window.captionNativeClicks !== 'number') {
            window.captionNativeClicks = 0;
            document.querySelector('#movie_player').addEventListener('click', () => window.captionNativeClicks++);
        }
    });
    const measurements = [];
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    // Fix rounds cover each reproduced defect once. Independent review can
    // request the complete acceptance matrix without repeating it in lanes.
    const sizes = process.argv.includes('--full-matrix')
        ? [[834,1194],[1194,834],[320,568],[360,640],[390,844],[844,390],
            [320,1180],[590,820],[500,700],[1280,600],[500,700,2],[1280,600,2]]
        : [[834,1194],[320,568]];
    for (const [width, height, zoom = 1] of sizes) {
        await page.setViewportSize({width,height});
        await page.evaluate(zoom => { document.documentElement.style.zoom = String(zoom); }, zoom);
        await page.evaluate(() => { scrollTo(0,0); document.querySelector('video').currentTime = 9.5; });
        await page.waitForFunction(text => document.querySelector('.jpdb-subtitle-primary .jpdb-reader-word')?.dataset.sentence === text, longCue);
        await settle();
        await page.waitForTimeout(300);
        const geometry = await page.evaluate(() => {
            const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
            const primary = document.querySelector('.jpdb-subtitle-primary');
            const native = document.querySelector('.ytp-caption-segment') ?? document.querySelector('.caption-visual-line') ?? document.querySelector('.captions-text');
            const walker=document.createTreeWalker(primary,NodeFilter.SHOW_TEXT,{acceptNode:node=>node.parentElement.closest('rt,.jpdb-reader-furi')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
            const textRects=[];while(walker.nextNode()){const range=document.createRange();range.selectNodeContents(walker.currentNode);textRects.push(...[...range.getClientRects()].map(rect=>rect.toJSON()));}
            const styles = ['.jpdb-subtitle-text','.jpdb-subtitle-primary'].map(selector=>({selector,style:document.querySelector(selector).getAttribute('style')}));
            return {styles,textRects,viewport:{width:visualViewport.width,height:visualViewport.height},
                primary:rect('.jpdb-subtitle-primary-row'), secondary:rect('.jpdb-subtitle-lines > .jpdb-subtitle-secondary'),
                rail:rect('.jpdb-subtitle-rail'),handle:rect('[data-subtitle-drag-handle]'),
                font:parseFloat(getComputedStyle(primary).fontSize), nativeFont:parseFloat(getComputedStyle(native).fontSize) };
        });
        writeFileSync(`${out}/${engine}-last-geometry.json`,JSON.stringify(geometry,null,2));
        await page.screenshot({path:`${out}/${engine}-${width}x${height}-zoom${zoom}-mechanism-fixture.png`});
        const overlap = (a,b) => Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
        for (const key of ['primary','secondary','handle','rail']) {
            const rect = geometry[key];
            assert(rect.top >= -1 && rect.bottom <= height+1 && rect.left >= -1 && rect.right <= width+1,
                `${engine} ${width}x${height}: ${key} is unreachable ${JSON.stringify(geometry)}`);
        }
        assert(geometry.textRects.every(rect=>rect.left>=-1&&rect.right<=width+1&&rect.top>=geometry.primary.top-1&&rect.bottom<=geometry.primary.bottom+1), `${engine} ${width}x${height}: caption text overflows its backdrop ${JSON.stringify({viewport:geometry.viewport,textRects:geometry.textRects})}`);
        for (const key of ['primary','secondary','handle']) assert(!overlap(geometry.rail,geometry[key]),
            `${engine} ${width}x${height}: controls cover ${key} ${JSON.stringify(geometry)}`);
        assert(Math.abs(geometry.font-geometry.nativeFont)<=.1,`${engine}: caption size differs from native ${JSON.stringify(geometry)}`);
        assert(geometry.styles.filter(style=>['.jpdb-subtitle-text','.jpdb-subtitle-primary'].includes(style.selector)).every(style=>!style.style?.includes('height:')), `${engine}: page ruby-room repair froze the reader's own caption height`);
        measurements.push({size:[width,height],zoom,...geometry});
    }
    await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
    await page.setViewportSize({width:834,height:1194});
    await page.evaluate(() => { scrollTo(0,0); document.querySelector('video').currentTime=1.3; });
    await page.waitForFunction(() => document.querySelector('.jpdb-subtitle-primary')?.textContent.includes('です。'));
    await settle();
    const shortBackdrop = await page.locator('.jpdb-subtitle-lines').evaluate(element => ({
        width: element.getBoundingClientRect().width,
        playerWidth: document.querySelector('#movie_player').getBoundingClientRect().width,
    }));
    assert(shortBackdrop.width < shortBackdrop.playerWidth * .95,
        `${engine}: short-caption backdrop spans the player ${JSON.stringify(shortBackdrop)}`);
    // A trusted tap in BOTH backdrops' padding must reach native playback and
    // leave the translation blur state alone. The inline text still toggles it.
    for (const selector of ['.jpdb-subtitle-primary-row','.jpdb-subtitle-lines > .jpdb-subtitle-secondary']) {
        const point = await page.locator(selector).evaluate(element => {
            const r=element.getBoundingClientRect();return {x:r.right-2,y:r.bottom-2};
        });
        const before = await page.evaluate(() => ({clicks:window.captionNativeClicks,blur:document.querySelector('.jpdb-subtitle-secondary').getAttribute('aria-pressed')}));
        await page.touchscreen.tap(point.x,point.y);
        assert.equal(await page.evaluate(()=>window.captionNativeClicks),before.clicks+1,`${engine}: ${selector} padding captured a video tap`);
        assert.equal(await page.locator('.jpdb-subtitle-secondary').getAttribute('aria-pressed'),before.blur,`${engine}: padding toggled translation blur`);
        await page.evaluate(()=>document.querySelector('video').pause());
    }
    // A long repaint is a mechanism fixture: the native compatibility click
    // must not undo the product's authorized pointer-up activation afterward.
    await page.evaluate(() => document.querySelector('.jpdb-subtitle-player').addEventListener('click', event => {
        if (event.isTrusted || !event.target.closest('.jpdb-subtitle-secondary')) return;
        const end = performance.now() + 850;
        while (performance.now() < end) { /* deliberate long repaint fixture */ }
    }, {capture:true,once:true}));
    const before = await page.locator('.jpdb-subtitle-secondary').getAttribute('aria-pressed');
    await tapTranslationText(page);
    await page.waitForFunction(before => document.querySelector('.jpdb-subtitle-secondary').getAttribute('aria-pressed') !== before, before, {timeout:2000});
    await tapTranslationText(page);
    const popups = process.argv.includes('--popup-rotation')
        ? await assertPopupRotation(page, engine, out, popupMode) : [];
    // Restore ordinary playback after touching the translation control. Focused
    // controls intentionally portal out of YouTube's :focus-within context.
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForFunction(() => document.querySelector('.jpdb-subtitle-player').parentElement.id === 'movie_player');
    writeFileSync(`${out}/${engine}-geometry.json`,JSON.stringify(measurements,null,2));
    return {sizes:measurements.length,captionOverlap:0,backdropClickThrough:true,popups};
}

async function assertPopupRotation(page, engine, out, mode) {
    const measurements = [];
    const snapshot = async label => {
        const data = await page.locator('.jpdb-reader-popover').evaluate(element => {
            const buttons = [...element.querySelectorAll('button,[role=separator]')].filter(button => /close|閉じる/i.test(button.getAttribute('aria-label') ?? ''));
            return { sheet:element.classList.contains('jpdb-reader-sheet'), rect:element.getBoundingClientRect().toJSON(),
                close:buttons.filter(button=>button.getBoundingClientRect().width>0).map(button=>button.getBoundingClientRect().toJSON()),
                width:visualViewport.width,height:visualViewport.height };
        });
        for (const rect of [data.rect,...data.close]) assert(rect.left>=-1&&rect.right<=data.width+1&&rect.top>=-1&&rect.bottom<=data.height+1,
            `${engine} ${label}: popup or close control clipped ${JSON.stringify(data)}`);
        if (data.sheet) assert(data.close.length,`${engine} ${label}: close control missing ${JSON.stringify(data)}`);
        measurements.push({label,...data});
        await page.screenshot({path:`${out}/${engine}-${label}-mechanism-fixture.png`});
        return data;
    };
    for (const [width,height] of [[834,1194],[1194,834]]) {
        await page.setViewportSize({width,height});
        await page.evaluate(()=>scrollTo(0,0));
        await page.waitForTimeout(300);
        await page.locator('.jpdb-subtitle-primary .jpdb-reader-word').first().tap();
        await page.locator('.jpdb-reader-popover').waitFor();
        await page.waitForTimeout(300);
        const initial = await snapshot(`${mode}-${width}x${height}`);
        assert.equal(initial.sheet,mode==='sheet'||(mode==='auto'&&height>width),`${engine}: incorrect popup presentation`);
        await page.setViewportSize({width:height,height:width});
        await page.waitForTimeout(300);
        await snapshot(`${mode}-rotated-from-${width}x${height}`);
        await page.keyboard.press('Escape');
        await page.locator('.jpdb-reader-popover').waitFor({state:'hidden'});
    }
    await page.setViewportSize({width:834,height:1194});
    await page.evaluate(()=>scrollTo(0,0));
    await page.waitForTimeout(300);
    return measurements;
}

async function tapTranslationText(page) {
    const point = await page.locator('.jpdb-subtitle-secondary-ink').evaluate(element => {
        const range=document.createRange();range.selectNodeContents(element);
        const r=range.getClientRects()[0];return {x:r.left+r.width/2,y:r.top+r.height/2};
    });
    await page.touchscreen.tap(point.x,point.y);
}
