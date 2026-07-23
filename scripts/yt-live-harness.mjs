// Live Yomu repro harness: drives a CLONED signed-in Chrome profile, injects the
// built dist (companions + core) via a GM shim with a cross-origin jpdb bridge,
// navigates to a target, runs a diagnostic, screenshots. Read-only on the repo.
//
//   node scripts/yt-live-harness.mjs [diagName] [url] [width] [height]
//
// diagName selects a probe in DIAGS below. Env: YT_HEADLESS=1 for headless.
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { loadLocalEnv } from './lib/qa-env.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const APP = path.resolve(import.meta.dirname, '..');
loadLocalEnv(APP);
const PROFILE = process.env.YT_PROFILE?.trim();
if (!PROFILE) {
    throw new Error('Set YT_PROFILE to a cloned signed-in Playwright/Chrome profile.');
}
const DIST = process.env.YT_DIST || path.join(APP, 'dist');

const diagName = process.argv[2] || 'overview';
const url = process.argv[3] || 'https://www.youtube.com/';
const width = Number(process.argv[4] || 1280);
const height = Number(process.argv[5] || 900);
const headless = process.env.YT_HEADLESS === '1';

function readDist(rel) {
    const p = path.join(DIST, rel);
    if (!existsSync(p)) throw new Error('missing dist file: ' + p);
    return readFileSync(p, 'utf8');
}
const CORE_SCRIPT = readDist('yomu.user.js');
// Mirror the exact built install graph: immutable hosted names in @require
// resolve to the canonical companion files beside this candidate build.
const COMPANION_SCRIPTS = [...CORE_SCRIPT.matchAll(
    /^\/\/ @require https:\/\/yomureader\.com\/greasyfork\/([^#\s]+)(?:#\S+)?$/gmu,
)].map(match => `greasyfork/${match[1].replace(/\.[0-9a-f]{12}(?=\.user\.js$)/u, '')}`);
const SCRIPTS = [
    ...COMPANION_SCRIPTS.map(rel => ({ rel, code: readDist(rel) })),
    { rel: 'yomu.user.js', code: CORE_SCRIPT },
];
const READER_CSS = readDist('yomu.css');

// Optional live JPDB key. loadLocalEnv follows the shared workspace/app paths.
const jpdbKey = (process.env.YOMU_JPDB_API_KEY
    || process.env.JPDB_API_KEY
    || process.env.YOMU_TEST_API_KEY
    || process.env.YOMU_PROFILE_API_KEY
    || '').trim();

const SETTINGS = {
    onboardingSeen: true,
    apiKey: jpdbKey,
    jpdbMiningEnabled: true,
    interfaceLanguage: 'en',
    showFurigana: true,
    furiganaMode: 'all',
    showPitchAccent: true,
};
if (diagName === 'subtitlebound') SETTINGS.subtitleBottomOffset = -110;

const DIAGS = {
    // Broad health check + which surfaces got decorated.
    overview: () => {
        const words = document.querySelectorAll('.jpdb-reader-word').length;
        const furi = document.querySelectorAll('.jpdb-reader-furi').length;
        const mirrors = document.querySelectorAll('.jpdb-reader-text-mirror').length;
        const filtered = document.querySelectorAll('[data-yomu-youtube-filtered]').length;
        return { yomuPresent: Boolean(window.__yomuCompanions || words || mirrors), words, furi, mirrors, filtered };
    },
    annotations: async () => {
        await new Promise(resolve => setTimeout(resolve, 7000));
        const projections = Array.from(document.querySelectorAll('[data-yomu-projected-reading="true"]'))
            .map(reading => {
                const rect = reading.getBoundingClientRect();
                const sourceLeft = Number(reading.dataset.yomuSourceLeft);
                const sourceTop = Number(reading.dataset.yomuSourceTop);
                const sourceWidth = Number(reading.dataset.yomuSourceWidth);
                return {
                    expression: reading.dataset.yomuExpression || '',
                    reading: reading.textContent || '',
                    display: getComputedStyle(reading).display,
                    rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
                    source: { left: sourceLeft, top: sourceTop, width: sourceWidth },
                    centerDelta: Math.round(((rect.left + rect.right) / 2 - sourceLeft - sourceWidth / 2) * 10) / 10,
                    baseGap: Math.round((sourceTop - rect.bottom) * 10) / 10,
                };
            });
        const words = Array.from(document.querySelectorAll('.jpdb-reader-word'))
            .filter(word => /[぀-ヿ㐀-鿿]/.test(word.dataset.expression || word.dataset.surface || ''))
            .map(word => {
                const expression = word.dataset.expression || word.dataset.surface || '';
                const reading = word.dataset.reading || '';
                const renderedReadings = Array.from(word.querySelectorAll('rt,.jpdb-reader-detached-furi'))
                    .map(node => ({
                        text: node.textContent || '',
                        display: getComputedStyle(node).display,
                        kind: node.matches('rt') ? 'ruby' : 'detached',
                    }));
                return {
                    expression,
                    reading,
                    pitchClass: word.dataset.pitchClass || '',
                    renderedReadings,
                    expectsReading: /[㐀-鿿]/.test(expression)
                        && Boolean(reading)
                        && reading !== expression,
                };
            });
        const missingReadings = words
            .filter(word => word.expectsReading && !word.renderedReadings.length)
            .map(({ expression, reading, pitchClass }) => ({ expression, reading, pitchClass }));
        return {
            projections,
            maxCenterDelta: Math.max(0, ...projections.map(item => Math.abs(item.centerDelta))),
            maxBaseGap: Math.max(0, ...projections.map(item => Math.abs(item.baseGap))),
            missingReadings,
            words,
        };
    },
    reddit: async () => {
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        const visible = element => {
            const box = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return box.width > 0 && box.height > 0
                && box.bottom > 0 && box.top < innerHeight
                && style.display !== 'none' && style.visibility !== 'hidden';
        };
        const rect = box => ({
            left: Math.round(box.left * 10) / 10,
            top: Math.round(box.top * 10) / 10,
            right: Math.round(box.right * 10) / 10,
            bottom: Math.round(box.bottom * 10) / 10,
            width: Math.round(box.width * 10) / 10,
            height: Math.round(box.height * 10) / 10,
        });
        const findSortControl = () => Array.from(document.querySelectorAll('button,[role="button"],faceplate-dropdown-menu,shreddit-sort-dropdown'))
            .filter(element => visible(element)
                && /賛成票率順/.test(`${element.textContent || ''} ${element.getAttribute('aria-label') || ''}`))
            .sort((first, second) => {
                const firstBox = first.getBoundingClientRect();
                const secondBox = second.getBoundingClientRect();
                return firstBox.width * firstBox.height - secondBox.width * secondBox.height;
            })[0] || null;
        const samples = [];
        for (let index = 0; index < 20; index += 1) {
            const control = findSortControl();
            const controlBox = control?.getBoundingClientRect();
            const readings = controlBox
                ? Array.from(document.querySelectorAll('[data-yomu-projected-reading="true"]'))
                    .filter(reading => {
                        const sourceLeft = Number(reading.dataset.yomuSourceLeft);
                        const sourceTop = Number(reading.dataset.yomuSourceTop);
                        return sourceLeft >= controlBox.left - 1
                            && sourceLeft <= controlBox.right + 1
                            && sourceTop >= controlBox.top - 1
                            && sourceTop <= controlBox.bottom + 1;
                    })
                    .map(reading => {
                        const readingBox = reading.getBoundingClientRect();
                        const sourceLeft = Number(reading.dataset.yomuSourceLeft);
                        const sourceTop = Number(reading.dataset.yomuSourceTop);
                        const sourceWidth = Number(reading.dataset.yomuSourceWidth);
                        return {
                            expression: reading.dataset.yomuExpression || '',
                            reading: reading.textContent || '',
                            display: getComputedStyle(reading).display,
                            rect: rect(readingBox),
                            centerDelta: Math.round(((readingBox.left + readingBox.right) / 2 - sourceLeft - sourceWidth / 2) * 10) / 10,
                            baseGap: Math.round((sourceTop - readingBox.bottom) * 10) / 10,
                        };
                    })
                : [];
            const words = control
                ? Array.from(control.querySelectorAll('.jpdb-reader-word')).map(word => ({
                    expression: word.dataset.expression || word.dataset.surface || '',
                    reading: word.dataset.reading || '',
                    pitchClass: word.dataset.pitchClass || '',
                }))
                : [];
            samples.push({
                index,
                found: Boolean(control),
                text: (control?.textContent || '').replace(/\s+/g, ' ').trim(),
                rect: controlBox ? rect(controlBox) : null,
                mirrorCount: control?.querySelectorAll('.jpdb-reader-text-mirror').length || 0,
                words,
                readings,
                signature: JSON.stringify({
                    words: words.map(word => `${word.expression}:${word.reading}:${word.pitchClass}`),
                    readings: readings.map(reading => `${reading.expression}:${reading.reading}:${reading.display}:${reading.centerDelta}:${reading.baseGap}`),
                }),
            });
            await sleep(500);
        }
        const japanese = /[぀-ヿ㐀-鿿]/;
        const textNodes = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode: node => japanese.test(node.data)
                && node.parentElement
                && visible(node.parentElement)
                && !node.parentElement.closest('script,style,noscript,.jpdb-reader-popover,.jpdb-reader-text-mirror,[data-yomu-projected-reading="true"],.jpdb-reader-detached-furi')
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT,
        });
        let node;
        while ((node = walker.nextNode())) {
            const text = node.data.replace(/\s+/g, ' ').trim();
            if (!text) continue;
            const parent = node.parentElement;
            textNodes.push({
                text: text.slice(0, 100),
                annotated: Boolean(parent?.closest('.jpdb-reader-word')
                    || parent?.querySelector('.jpdb-reader-word,.jpdb-reader-text-mirror')),
            });
        }
        return {
            href: location.href,
            samples,
            uniqueSignatures: Array.from(new Set(samples.map(sample => sample.signature))),
            coverage: {
                visibleJapaneseTextNodes: textNodes.length,
                annotated: textNodes.filter(item => item.annotated).length,
                missing: textNodes.filter(item => !item.annotated).slice(0, 30),
                words: document.querySelectorAll('.jpdb-reader-word').length,
                mirrors: document.querySelectorAll('.jpdb-reader-text-mirror').length,
                projectedReadings: document.querySelectorAll('[data-yomu-projected-reading="true"]').length,
            },
        };
    },
    playback: async () => {
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        const video = document.querySelector('video');
        await video?.play().catch(() => undefined);
        video?.click();
        await sleep(300);
        const settings = document.querySelector('.ytp-settings-button,button[aria-label*="再生設定"],[aria-label*="Settings"]');
        if (settings instanceof HTMLElement) settings.click();
        await sleep(800);
        const speed = Array.from(document.querySelectorAll('[role="menuitem"],.ytp-menuitem,button'))
            .find(element => {
                const box = element.getBoundingClientRect();
                const label = `${element.textContent || ''} ${element.getAttribute('aria-label') || ''}`;
                return box.width > 0 && box.height > 0
                    && /再生速度|速度|Playback speed/i.test(label)
                    && !/下げる|上げる|decrease|increase/i.test(label);
            });
        if (speed instanceof HTMLElement) speed.click();
        await sleep(5000);
        const rect = box => ({
            left: Math.round(box.left * 100) / 100,
            top: Math.round(box.top * 100) / 100,
            right: Math.round(box.right * 100) / 100,
            bottom: Math.round(box.bottom * 100) / 100,
            width: Math.round(box.width * 100) / 100,
            height: Math.round(box.height * 100) / 100,
        });
        const sourceRanges = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode: node => node.data.includes('倍') && !node.parentElement?.closest('script,style')
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT,
        });
        let sourceNode;
        while ((sourceNode = walker.nextNode())) {
            for (let offset = 0; (offset = sourceNode.data.indexOf('倍', offset)) >= 0; offset += 1) {
                const range = document.createRange();
                range.setStart(sourceNode, offset);
                range.setEnd(sourceNode, offset + 1);
                const parent = sourceNode.parentElement;
                const rects = Array.from(range.getClientRects()).map(rect);
                if (!rects.length) continue;
                sourceRanges.push({
                    text: sourceNode.data,
                    visibility: parent ? getComputedStyle(parent).visibility : '',
                    insideMirror: Boolean(parent?.closest('.jpdb-reader-text-mirror')),
                    insideWord: Boolean(parent?.closest('.jpdb-reader-word')),
                    insideReading: Boolean(parent?.closest('[data-yomu-projected-reading="true"],.jpdb-reader-detached-furi')),
                    rects,
                });
            }
        }
        const rows = Array.from(document.querySelectorAll('[role="menuitem"],.ytp-menuitem,button,span,div'))
            .filter(element => /倍/.test(element.textContent || '') && element.querySelector('.jpdb-reader-word,.jpdb-reader-text-mirror'))
            .slice(0, 20)
            .map(element => ({
                text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
                words: Array.from(element.querySelectorAll('.jpdb-reader-word')).map(word => ({
                    expression: word.dataset.expression || word.dataset.surface || '',
                    reading: word.dataset.reading || '',
                    pitchClass: word.dataset.pitchClass || '',
                })),
            }));
        const projections = Array.from(document.querySelectorAll('[data-yomu-projected-reading="true"]'))
            .filter(reading => reading.dataset.yomuExpression === '倍')
            .map(reading => {
                const readingRect = reading.getBoundingClientRect();
                const sourceLeft = Number(reading.dataset.yomuSourceLeft);
                const sourceTop = Number(reading.dataset.yomuSourceTop);
                const sourceWidth = Number(reading.dataset.yomuSourceWidth);
                const exactSources = sourceRanges
                    .filter(source => !source.insideMirror && !source.insideReading)
                    .flatMap(source => source.rects);
                const exactSource = exactSources
                    .sort((first, second) => {
                        const firstDistance = Math.abs((first.left + first.right) / 2 - sourceLeft - sourceWidth / 2)
                            + Math.abs(first.top - sourceTop);
                        const secondDistance = Math.abs((second.left + second.right) / 2 - sourceLeft - sourceWidth / 2)
                            + Math.abs(second.top - sourceTop);
                        return firstDistance - secondDistance;
                    })[0] || null;
                return {
                    reading: reading.textContent || '',
                    exactSource,
                    centerDelta: exactSource
                        ? Math.round(((readingRect.left + readingRect.right) / 2
                            - (exactSource.left + exactSource.right) / 2) * 10) / 10
                        : null,
                    baseGap: exactSource
                        ? Math.round((exactSource.top - readingRect.bottom) * 10) / 10
                        : null,
                };
            });
        const readings = Array.from(document.querySelectorAll('[data-yomu-projected-reading="true"],.jpdb-reader-detached-furi'))
            .filter(reading => reading.dataset.yomuExpression === '倍' || reading.textContent?.trim() === 'ばい')
            .map(reading => ({
                reading: reading.textContent || '',
                expression: reading.dataset.yomuExpression || '',
                display: getComputedStyle(reading).display,
                rect: rect(reading.getBoundingClientRect()),
            }));
        return {
            settingsOpened: Boolean(settings),
            speedOpened: Boolean(speed),
            rows,
            projections,
            readings,
            sourceRanges,
        };
    },
    subtitlebound: async () => {
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        const rect = element => {
            const box = element?.getBoundingClientRect();
            return box ? { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height } : null;
        };
        const video = Array.from(document.querySelectorAll('video'))
            .filter(element => {
                const box = element.getBoundingClientRect();
                return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight;
            })
            .sort((first, second) => second.getBoundingClientRect().height - first.getBoundingClientRect().height)[0];
        await video?.play().catch(() => undefined);
        await sleep(5000);
        const root = document.querySelector('.jpdb-subtitle-player');
        const subtitle = root?.querySelector('.jpdb-subtitle-text');
        const handle = root?.querySelector('[data-subtitle-drag-handle]');
        const snapshot = () => {
            const media = rect(video);
            const overlay = rect(root);
            const line = rect(subtitle);
            return {
                savedBottom: window.GM_getValue?.('jpdb-popup-reader-settings', {})?.subtitleBottomOffset,
                effectiveBottom: root instanceof HTMLElement ? root.style.getPropertyValue('--subtitle-bottom') : '',
                video: media,
                root: overlay,
                subtitle: line,
                insideVideo: Boolean(media && line && line.top >= media.top - 1 && line.bottom <= media.bottom + 1),
            };
        };
        const stale = snapshot();
        for (let index = 0; index < 16; index += 1) {
            handle?.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true }));
        }
        await sleep(300);
        return {
            href: location.href,
            text: (subtitle?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
            hidden: root instanceof HTMLElement ? root.hidden : null,
            stale,
            afterPageDown: snapshot(),
        };
    },
    // Title clipping: compare each mirror host box vs mirror box + clamp.
    titles: () => {
        const out = [];
        for (const m of document.querySelectorAll('.jpdb-reader-text-mirror')) {
            const host = m.parentElement;
            if (!host) continue;
            const hr = host.getBoundingClientRect();
            const mr = m.getBoundingClientRect();
            const cs = getComputedStyle(host);
            const clampBox = host.closest('[style*="line-clamp"],.yt-core-attributed-string--white-space-pre-wrap') || host;
            const cbcs = getComputedStyle(clampBox);
            out.push({
                hostClass: host.className?.toString().slice(0, 60),
                src: (m.dataset.sourceText || '').slice(0, 40),
                host: { w: Math.round(hr.width), h: Math.round(hr.height) },
                mirror: { w: Math.round(mr.width), h: Math.round(mr.height) },
                overflowsHost: Math.round(mr.height) - Math.round(hr.height) > 4 || Math.round(mr.width) - Math.round(hr.width) > 4,
                hostDisplay: cs.display, hostPosition: cs.position, hostOverflow: cs.overflow,
                clampLine: cbcs.webkitLineClamp, clampOverflow: cbcs.overflow,
                mirrorInset: m.style.inset, mirrorWidth: m.style.width, mirrorWhiteSpace: m.style.whiteSpace,
            });
        }
        const overflowing = out.filter(o => o.overflowsHost);
        const titles = out.filter(o => o.host.w > 120);
        return { count: out.length, overflowingCount: overflowing.length, overflowing: overflowing.slice(0, 8), titles: titles.slice(0, 8) };
    },
    // Flicker (reactivity thrash) + pitch-accent coverage. Idle churn = thrash
    // (words/mirrors removed+re-added with no content change); scroll churn is
    // expected (new videos). hostStyle = mirror-observer re-assert fights.
    explore: async () => {
        const c = { wordAdd: 0, wordRemove: 0, mirrorAdd: 0, mirrorRemove: 0, hostStyle: 0 };
        const isWord = n => n.nodeType === 1 && (n.matches?.('.jpdb-reader-word') || n.querySelector?.('.jpdb-reader-word'));
        const obs = new MutationObserver(muts => {
            for (const m of muts) {
                for (const n of m.addedNodes) { if (isWord(n)) c.wordAdd++; if (n.nodeType === 1 && n.matches?.('.jpdb-reader-text-mirror')) c.mirrorAdd++; }
                for (const n of m.removedNodes) { if (isWord(n)) c.wordRemove++; if (n.nodeType === 1 && n.matches?.('.jpdb-reader-text-mirror')) c.mirrorRemove++; }
                if (m.type === 'attributes' && m.attributeName === 'style' && m.target.querySelector?.('.jpdb-reader-text-mirror')) c.hostStyle++;
            }
        });
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
        await sleep(7000);
        const idle = { ...c };
        Object.keys(c).forEach(k => (c[k] = 0));
        window.scrollBy(0, 1400); await sleep(2000);
        window.scrollBy(0, 1800); await sleep(2000);
        window.scrollBy(0, -2000); await sleep(2500);
        const scroll = { ...c };
        obs.disconnect();
        const words = Array.from(document.querySelectorAll('.jpdb-reader-word'));
        const withPitch = words.filter(w => (w.dataset.pitchClass || '').length > 0);
        const colored = words.filter(w => Array.from(w.classList).some(x => x.startsWith('jpdb-pitch-') && x !== 'jpdb-pitch-'));
        const sampleMissing = words.filter(w => !(w.dataset.pitchClass || '')).slice(0, 10).map(w => w.dataset.surface || (w.textContent || '').slice(0, 8));
        return { idleChurn: idle, scrollChurn: scroll, words: words.length, withPitchClass: withPitch.length, coloredPitch: colored.length, pitchPct: Math.round(100 * withPitch.length / Math.max(1, words.length)), sampleMissingPitch: sampleMissing };
    },
    // Segmentation of kana words on the page.
    segments: () => {
        const groups = {};
        for (const w of document.querySelectorAll('.jpdb-reader-word')) {
            const host = w.closest('a,span,div')?.textContent?.slice(0, 24) || '';
            (groups[host] ||= []).push(w.dataset.surface || w.textContent);
        }
        const kana = Object.entries(groups)
            .filter(([k]) => /[぀-ゟ]/.test(k))
            .slice(0, 20)
            .map(([k, v]) => ({ container: k, words: v }));
        return { kana };
    },
    // Live release acceptance for annotation geometry and lazy coverage.
    acceptance: async () => {
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        const expand = document.querySelector('#description-inline-expander #expand, #description #expand, ytd-text-inline-expander #expand');
        if (expand instanceof HTMLElement) expand.click();
        await sleep(1200);
        const rect = selector => {
            const element = document.querySelector(selector);
            if (!(element instanceof HTMLElement)) return null;
            const box = element.getBoundingClientRect();
            return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
        };
        const overlap = (first, second) => Boolean(first && second
            && Math.min(first.right, second.right) > Math.max(first.left, second.left)
            && Math.min(first.bottom, second.bottom) > Math.max(first.top, second.top));
        const description = rect('#description-inline-expander, ytd-text-inline-expander, ytd-watch-metadata #description, yt-description-preview-view-model, yt-description-view-model');
        const video = rect('#movie_player, ytd-player');
        const secondary = rect('#secondary');
        const controlSamples = Array.from(document.querySelectorAll('button .jpdb-reader-word, [role="button"] .jpdb-reader-word, [role="tab"] .jpdb-reader-word'))
            .slice(0, 30)
            .map(word => {
                const control = word.closest('button,[role="button"],[role="tab"]');
                const controlRect = control?.getBoundingClientRect();
                const wordRect = word.getBoundingClientRect();
                return {
                    text: (word.dataset.expression || word.textContent || '').trim(),
                    readingCount: word.querySelectorAll('rt,.jpdb-reader-detached-furi').length,
                    centerDelta: controlRect ? Math.round((wordRect.top + wordRect.height / 2 - controlRect.top - controlRect.height / 2) * 10) / 10 : null,
                };
            });
        const collapse = document.querySelector('#description-inline-expander #collapse, #description #collapse, ytd-text-inline-expander #collapse');
        if (collapse instanceof HTMLElement) collapse.click();
        await sleep(600);
        const comments = document.querySelector('ytd-comments') || document.querySelector('#comments');
        comments?.scrollIntoView({ block: 'start' });
        await sleep(2500);
        window.scrollBy(0, 1200);
        await sleep(1500);
        const loadedJapaneseHosts = Array.from(document.querySelectorAll('ytd-comment-view-model #content-text,ytd-comment-renderer #content-text,ytm-comment-renderer #content-text'))
            .filter(element => /[぀-ヿ㐀-鿿]/.test(element.textContent || ''));
        const visibleJapaneseHosts = loadedJapaneseHosts
            .filter(element => {
                const box = element.getBoundingClientRect();
                return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight
                    && /[぀-ヿ㐀-鿿]/.test(element.textContent || '');
            });
        const unannotated = visibleJapaneseHosts
            .filter(element => !element.querySelector('.jpdb-reader-word,.jpdb-reader-text-mirror'))
            .map(element => (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80))
            .filter(Boolean)
            .slice(0, 20);
        return {
            descriptionExpanded: Boolean(expand),
            description,
            overlapsVideo: overlap(description, video),
            overlapsSecondary: overlap(description, secondary),
            controlSamples,
            maxControlCenterDelta: Math.max(0, ...controlSamples.map(sample => Math.abs(sample.centerDelta || 0))),
            controlsWithReadings: controlSamples.filter(sample => sample.readingCount > 0).map(sample => sample.text),
            commentsAvailable: Boolean(comments),
            loadedJapaneseCommentHosts: loadedJapaneseHosts.length,
            loadedAnnotatedCommentHosts: loadedJapaneseHosts.filter(element => element.querySelector('.jpdb-reader-word,.jpdb-reader-text-mirror')).length,
            bottomVisibleJapaneseHosts: visibleJapaneseHosts.length,
            bottomUnannotated: unannotated,
        };
    },
    comments: async () => {
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        const comments = document.querySelector('ytd-comments') || document.querySelector('#comments');
        comments?.scrollIntoView({ block: 'start' });
        await sleep(3000);
        window.scrollBy(0, 900);
        await sleep(1800);
        const candidates = Array.from(document.querySelectorAll('ytd-comments yt-attributed-string,ytd-comments yt-formatted-string,ytd-comments .ytAttributedStringHost,ytd-comments #content-text'))
            .filter(element => {
                const box = element.getBoundingClientRect();
                return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight
                    && /[぀-ヿ㐀-鿿]/.test(element.textContent || '');
            });
        const summary = element => ({
            text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100),
            annotated: Boolean(element.querySelector('.jpdb-reader-word,.jpdb-reader-text-mirror')),
        });
        return {
            commentsAvailable: Boolean(comments),
            visibleJapanese: candidates.map(summary),
            unannotated: candidates.filter(element => !element.querySelector('.jpdb-reader-word,.jpdb-reader-text-mirror')).map(summary),
        };
    },
    // Cross-site acceptance: open a visible sort/menu surface when present,
    // then inspect real rendered Japanese text nodes rather than fixture-owned
    // selectors. Works for Reddit, YouTube and other dynamic app shells.
    coverage: async () => {
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        const controls = Array.from(document.querySelectorAll('button,[role="button"]'));
        const opener = controls.find(element => /並べ替え|並び替え|sort/i.test((element.textContent || element.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()));
        if (opener instanceof HTMLElement) {
            opener.click();
            await sleep(1200);
        }
        // Allow the live page's final mutation scan and parser batch to settle;
        // the probe must not count a discovered-but-still-in-flight target as
        // permanently bare on slower mobile/API runs.
        await sleep(5000);
        const samples = [];
        const seen = new Set();
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let inspected = 0, node = walker.nextNode(); node && inspected < 2400; inspected += 1, node = walker.nextNode()) {
            const parent = node.parentElement;
            const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
            if (!parent || !text || !/[぀-ヿ㐀-鿿]/.test(text)) continue;
            if (parent.closest('[data-jpdb-reader-root],script,style,noscript,svg,rt,rp,[aria-hidden="true"]')) continue;
            const rect = parent.getBoundingClientRect();
            const style = getComputedStyle(parent);
            if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') <= 0) continue;
            if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) continue;
            const key = `${text}\n${Math.round(rect.left)}:${Math.round(rect.top)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const host = parent.closest('.jpdb-reader-word') || parent;
            const annotated = Boolean(parent.closest('.jpdb-reader-word,.jpdb-reader-text-mirror')
                || host.querySelector?.('.jpdb-reader-word,.jpdb-reader-text-mirror'));
            samples.push({
                text: text.slice(0, 90),
                tag: parent.tagName.toLowerCase(),
                role: parent.getAttribute('role') || '',
                annotated,
                readings: host.querySelectorAll?.('rt,.jpdb-reader-detached-furi').length || 0,
                context: Array.from({ length: 6 }, (_, index) => {
                    let current = parent;
                    for (let depth = 0; depth < index && current; depth += 1) current = current.parentElement;
                    if (!current) return '';
                    const classes = typeof current.className === 'string'
                        ? current.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.')
                        : '';
                    return `${current.localName}${current.id ? `#${current.id}` : ''}${classes ? `.${classes}` : ''}${current.getAttribute('role') ? `[role=${current.getAttribute('role')}]` : ''}`;
                }).filter(Boolean),
            });
        }
        const unannotated = samples.filter(sample => !sample.annotated);
        return {
            menuOpened: Boolean(opener),
            visibleJapaneseSamples: samples.length,
            annotatedSamples: samples.length - unannotated.length,
            unannotated: unannotated.slice(0, 40),
            menuSamples: samples.filter(sample => sample.role === 'menuitem' || /順|メニュー|ハイライト/.test(sample.text)).slice(0, 30),
            words: document.querySelectorAll('.jpdb-reader-word').length,
            readings: document.querySelectorAll('rt,.jpdb-reader-detached-furi').length,
        };
    },
    // Open a real YouTube engagement surface (Ask, transcript, or summary) and
    // prove its short functional heading is covered by the generic residual
    // scanner rather than a YouTube-only parser.
    engagement: async () => {
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        const visible = element => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight
                && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0;
        };
        const label = element => (element.textContent || element.getAttribute('aria-label') || element.getAttribute('title') || '')
            .replace(/\s+/g, ' ').trim();
        const initialControls = Array.from(document.querySelectorAll('button,[role="button"]'))
            .filter(element => element instanceof HTMLElement && visible(element));
        const descriptionExpand = document.querySelector('#description-inline-expander #expand, #description #expand, ytd-text-inline-expander #expand')
            || initialControls.find(element => /もっと見る|show more/i.test(label(element)));
        if (descriptionExpand instanceof HTMLElement) {
            descriptionExpand.click();
            await sleep(1200);
        }
        const controls = Array.from(document.querySelectorAll('button,[role="button"]'))
            .filter(element => {
                if (!(element instanceof HTMLElement)) return false;
                const rect = element.getBoundingClientRect();
                const style = getComputedStyle(element);
                return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
            });
        const patterns = [/質問|ask/i, /文字起こし|transcript/i, /概要|summary/i];
        const opener = patterns.map(pattern => controls.find(element => pattern.test(label(element)))).find(Boolean);
        if (opener instanceof HTMLElement) {
            opener.scrollIntoView({ block: 'center' });
            await sleep(250);
            opener.click();
            await sleep(4500);
        }
        const panels = Array.from(document.querySelectorAll('ytd-engagement-panel-section-list-renderer,ytm-engagement-panel-section-list-renderer,[role="dialog"]'))
            .filter(element => element instanceof HTMLElement && visible(element));
        const samples = [];
        for (const panel of panels) {
            const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const parent = node.parentElement;
                const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
                if (!parent || !text || !/[぀-ヿ㐀-鿿]/.test(text) || parent.closest('script,style,svg,rt,rp,[aria-hidden="true"]') || !visible(parent)) continue;
                const heading = parent.closest('h1,h2,h3,h4,h5,h6,[role="heading"]');
                samples.push({
                    text: text.slice(0, 100),
                    heading: Boolean(heading),
                    centered: Boolean(heading && getComputedStyle(heading).textAlign === 'center'),
                    annotated: Boolean(parent.closest('.jpdb-reader-word,.jpdb-reader-text-mirror')
                        || parent.querySelector('.jpdb-reader-word,.jpdb-reader-text-mirror')),
                    parserIds: Array.from(parent.closest('.jpdb-reader-text-mirror')?.querySelectorAll('.jpdb-reader-word') || [])
                        .map(word => word.getAttribute('data-parser-id')).filter(Boolean),
                });
            }
        }
        return {
            opener: opener instanceof HTMLElement ? label(opener).slice(0, 120) : null,
            panels: panels.length,
            samples,
            unannotated: samples.filter(sample => !sample.annotated),
            centeredHeadings: samples.filter(sample => sample.heading && sample.centered),
        };
    },
    rail: async () => {
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        const rail = document.querySelector('.jpdb-subtitle-rail');
        if (!(rail instanceof HTMLElement)) return { found: false };
        const snapshot = () => {
            const rect = rail.getBoundingClientRect();
            const gear = document.querySelector('.ytp-settings-button,[aria-label*="設定" i],[aria-label*="settings" i]');
            const gearRect = gear instanceof HTMLElement ? gear.getBoundingClientRect() : null;
            const primary = document.querySelector('.jpdb-subtitle-primary');
            const word = primary?.querySelector('.jpdb-reader-word');
            const overlap = Boolean(gearRect
                && Math.min(rect.right, gearRect.right) > Math.max(rect.left, gearRect.left)
                && Math.min(rect.bottom, gearRect.bottom) > Math.max(rect.top, gearRect.top));
            return {
                rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
                gear: gearRect ? { left: gearRect.left, top: gearRect.top, right: gearRect.right, bottom: gearRect.bottom } : null,
                overlapsSettings: overlap,
                actions: Array.from(rail.querySelectorAll('button')).map(button => button.dataset.action),
                pinned: rail.querySelector('[data-action="rail-expand"]')?.getAttribute('aria-expanded'),
                moveHandle: Boolean(rail.querySelector('[data-subtitle-rail-drag-handle]')),
                primaryPointerEvents: primary instanceof HTMLElement ? getComputedStyle(primary).pointerEvents : null,
                wordPointerEvents: word instanceof HTMLElement ? getComputedStyle(word).pointerEvents : null,
                rootClasses: rail.closest('.jpdb-subtitle-player')?.className || '',
            };
        };
        const before = snapshot();
        rail.querySelector('[data-action="rail-expand"]')?.click();
        await sleep(120);
        return { found: true, before, afterPin: snapshot() };
    },
    // Empirically validate the geometry fix on a real broken title mirror.
    fixprobe: () => {
        const results = [];
        for (const m of document.querySelectorAll('.jpdb-reader-text-mirror')) {
            const host = m.parentElement;
            if (!host) continue;
            const hr = host.getBoundingClientRect();
            const mrBefore = m.getBoundingClientRect();
            const collapsed = mrBefore.width < hr.width - 4;
            if (!collapsed || hr.width < 120) continue;
            const cs = getComputedStyle(host);
            const before = { hostW: Math.round(hr.width), mW: Math.round(mrBefore.width), mH: Math.round(mrBefore.height), hostDisplay: cs.display };
            // Apply candidate fix in place.
            if (cs.display === 'inline') host.style.setProperty('display', 'inline-block', 'important');
            m.style.setProperty('inset', '0 0 auto 0');
            m.style.removeProperty('width');
            m.style.removeProperty('min-width');
            // force reflow
            void host.offsetWidth;
            const hr2 = host.getBoundingClientRect();
            const mr2 = m.getBoundingClientRect();
            results.push({ src: (m.dataset.sourceText || '').slice(0, 30), before, after: { hostW: Math.round(hr2.width), mW: Math.round(mr2.width), mH: Math.round(mr2.height) } });
            if (results.length >= 8) break;
        }
        return { fixedSamples: results };
    },
};

const probe = DIAGS[diagName] || DIAGS.overview;

const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    headless,
    viewport: { width, height },
    locale: 'ja-JP',
    bypassCSP: true,
    ...(process.env.YT_MOBILE === '1' ? { userAgent: mobileUA, isMobile: true, hasTouch: true } : {}),
    args: ['--disable-blink-features=AutomationControlled'],
});

// Cross-origin GM_xmlhttpRequest bridge (CORS-free, server-side fetch).
await ctx.exposeFunction('__yomuReq', async (opts) => {
    try {
        const res = await ctx.request.fetch(opts.url, {
            method: opts.method || 'GET',
            headers: opts.headers || {},
            data: opts.data,
            timeout: 20000,
        });
        const body = await res.text();
        const headers = res.headers();
        return { status: res.status(), statusText: '', responseText: body,
            responseHeaders: Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') };
    } catch (e) { return { status: 0, error: String(e) }; }
});

const initScript = `
(() => {
  const store = new Map(Object.entries(${JSON.stringify({ 'jpdb-popup-reader-settings': SETTINGS })}));
  const listeners = new Map();
  const enc = v => JSON.stringify(v);
  const dec = v => { try { return JSON.parse(v); } catch { return v; } };
  window.GM_getValue = (k, d) => store.has(k) ? store.get(k) : d;
  window.GM_setValue = (k, v) => { const old = store.get(k); store.set(k, v); (listeners.get(k)||[]).forEach(f=>{try{f(k,old,v,false)}catch{}}); };
  window.GM_deleteValue = (k) => store.delete(k);
  window.GM_listValues = () => Array.from(store.keys());
  window.GM_addValueChangeListener = (k, f) => { const a=listeners.get(k)||[]; a.push(f); listeners.set(k,a); return a.length-1; };
  window.GM_removeValueChangeListener = () => {};
  window.GM_registerMenuCommand = () => {};
  window.GM_openInTab = (u) => window.open(u, '_blank');
  const yomuCss = ${JSON.stringify(READER_CSS)};
  window.GM_getResourceText = name => name === 'yomuCss' ? yomuCss : '';
  window.GM_info = { script: { version: '1.2.0', name: 'yomu' }, scriptHandler: 'HarnessGM' };
  window.GM = {
    getValue: async (k,d)=>window.GM_getValue(k,d), setValue: async (k,v)=>window.GM_setValue(k,v),
    deleteValue: async k=>window.GM_deleteValue(k), listValues: async ()=>window.GM_listValues(),
    registerMenuCommand: ()=>{}, openInTab: u=>window.open(u,'_blank'),
    xmlHttpRequest: (o)=>window.GM_xmlhttpRequest(o),
  };
  window.GM_xmlhttpRequest = (o) => {
    Promise.resolve(window.__yomuReq({ method:o.method, url:o.url, headers:o.headers, data:o.data }))
      .then(r => { if (r && r.status && o.onload) o.onload({ status:r.status, statusText:r.statusText||'', responseText:r.responseText||'', response:r.responseText||'', responseHeaders:r.responseHeaders||'', finalUrl:o.url }); else if (o.onerror) o.onerror(r||{status:0}); })
      .catch(e => { if (o.onerror) o.onerror({ status:0, error:String(e) }); });
    return { abort(){} };
  };
})();
`;
await ctx.addInitScript({ content: initScript });
for (const s of SCRIPTS) {
    // Run each dist file at document-start in the page's main world.
    await ctx.addInitScript({ content: s.code });
}

const page = ctx.pages()[0] || await ctx.newPage();
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
page.on('pageerror', e => consoleErrors.push('PAGEERR ' + String(e).slice(0, 200)));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
// Let YouTube hydrate + Yomu scan + jpdb parse settle.
await page.waitForTimeout(9000);

const popoverState = () => page.evaluate(() => {
    const p = document.querySelector('.jpdb-reader-popover');
    return { open: Boolean(p) && p.getBoundingClientRect().width > 0, text: p ? (p.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50) : '' };
});

// Deterministic live test of the popover re-anchor patch: open the popover by
// hovering a word, then simulate a YouTube reconcile by replacing the hovered
// node with a same-vid:sid clone, and confirm the popover survives + re-anchors
// instead of auto-dismissing. Also flags any flicker during the hover.
async function runHoverExploration() {
    const box = await page.evaluate(() => {
        const words = Array.from(document.querySelectorAll('.jpdb-reader-word'));
        const w = words.find(el => (el.dataset.surface || '').length >= 2 && /[぀-ヿ㐀-鿿]/.test(el.dataset.surface || el.textContent || '') && el.getBoundingClientRect().width > 0);
        if (!w) return null;
        const r = w.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), surface: w.dataset.surface || w.textContent, vid: w.dataset.vid, sid: w.dataset.sid };
    });
    if (!box) return { error: 'no hoverable word found' };
    await page.mouse.move(box.x - 40, box.y - 40);
    await page.mouse.move(box.x, box.y);
    await page.waitForTimeout(1400);
    const afterOpen = await popoverState();
    await page.waitForTimeout(3000); // stationary — pre-fix bug would dismiss here on reconcile
    const afterStationary = await popoverState();
    // Force the reactive-replacement scenario the fix targets.
    const replaced = await page.evaluate(pt => {
        const el = document.elementFromPoint(pt.x, pt.y);
        const word = el && el.closest && el.closest('.jpdb-reader-word');
        if (!word || !word.parentNode) return false;
        word.replaceWith(word.cloneNode(true));
        return true;
    }, box);
    await page.waitForTimeout(1500); // hover-watch tick(s)
    const afterReconcile = await popoverState();
    await page.screenshot({ path: path.join(APP, `qa-artifacts/yt-hover-${width}x${height}.png`) }).catch(() => {});
    return { hovered: box.surface, vidSid: `${box.vid}:${box.sid}`, afterOpen, afterStationary, nodeReplaced: replaced, afterReconcile, reanchorSurvived: afterOpen.open && afterReconcile.open };
}

async function runRailDragExploration() {
    const before = await page.evaluate(() => {
        const rail = document.querySelector('.jpdb-subtitle-rail');
        const handle = rail?.querySelector('[data-subtitle-rail-drag-handle]');
        if (!(rail instanceof HTMLElement) || !(handle instanceof HTMLElement)) return null;
        const railRect = rail.getBoundingClientRect();
        const handleRect = handle.getBoundingClientRect();
        return {
            rail: { left: railRect.left, top: railRect.top },
            handle: { x: handleRect.left + handleRect.width / 2, y: handleRect.top + handleRect.height / 2 },
        };
    });
    if (!before) return { moved: false, error: 'no rail drag handle' };
    await page.mouse.move(before.handle.x, before.handle.y);
    await page.mouse.down();
    await page.mouse.move(before.handle.x + 56, before.handle.y + 72, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(180);
    const after = await page.evaluate(() => {
        const rail = document.querySelector('.jpdb-subtitle-rail');
        if (!(rail instanceof HTMLElement)) return null;
        const rect = rail.getBoundingClientRect();
        return {
            left: rect.left,
            top: rect.top,
            stored: window.GM_getValue?.('jpdb-reader-subtitle-control-rail-position', null) ?? null,
        };
    });
    return {
        before: before.rail,
        after,
        moved: Boolean(after && (Math.abs(after.left - before.rail.left) > 20 || Math.abs(after.top - before.rail.top) > 20)),
    };
}

async function runRailTapExploration() {
    await page.waitForTimeout(3200);
    const snapshot = () => page.evaluate(() => {
        const root = document.querySelector('.jpdb-subtitle-player');
        const rail = root?.querySelector('.jpdb-subtitle-rail');
        const handle = rail?.querySelector('[data-subtitle-rail-drag-handle]');
        if (!(root instanceof HTMLElement) || !(rail instanceof HTMLElement) || !(handle instanceof HTMLElement)) return null;
        const rect = handle.getBoundingClientRect();
        return {
            idle: root.classList.contains('jpdb-subtitle-controls-idle'),
            visibleActions: Array.from(rail.querySelectorAll('button')).filter(button => getComputedStyle(button).display !== 'none').map(button => button.dataset.action),
            point: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        };
    });
    const before = await snapshot();
    if (!before) return { expanded: false, error: 'no rail tap handle' };
    if (process.env.YT_MOBILE === '1') await page.touchscreen.tap(before.point.x, before.point.y);
    else await page.mouse.click(before.point.x, before.point.y);
    await page.waitForTimeout(180);
    const after = await snapshot();
    return {
        before,
        after,
        expanded: Boolean(after && before.idle && !after.idle && after.visibleActions.length > before.visibleActions.length),
    };
}

async function runFullscreenExploration() {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(350);
    const videoBox = await page.evaluate(() => {
        const video = Array.from(document.querySelectorAll([
            'video',
            '#player',
            '#movie_player',
            'ytm-player',
            '.player-container',
            '.player-container-inner',
            '.html5-video-player',
            'ytm-player-control-overlay',
        ].join(',')))
            .map(element => {
                const rect = element.getBoundingClientRect();
                const visibleHeight = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
                const visibleWidth = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
                const plausibleFrame = rect.width >= innerWidth * 0.65
                    && rect.height >= 100
                    && rect.height <= innerHeight * 0.7;
                return { element, rect, visibleArea: plausibleFrame ? visibleWidth * visibleHeight : 0 };
            })
            .sort((a, b) => b.visibleArea - a.visibleArea)[0];
        if (!video || !(video.element instanceof HTMLElement) || video.visibleArea <= 0) return null;
        const rect = video.rect;
        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            element: `${video.element.localName}${video.element.id ? `#${video.element.id}` : ''}.${String(video.element.className || '').trim().split(/\s+/).slice(0, 3).join('.')}`,
        };
    });
    if (videoBox) {
        await page.mouse.click(videoBox.x, videoBox.y);
        await page.evaluate(() => {
            const video = Array.from(document.querySelectorAll('video')).find(element => element.readyState >= 1);
            if (!video) return;
            if (Number.isFinite(video.duration) && video.duration > 70) video.currentTime = 60;
            void video.play().catch(() => undefined);
        });
        await page.waitForTimeout(2200);
        await page.mouse.move(videoBox.right - 24, videoBox.bottom - 24);
        await page.waitForTimeout(300);
    }
    const before = await page.evaluate(videoRect => {
        const visible = element => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        };
        const candidates = Array.from(document.querySelectorAll('button,[role="button"]'))
            .filter(element => element instanceof HTMLElement && visible(element))
            .map(element => {
                const rect = element.getBoundingClientRect();
                return {
                    element,
                    label: element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '',
                    classes: String(element.className || ''),
                    rect,
                };
            });
        const candidate = candidates.find(item => /fullscreen|full screen|全画面/i.test(`${item.label} ${item.classes}`));
        const point = candidate
            ? { x: candidate.rect.left + candidate.rect.width / 2, y: candidate.rect.top + candidate.rect.height / 2 }
            : { x: videoRect.right - 24, y: videoRect.bottom - 24 };
        window.__yomuFullscreenProbeTarget = null;
        document.addEventListener('click', event => {
            const target = event.target;
            window.__yomuFullscreenProbeTarget = target instanceof Element
                ? { tag: target.localName, id: target.id, classes: String(target.className || '').slice(0, 120), reader: Boolean(target.closest('[data-jpdb-reader-root],.jpdb-subtitle-player,.jpdb-subtitle-surface,.jpdb-subtitle-text')) }
                : { tag: '', id: '', classes: '', reader: false };
        }, { once: true, capture: true });
        if (candidate) candidate.element.addEventListener('click', () => { candidate.element.dataset.yomuFullscreenProbeReceived = 'true'; }, { once: true, capture: true });
        return {
            found: true,
            point,
            explicitButton: Boolean(candidate),
            label: candidate?.label.trim().slice(0, 100) || 'video bottom-right',
            classes: candidate?.classes.slice(0, 120) || '',
            rect: candidate
                ? { left: candidate.rect.left, top: candidate.rect.top, right: candidate.rect.right, bottom: candidate.rect.bottom }
                : videoRect,
            hitStack: document.elementsFromPoint(point.x, point.y).slice(0, 10).map(element => ({
                tag: element.localName,
                id: element.id,
                classes: String(element.className || '').slice(0, 120),
                reader: Boolean(element.closest('[data-jpdb-reader-root],.jpdb-subtitle-player,.jpdb-subtitle-surface,.jpdb-subtitle-text')),
                pointerEvents: getComputedStyle(element).pointerEvents,
            })),
        };
    }, videoBox);
    if (!before.found) return before;
    await page.mouse.click(before.point.x, before.point.y);
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => {
        const received = document.querySelector('[data-yomu-fullscreen-probe-received="true"]');
        const video = document.querySelector('video');
        return {
            nativeButtonReceivedClick: Boolean(received),
            clickedTarget: window.__yomuFullscreenProbeTarget ?? null,
            fullscreenElement: document.fullscreenElement?.localName || null,
            webkitDisplayingFullscreen: Boolean(video && 'webkitDisplayingFullscreen' in video && video.webkitDisplayingFullscreen),
        };
    });
    return { before, after };
}

let result;
let diagnosticError = '';
if (diagName === 'hover') {
    try { result = await runHoverExploration(); } catch (e) { diagnosticError = String(e); result = { hoverError: diagnosticError }; }
} else if (diagName === 'rail') {
    try {
        const tap = await runRailTapExploration();
        result = await page.evaluate(probe);
        result.tap = tap;
        result.drag = await runRailDragExploration();
        result.fullscreen = await runFullscreenExploration();
    } catch (e) { diagnosticError = String(e); result = { railError: diagnosticError }; }
} else if (diagName === 'reddit') {
    try {
        const consentButtons = [
            page.getByRole('button', { name: /すべて承諾|Accept All/i }).first(),
            page.locator('button').filter({ hasText: /すべて.*承諾|Accept All/i }).first(),
            page.getByText(/すべて.*承諾|Accept All/i).last(),
        ];
        let consentDismissed = false;
        for (const consent of consentButtons) {
            await consent.waitFor({ state: 'visible', timeout: 3500 }).catch(() => {});
            if (!await consent.isVisible().catch(() => false)) continue;
            await consent.click();
            consentDismissed = true;
            await page.waitForTimeout(2200);
            break;
        }
        const close = page.getByRole('button', { name: /閉じる|Close/i }).first();
        if (await close.isVisible().catch(() => false)) {
            await close.click();
            await page.waitForTimeout(1200);
        }
        result = await page.evaluate(probe);
        result.consentDismissed = consentDismissed;
    } catch (e) { diagnosticError = String(e); result = { redditError: diagnosticError }; }
} else if (diagName === 'fullscreen') {
    try { result = await runFullscreenExploration(); } catch (e) { diagnosticError = String(e); result = { fullscreenError: diagnosticError }; }
} else {
    try { result = await page.evaluate(probe); } catch (e) { diagnosticError = String(e); result = { evalError: diagnosticError }; }
}

const shot = path.join(APP, `qa-artifacts/yt-${diagName}-${width}x${height}.png`);
mkdirSync(path.dirname(shot), { recursive: true });
await page.screenshot({ path: shot, fullPage: false }).catch(() => {});

const validationError = diagnosticError || validateDiagnostic(diagName, result);
console.log(JSON.stringify({
    diag: diagName,
    url,
    viewport: `${width}x${height}`,
    jpdbKey: jpdbKey ? 'set' : 'none',
    result,
    validationError: validationError || null,
    consoleErrors: consoleErrors.slice(0, 8),
    shot,
}, null, 2));

await Promise.race([
    ctx.close(),
    new Promise(resolve => setTimeout(resolve, 3000)),
]).catch(() => undefined);
if (validationError) {
    console.error(`[yt-live-harness] FAIL ${diagName}: ${validationError}`);
    process.exitCode = 1;
}

function validateDiagnostic(name, value) {
    if (!value || typeof value !== 'object') return 'diagnostic returned no result';
    if (name === 'overview' && !value.yomuPresent) return 'Yomu did not mount';
    if (name === 'annotations') {
        if (!value.projections?.length) return 'no projected readings were measured';
        if (value.maxCenterDelta > 0.75 || value.maxBaseGap > 0.75) return 'projected readings drifted from their source ranges';
    }
    if (name === 'reddit') {
        if (!value.samples?.length || value.samples.some(sample => !sample.found)) return 'Reddit sort control was not stable for every sample';
        if (value.uniqueSignatures?.length !== 1) return 'Reddit annotation signature changed during sampling';
        if (value.samples.some(sample => !sample.readings?.length)) return 'Reddit sort control lost its projected readings';
    }
    if (name === 'playback') {
        if (!value.settingsOpened || !value.speedOpened) return 'YouTube playback-speed menus did not both open';
        if (!value.rows?.length) return 'no annotated playback-speed row containing 倍 was found';
        if (!value.projections?.length) return 'no ばい projection was found for 倍';
        if (value.projections.some(projection => !projection.exactSource)) return 'no independent native 倍 range was found';
        if (value.projections.some(projection => Math.abs(projection.centerDelta) > 0.75 || Math.abs(projection.baseGap) > 0.75)) {
            return 'ばい was not aligned to the exact 倍 range';
        }
    }
    if (name === 'subtitlebound') {
        if (!value.stale?.insideVideo || !value.afterPageDown?.insideVideo) return 'subtitle line escaped the active video frame';
    }
    return '';
}
