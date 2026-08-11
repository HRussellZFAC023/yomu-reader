import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../../src/reader/languages/active';
import { createLearningTargetModule } from '../../../src/reader/languages/module';
import {
    registerLearningTargetModule,
    unregisterLearningTargetModule,
} from '../../../src/reader/languages/registry';
import { SLICE1_TARGET_LANGUAGE } from '../../../src/reader/languages/roster';
import { targetOcrLanguageTag } from '../../../src/reader/languages/resolve';

// Core call sites, imported exactly as core ships them. None of these files
// knows that any target other than Japanese exists.
import { OnboardingController } from '../../../src/reader/app/onboarding';
import { AudioPlayer } from '../../../src/reader/audio/player';
import { renderCardSpellingWithFurigana } from '../../../src/reader/cards/reading-display';
import { createGoogleLensRequest, googleLensAcceptLanguage } from '../../../src/reader/ocr/google-lens-request';
import { ocrRecognizer } from '../../../src/reader/ocr/ocr-providers';
import { readFormSettings } from '../../../src/reader/settings/form-read';
import { localizeSettingsForm, renderSettingsForm } from '../../../src/reader/settings/form';
import {
    buildSubtitleBatchMiningCandidates,
    type SubtitleBatchMiningRow,
} from '../../../src/reader/subtitles/subtitle-batch-mining';
import { loadSubtitleTrackCues } from '../../../src/reader/subtitles/subtitle-track-loader';
import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../../src/reader/settings/index';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../../../src/reader/app/types';

const AD_HOC_TARGET_LANGUAGES = ['sv', 'sw'] as const;

