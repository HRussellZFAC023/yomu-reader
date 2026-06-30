import { afterEach, describe, expect, it, vi } from 'vitest';

import { newTabKeyHintsRenderable, renderNewTabGradeControlButtons } from '../../src/reader/newtab/review-controls';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('new-tab review controls', () => {
    it('renders shortcut hints from configured keys on keyboard-capable devices', () => {
        vi.stubGlobal('matchMedia', (query: string) => ({
            matches: query.includes('pointer: fine') || query.includes('hover: hover'),
        }));

        expect(newTabKeyHintsRenderable()).toBe(true);
        const buttons = renderNewTabGradeControlButtons({
            apiShortLabel: 'JPDB',
            bothLabel: 'Both',
            grades: [['nothing', 'Nothing'], ['okay', 'Okay']],
            selectorLabel: 'Grade target',
            keyHints: { nothing: 'Z', okay: 'K' },
            selectedOption: undefined,
            summary: { targets: [], hasJpdb: true, hasJiten: false, hasBunpro: false, hasYomuLocal: false, hasAnki: false },
            targetLabel: 'Grades JPDB',
            targetOptions: [],
        });

        const hints = buttons
            .filter(node => node.matches?.('[data-newtab-action="grade"]'))
            .map(button => button.querySelector('.jpdb-reader-newtab-key-hint')?.textContent);
        expect(hints).toEqual(['Z', 'K']);
    });

    it('does not render shortcut hints on touch-only devices', () => {
        vi.stubGlobal('matchMedia', (query: string) => ({
            matches: query.includes('pointer: coarse') || query.includes('hover: none'),
        }));

        expect(newTabKeyHintsRenderable()).toBe(false);
        const buttons = renderNewTabGradeControlButtons({
            apiShortLabel: 'JPDB',
            bothLabel: 'Both',
            grades: [['okay', 'Okay']],
            selectorLabel: 'Grade target',
            keyHints: { okay: 'K' },
            selectedOption: undefined,
            summary: { targets: [], hasJpdb: true, hasJiten: false, hasBunpro: false, hasYomuLocal: false, hasAnki: false },
            targetLabel: 'Grades JPDB',
            targetOptions: [],
        });

        expect(buttons[0]?.querySelector('.jpdb-reader-newtab-key-hint')).toBeNull();
    });
});
