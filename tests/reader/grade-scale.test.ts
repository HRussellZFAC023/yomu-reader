import '../../src/reader/companions/register-build-companions';
import { describe, expect, it } from 'vitest';
import { reviewGradeProfile, reviewGradeScale, type ReviewGradeProfile } from '../../src/reader/cards/grade-scale';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { renderReviewButtons } from '../../src/reader/anki/render';
import { setInnerHtml } from '../../src/reader/dom';
import { readCardCommandCapability, readPrivateReviewTarget } from '../../src/reader/dom/private-command-capabilities';
import { reviewShortcutButton } from '../../src/reader/dom/review-shortcuts';
import { renderNewTabLookupReviewControls } from '../../src/reader/newtab/lookup-dom';
import { updatePopoverReviewTargetSelection } from '../../src/reader/cards/popover-renderer';
import { renderNewTabGradeControlButtons, selectedNewTabMainGradeTarget, summarizeNewTabReviewSources, updateNewTabMainGradeTargetLabel } from '../../src/reader/newtab/review-controls';
import type { JPDBCard } from '../../src/reader/app/types';
import { jitenRatingForGrade } from '../../src/reader/dictionaries/jiten';
import { isFailedNewTabGrade } from '../../src/reader/newtab/review-targets';
import { existingAnkiNote } from './helpers/anki-render';
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, vi } from "vitest";
import { GRADE_KEY_HINTS_RETIRED_KEY, resetGradeKeyHintsForTests, retireGradeKeyHints, showGradeKeyHintsUntilRetired } from "../../src/reader/cards/grade-key-hints";
import { gmPrivateStorageGet } from "../../src/reader/app/storage";
import { bindPrivateCommandCapability } from "../../src/reader/dom/private-command-capabilities";
import { installGmStorageFixture } from "./helpers/settings-persistence-fixture";
import { DEFAULT_SETTINGS as DEFAULT_SETTINGS2, card as card2, testCardActionController } from "./jpdb/fixtures";
import type { JPDBCard as JPDBCard2 } from "./jpdb/fixtures";
import { NewTabRuntime } from "./new-tab-review/fixtures";

const card = { source: 'jiten', reviewSource: 'jiten-api' } as JPDBCard;
const settings = { ...DEFAULT_SETTINGS, enableReviews: true };
const key = (value: string) => new KeyboardEvent('keydown', { key: value });
const outcome = (root: HTMLElement, value: string) => readCardCommandCapability(reviewShortcutButton(root, key(value), settings))?.grade;