afterEach(() => {
    resetActiveLearningTargetLanguage();
    for (const language of AD_HOC_TARGET_LANGUAGES) unregisterLearningTargetModule(language);
    document.body.innerHTML = '';
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

function adHocTarget(language: string, overrides: Parameters<typeof createLearningTargetModule>[0] extends infer T ? Partial<T> : never = {}) {
    return createLearningTargetModule({
        id: `${language}-call-site-test-target`,
        language,
        featureSemantics: {
            characterSystem: 'latin',
            phoneticScripts: ['latin'],
            pronunciation: 'none',
            readingAnnotation: 'none',
        },
        detectsText: /[A-Za-z]/u,
        ...overrides,
    });
}

function activateAdHocTarget(language: string, overrides: Parameters<typeof adHocTarget>[1] = {}) {
    const target = registerLearningTargetModule(adHocTarget(language, overrides));
    expect(setActiveLearningTargetLanguage(language)).toBe(target);
    return target;
}

// ---------------------------------------------------------------------------
// app/onboarding.ts — typography.contentLocale on the selected target option
// ---------------------------------------------------------------------------

describe('onboarding target-language picker', () => {
    it('stamps lang= from the active target typography, not a Japanese literal', async () => {
        const target = activateAdHocTarget('sv');
        expect(target.typography.contentLocale).toBe('sv');

        let settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            onboardingSeen: false,
            learningTargetChosen: true,
            interfaceLanguage: 'en',
            languageProfiles: DEFAULT_SETTINGS.languageProfiles.map(profile => ({
                ...profile,
                targetLanguage: 'sv',
            })),
        };
        const controller = new OnboardingController({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            showSettings: vi.fn(),
            parseJapanese: vi.fn(),
        });

        await expect(controller.showIfNeeded()).resolves.toBe(true);

        const picker = document.querySelector<HTMLSelectElement>('select[name="targetLanguage"]');
        const selected = picker?.selectedOptions[0];
        expect(picker).not.toBeNull();
        expect(selected?.value).toBe('sv');
        expect(selected?.lang).toBe('sv');
    });
});

// ---------------------------------------------------------------------------
// audio/player.ts — audio.speechSynthesisLocale on the TTS utterance
// ---------------------------------------------------------------------------

describe('browser text-to-speech', () => {
    it('speaks with the active target speech-synthesis locale', async () => {
        activateAdHocTarget('sv');
        const spoken: Array<{ text: string; lang: string }> = [];
        class FakeUtterance {
            lang = '';
            voice: SpeechSynthesisVoice | null = null;
            onend: (() => void) | null = null;
            onerror: (() => void) | null = null;
            constructor(public text: string) {}
        }
        vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
        vi.stubGlobal('speechSynthesis', {
            cancel: vi.fn(),
            getVoices: vi.fn(() => [] as SpeechSynthesisVoice[]),
            speak: vi.fn((utterance: FakeUtterance) => {
                spoken.push({ text: utterance.text, lang: utterance.lang });
                utterance.onend?.();
            }),
        });

        await new AudioPlayer(() => DEFAULT_SETTINGS).playJapaneseText('hej');

        expect(spoken).toEqual([{ text: 'hej', lang: 'sv-SE' }]);
    });

    it('selects a Russian voice and never falls back to a Japanese voice', async () => {
        expect(setActiveLearningTargetLanguage('ru')).not.toBeNull();
        const spoken: Array<{ lang: string; voice: string; voiceLang: string }> = [];
        class FakeUtterance {
            lang = '';
            voice: SpeechSynthesisVoice | null = null;
            onend: (() => void) | null = null;
            onerror: (() => void) | null = null;
            constructor(public text: string) {}
        }
        let voices = [
            { name: 'Kyoko', lang: 'ja-JP', default: true },
            { name: 'Milena', lang: 'ru-RU', default: false },
        ] as SpeechSynthesisVoice[];
        vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
        vi.stubGlobal('speechSynthesis', {
            cancel: vi.fn(),
            getVoices: vi.fn(() => voices),
            speak: vi.fn((utterance: FakeUtterance) => {
                spoken.push({
                    lang: utterance.lang,
                    voice: utterance.voice?.name ?? '',
                    voiceLang: utterance.voice?.lang ?? '',
                });
                utterance.onend?.();
            }),
        });

        const player = new AudioPlayer(() => DEFAULT_SETTINGS);
        await player.playJapaneseText('привет');
        await player.playJapaneseText('до свидания', 'Missing saved voice');
        await player.playJapaneseText('пожалуйста', 'Kyoko');
        voices = [
            { name: 'Kyoko', lang: 'ja-JP', default: true },
            { name: 'Samantha', lang: 'en-US', default: false },
        ] as SpeechSynthesisVoice[];
        await player.playJapaneseText('спасибо');

        expect(spoken).toEqual([
            { lang: 'ru-RU', voice: 'Milena', voiceLang: 'ru-RU' },
            { lang: 'ru-RU', voice: 'Milena', voiceLang: 'ru-RU' },
            { lang: 'ru-RU', voice: 'Milena', voiceLang: 'ru-RU' },
            { lang: 'ru-RU', voice: 'Samantha', voiceLang: 'en-US' },
        ]);
        expect(spoken.some(entry => entry.voiceLang === 'ja-JP')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// cards/reading-display.ts — normalizeReading for a headword's furigana
// ---------------------------------------------------------------------------

describe('headword reading display', () => {
    const neko = {
        spelling: '猫',
        reading: 'ねこ',
        cardState: ['new'],
        partOfSpeech: [],
        wordWithReading: null,
    } as unknown as JPDBCard;

    it('normalizes the headword reading through the active target', () => {
        // Japanese first: the rendered furigana must not move.
        expect(renderCardSpellingWithFurigana(neko, DEFAULT_SETTINGS))
            .toBe('<ruby><span class="jpdb-reader-ruby-base">猫</span><rp>(</rp><rt class="jpdb-reader-furi">ねこ</rt><rp>)</rp></ruby>');

        activateAdHocTarget('sv', {
            normalizeReading: (spelling: string, reading?: string) => (reading ? `${reading}さん` : spelling),
        });

        expect(renderCardSpellingWithFurigana(neko, DEFAULT_SETTINGS)).toContain('ねこさん');
    });
});

// ---------------------------------------------------------------------------
// ocr/google-lens-request.ts — ocr.defaultLanguage / ocr.languageHint
// ---------------------------------------------------------------------------

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
    it('keeps the Japanese locale context byte-identical for the default target', () => {
        expect(lensLocaleContext(createGoogleLensRequest(new Uint8Array([1, 2, 3]), 40, 20, '')))
            .toEqual({ language: 'ja', region: 'JP' });
        expect(lensLocaleContext(createGoogleLensRequest(new Uint8Array([1, 2, 3]), 40, 20, 'en-GB')))
            .toEqual({ language: 'en', region: 'GB' });
    });

    it('falls back to the active target OCR locale when no locale is configured', () => {
        activateAdHocTarget('sv');

        expect(lensLocaleContext(createGoogleLensRequest(new Uint8Array([1, 2, 3]), 40, 20, '')))
            .toEqual({ language: 'sv', region: 'SE' });
    });

    it('weights the OCR with an accept-language that follows the target', () => {
        // Byte-identical to the literal this replaced, so the Japanese request
        // Lens has always seen does not move.
        expect(googleLensAcceptLanguage('')).toBe('ja,en-US;q=0.9,en;q=0.8');

        activateAdHocTarget('sv');

        expect(googleLensAcceptLanguage('')).toBe('sv,en-US;q=0.9,en;q=0.8');
        expect(googleLensAcceptLanguage('de-DE')).toBe('de,en-US;q=0.9,en;q=0.8');
    });
});

// ---------------------------------------------------------------------------
// ocr/ocr-providers.ts — ocr.defaultLanguage / ocr.languageHint in the payload
// ---------------------------------------------------------------------------

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
    image.width = 40;
    image.height = 20;
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
    it('keeps the Japanese OCR language for the default target', async () => {
        stubCanvasEncoding();
        const body = await recognizeWith({ ...DEFAULT_SETTINGS, ocrProvider: 'local-service', ocrLanguage: '' });

        expect(body.language_code).toBe('ja-JP');
        expect(body.language).toEqual({ bcp47_tag: 'ja-JP', two_letter_code: 'ja' });
    });

    it('sends the active target OCR language to the local service', async () => {
        stubCanvasEncoding();
        activateAdHocTarget('sv');
        const body = await recognizeWith({ ...DEFAULT_SETTINGS, ocrProvider: 'local-service', ocrLanguage: '' });

        expect(body.language_code).toBe('sv-SE');
        expect(body.language).toEqual({ bcp47_tag: 'sv-SE', two_letter_code: 'sv' });
    });

    it('sends the active target language hint to Cloud Vision', async () => {
        stubCanvasEncoding();
        activateAdHocTarget('sv');
        const body = await recognizeWith({
            ...DEFAULT_SETTINGS,
            ocrProvider: 'cloud-vision',
            ocrCloudVisionApiKey: 'test-key',
            ocrLanguage: '',
        });

        const requests = body.requests as Array<{ imageContext: { languageHints: string[] } }>;
        expect(requests[0]?.imageContext.languageHints).toEqual(['sv']);
    });

    it('still honours an explicitly configured OCR language over the target default', async () => {
        stubCanvasEncoding();
        activateAdHocTarget('sv');
        const body = await recognizeWith({ ...DEFAULT_SETTINGS, ocrProvider: 'local-service', ocrLanguage: 'de-DE' });

        expect(body.language_code).toBe('de-DE');
        expect(body.language).toEqual({ bcp47_tag: 'de-DE', two_letter_code: 'de' });
    });
});

// ---------------------------------------------------------------------------
// settings/form-read.ts — ocr.defaultLanguage as the saved OCR language
// ---------------------------------------------------------------------------

describe('settings form OCR language', () => {
    it('keeps a blank OCR language blank so it can still follow the target', () => {
        expect(readFormSettings(new FormData(), DEFAULT_SETTINGS).ocrLanguage).toBe('');

        activateAdHocTarget('sv');

        expect(readFormSettings(new FormData(), DEFAULT_SETTINGS).ocrLanguage).toBe('');
    });

    it('round-trips a save under one target without pinning the next one', () => {
        const saved = readFormSettings(new FormData(), DEFAULT_SETTINGS);
        expect(saved.ocrLanguage).toBe('');

        activateAdHocTarget('sv');
        const reloaded = normalizeReaderSettings(JSON.parse(JSON.stringify(saved)) as ReaderSettings);

        expect(targetOcrLanguageTag(reloaded.ocrLanguage)).toBe('sv-SE');
    });

    it('keeps an explicitly configured OCR language across a save', () => {
        const form = new FormData();
        form.set('ocrLanguage', 'de-DE');

        expect(readFormSettings(form, DEFAULT_SETTINGS).ocrLanguage).toBe('de-DE');
    });
});

// ---------------------------------------------------------------------------
// settings/index.ts — unpinning an OCR language an older build wrote for us
// ---------------------------------------------------------------------------

describe('stored OCR language migration', () => {
    it('unpins a stored tag that is only a target default', () => {
        const stored = normalizeReaderSettings({ ...DEFAULT_SETTINGS, ocrLanguage: 'ja-JP' });
        expect(stored.ocrLanguage).toBe('');

        activateAdHocTarget('sv');

        expect(targetOcrLanguageTag(stored.ocrLanguage)).toBe('sv-SE');
    });

    it('keeps a stored tag no target claims', () => {
        expect(normalizeReaderSettings({ ...DEFAULT_SETTINGS, ocrLanguage: 'de-DE' }).ocrLanguage).toBe('de-DE');
    });
});

// ---------------------------------------------------------------------------
// subtitles/subtitle-batch-mining.ts — collationLocale for the sort tie-break
// ---------------------------------------------------------------------------

function miningToken(spelling: string): JPDBToken {
    return {
        card: { spelling, reading: '', cardState: ['new'], partOfSpeech: [], frequencyRank: 100 } as unknown as JPDBCard,
        start: 0,
        end: spelling.length,
        length: spelling.length,
        rubies: [],
        pitchClass: '',
        sentence: 'row',
    } as unknown as JPDBToken;
}

function miningRow(spellings: readonly string[]): SubtitleBatchMiningRow {
    return {
        cueIndex: 0,
        rowIndex: 0,
        start: 0,
        end: 1,
        text: 'row',
        tokens: spellings.map(miningToken),
    };
}

describe('subtitle batch mining order', () => {
    it('breaks ties with the active target collation locale', () => {
        // 'ä' sorts before 'z' under Japanese (and root) collation and after it
        // under Swedish, so the order is a direct read-out of the locale used.
        const japanese = buildSubtitleBatchMiningCandidates([miningRow(['ä', 'z'])]);
        expect(japanese.map(candidate => candidate.card.spelling)).toEqual(['ä', 'z']);

        activateAdHocTarget('sv', { collationLocale: 'sv' });

        const swedish = buildSubtitleBatchMiningCandidates([miningRow(['ä', 'z'])]);
        expect(swedish.map(candidate => candidate.card.spelling)).toEqual(['z', 'ä']);
    });
});

// ---------------------------------------------------------------------------
// subtitles/subtitle-track-loader.ts — subtitles.languageTag as the
// translation destination for a track that carries no language of its own
// ---------------------------------------------------------------------------

describe('translated subtitle track destination', () => {
    // translateText memoizes on source:target:text, so every call needs its own
    // line — otherwise a retried attempt reads the cache and issues no request.
    let translationLine = 0;

    async function translationTargetFor(label: string): Promise<string> {
        translationLine += 1;
        const text = `${label} ${translationLine}`;
        const urls: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            urls.push(String(url));
            return {
                ok: true,
                status: 200,
                headers: new Headers({ 'content-type': 'application/json' }),
                json: async () => ({ sentences: [{ trans: 'translated' }] }),
                text: async () => JSON.stringify({ sentences: [{ trans: 'translated' }] }),
            } as unknown as Response;
        }));

        const source = {
            id: 'source',
            label: 'English',
            kind: 'youtube' as const,
            language: 'en',
            cues: [{ start: 0, end: 1, text }],
        };
        const translated = { id: 'translated', label: 'Auto', kind: 'youtube' as const, translatedFromTrackId: 'source' };

        await loadSubtitleTrackCues(translated, {
            tracks: [source, translated],
            transcriptEligible: false,
            requestText: async () => '',
        });

        expect(urls).toHaveLength(1);
        return new URL(urls[0]!).searchParams.get('tl') ?? '';
    }

    it('translates into Japanese for the default target', async () => {
        await expect(translationTargetFor('default target line')).resolves.toBe('ja');
    });

    it('translates into the active target subtitle language', async () => {
        activateAdHocTarget('sv');
        await expect(translationTargetFor('active target line')).resolves.toBe('sv');
    });
});

