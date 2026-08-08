import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetActiveLearningTargetLanguage, setActiveLearningTargetLanguage } from '../../src/reader/languages/active';
import { LEARNING_TARGET_ROSTER } from '../../src/reader/languages/roster';
import { learningTargetModuleFor } from '../../src/reader/languages/registry';
import { resetGoogleTranslationCacheForTests } from '../../src/reader/translation/google';
import { loadSubtitleTrackCues } from '../../src/reader/subtitles/subtitle-track-loader';
import {
    autoSelectablePageTrackRole,
    ensureTranslatedTargetTrack,
    subtitleFilePickerJobs,
} from '../../src/reader/subtitles/subtitle-track-selection';
import type { SubtitleTrackOption } from '../../src/reader/subtitles/subtitle-track-options';

const JAPANESE_ENGLISH = { targetLanguage: 'ja', outputLanguage: 'en' };

function expectLearningTargetSubtitleBehavior(runtimeLocale: string): void {
    const target = learningTargetModuleFor(runtimeLocale)!;
    const languages = { targetLanguage: target.subtitles.languageTag, outputLanguage: 'en' };
    const option = { id: `target-${target.language}`, label: target.language, kind: 'remote' as const, language: target.subtitles.languageTag };
    expect(autoSelectablePageTrackRole(option, {
        selectedTrackId: '',
        secondaryTrackId: '',
        selected: undefined,
        secondary: undefined,
        cues: [],
        secondaryCues: [],
    }, languages), `${target.language} primary`).toBe('primary');

    const tracks = [{ id: 'english', label: 'English', kind: 'remote' as const, language: 'en' }];
    const generated = ensureTranslatedTargetTrack(tracks, 'en', languages);
    const shouldGenerate = !['en', 'grc'].includes(target.subtitles.languageTag);
    expect(generated, `${target.language} generated`).toBe(shouldGenerate);
    expect(tracks.find(track => track.id !== 'english')?.language, `${target.language} label`).toBe(
        shouldGenerate ? target.subtitles.languageTag : undefined,
    );
}

describe('subtitle track selection', () => {
    afterEach(() => {
        resetActiveLearningTargetLanguage();
        resetGoogleTranslationCacheForTests();
        vi.unstubAllGlobals();
    });

    it('keeps native-labelled translations behind the Japanese primary file', () => {
        const native = new File([''], 'lesson.native.srt', { type: 'application/x-subrip' });
        const japanese = new File([''], 'lesson.jpn.srt', { type: 'application/x-subrip' });

        expect(subtitleFilePickerJobs('primary', [native, japanese], JAPANESE_ENGLISH).map(job => ({
            kind: job.kind,
            name: job.file.name,
        }))).toEqual([
            { kind: 'primary', name: 'lesson.jpn.srt' },
            { kind: 'secondary', name: 'lesson.native.srt' },
        ]);
    });

    it('pairs the active target file as primary ahead of an English translation', () => {
        expect(setActiveLearningTargetLanguage('es')).not.toBeNull();
        const english = new File([''], 'lesson.eng.srt', { type: 'application/x-subrip' });
        const spanish = new File([''], 'lesson.spa.srt', { type: 'application/x-subrip' });

        expect(subtitleFilePickerJobs('primary', [english, spanish], {
            targetLanguage: 'es',
            outputLanguage: 'en',
        }).map(job => ({
            kind: job.kind,
            name: job.file.name,
        }))).toEqual([
            { kind: 'primary', name: 'lesson.spa.srt' },
            { kind: 'secondary', name: 'lesson.eng.srt' },
        ]);
    });

    it('partitions English-target multi-file jobs once and keeps OUTPUT last for selection', () => {
        const english = new File([''], 'lesson.eng.srt', { type: 'application/x-subrip' });
        const japanese = new File([''], 'lesson.jpn.srt', { type: 'application/x-subrip' });
        const output = new File([''], 'lesson.native.srt', { type: 'application/x-subrip' });

        const jobs = subtitleFilePickerJobs('primary', [english, japanese, output], {
            targetLanguage: 'en',
            outputLanguage: 'es',
        });

        expect(jobs.map(job => `${job.kind}:${job.file.name}`)).toEqual([
            'primary:lesson.eng.srt',
            'secondary:lesson.jpn.srt',
            'secondary:lesson.native.srt',
        ]);
        expect(new Set(jobs.map(job => job.file)).size).toBe(3);
    });

    it('auto-selects secondary tracks from OUTPUT rather than hardcoded English', () => {
        const state = {
            selectedTrackId: 'japanese',
            secondaryTrackId: '',
            selected: { id: 'japanese', label: '日本語', kind: 'remote' as const, language: 'ja' },
            secondary: undefined,
            cues: [],
            secondaryCues: [],
        };
        const languages = { targetLanguage: 'ja', outputLanguage: 'es' };

        expect(autoSelectablePageTrackRole({
            id: 'spanish', label: 'Español', kind: 'remote', language: 'es',
        }, state, languages)).toBe('secondary');
        expect(autoSelectablePageTrackRole({
            id: 'english', label: 'English', kind: 'remote', language: 'en',
        }, state, languages)).toBeNull();
    });

    it('translates TARGET from a supported OUTPUT track without assuming English', async () => {
        const tracks: SubtitleTrackOption[] = [
            {
                id: 'spanish',
                label: 'Español',
                kind: 'remote',
                language: 'es',
                cues: [{ start: 0, end: 1, text: 'Leemos hoy.' }],
            },
        ];

        expect(ensureTranslatedTargetTrack(tracks, 'en', {
            targetLanguage: 'ko',
            outputLanguage: 'es',
        })).toBe(true);
        expect(tracks[1]).toMatchObject({
            language: 'ko',
            sourceLanguage: 'es',
            targetLanguage: 'ko',
            translatedFromTrackId: 'spanish',
        });

        const requestedUrls: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            requestedUrls.push(String(input));
            return new Response(JSON.stringify({ sentences: [{ trans: '오늘 읽어요.' }] }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        }));
        await expect(loadSubtitleTrackCues(tracks[1]!, {
            tracks,
            transcriptEligible: true,
            requestText: async () => '',
        })).resolves.toMatchObject({ cues: [{ text: '오늘 읽어요.' }] });
        expect(new URL(requestedUrls[0]!).searchParams.get('sl')).toBe('es');
        expect(new URL(requestedUrls[0]!).searchParams.get('tl')).toBe('ko');

        expect(ensureTranslatedTargetTrack([
            { id: 'ancient-greek', label: 'Ἑλληνική', kind: 'remote', language: 'grc' },
        ], 'en', {
            targetLanguage: 'ko',
            outputLanguage: 'grc',
        })).toBe(false);
    });

    it('proves primary matching and the provider-audited translation boundary across all 33 targets', () => {
        expect(LEARNING_TARGET_ROSTER).toHaveLength(33);
        for (const target of LEARNING_TARGET_ROSTER) expectLearningTargetSubtitleBehavior(target.runtimeLocale);
    });
});