describe('shared provider grade scale', () => {
    it.each([
        ['standard', false, ['nothing', 'something', 'hard', 'okay', 'easy']],
        ['standard', true, ['fail', 'pass']],
        ['jiten', false, ['nothing', 'hard', 'okay', 'easy']],
        ['jiten', true, ['fail', 'pass']],
        ['anki', false, ['nothing', 'hard', 'okay', 'easy']],
        ['anki', true, ['fail', 'pass']],
        ['bunpro-regular', false, ['fail', 'pass']],
        ['bunpro-regular', true, ['fail', 'pass']],
        ['bunpro-fsrs', false, ['nothing', 'hard', 'okay', 'easy']],
        ['bunpro-fsrs', true, ['nothing', 'hard', 'okay', 'easy']],
    ] as const)('%s with two-button preference %s', (profile, twoButtonReviews, expected) => {
        const scale = reviewGradeScale({ ...settings, twoButtonReviews }, profile);
        expect(scale.grades.map(([grade]) => grade)).toEqual(expected);
        expect(scale.shortcuts.map(([, grade]) => grade)).toEqual(expected);
        expect(scale.twoButton).toBe(expected.length === 2);
    });

    it('selects destination over dictionary identity and localizes four outcomes', () => {
        expect(reviewGradeProfile(card, 'anki')).toBe('anki');
        expect(reviewGradeProfile({ source: 'jpdb' } as JPDBCard, 'jiten')).toBe('jiten');
        expect(reviewGradeScale({ ...settings, interfaceLanguage: 'ja' }, 'jiten').grades.map(([, label]) => label))
            .toEqual(['もう一度', '難しい', '良い', '簡単']);
    });

    it.each([
        [false, 'en', ['Again', 'Hard', 'Good', 'Easy']],
        [false, 'ja', ['もう一度', '難しい', '良い', '簡単']],
        [true, 'en', ['Again', 'Good']],
        [true, 'ja', ['もう一度', '良い']],
    ] as const)('renders native Anki labels for two-button=%s, language=%s', (twoButtonReviews, interfaceLanguage, labels) => {
        const root = document.createElement('div');
        const current = { ...settings, twoButtonReviews, interfaceLanguage };
        setInnerHtml(root, renderReviewButtons(current, existingAnkiNote()));
        const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-action="grade"]')];
        expect(buttons.map(button => button.textContent)).toEqual(labels);
        expect(buttons.map(readPrivateReviewTarget)).toEqual(labels.map(() => ({ target: 'anki', ankiCardId: 123 })));
        if (!twoButtonReviews) expect(['1', '2', '3', '4', '5'].map(value => readCardCommandCapability(reviewShortcutButton(root, key(value), current))?.grade))
            .toEqual(['nothing', 'hard', 'okay', 'easy', undefined]);
    });

    it.each([
        ['jiten', ['Again', 'Hard', 'Good', 'Easy'], ['1', '2', '3', '4']],
        ['anki', ['Again', 'Hard', 'Good', 'Easy'], ['1', '2', '3', '4']],
        ['standard', ['Nothing', 'Something', 'Hard', 'Okay', 'Easy'], ['1', '2', '3', '4', '5']],
    ] as const)('shows on each %s popover grade button the key that actually grades it', (gradeProfile, labels, keys) => {
        const root = document.createElement('div');
        setInnerHtml(root, renderReviewButtons(settings, null, { gradeProfile }));
        const buttons = [...root.querySelectorAll<HTMLButtonElement>('button')];
        expect(buttons.map(button => button.textContent)).toEqual(labels);
        expect(buttons.map(button => button.dataset.gradeKey)).toEqual(keys);
        expect(buttons.map(button => button.getAttribute('aria-keyshortcuts'))).toEqual(keys);
        for (const [index, value] of keys.entries()) {
            expect(readCardCommandCapability(reviewShortcutButton(root, key(value), settings))).toEqual(readCardCommandCapability(buttons[index]!));
        }
    });

    it('labels a custom grade key on the popover and omits a hint for a cleared shortcut', () => {
        const custom = { ...settings, shortcuts: { ...settings.shortcuts, gradeNothing: 'a', gradeSomething: 'b', gradeHard: '', gradeOkay: '"', gradeEasy: 'e' } };
        const root = document.createElement('div');
        setInnerHtml(root, renderReviewButtons(custom, null, { gradeProfile: 'jiten' }));
        expect([...root.querySelectorAll<HTMLButtonElement>('button')].map(button => button.dataset.gradeKey)).toEqual(['a', 'b', undefined, '"']);
    });

    it('sends four distinct ratings and keeps Hard out of the failure loop while retaining queued aliases', () => {
        const grades = reviewGradeScale(settings, 'jiten').grades.map(([grade]) => grade);
        expect(grades.map(jitenRatingForGrade)).toEqual([1, 2, 3, 4]);
        expect(grades.map(isFailedNewTabGrade)).toEqual([true, false, false, false]);
        expect(['fail', 'something', 'pass'].map(grade => jitenRatingForGrade(grade as 'fail' | 'something' | 'pass'))).toEqual([1, 2, 3]);
    });

    it('binds offhost generic controls to four custom shortcuts without DOM authority', () => {
        const custom = { ...settings, shortcuts: { ...settings.shortcuts, gradeNothing: 'a', gradeSomething: 'b', gradeHard: 'c', gradeOkay: 'd', gradeEasy: 'e' } };
        const root = document.createElement('div');
        setInnerHtml(root, renderReviewButtons(custom, null, { gradeProfile: 'jiten' }));
        const buttons = [...root.querySelectorAll<HTMLButtonElement>('button')];
        expect(root.querySelector('[data-review-target], [data-anki-card-id], [data-review-grade-profile]')).toBeNull();
        expect(buttons.map(button => button.textContent)).toEqual(['Again', 'Hard', 'Good', 'Easy']);
        buttons[1]!.dataset.grade = 'easy';
        buttons[1]!.dataset.reviewGradeProfile = 'standard';
        expect(['a', 'b', 'c', 'd', 'e'].map(value => readCardCommandCapability(reviewShortcutButton(root, key(value), custom))?.grade))
            .toEqual(['nothing', 'hard', 'okay', 'easy', undefined]);
        root.prepend(buttons[1]!.cloneNode(true));
        expect(reviewShortcutButton(root, key('b'), custom)).toBe(buttons[1]);
        buttons[1]!.disabled = true;
        expect(reviewShortcutButton(root, key('b'), custom)).toBeUndefined();
    });

    it('ignores unhidden off-target rows and forged option/profile attributes in hosted lookup', () => {
        const root = document.createElement('div');
        root.className = 'jpdb-reader-actions';
        const controls = renderNewTabLookupReviewControls(reviewGradeScale(settings, 'jiten').grades, [
            { id: 'jiten', kind: 'jiten', label: 'Grades Jiten', shortLabel: 'Jiten' },
            { id: 'anki:42', kind: 'anki', label: 'Grades Anki', shortLabel: 'Anki', ankiCardId: 42 },
        ], { settings, card });
        setInnerHtml(root, `${controls.gutter}${controls.buttons}`);
        const select = root.querySelector('select')!;
        const offTarget = root.querySelector<HTMLElement>('[data-review-grade-profile="anki"]')!;
        offTarget.hidden = false;
        offTarget.dataset.reviewGradeProfile = 'jiten';
        root.prepend(offTarget);
        select.options[0]!.dataset.reviewGradeProfile = 'standard';
        select.options[0]!.dataset.reviewTarget = 'anki';
        expect(outcome(root, '2')).toBe('hard');
        expect(reviewShortcutButton(root, key('3'), settings)?.dataset.gradeKey).toBe('3');
        expect(readPrivateReviewTarget(reviewShortcutButton(root, key('2'), settings)!)).toEqual({ target: 'jiten', ankiCardId: undefined });
        expect(outcome(root, '5')).toBeUndefined();
        select.selectedIndex = 1;
        // Restore presentation, then exercise the real target-change helper.
        offTarget.dataset.reviewGradeProfile = 'anki';
        updatePopoverReviewTargetSelection(select);
        expect(outcome(root, '2')).toBe('hard');
        expect(outcome(root, '5')).toBeUndefined();
        const button = reviewShortcutButton(root, key('2'), settings)!;
        expect(readPrivateReviewTarget(button)).toEqual({ target: 'anki', ankiCardId: 42 });
        select.selectedIndex = 0;
        updatePopoverReviewTargetSelection(select);
        expect(outcome(root, '2')).toBe('hard');
        const clone = select.options[0]!.cloneNode(true) as HTMLOptionElement;
        select.append(clone);
        select.selectedIndex = select.options.length - 1;
        expect(outcome(root, '2')).toBeUndefined();
    });

    it('replaces main Study controls and retains private selection, intervals and delegated clicks', () => {
        const root = document.createElement('div');
        root.dataset.newtabControls = 'true';
        const targetOptions = [
            { id: 'both', kind: 'both' as const, label: 'Both', shortLabel: 'Both', gradeProfile: 'jiten' as ReviewGradeProfile },
            { id: 'anki:42', kind: 'anki' as const, label: 'Anki', shortLabel: 'Anki', ankiCardId: 42, gradeProfile: 'anki' as ReviewGradeProfile },
        ];
        root.append(...renderNewTabGradeControlButtons({ settings, gradeProfile: 'jiten', grades: [],
            apiShortLabel: 'Jiten', bothLabel: 'Both', selectorLabel: 'Target', targetLabel: 'Both', targetOptions,
            selectedOption: targetOptions[0], summary: summarizeNewTabReviewSources(['jiten-api', 'anki']),
            intervals: { hard: { intervalLabel: '5m' }, okay: { intervalLabel: '1d' } },
        }));
        expect(outcome(root, '2')).toBe('hard');
        expect(reviewShortcutButton(root, key('2'), settings)?.title).toContain('5m');
        expect(root.querySelector('.jpdb-reader-newtab-grade-interval')).toBeNull();
        const submitted: unknown[] = [];
        root.addEventListener('click', event => submitted.push([
            readCardCommandCapability(event.target as Element)?.grade, selectedNewTabMainGradeTarget(root),
        ]));
        const select = root.querySelector('select')!;
        select.selectedIndex = 1;
        select.options[1]!.dataset.ankiCardId = '999';
        updateNewTabMainGradeTargetLabel(root, select.options[select.selectedIndex]!, 'Both');
        reviewShortcutButton(root, key('2'), settings)!.click();
        expect(submitted).toEqual([['hard', { kind: 'anki', ankiCardId: 42 }]]);
        expect(root.dataset.newtabGradeCount).toBe('4');
        select.selectedIndex = 0;
        updateNewTabMainGradeTargetLabel(root, select.options[select.selectedIndex]!, 'Both');
        expect(outcome(root, '2')).toBe('hard');
        expect(outcome(root, '5')).toBeUndefined();
        expect(root.dataset.newtabGradeCount).toBe('4');
    });
});

