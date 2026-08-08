import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JPDBToken } from '../../../src/reader/app/types';
import { getOrderedAudioSources } from '../../../src/reader/audio/source-resolution';
import { contextOccurrenceCount } from '../../../src/reader/cards/frequency-ranks';
import { effectiveTokenRubies, nonOverlappingTokens } from '../../../src/reader/dom/token-text-rendering';
import {
    targetCanHandwriteText,
    targetCanLookupCharacter,
    targetCanLookupWritingUnit,
} from '../../../src/reader/languages/character-lookup';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../../src/reader/languages/active';
import { learningTargetModuleFor } from '../../../src/reader/languages/registry';
import { LEARNING_TARGET_ROSTER } from '../../../src/reader/languages/roster';
import type { LearningTargetCapability } from '../../../src/reader/languages/types';
import { renderFrequencyPill } from '../../../src/reader/sources/definition-render';
import { DEFAULT_SETTINGS } from '../../../src/reader/settings';
import { recognizeGoogleHandwriting } from '../../../src/reader/newtab/kanji-helpers';
import { renderModalCard, testCardPopoverRenderer } from '../jpdb/fixtures';

const NON_GRAMMAR_CAPABILITIES: readonly LearningTargetCapability[] = [
    'term-lookup', 'character-lookup', 'segmentation', 'morphology',
    'reading-annotation', 'pronunciation', 'frequency', 'examples', 'audio',
    'text-to-speech', 'ocr', 'subtitles', 'mining', 'srs', 'grading', 'typing',
    'handwriting',
];

const MORPHOLOGY_TARGET_IDS = new Set(['ja', 'ar', 'de', 'ko', 'ru', 'es']);

// Native-script probes double as real detection/segmentation inputs. Keep one
// for every roster ID so adding a target makes this suite fail until its
// browser-facing behavior is exercised.
const TARGET_PROBES: Readonly<Record<string, string>> = {
    ja: '猫',
    sq: 'ujë',
    grc: 'ὕδωρ',
    ar: 'كِتاب',
    yue: '食飯',
    zh: '學習',
    da: 'blå',
    nl: 'café',
    en: 'water',
    fi: 'yö',
    fr: 'élève',
    de: 'Bär',
    el: 'νερό',
    hu: 'víz',
    id: 'air',
    it: 'perché',
    km: 'ទឹក',
    ko: '물',
    lo: 'ເສືອ',
    la: 'cūrā',
    mn: 'үг',
    fa: 'آب',
    pl: 'żółć',
    pt: 'água',
    ro: 'apă',
    ru: 'ёлка',
    sh: 'kuća',
    es: 'año',
    sv: 'blå',
    tl: 'áso',
    th: 'น้ำ',
    tr: 'ağız',
    vi: 'nước',
};

afterEach(() => {
    resetActiveLearningTargetLanguage();
    vi.unstubAllGlobals();
});

