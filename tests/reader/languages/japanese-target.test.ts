import { describe, expect, it } from 'vitest';

import { JAPANESE_LEARNING_TARGET } from '../../../src/reader/languages/japanese';
import { activeLearningTarget } from '../../../src/reader/languages/active';
import {
    LEARNING_TARGET_CAPABILITY_IDS,
    LEARNING_TARGET_MODULE_INTERFACE_VERSION,
} from '../../../src/reader/languages/types';
import { afterEach } from "vitest";
import { targetCanLookupCharacter, usesJapaneseProviders } from "../../../src/reader/languages/character-lookup";
import { isUnifiedIdeograph } from "../../../src/reader/languages/han";
import { isKanjiCharacter } from "../../../src/reader/popup/pitch";
import { card, renderModalCard, testCardPopoverRenderer } from "../jpdb/fixtures";
import { vi } from "vitest";
import { targetOcrLanguageTag } from "../../../src/reader/languages/resolve";
import { createGoogleLensRequest, googleLensAcceptLanguage } from "../../../src/reader/ocr/google-lens-request";
import { ocrRecognizer } from "../../../src/reader/ocr/ocr-providers";
import { readFormSettings } from "../../../src/reader/settings/form-read";
import { DEFAULT_SETTINGS, normalizeReaderSettings } from "../../../src/reader/settings/index";
import type { ReaderSettings } from "../../../src/reader/app/types";
import { normalizeDexieTermMetaRow, normalizeDexieTermRow } from "../../../src/reader/dictionaries/yomitan/dexie-normalize";
import { normalizeZipTermMetaRow, normalizeZipTermRow } from "../../../src/reader/dictionaries/yomitan/zip-normalize";
import { normalizeGenericLookupText, normalizeImportedLookupMeta, normalizeImportedLookupTerm } from "../../../src/reader/languages/lookup-normalization";
import { codePointBoundaryAtOrAfter, codePointBoundaryAtOrBefore, codePointSafePrefix, lookupSpansContainingOffset, lookupSpansStartingInRange } from "../../../src/reader/languages/lookup-spans";
import { fallbackLookupTermsForText } from "../../../src/reader/lookup/japanese-segments";
import { targetLookupTermsForText } from "../../../src/reader/lookup/target-text";

describe('Japanese learning-target Adapter', () => {
    it('publishes the complete current Japanese capability semantics', () => {
        expect(JAPANESE_LEARNING_TARGET.interfaceVersion).toBe(LEARNING_TARGET_MODULE_INTERFACE_VERSION);
        expect(JAPANESE_LEARNING_TARGET.language).toBe('ja');
        expect(JAPANESE_LEARNING_TARGET.featureSemantics).toEqual({
            characterSystem: 'kanji',
            phoneticScripts: ['hiragana', 'katakana'],
            pronunciation: 'pitch-accent',
            readingAnnotation: 'furigana',
        });
        expect(LEARNING_TARGET_CAPABILITY_IDS.every(
            capability => JAPANESE_LEARNING_TARGET.capabilities[capability],
        )).toBe(true);
    });

    it('delegates normalization, lookup eligibility, and segmentation to Japanese semantics', () => {
        expect(JAPANESE_LEARNING_TARGET.normalizeText('  ｶﾀｶﾅ  ')).toBe('カタカナ');
        expect(JAPANESE_LEARNING_TARGET.isLookupableText('I read 日本語')).toBe(true);
        expect(JAPANESE_LEARNING_TARGET.isLookupableText('English only')).toBe(false);

        const segments = JAPANESE_LEARNING_TARGET.segment('私は日本語を読む');
        expect(segments.map(segment => segment.text).join('')).toBe('私は日本語を読む');
        expect(segments.every(segment => (
            segment.text === '私は日本語を読む'.slice(segment.start, segment.end)
        ))).toBe(true);
    });

    it('reuses the existing deinflection candidates and reading fallback', () => {
        const candidates = JAPANESE_LEARNING_TARGET.lookupCandidates('食べました');
        expect(candidates[0]?.term).toBe('食べました');
        expect(candidates.some(candidate => candidate.term === '食べる')).toBe(true);
        expect(candidates.find(candidate => candidate.term === '食べる')?.reasons).toContain('polite past');

        expect(JAPANESE_LEARNING_TARGET.normalizeReading('猫', 'ねこ')).toBe('ねこ');
        expect(JAPANESE_LEARNING_TARGET.normalizeReading('猫', 'cat')).toBe('猫');
    });

    it('is the one active learning target', () => {
        expect(activeLearningTarget()).toBe(JAPANESE_LEARNING_TARGET);
    });
});

