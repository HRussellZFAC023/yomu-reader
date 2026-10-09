import { afterEach, describe, expect, it, vi } from 'vitest';

import { JAPANESE_LEARNING_TARGET } from '../../src/reader/languages/japanese';
import { resetGoogleTranslationCacheForTests } from '../../src/reader/translation/google';
import { loadSubtitleTrackCues } from '../../src/reader/subtitles/subtitle-track-loader';
import {
    autoSelectablePageTrackRole,
    ensureTranslatedTargetTrack,
    subtitleFilePickerJobs,
} from '../../src/reader/subtitles/subtitle-track-selection';
import type { SubtitleTrackOption } from '../../src/reader/subtitles/subtitle-track-options';

const JAPANESE_ENGLISH = { targetLanguage: 'ja', outputLanguage: 'en' };

function expectLearningTargetSubtitleBehavior(): void {
    const target = JAPANESE_LEARNING_TARGET;
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
    expect(generated, `${target.language} generated`).toBe(true);
    expect(tracks.find(track => track.id !== 'english')?.language, `${target.language} label`).toBe(target.subtitles.languageTag);
}

describe('subtitle track selection', () => {
    afterEach(() => {
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

    it('auto-selects only the English OUTPUT track as secondary', () => {
        const state = {
            selectedTrackId: 'japanese',
            secondaryTrackId: '',
            selected: { id: 'japanese', label: '日本語', kind: 'remote' as const, language: 'ja' },
            secondary: undefined,
            cues: [],
            secondaryCues: [],
        };
        expect(autoSelectablePageTrackRole({
            id: 'english', label: 'English', kind: 'remote', language: 'en',
        }, state, JAPANESE_ENGLISH)).toBe('secondary');
        expect(autoSelectablePageTrackRole({
            id: 'spanish', label: 'Español', kind: 'remote', language: 'es',
        }, state, JAPANESE_ENGLISH)).toBeNull();
    });

    it('translates TARGET from a supported non-English track when no English track exists', async () => {
        const tracks: SubtitleTrackOption[] = [
            {
                id: 'spanish',
                label: 'Español',
                kind: 'remote',
                language: 'es',
                cues: [{ start: 0, end: 1, text: 'Leemos hoy.' }],
            },
        ];

        expect(ensureTranslatedTargetTrack(tracks, 'en', JAPANESE_ENGLISH)).toBe(true);
        expect(tracks[1]).toMatchObject({
            language: 'ja',
            sourceLanguage: 'es',
            targetLanguage: 'ja',
            translatedFromTrackId: 'spanish',
        });

        const requestedUrls: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            requestedUrls.push(String(input));
            return new Response(JSON.stringify({ sentences: [{ trans: '今日読みます。' }] }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        }));
        await expect(loadSubtitleTrackCues(tracks[1]!, {
            tracks,
            transcriptEligible: true,
            requestText: async () => '',
        })).resolves.toMatchObject({ cues: [{ text: '今日読みます。' }] });
        expect(new URL(requestedUrls[0]!).searchParams.get('sl')).toBe('es');
        expect(new URL(requestedUrls[0]!).searchParams.get('tl')).toBe('ja');

        expect(ensureTranslatedTargetTrack([
            { id: 'ancient-greek', label: 'Ἑλληνική', kind: 'remote', language: 'grc' },
        ], 'en', JAPANESE_ENGLISH)).toBe(false);
    });

    it('proves primary matching and the provider-audited translation boundary for the Japanese target', () => {
        expectLearningTargetSubtitleBehavior();
    });
});
