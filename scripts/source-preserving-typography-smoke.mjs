#!/usr/bin/env node
// Real-engine DOM fixtures: proportional Japanese source text keeps its exact
// glyph Ranges; visible reading/underline paint remains attached to those Ranges.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, webkit } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const temp = mkdtempSync(path.join(tmpdir(), 'yomu-source-typography-'));
const out = path.join(root, 'artifacts/source-preserving-typography');
mkdirSync(out, { recursive: true });
try {
    execFileSync(process.execPath, [path.join(root, 'scripts/build-reader-css.mjs')], {
        env: { ...process.env, YOMU_READER_CSS_OUT: path.join(temp, 'yomu.css'), YOMU_NEW_TAB_CSS_OUT: path.join(temp, 'newtab.css') }, stdio: 'pipe',
    });
    const css = readFileSync(path.join(temp, 'yomu.css'), 'utf8');
    const probe = (await build({ bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent', stdin: {
        resolveDir: root, contents: `
            import './src/reader/companions/annotations.ts';
            import { applyTokensToScanTarget, collectTextTargetsIn, collectFragmentTextTargetsIn, projectAdditiveTextMirrors,
                documentPortalReaderWordScopeForSource, removeNonDestructiveScanMirrors, projectedReadingWordAtPoint } from './src/reader/dom/index.ts';
            import { DEFAULT_SETTINGS } from './src/reader/settings/index.ts';
            ${[settleProjection, readingOwner, visibleReadings, measureSourceProjection, hasUnderline, findFixtureTarget].map(fn => fn.toString()).join('\n')}
            Object.assign(window, { runSourceTypography: ${runSourceTypography.toString()}, runMixedTypography: ${runMixedTypography.toString()} });
        `,
    } })).outputFiles[0].text;
    for (const [name, browserType] of [['chromium', chromium], ['webkit', webkit]]) {
        const browser = await browserType.launch({ headless: true });
        const results = [];
        try {
            const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
            await page.setContent(`<style>${css}</style><style>body{margin:40px;font-family:"Yu Mincho","Yu Gothic",Meiryo,serif}p{line-height:1.9;letter-spacing:.04em}span{font-family:"Courier New",monospace;font-style:italic;font-weight:700;letter-spacing:4px}</style>`);
            await page.addScriptTag({ content: probe });
            for (const size of [16, 20, 32]) {
                for (const scale of [1, 1.25]) {
                    for (const enabled of [true, false]) {
                        const result = await page.evaluate(options => window.runSourceTypography(options), { size, scale, enabled });
                        const label = `${name} ${size}px scale${scale} palt ${enabled}`;
                        assert.equal(result.projected, enabled, `${label}: wrong annotation path`);
                        if (enabled) {
                            assert(result.sourceRetained, `${label}: source text node was replaced`);
                            assert.deepEqual(result.before, result.after, `${label}: glyph geometry changed`);
                            assert(result.underlineVisible, `${label}: underline disappeared`);
                            assert(result.readings.length > 0, `${label}: visible reading disappeared`);
                            assert(result.readings.every(reading => reading.expression === '学習' && reading.fontSize === size * .5), `${label}: reading owner or size changed ${JSON.stringify(result.readings)}`);
                            assert(result.readings.every(reading => reading.fontFamily === result.fontFamily && reading.fontWeight === '400' && reading.letterSpacing === 'normal'), `${label}: reading picked up host span typography`);
                            assert(result.fragmentErrors.every(error => error <= 1), `${label}: underline left its source Range`);
                            assert(result.styleChangeErrors.every(error => error <= 1), `${label}: style change left stale projection`);
                        }
                        results.push({ size, scale, enabled, ...result });
                    }
                }
            }
            for (const enabled of [true, false]) {
                const mixed = await page.evaluate(enabled => window.runMixedTypography(enabled), enabled);
                assert.equal(mixed.schoolOwners, 1, `${name} mixed palt${enabled}: duplicate link reading owner`);
                assert(mixed.linkRetained && mixed.clicks === 1, `${name} mixed palt${enabled}: native link identity/dispatch changed`);
                if (enabled) {
                    assert.equal(mixed.japaneseOwners, 1, `${name}: uniform spans split a source word`);
                    assert.equal(mixed.readings.length, 2, `${name}: mixed source readings disappeared`);
                    assert.deepEqual(mixed.readings.map(reading => reading.expression).sort(), ['学校教育', '日本語'].sort(), `${name}: reading hit routing lost its source owner`);
                    assert(mixed.readings.every(reading => reading.error <= 1), `${name}: duplicate paint shifted a mixed reading lane`);
                }
                results.push({ mixed: true, enabled, ...mixed });
            }
            writeFileSync(path.join(out, `${name}.json`), `${JSON.stringify(results, null, 2)}\n`);
            console.log(`${name}: ${results.length} proportional-font projection/lifecycle fixtures passed`);
        } finally { await browser.close(); }
    }
} finally { rmSync(temp, { recursive: true, force: true }); }