describe('character lookup capability', () => {
    afterEach(() => {
        document.body.replaceChildren();
    });


    it('recognises Japanese kanji beyond the BMP without truncating surrogate pairs', () => {
        for (const character of ['𠮶', '𡃁', '𠮟', '𩸽']) {
            expect(isUnifiedIdeograph(character)).toBe(true);
            expect(isKanjiCharacter(character)).toBe(true);
            expect(Array.from(character)).toHaveLength(1);
        }
        expect(isUnifiedIdeograph('𠮶a')).toBe(false);
        expect(isUnifiedIdeograph('々')).toBe(false);
    });

    it('looks up kanji with the Japanese providers and never Latin letters', () => {
        expect(usesJapaneseProviders()).toBe(true);
        expect(targetCanLookupCharacter('猫')).toBe(true);
        expect(targetCanLookupCharacter('𠮟')).toBe(true);
        expect(targetCanLookupCharacter('a')).toBe(false);
    });

    it('renders inline kanji navigation for Japanese headwords', () => {
        const japanese = renderModalCard(testCardPopoverRenderer(), {
            ...card,
            spelling: '𠮟る',
            reading: 'しかる',
        }, '𠮟る。');
        expect(japanese).toContain('data-jpdb-reader-kanji-nav');
        expect(japanese).toContain('data-action="kanji" data-kanji="𠮟"');
    });
});

describe("japanese call sites", () => {
    // Japanese is the one learning target: these call sites default to Japanese
    // and still honour a language the learner configured explicitly.

    afterEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    function readVarint(bytes: Uint8Array, offset: number): [number, number] {
        let value = 0;
        let shift = 0;
        let index = offset;
        while (index < bytes.length) {
            const byte = bytes[index]!;
            index += 1;
            value += (byte & 0x7f) * 2 ** shift;
            shift += 7;
            if (!(byte & 0x80)) break;
        }
        return [value, index];
    }

    function lengthDelimitedField(message: Uint8Array, field: number): Uint8Array | null {
        let offset = 0;
        while (offset < message.length) {
            const [tag, afterTag] = readVarint(message, offset);
            const wire = tag & 7;
            const number = tag >> 3;
            offset = afterTag;
            if (wire === 2) {
                const [length, afterLength] = readVarint(message, offset);
                if (number === field) return message.subarray(afterLength, afterLength + length);
                offset = afterLength + length;
            } else if (wire === 0) {
                offset = readVarint(message, offset)[1];
            } else {
                return null;
            }
        }
        return null;
    }

    function nestedMessage(message: Uint8Array, path: readonly number[]): Uint8Array {
        let current = message;
        for (const field of path) {
            const next = lengthDelimitedField(current, field);
            expect(next, `protobuf field ${field}`).not.toBeNull();
            current = next!;
        }
        return current;
    }

    function lensLocaleContext(request: Uint8Array): { language: string; region: string } {
        // request > 1 > 1 (requestContext) > 4 (clientContext) > 4 (localeContext)
        const localeContext = nestedMessage(request, [1, 1, 4, 4]);
        const decode = (field: number) => new TextDecoder().decode(lengthDelimitedField(localeContext, field) ?? new Uint8Array());
        return { language: decode(1), region: decode(2) };
    }

    describe('Google Lens OCR request', () => {
        it('keeps the Japanese locale context byte-identical', () => {
            expect(lensLocaleContext(createGoogleLensRequest(new Uint8Array([1, 2, 3]), 40, 20, '')))
                .toEqual({ language: 'ja', region: 'JP' });
            expect(lensLocaleContext(createGoogleLensRequest(new Uint8Array([1, 2, 3]), 40, 20, 'en-GB')))
                .toEqual({ language: 'en', region: 'GB' });
        });

        it('weights the OCR towards Japanese unless a locale is configured', () => {
            expect(googleLensAcceptLanguage('')).toBe('ja,en-US;q=0.9,en;q=0.8');
            expect(googleLensAcceptLanguage('de-DE')).toBe('de,en-US;q=0.9,en;q=0.8');
        });
    });

    function stubCanvasEncoding(): void {
        const context = {
            drawImage: vi.fn(),
            getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData)),
        } as unknown as CanvasRenderingContext2D;
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(callback: BlobCallback) {
            callback(new Blob(['image'], { type: 'image/jpeg' }));
        });
    }

    function ocrImage(): HTMLImageElement {
        const image = document.createElement('img');
        // OCR reads decoded pixels only; jsdom never decodes, so give it a natural size.
        Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 40 });
        Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 20 });
        return image;
    }

    async function recognizeWith(settings: ReaderSettings): Promise<Record<string, unknown>> {
        const bodies: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            bodies.push(String(init?.body ?? ''));
            return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
        }));
        const recognizer = ocrRecognizer(settings);
        expect(recognizer).not.toBeNull();
        await recognizer!(ocrImage(), settings);
        expect(bodies).toHaveLength(1);
        return JSON.parse(bodies[0]!) as Record<string, unknown>;
    }

    describe('OCR provider request payloads', () => {
        it('sends the Japanese OCR language by default', async () => {
            stubCanvasEncoding();
            const body = await recognizeWith({ ...DEFAULT_SETTINGS, ocrProvider: 'local-service', ocrLanguage: '' });

            expect(body.language_code).toBe('ja-JP');
            expect(body.language).toEqual({ bcp47_tag: 'ja-JP', two_letter_code: 'ja' });
        });

        it('still honours an explicitly configured OCR language', async () => {
            stubCanvasEncoding();
            const body = await recognizeWith({ ...DEFAULT_SETTINGS, ocrProvider: 'local-service', ocrLanguage: 'de-DE' });

            expect(body.language_code).toBe('de-DE');
            expect(body.language).toEqual({ bcp47_tag: 'de-DE', two_letter_code: 'de' });
        });
    });

    describe('stored OCR language', () => {
        it('keeps a blank OCR language blank across a save, so it reads Japanese', () => {
            const saved = readFormSettings(new FormData(), DEFAULT_SETTINGS);
            expect(saved.ocrLanguage).toBe('');
            const reloaded = normalizeReaderSettings(JSON.parse(JSON.stringify(saved)) as ReaderSettings);
            expect(targetOcrLanguageTag(reloaded.ocrLanguage)).toBe('ja-JP');
        });

        it('keeps an explicitly configured OCR language across a save', () => {
            const form = new FormData();
            form.set('ocrLanguage', 'de-DE');
            expect(readFormSettings(form, DEFAULT_SETTINGS).ocrLanguage).toBe('de-DE');
        });

        it('unpins a stored tag an older build wrote as the Japanese default', () => {
            expect(normalizeReaderSettings({ ...DEFAULT_SETTINGS, ocrLanguage: 'ja-JP' }).ocrLanguage).toBe('');
            expect(normalizeReaderSettings({ ...DEFAULT_SETTINGS, ocrLanguage: 'de-DE' }).ocrLanguage).toBe('de-DE');
        });
    });
});

