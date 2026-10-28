import { describe, expect, it } from 'vitest';

import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';
import { renderTokensToHtml } from '../../src/reader/dom/index';
import {
    pitchClassNameForPattern,
    pitchPatternFromPosition,
    type PitchClassName,
} from '../../src/reader/lookup/pitch-accent';
import { renderListenCard, type ListenCardView } from '../../src/reader/newtab/listen-render';
import type { PitchSrsItem } from '../../src/reader/newtab/pitch-srs';
import { renderPitch } from '../../src/reader/popup/pitch';
import { renderSettingsForm } from '../../src/reader/settings/form';
import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../src/reader/settings/index';

const READING = 'ふたご';
const EXPECTED_CLASSES: PitchClassName[] = ['heiban', 'atamadaka', 'nakadaka', 'odaka'];

function card(pattern: string): JPDBCard {
    return {
        vid: 17,
        sid: 3,
        rid: 0,
        source: 'jpdb',
        spelling: '双子',
        reading: READING,
        frequencyRank: 500,
        partOfSpeech: ['n'],
        meanings: [{ glosses: ['twins'], partOfSpeech: ['n'] }],
        cardState: ['not-in-deck'],
        pitchAccent: [pattern],
        wordWithReading: null,
    };
}

function token(pattern: string): JPDBToken {
    return {
        card: card(pattern),
        start: 0,
        end: 2,
        length: 2,
        rubies: [],
        pitchClass: pitchClassNameForPattern(pattern, READING),
    };
}

function listenView(): ListenCardView {
    const pattern = pitchPatternFromPosition(READING, 0);
    const item: PitchSrsItem = {
        key: `${READING}#0`,
        reading: READING,
        pitchNumber: 0,
        pattern,
        pitchClass: 'heiban',
        displaySpelling: '双子',
        due: 0,
        intervalDays: 0,
        ease: 2.5,
        reps: 0,
        lapses: 0,
        introducedAt: 0,
    };
    return {
        item,
        meaning: 'twins',
        subMode: 'perceive',
        revealed: false,
        selectedPosition: null,
        outcome: null,
        validPositions: [0],
        variants: [],
        hasAudio: true,
        recording: false,
        hasRecording: false,
        speakingScore: null,
        speakingScoring: false,
        micEnabled: false,
        micUnavailable: false,
        contrast: null,
    };
}

describe('canonical pitch taxonomy across reader surfaces', () => {
    it('uses only the four positional Tokyo classes on page words and popup graphs', () => {
        for (let position = 0; position <= 3; position += 1) {
            const pattern = pitchPatternFromPosition(READING, position);
            const expected = EXPECTED_CLASSES[position];
            expect(renderTokensToHtml('双子', [token(pattern)], DEFAULT_SETTINGS))
                .toContain(`jpdb-pitch-${expected}`);
            expect(renderPitch(card(pattern))).toContain(`class="${expected}"`);
        }
    });

    it('renders malformed contours as honest unknowns instead of a fifth class or graph', () => {
        const malformed = 'LHLH';
        const page = renderTokensToHtml('双子', [token(malformed)], DEFAULT_SETTINGS);
        expect(page).toContain('jpdb-pitch-unknown');
        expect(page).not.toContain('jpdb-pitch-kifuku');
        expect(renderPitch(card(malformed))).toBe('');
    });

    it('labels every new-tab position with the same canonical class mapping', () => {
        const root = document.createElement('div');
        root.innerHTML = renderListenCard(listenView(), key => key);
        expect(Array.from(root.querySelectorAll<HTMLElement>('[data-listen-pos]'), button => button.dataset.pitchClass))
            .toEqual(EXPECTED_CLASSES);
        expect(root.innerHTML).not.toContain('kifuku');
    });

    it('keeps legacy settings load-compatible while removing the obsolete color control', () => {
        const normalized = normalizeReaderSettings({
            ...DEFAULT_SETTINGS,
            pitchColorNakadaka: '#654321',
            pitchColorKifuku: '#123456',
        } as typeof DEFAULT_SETTINGS & { pitchColorKifuku: string });
        expect(normalized.pitchColorNakadaka).toBe('#654321');
        expect(Object.hasOwn(normalized, 'pitchColorKifuku')).toBe(false);

        const form = renderSettingsForm(normalized, 'https://example.test/');
        expect(form).toContain('name="pitchColorUnknown"');
        expect(form).not.toContain('pitchColorKifuku');
    });
});
