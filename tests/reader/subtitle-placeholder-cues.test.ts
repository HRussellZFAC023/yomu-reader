import { describe, expect, it } from 'vitest';

import { isPlaceholderSubtitleCueText, normalizeSubtitleCues } from '../../src/reader/subtitles/subtitle-cues';

// Amazon product videos ship a single metadata cue ("Captions not needed:
// There is no dialogue.") that was rendered — and machine-translated into a
// permanent Japanese subtitle — as if it were dialogue.
describe('placeholder subtitle cues', () => {
    it.each([
        'Captions not needed: There is no dialogue.',
        'captions not needed',
        'Subtitles are not available.',
        'No dialogue.',
        '[no speech]',
        '(No audio)',
        'There is no dialogue in this video.',
        'This video contains no dialogue',
    ])('recognizes %j as a placeholder', text => {
        expect(isPlaceholderSubtitleCueText(text)).toBe(true);
    });

    it.each([
        'No dialogue survives a war like this one.',
        'Turn on captions not needed for this scene, but useful.',
        'この動画には字幕があります。',
        'He said there is no dialogue between them anymore, sadly.',
    ])('keeps real dialogue %j', text => {
        expect(isPlaceholderSubtitleCueText(text)).toBe(false);
    });

    it('drops placeholder cues during normalization and keeps real ones', () => {
        const cues = normalizeSubtitleCues([
            { start: 0, end: 148, text: 'Captions not needed: There is no dialogue.' },
            { start: 2, end: 4, text: '日本語の台詞です。' },
        ]);
        expect(cues).toHaveLength(1);
        expect(cues[0]?.text).toBe('日本語の台詞です。');
    });
});
