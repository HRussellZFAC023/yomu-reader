import { afterEach, describe, expect, it, vi } from 'vitest';

import { newTabKeyHintsRenderable, renderNewTabGradeControlButtons } from '../../src/reader/newtab/review-controls';
import { newTabGradeOptions, usesTwoButtonNewTabGradeScale } from '../../src/reader/newtab/review-targets';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard } from '../../src/reader/app/types';
import { popoverUsesBunproGradeScale, updatePopoverReviewTargetSelection } from '../../src/reader/cards/popover-renderer';
import { bindPrivateCommandCapability } from '../../src/reader/dom/private-command-capabilities';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('new-tab review controls', () => {
    it('uses Bunpro Hard/Good instead of the JPDB five-point scale', () => {
        const card = { source: 'bunpro', reviewSource: 'bunpro-api' } as JPDBCard;
        expect(newTabGradeOptions(DEFAULT_SETTINGS, card)).toEqual([
            ['fail', 'Hard'],
            ['pass', 'Good'],
        ]);
        expect(usesTwoButtonNewTabGradeScale(DEFAULT_SETTINGS, card)).toBe(true);
        expect(newTabGradeOptions(DEFAULT_SETTINGS)).toHaveLength(5);
        expect(usesTwoButtonNewTabGradeScale(DEFAULT_SETTINGS)).toBe(false);
    });

    it('uses Bunpro FSRS Again/Hard/Good/Easy instead of a five-point scale', () => {
        const card = { source: 'bunpro', reviewSource: 'bunpro-api', bunproReviewInputMode: 'fsrs' } as JPDBCard;
        expect(newTabGradeOptions(DEFAULT_SETTINGS, card)).toEqual([
            ['nothing', 'Again'],
            ['hard', 'Hard'],
            ['okay', 'Good'],
            ['easy', 'Easy'],
        ]);
        expect(usesTwoButtonNewTabGradeScale(DEFAULT_SETTINGS, card)).toBe(false);
    });

    it('switches a mixed popover between Bunpro two-button and JPDB five-button rows', () => {
        document.body.innerHTML = `<div class="jpdb-reader-actions">
            <select data-review-target-select>
                <option data-review-target="jpdb" data-review-grade-profile="standard" data-review-target-label="Grades JPDB" data-review-target-short-label="JPDB">JPDB</option>
                <option data-review-target="bunpro" data-review-grade-profile="bunpro-regular" data-review-target-label="Grades Bunpro" data-review-target-short-label="Bunpro">Bunpro</option>
            </select>
            <span data-review-target-current></span>
            <span data-review-target-label><span data-newtab-grade-target-text></span></span>
            <div data-review-target-row data-review-grade-profile="standard"><button data-action="grade" data-grade="nothing"></button></div>
            <div data-review-target-row data-review-grade-profile="bunpro-regular" hidden><button data-action="grade" data-grade="pass"></button></div>
        </div>`;
        const select = document.querySelector<HTMLSelectElement>('select')!;
        bindPrivateCommandCapability(select.options[0]!, { kind: 'review-target', target: 'jpdb', gradeProfile: 'standard', label: 'Grades JPDB', shortLabel: 'JPDB' });
        bindPrivateCommandCapability(select.options[1]!, { kind: 'review-target', target: 'bunpro', gradeProfile: 'bunpro-regular', label: 'Grades Bunpro', shortLabel: 'Bunpro' });
        select.selectedIndex = 1;
        updatePopoverReviewTargetSelection(select);

        expect(document.querySelector<HTMLElement>('[data-review-grade-profile="standard"]')?.hidden).toBe(true);
        expect(document.querySelector<HTMLElement>('[data-review-grade-profile="bunpro-regular"]')?.hidden).toBe(false);
        expect(popoverUsesBunproGradeScale(document)).toBe(true);
        expect(document.querySelector('[data-review-target-current]')?.textContent).toBe('Bunpro');
        expect(document.querySelector('[data-review-grade-profile="bunpro-regular"] button')?.getAttribute('data-review-target')).toBe('bunpro');

        select.selectedIndex = 0;
        updatePopoverReviewTargetSelection(select);
        expect(popoverUsesBunproGradeScale(document)).toBe(false);
    });
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
            summary: { targets: [], hasJpdb: true, hasJiten: false, hasBunpro: false, hasWanikani: false, hasYomuLocal: false, hasAnki: false },
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
            summary: { targets: [], hasJpdb: true, hasJiten: false, hasBunpro: false, hasWanikani: false, hasYomuLocal: false, hasAnki: false },
            targetLabel: 'Grades JPDB',
            targetOptions: [],
        });

        expect(buttons[0]?.querySelector('.jpdb-reader-newtab-key-hint')).toBeNull();
    });

    it('does not render shortcut hints when the Study hint setting is off', () => {
        vi.stubGlobal('matchMedia', (query: string) => ({
            matches: query.includes('pointer: fine') || query.includes('hover: hover'),
        }));

        expect(newTabKeyHintsRenderable(false)).toBe(false);
        const buttons = renderNewTabGradeControlButtons({
            apiShortLabel: 'JPDB',
            bothLabel: 'Both',
            grades: [['okay', 'Okay']],
            selectorLabel: 'Grade target',
            keyHints: { okay: 'K' },
            selectedOption: undefined,
            showShortcutHints: false,
            summary: { targets: [], hasJpdb: true, hasJiten: false, hasBunpro: false, hasWanikani: false, hasYomuLocal: false, hasAnki: false },
            targetLabel: 'Grades JPDB',
            targetOptions: [],
        });

        expect(buttons[0]?.querySelector('.jpdb-reader-newtab-key-hint')).toBeNull();
    });
});