// ---------------------------------------------------------------------------
// settings/index.ts + settings/form.ts — the two axes that are NOT the
// learning target, pinned so a future "many-to-many" pass cannot quietly
// reroute them through the target module.
// ---------------------------------------------------------------------------

describe('language-profile independence', () => {
    it('now sees a persisted target, because normalization no longer forces one', () => {
        // This clause used to be unreachable: normalizeLanguageProfile stamped
        // SLICE1_TARGET_LANGUAGE on every profile it returned, so a persisted
        // non-Japanese target never reached the independence check. A stored
        // target with a registered module now survives, which is what makes
        // the profile independent — so the profile's own parserProvider wins
        // instead of the legacy top-level one.
        const profile = DEFAULT_SETTINGS.languageProfiles[0]!;
        const withForeignTarget = normalizeReaderSettings({
            ...DEFAULT_SETTINGS,
            parserProvider: 'jpdb',
            languageProfiles: [{ ...profile, targetLanguage: 'ko' }],
            activeLanguageProfileId: profile.id,
        } as Partial<ReaderSettings>);

        expect(withForeignTarget.languageProfiles[0]?.targetLanguage).toBe('ko');
        expect(withForeignTarget.parserProvider).toBe(profile.parserProvider);

        // A target with no registered module is still forced back, so the
        // Japanese install every existing user has is judged exactly as before.
        const withUnknownTarget = normalizeReaderSettings({
            ...DEFAULT_SETTINGS,
            parserProvider: 'jpdb',
            languageProfiles: [{ ...profile, targetLanguage: 'qqq' }],
            activeLanguageProfileId: profile.id,
        } as Partial<ReaderSettings>);

        expect(withUnknownTarget.languageProfiles[0]?.targetLanguage).toBe(SLICE1_TARGET_LANGUAGE);
        expect(withUnknownTarget.parserProvider).toBe('jpdb');
    });
});

describe('settings dialog catalogue panel', () => {
    it('follows the interface language, never the active learning target', () => {
        activateAdHocTarget('sv');

        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(
            normalizeReaderSettings({ ...DEFAULT_SETTINGS, interfaceLanguage: 'en' }),
            'https://jpdb.io/settings',
        );
        localizeSettingsForm(form, 'ja');
        const section = form.querySelector<HTMLElement>('[data-catalog-browse]');

        expect(section).not.toBeNull();
        // Japanese UI copy must stay labelled as Japanese even while the reader
        // is studying Swedish; this locale is the interface axis, not the target.
        expect(section!.lang).toBe('ja');
        expect(section!.dir).toBe('ltr');
    });
});