describe('generic lookup normalization', () => {
    it('uses one canonical function at every dictionary import and query door', () => {
        const source = 'Cafe\u0301';
        const expected = normalizeGenericLookupText(source);
        const zip = normalizeZipTermRow(
            [source, source, '', '', 0, ['coffee shop'], 1, ''],
            'ZIP fixture',
        );
        const dexie = normalizeDexieTermRow({
            expression: source,
            reading: source,
            glossary: ['coffee shop'],
            dictionary: 'Dexie fixture',
        });
        const readerExport = normalizeImportedLookupTerm({
            expression: source,
            reading: source,
            glossary: ['coffee shop'],
            dictionary: 'Reader export fixture',
        });
        const zipMeta = normalizeZipTermMetaRow([source, 'freq', 1], 'ZIP fixture');
        const dexieMeta = normalizeDexieTermMetaRow({
            expression: source,
            mode: 'freq',
            data: 1,
            dictionary: 'Dexie fixture',
        });
        const readerExportMeta = normalizeImportedLookupMeta({
            expression: source,
            mode: 'freq',
            data: 1,
            dictionary: 'Reader export fixture',
        });

        expect(zip?.expression).toBe(expected);
        expect(zip?.reading).toBe(expected);
        expect(dexie?.expression).toBe(expected);
        expect(dexie?.reading).toBe(expected);
        expect(readerExport.expression).toBe(expected);
        expect(readerExport.reading).toBe(expected);
        expect(zipMeta?.expression).toBe(expected);
        expect(dexieMeta?.expression).toBe(expected);
        expect(readerExportMeta.expression).toBe(expected);
    });

    it('preserves Thai and Lao SARA AM instead of compatibility-decomposing it', () => {
        const thai = 'ทำ';
        const lao = 'ຄຳ';

        expect([...normalizeGenericLookupText(thai)]).toEqual([...thai]);
        expect([...normalizeGenericLookupText(lao)]).toEqual([...lao]);
        expect(normalizeGenericLookupText(thai)).toContain('\u0e33');
        expect(normalizeGenericLookupText(lao)).toContain('\u0eb3');
    });

    it('keeps Japanese kana and kanji byte-identical', () => {
        const text = 'かな漢字';
        const bytes = (value: string) => [...new TextEncoder().encode(value)];

        expect(bytes(normalizeGenericLookupText(text))).toEqual(bytes(text));
        expect(bytes(JAPANESE_LEARNING_TARGET.normalizeText(text))).toEqual(bytes(text));
        expect(bytes(JAPANESE_LEARNING_TARGET.lookupCandidates(text)[0]!.term)).toEqual(bytes(text));
    });
});

