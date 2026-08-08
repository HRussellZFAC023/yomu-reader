import { describe, expect, it } from 'vitest';

import { subtitleFilePickerJobs } from '../../src/reader/subtitles/subtitle-track-selection';

describe('subtitle track selection', () => {
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
});
