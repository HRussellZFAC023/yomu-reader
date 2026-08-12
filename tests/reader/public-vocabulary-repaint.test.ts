import { describe, expect, it } from 'vitest';

import { applyPublicVocabularyFurigana } from '../../src/reader/app/dom-helpers';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import { applyTokensToScanTarget, applyTokensToTextNode, readerWordSurfaceText, removeNonDestructiveScanMirrors } from '../../src/reader/dom/index';
import { renderedWordPrivateValue } from '../../src/reader/dom/rendered-word-private-state';
import { setRenderedWordCardIdentity } from '../../src/reader/dom/rendered-word-state';
import { noteScannedShadowRoot } from '../../src/reader/dom/shadow-scan-registry';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';

if (typeof Range.prototype.getClientRects !== 'function') {
    Object.defineProperty(Range.prototype, 'getClientRects', {
        configurable: true,
        value: () => [],
    });
}

function card(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 11,
        sid: 22,
        rid: 0,
        spelling: '読む',
        reading: 'よむ',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['known'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jiten',
        ...overrides,
    };
}

function unresolvedToken(surface: string): JPDBToken {
    return {
        card: card({
            spelling: surface,
            reading: '',
            cardState: ['not-in-deck'],
        }),
        start: 0,
        end: surface.length,
        length: surface.length,
        rubies: [],
        pitchClass: 'unknown',
        sentence: surface,
    };
}

function mockBox(element: HTMLElement, width: number, height: number): void {
    Object.defineProperties(element, {
        clientWidth: { value: width, configurable: true },
        clientHeight: { value: height, configurable: true },
        scrollWidth: { value: width, configurable: true },
        scrollHeight: { value: height, configurable: true },
        getBoundingClientRect: {
            configurable: true,
            value: () => ({
                x: 0, y: 0, left: 0, top: 0, right: width, bottom: height,
                width, height, toJSON: () => ({}),
            }) as DOMRect,
        },
    });
}

function renderedTextNodes(root: HTMLElement): Text[] {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node instanceof Text && node.data.trim()) nodes.push(node);
    }
    return nodes;
}

