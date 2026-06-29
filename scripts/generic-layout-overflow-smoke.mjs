#!/usr/bin/env node
// Generic layout overflow regression smoke: compact unsemantic controls stay
// lookupable without ruby, generic clipped boxes keep authored dimensions, and
// non-destructive mirrors follow late host color changes.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const ARTIFACTS = path.join(ROOT, 'artifacts', 'yomu-reader');
const tempDir = mkdtempSync(path.join(tmpdir(), 'yomu-generic-layout-smoke-'));
const entryPath = path.join(tempDir, 'probe.ts');
const bundlePath = path.join(tempDir, 'probe.js');

mkdirSync(ARTIFACTS, { recursive: true });
writeFileSync(entryPath, `
    import {
        applyTokensToScanTarget,
        collectFragmentTextTargetsIn,
        makeRoomForRubyInCroppedRows,
        type FragmentTextTarget,
    } from ${JSON.stringify(path.join(ROOT, 'src/reader/dom/index.ts'))};
    import { DEFAULT_SETTINGS } from ${JSON.stringify(path.join(ROOT, 'src/reader/settings/index.ts'))};
    import type { JPDBCard, JPDBToken } from ${JSON.stringify(path.join(ROOT, 'src/reader/app/types.ts'))};

    function collectTargets(root: Node = document.body): FragmentTextTarget[] {
        return collectFragmentTextTargetsIn(root, 40, false, '', {
            allowUiText: true,
            includeUiChrome: true,
            includeTabChrome: true,
            includePassiveInteractions: true,
            heading: true,
            minLength: 1,
        });
    }

    function card(surface: string, reading: string): JPDBCard {
        return {
            vid: surface.charCodeAt(0),
            sid: surface.charCodeAt(0),
            rid: 0,
            spelling: surface,
            reading,
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [],
            cardState: ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'fallback',
        };
    }

    function token(sentence: string, surface: string, reading: string): JPDBToken {
        const start = sentence.indexOf(surface);
        if (start < 0) throw new Error('Missing token surface: ' + surface);
        return {
            card: card(surface, reading),
            start,
            end: start + surface.length,
            length: surface.length,
            rubies: [{ text: reading, start, end: start + surface.length, length: surface.length }],
            pitchClass: 'heiban',
            sentence,
        };
    }

    function applyFirst(targetText: string, surfaces: Array<[string, string]>, override: Partial<FragmentTextTarget> = {}) {
        const target = collectTargets().find(candidate => candidate.text.includes(targetText));
        if (!target) throw new Error('Target not collected: ' + targetText);
        applyTokensToScanTarget({ ...target, ...override }, surfaces.map(([surface, reading]) => token(target.text, surface, reading)), {
            ...DEFAULT_SETTINGS,
            showFurigana: true,
            furiganaMode: 'all',
        });
        return target;
    }

    function rect(element: Element | null) {
        const box = element?.getBoundingClientRect();
        return box ? { width: box.width, height: box.height, top: box.top, bottom: box.bottom, left: box.left, right: box.right } : null;
    }

    function compactSnapshot(selector: string, beforeHeight: number, expectedText: string) {
        const chip = document.querySelector<HTMLElement>(selector);
        const text = chip?.textContent?.replace(/\\s+/g, '').trim() ?? '';
        return {
            text,
            expectedText,
            passiveChrome: chip?.getAttribute('data-jpdb-reader-passive-chrome') ?? '',
            passiveWords: chip?.querySelectorAll('.jpdb-reader-passive-word').length ?? 0,
            rubyCount: chip?.querySelectorAll('rt,.jpdb-reader-furi').length ?? 0,
            mirrorCount: chip?.querySelectorAll('.jpdb-reader-text-mirror').length ?? 0,
            heightBefore: beforeHeight,
            heightAfter: chip?.getBoundingClientRect().height ?? 0,
            scrollHeight: chip?.scrollHeight ?? 0,
            rect: rect(chip),
        };
    }

    Object.assign(window, {
        runYomuGenericLayoutOverflowProbe() {
            const chip = document.querySelector<HTMLElement>('#trade-chip')!;
            const clipped = document.querySelector<HTMLElement>('#generic-clipped')!;
            const message = document.querySelector<HTMLElement>('#message')!;
            const chipHeight = chip.getBoundingClientRect().height;
            const clippedHeight = clipped.getBoundingClientRect().height;

            const collectedBefore = collectTargets().map(target => target.text);
            applyFirst('注文確認', [['注文', 'ちゅうもん'], ['確認', 'かくにん']]);
            const compactInitial = compactSnapshot('#trade-chip', chipHeight, '注文確認');
            chip.textContent = '取引詳細';
            applyFirst('取引詳細', [['取引', 'とりひき'], ['詳細', 'しょうさい']]);
            const compactMutated = compactSnapshot('#trade-chip', chipHeight, '取引詳細');
            const lateControls = document.querySelector<HTMLElement>('#late-controls')!;
            lateControls.innerHTML = '<a id="late-account-choice" class="late-control" href="/signin" role="link">アカウント選択</a>';
            const lateControl = document.querySelector<HTMLElement>('#late-account-choice')!;
            const lateHeight = lateControl.getBoundingClientRect().height;
            applyFirst('アカウント選択', [['アカウント', 'アカウント'], ['選択', 'せんたく']]);
            const compactLate = compactSnapshot('#late-account-choice', lateHeight, 'アカウント選択');
            applyFirst('日本語の通知', [['日本語', 'にほんご']]);
            const rubyRoomAdjustments = makeRoomForRubyInCroppedRows(document);
            applyFirst('日本語の回答', [['日本語', 'にほんご']], { nonDestructive: true });
            const mirror = message.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
            const mirrorColorBefore = getComputedStyle(mirror).color;
            message.classList.remove('loading');
            message.classList.add('ready');
            const mirrorColorAfter = getComputedStyle(mirror).color;
            applyFirst('今日は日本語の文章', [['日本語', 'にほんご']]);

            return {
                collectedBefore,
                compactInitial,
                compact: compactMutated,
                compactLate,
                clipped: {
                    heightBefore: clippedHeight,
                    heightAfter: clipped.getBoundingClientRect().height,
                    styleHeight: clipped.style.height,
                    styleMaxHeight: clipped.style.maxHeight,
                    rubyRoom: clipped.getAttribute('data-yomu-ruby-room') ?? '',
                    rubyCount: clipped.querySelectorAll('rt,.jpdb-reader-furi').length,
                    adjustments: rubyRoomAdjustments,
                },
                mirror: {
                    inlineColor: mirror.style.color,
                    colorBefore: mirrorColorBefore,
                    colorAfter: mirrorColorAfter,
                    wordCount: mirror.querySelectorAll('.jpdb-reader-word').length,
                },
                placeholder: {
                    composerWords: document.querySelectorAll('#composer-placeholder .jpdb-reader-word').length,
                    sendWords: document.querySelectorAll('#composer-send .jpdb-reader-word').length,
                    collectedComposer: collectedBefore.includes('メッセージを入力'),
                    collectedSend: collectedBefore.includes('送信'),
                },
                prose: {
                    rubyText: document.querySelector('#article-prose rt')?.textContent?.trim() ?? '',
                    passiveChrome: document.querySelector('#article-prose')?.getAttribute('data-jpdb-reader-passive-chrome') ?? '',
                },
                layout: {
                    viewportWidth: window.innerWidth,
                    scrollWidth: document.documentElement.scrollWidth,
                },
            };
        },
    });
`);

