#!/usr/bin/env node
// Lookup popover regression smoke: the selection/search token strip flows
// inline as a wrapping sentence (numbers and gap text preserved, pitch/state
// classes carried), and the Composed of section renders wrapping, focusable
// ruby chips. Runs in Chromium AND WebKit (iPhone reports drove these fixes).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const ARTIFACTS = path.join(ROOT, 'artifacts', 'yomu-reader');
const tempDir = mkdtempSync(path.join(tmpdir(), 'yomu-lookup-popover-smoke-'));
const entryPath = path.join(tempDir, 'probe.ts');
const bundlePath = path.join(tempDir, 'probe.js');

mkdirSync(ARTIFACTS, { recursive: true });
writeFileSync(entryPath, `
    import { renderTokenListHtml } from ${JSON.stringify(path.join(ROOT, 'src/reader/main/token-list.ts'))};
    import { CardPopoverRenderer } from ${JSON.stringify(path.join(ROOT, 'src/reader/cards/popover-renderer.ts'))};
    import { DEFAULT_SETTINGS } from ${JSON.stringify(path.join(ROOT, 'src/reader/settings/index.ts'))};
    import type { JPDBCard, JPDBToken } from ${JSON.stringify(path.join(ROOT, 'src/reader/app/types.ts'))};

    const settings = { ...DEFAULT_SETTINGS, showPitchAccent: true };

    function card(overrides: Partial<JPDBCard>): JPDBCard {
        return {
            vid: 1,
            sid: 1,
            rid: 1,
            spelling: '',
            reading: '',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [],
            cardState: ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: null,
            ...overrides,
        } as JPDBCard;
    }

    function token(overrides: Partial<JPDBToken> & { card: JPDBCard }): JPDBToken {
        return {
            start: 0,
            end: overrides.card.spelling.length,
            length: overrides.card.spelling.length,
            rubies: [],
            pitchClass: '',
            sentence: '',
            ...overrides,
        } as JPDBToken;
    }

    Object.assign(window, {
        runYomuLookupPopoverProbe() {
            const selected = '毎日50ページ読んだ';
            const tokens = [
                token({ card: card({ vid: 11, sid: 11, spelling: '毎日', reading: 'まいにち' }), start: 0, end: 2, pitchClass: 'heiban' }),
                token({ card: card({ vid: 12, sid: 12, spelling: 'ページ', reading: 'ページ' }), start: 4, end: 7, pitchClass: 'atamadaka' }),
                token({ card: card({ vid: 13, sid: 13, spelling: '読む', reading: 'よむ', pitchAccent: ['HL'], cardState: ['known'] }), start: 7, end: 10 }),
            ];
            const listHost = document.querySelector<HTMLElement>('#token-list')!;
            listHost.innerHTML = renderTokenListHtml(tokens, selected, 'selection', undefined, settings);

            const renderer = new CardPopoverRenderer({
                getSettings: () => settings,
                isJpdbBackedCard: () => true,
                renderWordHistory: () => '',
                renderWordPills: () => '',
                renderDefinitionSources: () => '',
                dictionarySourceAttributes: () => 'open',
                dictionaryLabel: (name: string) => name,
            });
            const cardHost = document.querySelector<HTMLElement>('#card')!;
            cardHost.innerHTML = renderer.render(card({
                spelling: '一石二鳥',
                reading: 'いっせきにちょう',
            }), '一石二鳥だ。', 'modal', {
                localEntries: [],
                kanjiEntries: [],
                metaEntries: [],
                ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
                jpdbDecks: [],
                ankiDecks: [],
                jpdbVocabularyInfo: null,
                loading: false,
                expressionComponents: [
                    { text: '一石', reading: 'いっせき' },
                    { text: '二鳥', reading: 'にちょう' },
                    { text: '一挙', reading: 'いっきょ' },
                    { text: '両得', reading: 'りょうとく' },
                ],
                componentPitches: [
                    { text: '一石', reading: 'いっせき', pitch: 'HLLL' },
                    { text: '二鳥', reading: 'にちょう', pitch: 'LHHH' },
                ],
            } as never);

            const strip = listHost.querySelector<HTMLElement>('.jpdb-reader-token-sentence')!;
            const chips = [...strip.querySelectorAll<HTMLButtonElement>('button[data-token-choice]')];
            const chipRects = chips.map(chip => {
                const box = chip.getBoundingClientRect();
                return { vid: chip.dataset.vid, top: box.top, width: box.width, height: box.height };
            });
            const componentLinks = [...cardHost.querySelectorAll<HTMLAnchorElement>('.jpdb-reader-expression-components a.gloss-link[data-dictionary-lookup]')];
            componentLinks[0]?.focus();
            const focusable = document.activeElement === componentLinks[0];
            const componentRects = componentLinks.map(link => {
                const box = link.getBoundingClientRect();
                return { top: box.top, left: box.left, width: box.width };
            });
            const summary = cardHost.querySelector<HTMLElement>('.jpdb-reader-expression-components summary')!;
            const pos = cardHost.querySelector<HTMLElement>('.jpdb-reader-pos');
            return {
                stripText: strip.textContent ?? '',
                stripWidth: strip.getBoundingClientRect().width,
                chipRects,
                chipClasses: chips.map(chip => chip.className),
                gapText: strip.querySelector('.jpdb-reader-token-sentence-gap')?.textContent ?? '',
                componentCount: componentLinks.length,
                componentRects,
                componentRoles: componentLinks.map(link => link.getAttribute('role')),
                componentTabindexes: componentLinks.map(link => link.getAttribute('tabindex')),
                componentPitchClasses: [...cardHost.querySelectorAll<HTMLElement>('.jpdb-reader-expression-component-term')].map(term => term.dataset.pitchClass ?? ''),
                componentRuby: [...cardHost.querySelectorAll<HTMLElement>('.jpdb-reader-expression-component-term .jpdb-reader-furi')].map(rt => rt.textContent ?? ''),
                focusable,
                composedGap: pos ? summary.getBoundingClientRect().top - pos.getBoundingClientRect().bottom : null,
            };
        },
    });
`);

