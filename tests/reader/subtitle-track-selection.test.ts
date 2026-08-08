import { afterEach, describe, expect, it } from 'vitest';

import { resetActiveLearningTargetLanguage, setActiveLearningTargetLanguage } from '../../src/reader/languages/active';
import { subtitleFilePickerJobs } from '../../src/reader/subtitles/subtitle-track-selection';

describe('subtitle track selection', () => {
    afterEach(() => resetActiveLearningTargetLanguage());

    it('keeps native-labelled translations behind the Japanese primary file', () => {
        const native = new File([''], 'lesson.native.srt', { type: 'application/x-subrip' });
        const japanese = new File([''], 'lesson.jpn.srt', { type: 'application/x-subrip' });

        expect(subtitleFilePickerJobs('primary', [native, japanese]).map(job => ({
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

        expect(subtitleFilePickerJobs('primary', [english, spanish]).map(job => ({
            kind: job.kind,
            name: job.file.name,
        }))).toEqual([
            { kind: 'primary', name: 'lesson.spa.srt' },
            { kind: 'secondary', name: 'lesson.eng.srt' },
        ]);
    });
});