describe('popup grade keycaps', () => {
    // The keycaps under the popup grade buttons (owner decision 3, 2026-10-07):
    // desktop only, only for a grade that has a shortcut, and only until the
    // learner's first popup grade, by click or by key, retires them for good.












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


    it('stay hidden until private storage answers, then show for a learner who has not graded yet', async () => {
        const shown = showGradeKeyHintsUntilRetired();
        expect(hintsShown()).toBe(false);
        await shown;
        expect(hintsShown()).toBe(true);
    });

    it('retire for good on the first popup grade, given by a grade button or its key', async () => {
        await showGradeKeyHintsUntilRetired();
        const settings = { ...DEFAULT_SETTINGS2, enableReviews: true, apiKey: 'jpdb-key', jpdbMiningEnabled: true };
        const jpdb = { addToDeck: vi.fn(async () => undefined), reviewCard: vi.fn(async () => undefined) };
        const controller = testCardActionController({ getSettings: () => settings, jpdb: jpdb as never, isJpdbBackedCard: () => true });

        // Both the popup's grade buttons and its grade keys land here.
        await controller.reviewGrade('okay', { ...card2, cardState: ['learning'] }, undefined, { target: 'jpdb' });

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
            handleLookupCardCommand(button: HTMLButtonElement, command: { kind: 'card-action'; action: 'grade'; grade: 'okay' }, lookedUp: JPDBCard2): void;
        };
        internals.newTab = { gradeFromLookup: vi.fn(async () => ({ preserveLookup: true })), destroy: vi.fn() } as never;
        const button = document.createElement('button');
        const command = { kind: 'card-action', action: 'grade', grade: 'okay' } as const;
        bindPrivateCommandCapability(button, command);
        document.body.append(button);
        try {
            internals.handleLookupCardCommand(button, command, card2);
            expect(hintsShown()).toBe(false);
        } finally {
            runtime.destroy();
        }
    });

    it('label only a grade that has a key, and always announce the key to assistive technology', () => {
        const custom = { ...DEFAULT_SETTINGS2, enableReviews: true, shortcuts: { ...DEFAULT_SETTINGS2.shortcuts, gradeHard: '' } };
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