const fixture = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lookup Popover Fixture</title>
<style>
html, body { margin: 0; background: #f6f7f9; color: #20242c; font: 16px/1.5 system-ui, sans-serif; }
main { display: grid; gap: 24px; padding: 16px; }
.jpdb-reader-popover { width: 320px; border: 1px solid #cbd5e1; border-radius: 10px; background: #ffffff; padding: 4px; }
</style>
</head>
<body>
<main>
  <div id="token-list" class="jpdb-reader-popover"></div>
  <div id="card" class="jpdb-reader-popover"></div>
</main>
</body>
</html>`;

function assert(condition, message, details = {}) {
    if (!condition) {
        const suffix = Object.keys(details).length ? `\n${JSON.stringify(details, null, 2)}` : '';
        throw new Error(`${message}${suffix}`);
    }
}

async function runProbe(browserType, name) {
    const browser = await browserType.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 720 } });
        await page.setContent(fixture, { waitUntil: 'domcontentloaded' });
        await page.addStyleTag({ content: readFileSync(path.join(ROOT, 'src/reader/styles/popover-core.css'), 'utf8') });
        await page.addScriptTag({ path: bundlePath });
        const result = await page.evaluate(() => window.runYomuLookupPopoverProbe());

        // Sentence strip: tokens flow inline as one sentence.
        const [first, second, third] = result.chipRects;
        assert(result.chipRects.length === 3, `${name}: expected 3 token chips`, result);
        assert(Math.abs(first.top - second.top) < 2 && Math.abs(second.top - third.top) < 2,
            `${name}: token chips stacked instead of flowing on one line`, result);
        assert(first.width + second.width + third.width < result.stripWidth,
            `${name}: token chips are full-width rows`, result);
        assert(result.gapText === '50', `${name}: numeric gap token dropped from the strip`, result);
        const stripOrder = result.stripText.replace(/\s+/g, '');
        assert(stripOrder.indexOf('毎日') < stripOrder.indexOf('50') && stripOrder.indexOf('50') < stripOrder.indexOf('ページ'),
            `${name}: strip lost sentence reading order`, result);
        assert(result.chipClasses[0].includes('jpdb-pitch-heiban') && result.chipClasses[0].includes('jpdb-not-in-deck'),
            `${name}: strip words missing pitch/state classes`, result);
        assert(result.chipClasses[2].includes('jpdb-pitch-atamadaka') && result.chipClasses[2].includes('jpdb-known'),
            `${name}: strip words missing derived pitch/state classes`, result);

        // Composed of: wrapping, annotated, focusable chips.
        assert(result.componentCount === 4, `${name}: expected 4 component chips`, result);
        const rows = new Set(result.componentRects.map(rect => Math.round(rect.top)));
        assert(rows.size >= 1 && rows.size < result.componentCount,
            `${name}: component chips do not share wrapped rows (one per line)`, result);
        const firstRowTop = Math.round(result.componentRects[0].top);
        const sameRow = result.componentRects.filter(rect => Math.round(rect.top) === firstRowTop);
        assert(sameRow.length >= 2, `${name}: component chips are stacked one per line`, result);
        assert(result.componentRoles.every(role => role === 'button'), `${name}: component chips missing role=button`, result);
        assert(result.componentTabindexes.every(tabindex => tabindex === '0'), `${name}: component chips missing tabindex`, result);
        assert(result.focusable, `${name}: component chip not keyboard focusable`, result);
        assert(result.componentPitchClasses.slice(0, 2).every(cls => cls && cls !== 'unknown'),
            `${name}: component chips missing pitch colouring`, result);
        assert(result.componentRuby.includes('いっせき') && result.componentRuby.includes('にちょう'),
            `${name}: component chips missing ruby readings`, result);
        assert(result.composedGap === null || result.composedGap >= 8,
            `${name}: missing vertical gap above the Composed of header`, result);

        const screenshotPath = path.join(ARTIFACTS, `lookup-popover-strip-smoke-${name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`${name}: lookup popover strip smoke passed (${screenshotPath})`);
        await browser.close();
    } catch (error) {
        await browser.close().catch(() => undefined);
        throw error;
    }
}

try {
    await esbuild.build({
        entryPoints: [entryPath],
        outfile: bundlePath,
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: 'es2020',
        logLevel: 'silent',
    });
    await runProbe(chromium, 'chromium');
    await runProbe(webkit, 'webkit');
    console.log('lookup-popover-strip smoke passed');
} finally {
    rmSync(tempDir, { recursive: true, force: true });
}
