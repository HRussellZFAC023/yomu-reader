// The keycaps under the popup grade buttons (owner decision 3, 2026-10-07):
// desktop only, only for a grade that has a shortcut, and only until the
// learner's first popup grade, by click or by key, retires them for good.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    GRADE_KEY_HINTS_RETIRED_KEY,
    resetGradeKeyHintsForTests,
    retireGradeKeyHints,
    showGradeKeyHintsUntilRetired,
} from '../../src/reader/cards/grade-key-hints';
import { gmPrivateStorageGet } from '../../src/reader/app/storage';
import { renderReviewButtons } from '../../src/reader/anki/render';
import { bindPrivateCommandCapability } from '../../src/reader/dom/private-command-capabilities';
import { setInnerHtml } from '../../src/reader/dom';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';
import { DEFAULT_SETTINGS, card, testCardActionController } from './jpdb/fixtures';
import type { JPDBCard } from './jpdb/fixtures';
import { NewTabRuntime } from './new-tab-review/fixtures';

const HINTS_CLASS = 'jpdb-reader-grade-key-hints';
const hintsShown = (): boolean => document.documentElement.classList.contains(HINTS_CLASS);
const storageSettled = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
    installGmStorageFixture();
    resetGradeKeyHintsForTests();
});

afterEach(() => {
    document.documentElement.classList.remove(HINTS_CLASS);
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('popup grade keycaps', () => {
    it('stay hidden until private storage answers, then show for a learner who has not graded yet', async () => {
        const shown = showGradeKeyHintsUntilRetired();
        expect(hintsShown()).toBe(false);
        await shown;
        expect(hintsShown()).toBe(true);
    });

    it('retire for good on the first popup grade, given by a grade button or its key', async () => {
        await showGradeKeyHintsUntilRetired();
        const settings = { ...DEFAULT_SETTINGS, enableReviews: true, apiKey: 'jpdb-key', jpdbMiningEnabled: true };
        const jpdb = { addToDeck: vi.fn(async () => undefined), reviewCard: vi.fn(async () => undefined) };
        const controller = testCardActionController({ getSettings: () => settings, jpdb: jpdb as never, isJpdbBackedCard: () => true });

        // Both the popup's grade buttons and its grade keys land here.
        await controller.reviewGrade('okay', { ...card, cardState: ['learning'] }, undefined, { target: 'jpdb' });

        expect(jpdb.reviewCard).toHaveBeenCalledTimes(1);
        expect(hintsShown()).toBe(false);
        await storageSettled();
        expect(await gmPrivateStorageGet(GRADE_KEY_HINTS_RETIRED_KEY, false)).toBe(true);

        // The next page reads the record and never shows them again.
        resetGradeKeyHintsForTests();
        await showGradeKeyHintsUntilRetired();
        expect(hintsShown()).toBe(false);
    });

    it('retire when a Study lookup popup grades its card', async () => {
        vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
        await showGradeKeyHintsUntilRetired();
        const runtime = new NewTabRuntime();
        const internals = runtime as unknown as {
            newTab: { gradeFromLookup: () => Promise<unknown> };
            handleLookupCardCommand(button: HTMLButtonElement, command: { kind: 'card-action'; action: 'grade'; grade: 'okay' }, lookedUp: JPDBCard): void;
        };
        internals.newTab = { gradeFromLookup: vi.fn(async () => ({ preserveLookup: true })), destroy: vi.fn() } as never;
        const button = document.createElement('button');
        const command = { kind: 'card-action', action: 'grade', grade: 'okay' } as const;
        bindPrivateCommandCapability(button, command);
        document.body.append(button);
        try {
            internals.handleLookupCardCommand(button, command, card);
            expect(hintsShown()).toBe(false);
        } finally {
            runtime.destroy();
        }
    });

    it('label only a grade that has a key, and always announce the key to assistive technology', () => {
        const custom = { ...DEFAULT_SETTINGS, enableReviews: true, shortcuts: { ...DEFAULT_SETTINGS.shortcuts, gradeHard: '' } };
        const root = document.createElement('div');
        setInnerHtml(root, renderReviewButtons(custom, null, { gradeProfile: 'standard' }));
        const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-action="grade"]')];
        expect(buttons.map(button => button.dataset.gradeKey)).toEqual(['1', '2', undefined, '4', '5']);
        expect(buttons.map(button => button.getAttribute('aria-keyshortcuts'))).toEqual(['1', '2', null, '4', '5']);
        // The keycap is drawn, never a control of its own inside the button.
        expect(root.querySelector('[data-action="grade"] :is(button, a, [role="button"], kbd)')).toBeNull();
    });

    it('are drawn only for a fine pointer that can hover, and only while the learner has not graded', () => {
        const css = readFileSync('src/reader/styles/popover-core.css', 'utf8');
        const style = document.createElement('style');
        style.textContent = css;
        document.head.append(style);
        try {
            const drawsKeycap = (rule: CSSRule): boolean => rule instanceof CSSStyleRule
                && /\[data-grade-key\]::after/u.test(rule.selectorText)
                && /attr\(data-grade-key\)/u.test(rule.style.getPropertyValue('content') || rule.cssText);
            const rules = [...style.sheet!.cssRules];
            expect(rules.filter(drawsKeycap)).toEqual([]);
            const desktop = rules.filter((rule): rule is CSSMediaRule => rule instanceof CSSMediaRule && rule.conditionText === '(hover: hover) and (pointer: fine)');
            const keycaps = desktop.flatMap(rule => [...rule.cssRules]).filter(drawsKeycap) as CSSStyleRule[];
            expect(keycaps.map(rule => rule.selectorText)).toEqual([`.${HINTS_CLASS} .jpdb-reader-btn[data-grade-key]::after`]);
        } finally {
            style.remove();
        }
    });

    it('a retirement before storage answers is not undone by the late answer', async () => {
        const shown = showGradeKeyHintsUntilRetired();
        retireGradeKeyHints();
        await shown;
        expect(hintsShown()).toBe(false);
    });
});