describe('public vocabulary repaint', () => {
    it('adds a late compact reading through the preserved detached channel', () => {
        document.body.innerHTML = '<button id="word" style="height:24px;overflow:hidden;white-space:nowrap">賛成票</button>';
        const host = document.querySelector<HTMLElement>('#word')!;
        mockBox(host, 72, 24);
        const node = host.firstChild as Text;

        applyTokensToTextNode({
            text: '賛成票',
            node,
            parent: host,
            decoration: 'interactive-passive',
            suppressRuby: true,
        }, [unresolvedToken('賛成票')], { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' });

        const word = host.querySelector<HTMLElement>('.jpdb-reader-word')!;
        expect(word.classList.contains('jpdb-reader-detached-reading-word')).toBe(true);
        expect(word.querySelector('.jpdb-reader-furi,rt')).toBeNull();

        applyPublicVocabularyFurigana(word, card({
            spelling: '賛成票',
            reading: 'さんせいひょう',
            cardState: ['not-in-deck'],
        }), { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' });

        const wrapper = word.querySelector<HTMLElement>('.jpdb-reader-detached-ruby')!;
        const reading = word.querySelector<HTMLElement>('.jpdb-reader-detached-furi')!;
        expect(word.querySelector('ruby,rt')).toBeNull();
        expect(wrapper).toBeTruthy();
        expect(reading.textContent).toBe('さんせいひょう');
        expect(readerWordSurfaceText(word)).toBe('賛成票');
        expect(wrapper.style.getPropertyValue('position')).toBe('relative');
        expect(wrapper.style.getPropertyPriority('position')).toBe('important');
        expect(reading.style.getPropertyValue('display')).toBe('none');
    });

    it('transitions a reading-free additive mirror only when a late reading materializes', () => {
        document.body.innerHTML = '<button id="host" style="display:block;height:24px;max-height:24px;overflow:hidden;white-space:nowrap">賛成票</button>';
        const host = document.querySelector<HTMLElement>('#host')!;
        mockBox(host, 72, 24);
        const node = host.firstChild as Text;

        applyTokensToScanTarget({
            text: '賛成票',
            node,
            parent: host,
            insideShadowDOM: true,
            decoration: 'interactive-passive',
            suppressRuby: true,
            passiveInteraction: true,
        }, [unresolvedToken('賛成票')], { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' });

        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-additive-text-mirror')!;
        const word = mirror.querySelector<HTMLElement>('.jpdb-reader-word')!;
        expect(mirror.dataset.yomuDetachedReadings).toBeUndefined();
        expect(mirror.style.getPropertyValue('overflow')).toBe('hidden');
        expect(word.querySelector('.jpdb-reader-furi,rt')).toBeNull();
        expect(host.firstChild?.textContent).toBe('賛成票');

        applyPublicVocabularyFurigana(word, card({
            spelling: '賛成票',
            reading: 'さんせいひょう',
            cardState: ['not-in-deck'],
        }), { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' });

        expect(host.querySelector('rt')).toBeNull();
        expect(mirror.dataset.yomuDetachedReadings).toBe('true');
        expect(mirror.style.getPropertyValue('overflow')).toBe('hidden');
        expect(word.querySelector('.jpdb-reader-detached-ruby')?.getAttribute('style')).toContain('position: relative');
        expect(word.querySelector<HTMLElement>('.jpdb-reader-detached-furi')?.style.getPropertyValue('display')).toBe('none');
        expect(host.firstChild?.textContent).toBe('賛成票');

        applyPublicVocabularyFurigana(word, card({
            spelling: '賛成票',
            reading: 'さんせいひょう',
            cardState: ['known'],
        }), {
            ...DEFAULT_SETTINGS,
            showFurigana: true,
            furiganaMode: 'known-status',
            furiganaHiddenStateGroups: ['known'],
        });

        expect(word.querySelector('.jpdb-reader-furi,rt')).toBeNull();
        expect(mirror.dataset.yomuDetachedReadings).toBeUndefined();
        expect(mirror.style.getPropertyValue('overflow')).toBe('hidden');
        expect(host.style.getPropertyValue('overflow')).toBe('hidden');

        removeNonDestructiveScanMirrors(document);
    });

    it('restores an outer composed clip after the last late shadow reading is cleared', () => {
        document.body.innerHTML = '<div id="clip" style="height:24px;max-height:24px;overflow:hidden"><reader-shadow-label></reader-shadow-label></div>';
        const clip = document.querySelector<HTMLElement>('#clip')!;
        const host = document.querySelector<HTMLElement>('reader-shadow-label')!;
        const root = host.attachShadow({ mode: 'open' });
        root.innerHTML = '<span id="source">賛成票</span>';
        noteScannedShadowRoot(root);
        mockBox(clip, 96, 24);
        mockBox(host, 72, 24);
        const source = root.querySelector<HTMLElement>('#source')!;
        const node = source.firstChild as Text;

        applyTokensToTextNode({
            text: '賛成票',
            node,
            parent: source,
            decoration: 'interactive-passive',
            suppressRuby: true,
        }, [unresolvedToken('賛成票')], { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' });
        const word = source.querySelector<HTMLElement>('.jpdb-reader-word')!;

        applyPublicVocabularyFurigana(word, card({
            spelling: '賛成票',
            reading: 'さんせいひょう',
            cardState: ['not-in-deck'],
        }), { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' });

        expect(clip.dataset.yomuDetachedReadingOverflow).toBeUndefined();
        expect(clip.style.getPropertyValue('overflow')).toBe('hidden');

        applyPublicVocabularyFurigana(word, card({
            spelling: '賛成票',
            reading: 'さんせいひょう',
            cardState: ['known'],
        }), {
            ...DEFAULT_SETTINGS,
            showFurigana: true,
            furiganaMode: 'known-status',
            furiganaHiddenStateGroups: ['known'],
        });

        expect(root.querySelector('.jpdb-reader-detached-furi')).toBeNull();
        expect(clip.dataset.yomuDetachedReadingOverflow).toBeUndefined();
        expect(clip.style.getPropertyValue('overflow')).toBe('hidden');
    });

    it('updates state classes and removes stale furigana when a reviewed word enters a hidden group', () => {
        document.body.innerHTML = `
            <span class="jpdb-reader-word jpdb-learning jpdb-reader-has-furi jpdb-reader-i-plus-one" data-expression="読む" data-mining-insight="i-plus-one">
                <ruby><span class="jpdb-reader-ruby-base">読</span><rt class="jpdb-reader-furi">よ</rt></ruby>む
            </span>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const reviewed = card({ cardState: ['known'] });
        const settings = {
            ...DEFAULT_SETTINGS,
            furiganaMode: 'known-status' as const,
            furiganaHiddenStateGroups: ['known'] as ReaderSettings['furiganaHiddenStateGroups'],
        };

        setRenderedWordCardIdentity(word, reviewed);
        applyPublicVocabularyFurigana(word, reviewed, settings);

        expect(renderedWordPrivateValue(word, 'cardState')).toBe('known');
        expect(word.classList.contains('jpdb-known')).toBe(true);
        expect(word.classList.contains('jiten-known')).toBe(false);
        expect(word.classList.contains('jpdb-learning')).toBe(false);
        expect(word.classList.contains('jpdb-reader-has-furi')).toBe(false);
        expect(word.classList.contains('jpdb-reader-i-plus-one')).toBe(false);
        expect(word.dataset.miningInsight).toBeUndefined();
        expect(word.querySelector('rt')).toBeNull();
        expect(readerWordSurfaceText(word)).toBe('読む');
    });

    it('clears the ruby when a whole-word reading enters a hidden state group', () => {
        document.body.innerHTML = '<span class="jpdb-reader-word jpdb-reader-has-furi" data-expression="本"><ruby><span class="jpdb-reader-ruby-base">本</span><rt class="jpdb-reader-furi">ほん</rt></ruby></span>';
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;

        applyPublicVocabularyFurigana(word, card({
            spelling: '本',
            reading: 'ほん',
            cardState: ['known'],
        }), {
            ...DEFAULT_SETTINGS,
            furiganaMode: 'known-status',
            furiganaHiddenStateGroups: ['known'],
        });

        expect(word.querySelector('rt')).toBeNull();
        expect(readerWordSurfaceText(word)).toBe('本');
    });

    it('clears the ruby when furigana is switched off entirely', () => {
        document.body.innerHTML = '<span class="jpdb-reader-word jpdb-reader-has-furi" data-expression="本"><ruby><span class="jpdb-reader-ruby-base">本</span><rt class="jpdb-reader-furi">ほん</rt></ruby></span>';
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;

        applyPublicVocabularyFurigana(word, card({
            spelling: '本',
            reading: 'ほん',
        }), {
            ...DEFAULT_SETTINGS,
            showFurigana: false,
        });

        expect(word.querySelector('rt')).toBeNull();
        expect(readerWordSurfaceText(word)).toBe('本');
    });

    it('preserves split provider rubies when they already spell the whole card reading', () => {
        document.body.innerHTML = '<span class="jpdb-reader-word jpdb-reader-has-furi" data-expression="年下"><ruby><span class="jpdb-reader-ruby-base">年</span><rt class="jpdb-reader-furi">とし</rt></ruby><ruby><span class="jpdb-reader-ruby-base">下</span><rt class="jpdb-reader-furi">した</rt></ruby></span>';
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;

        applyPublicVocabularyFurigana(word, card({
            spelling: '年下',
            reading: 'としした',
            cardState: ['not-in-deck'],
        }), {
            ...DEFAULT_SETTINGS,
            furiganaMode: 'all',
        });

        expect([...word.querySelectorAll('rt')].map(rt => rt.textContent)).toEqual(['とし', 'した']);
        expect([...word.querySelectorAll('.jpdb-reader-ruby-base')].map(base => base.textContent)).toEqual(['年', '下']);
        expect(readerWordSurfaceText(word)).toBe('年下');
    });

    it('keeps matching provider rubies scanner-isolated on OCR lines', () => {
        document.body.innerHTML = `
            <div class="jpdb-ocr-line">
                <span class="jpdb-ocr-line-text">
                    <span class="jpdb-reader-word jpdb-reader-has-furi" data-expression="冒険" data-surface="冒険">
                        <ruby><span class="jpdb-reader-ruby-base">冒険</span><rt class="jpdb-reader-furi">ぼうけん</rt></ruby>
                    </span>
                </span>
            </div>
        `;
        const line = document.querySelector<HTMLElement>('.jpdb-ocr-line')!;
        const word = line.querySelector<HTMLElement>('.jpdb-reader-word')!;

        applyPublicVocabularyFurigana(word, card({
            spelling: '冒険',
            reading: 'ぼうけん',
            cardState: ['not-in-deck'],
        }), {
            ...DEFAULT_SETTINGS,
            popupActivationMode: 'click',
            furiganaMode: 'all',
        });

        expect(line.dataset.hasFuri).toBe('true');
        expect(word.classList.contains('jpdb-ocr-page-scanner-isolated')).toBe(true);
        expect(renderedTextNodes(word)).toEqual([]);
        expect([...word.querySelectorAll<HTMLElement>('[data-yomu-ocr-visual-text]')]
            .map(element => element.dataset.yomuOcrVisualText)
            .join('')).toContain('冒険');
    });

    it('keeps existing furigana when the policy still allows it and fresh lookup data cannot add new ruby', () => {
        document.body.innerHTML = `
            <span class="jpdb-reader-word jpdb-learning jpdb-reader-has-furi" data-vid="11" data-sid="22" data-card-state="learning" data-expression="読む">
                <ruby><span class="jpdb-reader-ruby-base">読</span><rt class="jpdb-reader-furi">よ</rt></ruby>む
            </span>
        `;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const sparse = card({ cardState: ['learning'], reading: '' });

        applyPublicVocabularyFurigana(word, sparse, {
            ...DEFAULT_SETTINGS,
            furiganaMode: 'known-status',
            furiganaHiddenStateGroups: ['known'],
        });

        expect(word.classList.contains('jpdb-reader-has-furi')).toBe(true);
        expect(word.querySelector('rt')?.textContent).toBe('よ');
    });

    it('keeps OCR glyphs isolated while late vocabulary furigana is applied and cleared', () => {
        document.body.innerHTML = `
            <div class="jpdb-ocr-line">
                <span class="jpdb-ocr-line-text">
                    <span class="jpdb-reader-word jpdb-not-in-deck" data-vid="11" data-sid="22" data-expression="読む" data-surface="読む">
                        <span class="jpdb-ocr-plain"><span class="jpdb-ocr-visual-text" data-yomu-ocr-visual-text="読む" aria-hidden="true"></span></span>
                    </span>
                </span>
            </div>
        `;
        const line = document.querySelector<HTMLElement>('.jpdb-ocr-line')!;
        const word = line.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const popupSettings = {
            ...DEFAULT_SETTINGS,
            popupActivationMode: 'click' as const,
            showFurigana: true,
            furiganaMode: 'all' as const,
        };

        expect(renderedTextNodes(word)).toEqual([]);
        applyPublicVocabularyFurigana(word, card({
            spelling: '読む',
            reading: 'よむ',
            cardState: ['not-in-deck'],
        }), popupSettings);

        expect(word.classList.contains('jpdb-reader-has-furi')).toBe(true);
        expect(line.dataset.hasFuri).toBe('true');
        expect(renderedTextNodes(word)).toEqual([]);
        expect(word.querySelectorAll('.jpdb-ocr-visual-text').length).toBeGreaterThan(0);

        applyPublicVocabularyFurigana(word, card({
            spelling: '読む',
            reading: 'よむ',
            cardState: ['known'],
        }), {
            ...popupSettings,
            furiganaMode: 'known-status',
            furiganaHiddenStateGroups: ['known'],
        });

        expect(word.classList.contains('jpdb-reader-has-furi')).toBe(false);
        expect(line.dataset.hasFuri).toBeUndefined();
        expect(renderedTextNodes(word)).toEqual([]);
        expect([...word.querySelectorAll<HTMLElement>('.jpdb-ocr-visual-text')]
            .map(element => element.dataset.yomuOcrVisualText)
            .join('')).toBe('読む');
    });

    it('normalizes OCR words and clears the line furigana flag only after the last ruby is removed', () => {
        document.body.innerHTML = `
            <div class="jpdb-ocr-line" data-has-furi="true">
                <span class="jpdb-ocr-line-text">
                    <span class="jpdb-reader-word jpdb-learning jpdb-reader-has-furi" data-vid="11" data-sid="22" data-expression="読む">
                        <span class="jpdb-ocr-ruby"><span class="jpdb-ocr-ruby-base"><span class="jpdb-ocr-furi">よ</span><span class="jpdb-ocr-ruby-base-text">読</span></span></span><span class="jpdb-ocr-plain">む</span>
                    </span>
                    <span class="jpdb-reader-word jpdb-learning jpdb-reader-has-furi" data-vid="33" data-sid="44" data-expression="書く">
                        <span class="jpdb-ocr-ruby"><span class="jpdb-ocr-ruby-base"><span class="jpdb-ocr-furi">か</span><span class="jpdb-ocr-ruby-base-text">書</span></span></span><span class="jpdb-ocr-plain">く</span>
                    </span>
                </span>
            </div>
        `;
        const line = document.querySelector<HTMLElement>('.jpdb-ocr-line')!;
        const [first, second] = [...document.querySelectorAll<HTMLElement>('.jpdb-reader-word')];
        const settings = {
            ...DEFAULT_SETTINGS,
            furiganaMode: 'known-status' as const,
            furiganaHiddenStateGroups: ['known'] as ReaderSettings['furiganaHiddenStateGroups'],
        };

        applyPublicVocabularyFurigana(first!, card({ cardState: ['known'] }), settings);

        expect(first!.classList.contains('jpdb-reader-has-furi')).toBe(false);
        expect(first!.querySelector('.jpdb-ocr-furi')).toBeNull();
        expect(renderedTextNodes(first!)).toEqual([]);
        expect(first!.querySelector<HTMLElement>('.jpdb-ocr-visual-text')?.dataset.yomuOcrVisualText).toBe('読む');
        expect(line.dataset.hasFuri).toBe('true');

        applyPublicVocabularyFurigana(second!, card({
            vid: 33,
            sid: 44,
            spelling: '書く',
            reading: 'かく',
            cardState: ['known'],
        }), settings);

        expect(second!.classList.contains('jpdb-reader-has-furi')).toBe(false);
        expect(second!.querySelector('.jpdb-ocr-furi')).toBeNull();
        expect(renderedTextNodes(second!)).toEqual([]);
        expect(second!.querySelector<HTMLElement>('.jpdb-ocr-visual-text')?.dataset.yomuOcrVisualText).toBe('書く');
        expect(line.dataset.hasFuri).toBeUndefined();
    });
});