describe('A47 non-grammar capability parity', () => {
    it('keeps universal behavior separate from targets with actual morphology', () => {
        expect(LEARNING_TARGET_ROSTER).toHaveLength(33);

        for (const rosterTarget of LEARNING_TARGET_ROSTER) {
            const target = learningTargetModuleFor(rosterTarget.runtimeLocale);
            expect(target, `${rosterTarget.id} Module`).not.toBeNull();
            expect(target!.capabilities.morphology, `${rosterTarget.id} morphology`)
                .toBe(MORPHOLOGY_TARGET_IDS.has(rosterTarget.id));
            expect(
                NON_GRAMMAR_CAPABILITIES
                    .filter(capability => capability !== 'morphology')
                    .filter(capability => !target!.capabilities[capability]),
                `${rosterTarget.id} missing universal behavior`,
            ).toEqual([]);
            expect(target!.experiences.morphology === 'dictionary-forms', `${rosterTarget.id} morphology Adapter`)
                .toBe(!MORPHOLOGY_TARGET_IDS.has(rosterTarget.id));
            expect(Object.values(target!.experiences).every(Boolean), `${rosterTarget.id} experience modes`)
                .toBe(true);
        }
    });

    it('runs lookup, readings, frequency fallback, audio, OCR and handwriting for each target', () => {
        for (const rosterTarget of LEARNING_TARGET_ROSTER) {
            const probe = TARGET_PROBES[rosterTarget.id];
            const target = learningTargetModuleFor(rosterTarget.runtimeLocale)!;
            expect(probe, `${rosterTarget.id} native probe`).toBeTruthy();
            expect(setActiveLearningTargetLanguage(target.language), `${rosterTarget.id} activation`).toBe(target);

            const unit = firstGrapheme(probe);
            expect(targetCanLookupWritingUnit(unit, target), `${rosterTarget.id} character term Adapter`).toBe(true);
            expect(targetCanLookupCharacter(unit), `${rosterTarget.id} dedicated character Adapter`)
                .toBe(target.experiences.characterLookup === 'character-dictionary');

            const candidates = target.lookupCandidates(probe);
            expect(candidates.length, `${rosterTarget.id} lookup candidates`).toBeGreaterThan(0);
            expect(candidates[0]?.term, `${rosterTarget.id} surface candidate`).toBe(target.normalizeText(probe));

            const token = exactDictionaryReadingToken(probe, target.language, `reading-${rosterTarget.id}`);
            expect(nonOverlappingTokens([token], probe), `${rosterTarget.id} token detection`).toEqual([token]);
            expect(effectiveTokenRubies(probe, token), `${rosterTarget.id} dictionary reading`).toEqual([{
                text: `reading-${rosterTarget.id}`,
                start: 0,
                end: probe.length,
                length: probe.length,
            }]);

            expect(renderFrequencyPill(
                { expression: probe, mode: 'freq', data: 123, dictionary: `frequency-${rosterTarget.id}` },
                value => value,
            ), `${rosterTarget.id} frequency metadata`).toContain('#123');
            expect(contextOccurrenceCount(
                token.card,
                `${probe} · ${probe}`,
            ), `${rosterTarget.id} context frequency`).toBe(2);

            const sources = getOrderedAudioSources({ ...DEFAULT_SETTINGS, audioSources: [] });
            expect(sources.map(source => source.type), `${rosterTarget.id} default audio Adapter`)
                .toEqual(target.audio.recordedWordAudio ? ['custom-json'] : ['text-to-speech']);
            expect(target.audio.speechSynthesisLocale, `${rosterTarget.id} TTS locale`).toBeTruthy();
            expect(target.ocr.defaultLanguage, `${rosterTarget.id} OCR locale`).toBeTruthy();
            expect(target.ocr.languageHint, `${rosterTarget.id} OCR hint`).toBeTruthy();
            expect(targetCanHandwriteText(probe, target), `${rosterTarget.id} handwriting Adapter`).toBe(true);
        }
    });

    it('labels context counts as occurrences and never as a corpus rank', () => {
        const card = {
            ...exactDictionaryReadingToken('agua', 'es', 'agua').card,
            frequencyRank: null,
        };
        const renderer = testCardPopoverRenderer();

        const withoutRank = renderModalCard(renderer, card, 'agua y agua');
        expect(withoutRank).toContain('data-frequency-source="context"');
        expect(withoutRank).toContain('In context ×2');
        expect(withoutRank).not.toContain('>#2<');

        const withRank = renderModalCard(renderer, card, 'agua y agua', {
            metaEntries: [{ expression: 'agua', mode: 'freq', data: 123, dictionary: 'Spanish frequency' }],
        });
        expect(withRank).not.toContain('data-frequency-source="context"');
    });

    it('sends handwriting recognition the target-owned language hint and keeps non-Han predictions', async () => {
        const spanish = learningTargetModuleFor('es')!;
        let requestBody: unknown;
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            requestBody = JSON.parse(String(init?.body));
            return new Response(JSON.stringify([
                'SUCCESS',
                [['request-id', ['agua', 'aguja'], [], { is_html_escaped: false }]],
            ]));
        }));

        const predictions = await recognizeGoogleHandwriting([
            [{ x: 0.1, y: 0.1, pressure: 0.5 }, { x: 0.9, y: 0.9, pressure: 0.5 }],
        ], spanish);

        expect(requestBody).toMatchObject({ requests: [{ language: 'es' }] });
        expect(predictions).toEqual(['agua', 'aguja']);
    });
});

function exactDictionaryReadingToken(surface: string, language: string, reading: string): JPDBToken {
    return {
        card: {
            vid: -1,
            sid: 0,
            rid: 0,
            spelling: surface,
            reading,
            language,
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [],
            cardState: [],
            pitchAccent: [],
            wordWithReading: null,
        },
        start: 0,
        end: surface.length,
        length: surface.length,
        rubies: [],
        pitchClass: '',
        sentence: surface,
    };
}

function firstGrapheme(value: string): string {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value))[0]?.segment ?? '';
}
