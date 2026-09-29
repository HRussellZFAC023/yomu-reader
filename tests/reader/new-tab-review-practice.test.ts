import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNewTabStudySession } from '../../src/reader/newtab/study-session';
import { DEFAULT_NEW_TAB_UI_STATE } from '../../src/reader/newtab/state';
import type { JPDBCard } from '../../src/reader/app/types';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import * as storage from '../../src/reader/app/storage';
import {
    newTabTestCard, newTabBareController, renderEnabledNewTabRoot,
    dispatchNewTabKeyboard, registerNewTabReviewCleanup, waitForExpect, deferred, stubKanjiDoodleBrowserApis,
} from './new-tab-review/fixtures';

function card(): JPDBCard {
    return newTabTestCard({ spelling: '日本語', reading: 'にほんご', pitchAccent: ['LHHH'], source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] });
}

function reviewFixture(overrides: Partial<JPDBCard> = {}) {
    const current = { ...card(), ...overrides };
    const reviewCard = vi.fn(async () => undefined);
    const controller = newTabBareController({
        ...DEFAULT_SETTINGS, apiKey: 'fixture-key', interfaceLanguage: 'en',
        ankiEnabled: false, newTabAnkiEnabled: false, immersionKitEnabled: false, audioEnabled: false,
    }, {
        jpdb: { reviewCard } as never,
        jpdbKanji: { lookup: vi.fn(async () => null) } as never,
        kanjiVG: { lookup: vi.fn(async () => null) } as never,
        rtk: { lookup: vi.fn(async () => null) } as never,
        jpdbReviewBridge: { onUpdate: () => () => {}, reveal: vi.fn(), latestStatus: () => ({ connected: false }) } as never,
    }, { surface: 'academy' });
    const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
    const internals = controller as unknown as {
        renderWord(root: HTMLElement, card: JPDBCard): void;
        bindRootEvents(root: HTMLElement): void;
        state: typeof DEFAULT_NEW_TAB_UI_STATE;
    };
    Object.assign(internals, {
        allWords: [current], visibleWords: [current], index: 0, reviewCountMode: true, sourceLabel: 'JPDB',
        state: { ...DEFAULT_NEW_TAB_UI_STATE, source: 'jpdb' },
    });
    internals.renderWord(root, current);
    internals.bindRootEvents(root);
    return { controller, root, current, reviewCard, internals };
}

describe('native review and embedded Academy practice', () => {
    registerNewTabReviewCleanup();
    afterEach(() => document.body.replaceChildren());

    it('defaults to one recall prompt and reveal even when every exercise is available', () => {
        const session = createNewTabStudySession(card(), {
            revealAnswer: false, renderAsKanji: false, hasRecallCloze: true, pitchAvailable: true,
        });
        expect(session.steps.map(step => step.kind)).toEqual(['word', 'final-reveal']);
        expect(session).toMatchObject({ activity: 'review', activeStep: { kind: 'word', gradeable: false } });
    });

    it('reaches native grading with one visible Reveal action and never submits before a grade', async () => {
        const { controller, root, reviewCard } = reviewFixture();
        try {
            expect(root.querySelector('[data-newtab-study]')?.getAttribute('data-newtab-study-step')).toBe('word');
            expect(root.querySelector('[data-newtab-study-tour]')).toBeNull();
            const reveal = root.querySelector<HTMLButtonElement>('[data-newtab-controls] [data-newtab-action="reveal"]');
            expect(reveal?.textContent).toContain('Reveal');
            expect(root.querySelector('[data-newtab-controls] [data-grade]')).toBeNull();
            reveal!.click();
            expect(reviewCard).not.toHaveBeenCalled();
            const grade = root.querySelector<HTMLButtonElement>('[data-newtab-controls] [data-grade]');
            expect(grade).not.toBeNull();
            grade!.click();
            await waitForExpect(() => expect(reviewCard).toHaveBeenCalledOnce());
        } finally { controller.destroy(); }
    });

    it('keeps exercise feedback, shortcuts and lookup controls from submitting a review', async () => {
        const { controller, root, current, reviewCard, internals } = reviewFixture();
        try {
            root.querySelector<HTMLButtonElement>('[data-study-step-id="type-word"]')!.click();
            internals.state.revealAnswer = true;
            internals.renderWord(root, current);
            expect(root.querySelector('[data-newtab-study]')?.getAttribute('data-newtab-activity')).toBe('practice');
            expect(root.querySelector('[data-newtab-controls] [data-grade]')).toBeNull();
            expect(controller.lookupReviewTargets(current)).toEqual([]);
            dispatchNewTabKeyboard(document.body, '3', { code: 'Digit3' });
            await controller.gradeFromLookup('okay', undefined, current);
            expect(reviewCard).not.toHaveBeenCalled();
        } finally { controller.destroy(); }
    });

    it('does not create a pitch schedule when choosing practice', () => {
        const write = vi.spyOn(storage, 'gmStorageSetSync');
        const { controller, root } = reviewFixture();
        try {
            root.querySelector<HTMLButtonElement>('[data-study-step-id="listen-pitch"]')!.click();
            controller.destroy();
            expect(write.mock.calls.filter(([key]) => key === 'yomu-pitch-items:v1')).toEqual([]);
        } finally { controller.destroy(); write.mockRestore(); }
    });

    it('discards assessment from a practice interaction after returning to a revealed native review', async () => {
        stubKanjiDoodleBrowserApis();
        const { controller, root, current } = reviewFixture({
            spelling: '水', reading: 'みず', reviewSource: 'jpdb-live', jpdbReviewId: 'kb,123',
        });
        const internals = controller as unknown as {
            dependencies: { getSettings(): typeof DEFAULT_SETTINGS };
            loadKanjiDetails(kanji: string): Promise<unknown>;
            assessDoodle(slots: unknown, card: JPDBCard, kanji: string, strokes: unknown[]): Promise<void>;
            studySlots(root: HTMLElement): unknown;
            renderDoodleAssessment(...args: unknown[]): void;
            gradeCurrentCard(...args: unknown[]): Promise<boolean>;
        };
        const pending = deferred<unknown>();
        const canvasPreview = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,');
        try {
            Object.assign(internals.dependencies.getSettings(), { newTabKanjiAutogradeEnabled: true });
            root.querySelector<HTMLButtonElement>('[data-newtab-controls] [data-newtab-action="reveal"]')!.click();
            root.querySelector<HTMLButtonElement>('[data-study-step-id="kanji-doodle:0"]')!.click();
            const details = await internals.loadKanjiDetails('水') as object;
            vi.spyOn(internals, 'loadKanjiDetails').mockReturnValue(pending.promise);
            const assessment = vi.spyOn(internals, 'renderDoodleAssessment');
            const grade = vi.spyOn(internals, 'gradeCurrentCard').mockResolvedValue(true);
            const drawing = internals.assessDoodle(internals.studySlots(root), current, '水', [[{ x: 0, y: 0 }, { x: 1, y: 1 }]]);
            root.querySelector<HTMLButtonElement>('[data-newtab-action="return-to-review"]')!.click();
            pending.resolve({ ...details, vg: { strokeCount: 1 } });
            await drawing;
            expect(grade).not.toHaveBeenCalled();
            expect(assessment).not.toHaveBeenCalled();
        } finally { pending.resolve({}); controller.destroy(); canvasPreview.mockRestore(); }
    });
});
