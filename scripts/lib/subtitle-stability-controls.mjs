import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';

// These controls exercise mechanisms on the recorded watch page, using the
// built product. The added control uses native fullscreen where available,
// otherwise YouTube's inline fullscreen mechanism (mobile Playwright WebKit
// does not expose the element Fullscreen API).
export async function assertCaptionControls(page, engine, out) {
    const primary = page.locator('.jpdb-subtitle-primary');
    const geometry = () => page.evaluate(() => {
        const root = document.querySelector('.jpdb-subtitle-player');
        return { root:root.getBoundingClientRect().toJSON(), parent:root.parentElement.tagName, style:root.style.cssText,
            video:document.querySelector('video').getBoundingClientRect().toJSON(), player:document.querySelector('#movie_player').getBoundingClientRect().toJSON(),
            text:document.querySelector('.jpdb-subtitle-text').getBoundingClientRect().toJSON(), scrollY,
            viewport:{top:visualViewport.offsetTop,height:visualViewport.height,scale:visualViewport.scale} };
    });
    const baseline = () => primary.evaluate(element => {
        const range = document.createRange();
        range.selectNodeContents(element.querySelector('.jpdb-reader-ruby-base'));
        // Touching a rail control may scroll the recorded page to that control.
        // Caption anchoring is relative to the player, not the page's scroll.
        return range.getBoundingClientRect().bottom - document.querySelector('#movie_player').getBoundingClientRect().top;
    });
    // Use visual viewport coordinates and the padding away from the rail.
    const box = await page.locator('.jpdb-subtitle-primary-row').boundingBox();
    const point = { x: box.x + box.width - 2, y: box.y + box.height - 2 };
    const clicks = await page.evaluate(() => window.captionNativeClicks);
    await page.touchscreen.tap(point.x, point.y);
    await page.waitForFunction(expected => window.captionNativeClicks === expected, clicks + 1, { timeout: 2000 });
    assert.equal(await page.evaluate(() => window.captionNativeClicks), clicks + 1,
        `${engine}: caption panel padding intercepted the video tap`);
    await page.evaluate(() => document.querySelector('video').pause());

    await page.locator('.jpdb-subtitle-style-toggle').tap();
    const opacity = page.locator('[data-subtitle-style-setting="subtitleBackgroundOpacity"]');
    await opacity.waitFor({ state: 'visible' });
    assert.equal(await opacity.inputValue(), '0.75', `${engine}: incorrect default backdrop`);
    // Opening a control can dismiss a mobile keyboard/panned visual viewport.
    // Compare opacity changes once that interaction has completed.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const before = await baseline();
    const beforeGeometry = await geometry();
    const backgrounds = () => page.locator('.jpdb-subtitle-lines').evaluate(element =>
        [...element.querySelectorAll('.jpdb-subtitle-primary-row,.jpdb-subtitle-secondary')]
            .map(row => getComputedStyle(row).backgroundColor));
    await opacity.press('Home');
    await page.waitForFunction(() => [...document.querySelectorAll('.jpdb-subtitle-primary-row,.jpdb-subtitle-lines > .jpdb-subtitle-secondary')]
        .every(element => getComputedStyle(element).backgroundColor.endsWith(', 0)')), null, { timeout: 5000 });
    assert.equal(await baseline(), before, `${engine}: transparent style moved the Japanese baseline ${JSON.stringify({before:beforeGeometry,after:await geometry()})}`);
    const transparent = await backgrounds();
    await opacity.press('End');
    await page.waitForFunction(() => [...document.querySelectorAll('.jpdb-subtitle-primary-row,.jpdb-subtitle-lines > .jpdb-subtitle-secondary')]
        .every(element => getComputedStyle(element).backgroundColor === 'rgb(24, 27, 32)'), null, { timeout: 5000 })
        .catch(async error => {
            throw new Error(`${engine}: opaque backdrop did not paint ${JSON.stringify({value: await opacity.inputValue(), backgrounds: await backgrounds(), root: await page.locator('.jpdb-subtitle-player').getAttribute('style')})}`, { cause: error });
        });
    assert.equal(await opacity.inputValue(), '1', `${engine}: opaque style was capped`);
    const opaque = await backgrounds();
    for (let step = 0; step < 5; step++) await opacity.press('ArrowLeft');
    assert.equal(await opacity.inputValue(), '0.75');
    await page.locator('.jpdb-subtitle-style-toggle').tap();
    await page.locator('[data-subtitle-style-popover]').waitFor({ state: 'hidden' });
    await page.locator('.jpdb-subtitle-style-toggle').evaluate(element => element.blur());
    await page.waitForFunction(() => document.querySelector('.jpdb-subtitle-player').parentElement.id === 'movie_player');

    const fullscreen = await assertCaptionFullscreen(page, engine, out);
    const accessibility = await new AxeBuilder({ page }).include('.jpdb-subtitle-player')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    assert.deepEqual(accessibility.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) })), [],
        `${engine}: subtitle accessibility violations`);
    return { clickThrough: true, transparent, opaque, fullscreen, axeViolations: 0 };
}