describe('code-point-safe lookup spans', () => {
    it('never cuts a supplementary Han character at a UTF-16 boundary', () => {
        const text = `a𡃁b`;

        expect(codePointBoundaryAtOrBefore(text, 2)).toBe(1);
        expect(codePointBoundaryAtOrAfter(text, 2)).toBe(3);
        expect(codePointSafePrefix(text, 2)).toBe('a');
        expect(codePointSafePrefix(text, 3)).toBe('a𡃁');
    });

    it('returns UTF-16 coordinates while limiting by Unicode code point', () => {
        const text = '我𡃁好';
        const segment = { text, start: 0, end: text.length };
        const spans = lookupSpansStartingInRange(text, segment, 0, text.length, 2);

        expect(spans.map(span => [span.term, span.start, span.end])).toEqual([
            ['我𡃁', 0, 3],
            ['我', 0, 1],
            ['𡃁好', 1, 4],
            ['𡃁', 1, 3],
            ['好', 3, 4],
        ]);
    });

    it('orders pointer candidates longest first without lone surrogates', () => {
        const text = '我𡃁好';
        const segment = { text, start: 0, end: text.length };
        const spans = lookupSpansContainingOffset(text, segment, 2, 18, 8);

        expect(spans.map(span => span.term)).toEqual([
            '我𡃁好',
            '我𡃁',
            '𡃁好',
            '𡃁',
        ]);
        expect(spans.every(span => !/[\ud800-\udfff]/u.test(
            span.term.replace(/[\ud800-\udbff][\udc00-\udfff]/gu, ''),
        ))).toBe(true);
    });
});

describe('targetLookupTermsForText on the Japanese target', () => {
    /**
     * `targetLookupTermsForText` is the target-neutral door into the same
     * deinflector `fallbackLookupTermsForText` has always used, and callers are
     * expected to migrate from one to the other. That only holds if Japanese comes
     * out the far side unchanged.
     *
     * The trap this pins is ordering, not membership. Both lists are capped at
     * eight terms, so a comparator that ranks two same-depth analyses differently
     * does not merely reshuffle the answer — it decides which dictionary form
     * survives the cap. Ranking needs the candidate's `rules`, which only the
     * target that produced them may read, so the ordering lives on the target
     * contract as `compareLookupCandidates`. Sorting on shape alone inside the
     * shared helper pushed 食べる, the dictionary form of 食べられなかった, off the
     * end of the list entirely.
     *
     * Every sample below is a real conjugation whose ranking depends on the rule
     * tags: potential/negative/past stacks, a suru compound, an irregular kuru,
     * and a polite negative past.
     */
    const JAPANESE_CONJUGATION_CORPUS = [
        '食べられなかった',
        '勉強しました',
        '来ました',
        'できませんでした',
        '読まなければならない',
        '話しかけられている',
        '行かせられた',
        '面白くなかった',
        '見つからない',
        '始めよう',
        '冒険を始めよう',
        'もう一度、冒険を始めよう。',
    ] as const;


    it.each(JAPANESE_CONJUGATION_CORPUS)('matches the Japanese fallback path for %s', surface => {
        expect(targetLookupTermsForText(surface)).toEqual(fallbackLookupTermsForText(surface));
    });

    it('keeps the dictionary form inside the eight-term cap', () => {
        const terms = targetLookupTermsForText('食べられなかった');

        expect(terms.length).toBeLessThanOrEqual(8);
        expect(terms).toContain('食べる');
    });

    it('leads with the surface itself', () => {
        expect(targetLookupTermsForText('勉強しました')[0]).toBe('勉強しました');
    });
});