const fixture = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Generic Layout Overflow Fixture</title>
<style>
html, body { margin: 0; min-height: 100%; background: #f6f7f9; color: #20242c; font: 16px/1.45 system-ui, sans-serif; }
main { width: min(720px, 100vw); box-sizing: border-box; padding: 24px; display: grid; gap: 18px; }
#trade-chip { box-sizing: border-box; display: flex; align-items: center; justify-content: center; width: 112px; height: 34px; max-height: 34px; overflow: hidden; white-space: nowrap; border: 1px solid #9ca3af; border-radius: 6px; background: #ffffff; }
.late-control { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; width: 156px; height: 38px; max-height: 38px; overflow: hidden; white-space: nowrap; border: 1px solid #9ca3af; border-radius: 6px; background: #ffffff; color: inherit; text-decoration: none; }
#generic-clipped { box-sizing: border-box; width: 220px; height: 22px; max-height: 22px; overflow: hidden; line-height: 22px; border: 1px solid #cbd5e1; background: #ffffff; }
#message.loading { color: rgb(128, 128, 128); }
#message.ready { color: rgb(20, 20, 20); }
.composer-shell { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; max-width: 420px; }
.prompt-textarea { min-height: 42px; max-height: 42px; overflow: hidden; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; color: #8b95a5; background: #ffffff; }
.composer-shell button { width: 72px; border: 0; border-radius: 8px; color: #f8fafc; background: #334155; }
article { max-width: 54ch; line-height: 1.8; }
</style>
</head>
<body>
<main>
  <div id="trade-chip" tabindex="0" onclick="void 0">注文確認</div>
  <nav id="late-controls" aria-label="late controls"></nav>
  <div id="generic-clipped">日本語の通知</div>
  <div id="message" class="message-content loading">日本語の回答</div>
  <section class="composer-shell">
    <div id="composer-placeholder" class="ProseMirror prompt-textarea" contenteditable="true" data-placeholder="メッセージを入力"><p>メッセージを入力</p></div>
    <button id="composer-send" type="button" aria-label="送信">送信</button>
  </section>
  <article id="article-prose"><p>今日は日本語の文章を読みます。</p></article>
</main>
</body>
</html>`;

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

    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 720, height: 540 } });
        await page.setContent(fixture, { waitUntil: 'domcontentloaded' });
        await page.addStyleTag({ content: readFileSync(path.join(ROOT, 'src/reader/styles/base.css'), 'utf8') });
        await page.addStyleTag({ content: readFileSync(path.join(ROOT, 'src/reader/styles/reader-words-ocr.css'), 'utf8') });
        await page.addScriptTag({ path: bundlePath });
        const result = await page.evaluate(() => window.runYomuGenericLayoutOverflowProbe());

        assertCompactControlSnapshot(result.compactInitial, 'initial compact control');
        assertCompactControlSnapshot(result.compact, 'mutated compact control');
        assertCompactControlSnapshot(result.compactLate, 'late compact control');
        assert(result.clipped.adjustments === 0, 'Generic clipped box received ruby-room layout mutation', result.clipped);
        assert(result.clipped.heightAfter <= result.clipped.heightBefore + 1, 'Generic clipped box changed size', result.clipped);
        assert(result.clipped.rubyRoom === '', 'Generic clipped box was marked for ruby room', result.clipped);
        assert(result.mirror.inlineColor !== 'rgb(128, 128, 128)', 'Text mirror froze a computed color instead of inheriting', result.mirror);
        assert(result.mirror.colorBefore === 'rgb(128, 128, 128)', 'Text mirror did not start with loading color', result.mirror);
        assert(result.mirror.colorAfter === 'rgb(20, 20, 20)', 'Text mirror did not follow late host color', result.mirror);
        assert(result.placeholder.composerWords === 0 && result.placeholder.sendWords === 0, 'Composer placeholder/send text was annotated', result.placeholder);
        assert(!result.placeholder.collectedComposer && !result.placeholder.collectedSend, 'Composer placeholder/send text was collected', result.placeholder);
        assert(result.prose.rubyText === 'にほんご', 'Readable prose lost ruby', result.prose);
        assert(result.prose.passiveChrome === '', 'Readable prose was marked passive chrome', result.prose);
        assert(result.layout.scrollWidth <= result.layout.viewportWidth + 1, 'Annotations caused horizontal overflow', result.layout);

        const screenshotPath = path.join(ARTIFACTS, 'generic-layout-overflow-smoke.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(JSON.stringify({ ok: true, screenshotPath, result }, null, 2));
        console.log('generic-layout-overflow smoke passed');
        await browser.close();
    } catch (error) {
        await browser.close().catch(() => undefined);
        throw error;
    }
} finally {
    rmSync(tempDir, { recursive: true, force: true });
}

function assert(condition, message, details = {}) {
    if (!condition) {
        const suffix = Object.keys(details).length ? `\n${JSON.stringify(details, null, 2)}` : '';
        throw new Error(`${message}${suffix}`);
    }
}

function assertCompactControlSnapshot(snapshot, label) {
    assert(snapshot.passiveChrome === 'true', `${label} was not marked passive chrome`, snapshot);
    assert(snapshot.passiveWords >= 2, `${label} words were not passive lookup words`, snapshot);
    assert(snapshot.rubyCount === 0, `${label} rendered ruby`, snapshot);
    assert(snapshot.mirrorCount === 0, `${label} created duplicate text mirrors`, snapshot);
    assert(snapshot.text === snapshot.expectedText, `${label} duplicated or lost compact control text`, snapshot);
    assert(snapshot.heightAfter <= snapshot.heightBefore + 1, `${label} height changed after annotation`, snapshot);
    assert(snapshot.scrollHeight <= snapshot.heightBefore + 2, `${label} reserved extra scroll height`, snapshot);
}
