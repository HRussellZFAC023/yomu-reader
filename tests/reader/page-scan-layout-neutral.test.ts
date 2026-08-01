import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    pageScanHasVisibleAnnotations,
    VisiblePageScanner,
    type VisiblePageScannerDependencies,
} from '../../src/reader/app/visible-page-scanner';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import {
    applyTokensToScanTarget,
    collectTextTargetsIn,
    removeNonDestructiveScanMirrors,
} from '../../src/reader/dom';
import { testEnSettings } from './helpers/settings-fixture';

const TEXT = '日本に住んでいる外国人の皆さんへ、やさしい日本語でニュースを伝えます。';
const CARD: JPDBCard = {
    vid: 1,
    sid: 1,
    rid: 0,
    spelling: TEXT,
    reading: 'にほんにすんでいるがいこくじんのみなさんへ',
    frequencyRank: null,
    partOfSpeech: [],
    meanings: [],
    cardState: ['not-in-deck'],
    pitchAccent: [],
    wordWithReading: null,
    source: 'jpdb',
};

function token(): JPDBToken {
    return {
        card: CARD,
        start: 0,
        end: TEXT.length,
        length: TEXT.length,
        rubies: [],
        pitchClass: '',
        sentence: TEXT,
    };
}

function neutralSettings(overrides: Partial<ReaderSettings> = {}): ReaderSettings {
    return {
        ...testEnSettings(),
        showFurigana: false,
        furiganaMode: 'off',
        wordHighlightColorSource: 'off',
        wordUnderlineColorSource: 'off',
        wordTextColorSource: 'off',
        ...overrides,
    };
}

function scannerFor(
    settings: ReaderSettings,
    parseJapanese: VisiblePageScannerDependencies['parseJapanese'] = vi.fn(async () => []),
): VisiblePageScanner {
    return new VisiblePageScanner({
        getSettings: () => settings,
        parseJapanese,
        pauseMutationObserver: callback => callback(),
        preloadParsedTokens: vi.fn(),
        enrichPitchWords: vi.fn(),
        enrichAnkiWords: vi.fn(),
        toast: vi.fn(),
    } satisfies VisiblePageScannerDependencies);
}

let scanner: VisiblePageScanner | undefined;

afterEach(() => {
    scanner?.destroy();
    scanner = undefined;
    removeNonDestructiveScanMirrors(document);
    document.body.replaceChildren();
});

describe('layout-neutral automatic page scan', () => {
    it('leaves a native CJK text run byte-for-byte and node-for-node intact when every visual channel is off', async () => {
        document.body.innerHTML = `<p id="article">${TEXT}</p>`;
        const article = document.getElementById('article')!;
        const nativeTextNode = article.firstChild;
        const parseJapanese = vi.fn(async () => [[token()]]);
        scanner = scannerFor(neutralSettings({ showPitchAccent: true }), parseJapanese);

        await scanner.scanVisiblePage({ silent: true });

        expect(parseJapanese).not.toHaveBeenCalled();
        expect(article.childNodes).toHaveLength(1);
        expect(article.firstChild).toBe(nativeTextNode);
        expect(article.textContent).toBe(TEXT);
        expect(article.querySelector('.jpdb-reader-word')).toBeNull();
    });

    it('restores native text and removes a prior mirror when settings change to visually off', async () => {
        document.body.innerHTML = `
            <p id="article">${TEXT}</p>
            <span id="reactive" class="ytAttributedStringHost">${TEXT}</span>
            <p id="counter"><span class="jpdb-reader-number-bind">7</span><span class="jpdb-reader-word" data-surface="件">件</span></p>
        `;
        const visibleSettings = testEnSettings();
        const article = document.getElementById('article')!;
        const articleTarget = collectTextTargetsIn(article, 10, false).find(target => target.text === TEXT);
        expect(articleTarget).toBeTruthy();
        applyTokensToScanTarget(articleTarget!, [token()], visibleSettings);
        article.dataset.yomuRubyRoom = 'true';
        article.style.minHeight = '80px';

        const reactive = document.getElementById('reactive')!;
        const reactiveTarget = collectTextTargetsIn(reactive, 10, false).find(target => target.text === TEXT);
        expect(reactiveTarget).toBeTruthy();
        applyTokensToScanTarget({ ...reactiveTarget!, nonDestructive: true }, [token()], visibleSettings);
        expect(document.querySelectorAll('.jpdb-reader-word').length).toBeGreaterThan(0);
        expect(reactive.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();

        scanner = scannerFor(neutralSettings());
        await scanner.scanVisiblePage({ silent: true });

        expect(document.querySelector('.jpdb-reader-word')).toBeNull();
        expect(document.querySelector('.jpdb-reader-text-mirror')).toBeNull();
        expect(article.textContent).toBe(TEXT);
        expect(article.childNodes).toHaveLength(1);
        expect(article.hasAttribute('data-yomu-ruby-room')).toBe(false);
        expect(article.style.getPropertyValue('min-height')).toBe('');
        expect(reactive.textContent).toBe(TEXT);
        expect(reactive.style.getPropertyValue('visibility')).toBe('');
        const counter = document.getElementById('counter')!;
        expect(counter.textContent).toBe('7件');
        expect(counter.childNodes).toHaveLength(1);
        expect(counter.querySelector('.jpdb-reader-number-bind')).toBeNull();
    });

    it('still scans when either furigana or a page colour channel can paint', () => {
        expect(pageScanHasVisibleAnnotations(neutralSettings())).toBe(false);
        // Pronunciation metadata alone is layout-invisible when every colour
        // channel is off, so it must not force token wrappers back onto prose.
        expect(pageScanHasVisibleAnnotations(neutralSettings({ showPitchAccent: true }))).toBe(false);
        expect(pageScanHasVisibleAnnotations(neutralSettings({
            showFurigana: true,
            furiganaMode: 'hover',
        }))).toBe(true);
        expect(pageScanHasVisibleAnnotations(neutralSettings({
            showPitchAccent: false,
            wordUnderlineColorSource: 'pitch',
        }))).toBe(true);
        expect(pageScanHasVisibleAnnotations(neutralSettings({
            wordTextColorSource: 'pitch',
            wordColorHiddenStateGroups: ['ignored'],
        }))).toBe(true);
        expect(pageScanHasVisibleAnnotations(neutralSettings({
            wordHighlightColorSource: 'pitch',
            wordColorStates: 'new-only',
            wordColorHiddenStateGroups: ['new'],
        }))).toBe(true);
    });
});