async function settleProjection() {
    const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await frames();
    projectAdditiveTextMirrors(document);
    await frames();
}

function readingOwner(rect) {
    return projectedReadingWordAtPoint(document, (rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2)?.dataset.expression;
}

function visibleReadings() {
    return Array.from(document.querySelectorAll('[data-yomu-projected-reading]')).filter(reading => {
        const style = getComputedStyle(reading);
        return style.display !== 'none' && style.visibility !== 'hidden';
    });
}

function findFixtureTarget(candidates, text) {
    const target = candidates.find(candidate => candidate.text === text);
    if (!target) throw new Error(`Typography fixture target was not collected: ${text}`);
    return target;
}

async function runMixedTypography(enabled) {
    const host = document.createElement('p');
    host.style.cssText = `font-size:20px;font-feature-settings:"palt" ${enabled ? 1 : 0}`;
    host.innerHTML = '日<span style="font:inherit;font-feature-settings:inherit;letter-spacing:inherit">本語</span>を<a href="#school">学校教育</a>で';
    document.body.append(host);
    const link = host.querySelector('a');
    let clicks = 0;
    link.addEventListener('click', event => { clicks += 1; event.preventDefault(); });
    const text = host.textContent;
    const target = findFixtureTarget(collectFragmentTextTargetsIn(host, 40, false), text);
    const linkTarget = findFixtureTarget(collectFragmentTextTargetsIn(link, 40, false), '学校教育');
    const token = (spelling, reading, start) => ({
        card: { vid: 1, sid: 1, rid: 0, spelling, reading, frequencyRank: null, partOfSpeech: [], meanings: [],
            cardState: ['new'], pitchAccent: ['LHHHH'], wordWithReading: null, source: 'jpdb' },
        start, end: start + spelling.length, length: spelling.length,
        rubies: [{ text: reading, start, end: start + spelling.length, length: spelling.length }],
        pitchClass: 'heiban', sentence: text,
    });
    const settings = { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all', wordColorHiddenStateGroups: [] };
    applyTokensToScanTarget(target, [token('日本語', 'にほんご', 0), token('学校教育', 'がっこうきょういく', 4)], settings);
    if (enabled) applyTokensToScanTarget(linkTarget, [token('学校教育', 'がっこうきょういく', 0)], settings);
    await settleProjection();
    const schoolOwners = document.querySelectorAll('.jpdb-reader-word[data-expression="学校教育"]').length;
    const japaneseOwners = document.querySelectorAll('.jpdb-reader-word[data-expression="日本語"]').length;
    const readings = visibleReadings().map(reading => {
        const rect = reading.getBoundingClientRect();
        const centre = Number(reading.dataset.yomuSourceLeft) + Number(reading.dataset.yomuSourceWidth) / 2;
        return { expression: readingOwner(rect), error: Math.abs((rect.left + rect.right) / 2 - centre) };
    });
    const linkRetained = host.querySelector('a') === link;
    link.click();
    removeNonDestructiveScanMirrors(host);
    host.remove();
    return { schoolOwners, japaneseOwners, readings, linkRetained, clicks };
}

async function runSourceTypography({ size, scale, enabled }) {
    const host = document.createElement('p');
    host.style.cssText = `font-size:${size}px;font-feature-settings:"palt" ${enabled ? 1 : 0};transform:scale(${scale});transform-origin:0 0`;
    host.textContent = 'で学習を';
    document.body.append(host);
    document.documentElement.classList.add('jpdb-reader-word-underline-pitch');
    const source = host.firstChild;
    const characterRects = () => Array.from(source.textContent, (_, index) => {
        const range = document.createRange();
        range.setStart(source, index);
        range.setEnd(source, index + 1);
        const rect = range.getBoundingClientRect();
        return [rect.x, rect.y, rect.width, rect.height];
    });
    const before = characterRects();
    const target = findFixtureTarget(collectTextTargetsIn(host, 40, false), host.textContent);
    const card = { vid: 1, sid: 1, rid: 0, spelling: '学習', reading: 'がくしゅう', frequencyRank: null,
        partOfSpeech: [], meanings: [], cardState: ['new'], pitchAccent: ['LHHHH'], wordWithReading: null, source: 'jpdb' };
    applyTokensToScanTarget(target, [{ card, start: 1, end: 3, length: 2,
        rubies: [{ text: 'がくしゅう', start: 1, end: 3, length: 2 }], pitchClass: 'heiban', sentence: 'で学習を' }], {
        ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all', wordUnderlineColorSource: 'pitch',
        wordHighlightColorSource: 'off', wordTextColorSource: 'off', wordColorHiddenStateGroups: [],
    });
    await settleProjection();
    const portal = documentPortalReaderWordScopeForSource(host) ?? host.querySelector('.jpdb-reader-additive-text-mirror');
    const projected = Boolean(portal);
    if (!enabled) {
        const inline = host.querySelectorAll('.jpdb-reader-word').length;
        host.remove();
        return { projected, inline };
    }
    const result = measureSourceProjection(host, source, before, characterRects, portal);
    removeNonDestructiveScanMirrors(host);
    host.remove();
    return { projected, ...result };
}

function measureSourceProjection(host, source, before, characterRects, portal) {
    if (!portal) throw new Error('proportional host has no source projection');
    const sourceRetained = host.firstChild === source;
    const after = characterRects();
    const fragmentErrors = () => {
        const range = document.createRange();
        range.setStart(source, 1);
        range.setEnd(source, 3);
        const sourceRects = Array.from(range.getClientRects());
        return Array.from(portal.querySelectorAll('.jpdb-reader-source-fragment'), (fragment, index) => {
            const rect = fragment.getBoundingClientRect();
            const native = sourceRects[index];
            return Math.max(Math.abs(rect.left - native.left), Math.abs(rect.top - native.top),
                Math.abs(rect.width - native.width), Math.abs(rect.height - native.height));
        });
    };
    const errors = fragmentErrors();
    const fragment = portal.querySelector('.jpdb-reader-source-fragment');
    const underlineVisible = hasUnderline(fragment);
    const readings = visibleReadings().map(reading => {
        const style = getComputedStyle(reading);
        return { expression: readingOwner(reading.getBoundingClientRect()), fontSize: parseFloat(style.fontSize),
            fontFamily: style.fontFamily, fontWeight: style.fontWeight, letterSpacing: style.letterSpacing };
    });
    host.style.fontFeatureSettings = '"palt" 0';
    projectAdditiveTextMirrors(document);
    await frames();
    const styleChangeErrors = fragmentErrors();
    const fontFamily = getComputedStyle(host).fontFamily;
    return { sourceRetained, before, after, fragmentErrors: errors, underlineVisible, readings, styleChangeErrors, fontFamily };
}

function hasUnderline(fragment) {
    if (!fragment) return false;
    const paint = getComputedStyle(fragment, '::after');
    return parseFloat(paint.borderBlockEndWidth) > 0 && !/transparent|rgba\([^)]*,\s*0\)/.test(paint.borderBlockEndColor);
}