async function assertCaptionFullscreen(page, engine, out) {
    await page.evaluate(() => {
        const player = document.querySelector('#movie_player');
        const originalStyle = player.style.cssText;
        const originalParent = player.parentNode;
        const originalNext = player.nextSibling;
        const control = document.createElement('button');
        control.id = 'caption-fullscreen-mechanism-fixture';
        control.textContent = 'Fullscreen mechanism fixture';
        control.style.cssText = 'position:fixed;top:4px;left:4px;z-index:3000';
        control.onclick = async () => {
            try {
                if (typeof player.requestFullscreen === 'function') {
                    await player.requestFullscreen();
                    window.captionFullscreenResult = 'element';
                } else {
                    // Model an inline fullscreen portal, escaping the recorded
                    // desktop shell's clipping and stacking contexts. Changing
                    // only the inner bounds leaves comments painting above it.
                    document.body.append(player);
                    player.classList.add('ytp-fullscreen');
                    for (const [key, value] of Object.entries({ position: 'fixed', inset: '0', width: '100vw', height: '100vh',
                        'z-index': '1000', background: 'black' })) {
                        player.style.setProperty(key, value, 'important');
                    }
                    window.captionFullscreenResult = 'inline';
                }
            } catch (error) { window.captionFullscreenResult = String(error); }
        };
        window.captionExitFullscreen = async () => {
            if (document.fullscreenElement) await document.exitFullscreen();
            else {
                player.classList.remove('ytp-fullscreen');
                player.style.cssText = originalStyle;
                originalParent.insertBefore(player, originalNext?.parentNode === originalParent ? originalNext : null);
            }
        };
        document.body.append(control);
    });
    await page.locator('#caption-fullscreen-mechanism-fixture').tap();
    await page.waitForFunction(() => {
        const root = document.querySelector('.jpdb-subtitle-player');
        const rect = root.getBoundingClientRect();
        return (document.fullscreenElement?.contains(root) || window.captionFullscreenResult === 'inline')
            && rect.width >= innerWidth - 2 && rect.height >= innerHeight - 2;
    }, null, { timeout: 5000 })
        .catch(async error => {
            const state = await page.evaluate(() => ({ result: window.captionFullscreenResult, enabled: document.fullscreenEnabled,
                fullscreen: document.fullscreenElement?.tagName, webkit: document.webkitFullscreenElement?.tagName,
                parent: document.querySelector('.jpdb-subtitle-player').parentElement.tagName }));
            throw new Error(`${engine}: fullscreen caption did not mount ${JSON.stringify(state)}`, { cause: error });
        });
    assert(await page.locator('.jpdb-subtitle-primary').isVisible(), `${engine}: fullscreen lost the caption`);
    const fullscreen = await page.locator('.jpdb-subtitle-player').evaluate(element => ({
        mode: window.captionFullscreenResult, parent: element.parentElement.id, rect: element.getBoundingClientRect().toJSON(),
    }));
    const onVideo = await page.locator('.jpdb-subtitle-primary-row').evaluate(row => {
        const rect = row.getBoundingClientRect();
        const root = row.closest('.jpdb-subtitle-player');
        const saved = root.style.visibility;
        try {
            root.style.visibility = 'hidden';
            return Boolean(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('#movie_player'));
        } finally { root.style.visibility = saved; }
    });
    if (!onVideo) {
        await page.screenshot({ path: `${out}/${engine}-fullscreen-failure-mechanism-fixture.png` });
        const paint = await page.locator('.jpdb-subtitle-primary-row').evaluate(row => {
            const rect = row.getBoundingClientRect();
            const root = row.closest('.jpdb-subtitle-player');
            root.style.visibility = 'hidden';
            const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
            root.style.visibility = '';
            return { row: rect.toJSON(), hit: hit?.outerHTML.slice(0, 500), ancestors: [...function* () {
                for (let node = document.querySelector('#movie_player'); node; node = node.parentElement) {
                    const s = getComputedStyle(node);
                    yield { tag:node.tagName, id:node.id, rect:node.getBoundingClientRect().toJSON(), position:s.position,
                        transform:s.transform, overflow:s.overflow, contain:s.contain, z:s.zIndex };
                }
            }()] };
        });
        assert.fail(`${engine}: fullscreen caption left the painted player ${JSON.stringify(paint)}`);
    }
    await page.screenshot({ path: `${out}/${engine}-fullscreen-mechanism-fixture.png` });
    await page.evaluate(() => window.captionExitFullscreen());
    await page.waitForFunction(() => !document.fullscreenElement);
    await page.locator('#caption-fullscreen-mechanism-fixture').evaluate(element => element.remove());
    return fullscreen;
}
