import fs from 'node:fs';
import path from 'node:path';
import { constructedResponseActivityPlugin } from '../../src/academy/activities/constructed-response';
import { ACADEMY_ASSETS } from '../../src/academy/assets';
import {
    AAKASH_DIRECTIONS_CONTENT,
    AAKASH_DIRECTIONS_LEARNING_SEQUENCE,
    AAKASH_DIRECTIONS_READER_ANNOTATIONS,
    AAKASH_RAINY_DIRECTIONS_SCENE_ID,
    createAakashDirectionsActivity,
} from '../../src/academy/content/aakash-meet';
import { auditColdProductionSequence } from '../../src/academy/content/cold-production-audit';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { renderAakashMeetScreen } from '../../src/academy/ui/character-scenes';

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

afterEach(() => document.body.replaceChildren());

function settleDialogue(root: ParentNode): void {
    const japanese = root.querySelector<HTMLElement>('.academy-vn-japanese');
    if (japanese?.dataset.performanceText === 'revealing') japanese.click();
}

function next(root: HTMLElement): void {
    settleDialogue(root);
    root.querySelector<HTMLButtonElement>('.academy-vn-action-slot > .academy-vn-primary-action')!.click();
    settleDialogue(root);
}

function guidedChoice(root: HTMLElement, choiceId: string): void {
    root.querySelector<HTMLButtonElement>(`.academy-aakash-guided-option[data-choice-id="${choiceId}"]`)!.click();
}

function guidedNext(root: HTMLElement): void {
    root.querySelector<HTMLButtonElement>('.academy-aakash-guided-feedback .academy-vn-primary-action')!.click();
}

function advanceToAssessment(root: HTMLElement): void {
    next(root);
    next(root);
    next(root);
    guidedChoice(root, 'right');
    guidedNext(root);
    next(root);
    guidedChoice(root, 'path-then-side');
    guidedNext(root);
}

describe('Aakash rainy-directions bond beat', () => {
    const runtime = createActivityRuntime([constructedResponseActivityPlugin]);
    const model = createAakashDirectionsActivity();

    it('records deterministic production evidence and preserves the authored review provenance', () => {
        expect(runtime.validate(model)).toEqual([]);
        expect(auditColdProductionSequence(AAKASH_DIRECTIONS_LEARNING_SEQUENCE)).toEqual([]);
        const result = runtime.evaluate(model, 'この道をまっすぐ行って、右です。');
        expect(result.result.outcome).toBe('pass');
        expect(result.attempt).toMatchObject({
            activityId: 'activity:aakash-rainy-directions',
            responseKind: 'ime',
            conceptIds: ['concept:directions-straight-right'],
        });
        expect(result.reviewSeeds).toEqual([expect.objectContaining({
            id: 'review:aakash-rainy-directions',
            content: expect.objectContaining({ expression: 'まっすぐ行って、右です。' }),
        })]);
        expect(AAKASH_RAINY_DIRECTIONS_SCENE_ID).toBe('scene:aakash-rainy-directions');
        expect(AAKASH_DIRECTIONS_READER_ANNOTATIONS).toEqual([{
            surface: '行って',
            lemma: '行く',
            reading: 'いって',
            pitch: expect.objectContaining({ pattern: 'LHHH', source: expect.stringContaining('1578850/0') }),
        }]);
    });

    it('uses an authored route repair after a left/right mistake', () => {
        const result = runtime.evaluate(model, 'この道をまっすぐ行って、左です。');

        expect(result.result.outcome).toBe('lapse');
        expect(result.result.errorTags).toEqual(['direction-side-confusion']);
        expect(result.result.feedback.repairPrompt?.ja).toContain('「左」を「右」に');
        expect(result.result.feedback.nearbyExample?.ja).toContain('「左」は左側');
        expect(model).not.toHaveProperty('payload.options');
    });

    it('introduces the rainy goal before showing either directions or an assessment', () => {
        const screen = renderAakashMeetScreen({
            language: 'en',
            activity: model,
            completed: false,
            onEvaluation: vi.fn(),
            onContinue: vi.fn(),
        });
        document.body.append(screen);

        expect(screen.dataset.academyScreen).toBe('aakash-directions-vn');
        expect(screen.querySelector<HTMLImageElement>('.academy-vn-plate img')?.src).toContain(ACADEMY_ASSETS.locations.cafe.wide);
        expect(screen.querySelector<HTMLImageElement>('[data-character="aakash"] img')?.src)
            .toContain('/academy/art/characters/aakash/aakash__neutral-route-map-burgundy-hoodie__front-near-front__fullbody__v010.png');
        expect(screen.textContent).toContain(AAKASH_DIRECTIONS_CONTENT.context.japanese);
        expect(screen.textContent).toContain('Aakash is looking for the cafe');
        expect(screen.textContent).not.toContain('カフェはどこですか。');
        expect(screen.querySelector('.academy-aakash-route-note')).toBeNull();
        expect(screen.querySelector('.academy-constructed-response')).toBeNull();
    });

    it('teaches the question, vocabulary, recognition, and an alternate-side frame before production', () => {
        const screen = renderAakashMeetScreen({
            language: 'en',
            activity: model,
            completed: false,
            onEvaluation: vi.fn(),
            onContinue: vi.fn(),
        });
        document.body.append(screen);

        next(screen);
        const note = screen.querySelector<HTMLElement>('.academy-aakash-route-note')!;
        expect(screen.querySelector('.academy-vn-japanese')?.textContent).toBe('カフェはどこですか。');
        expect(note.textContent).toContain('kafee wa doko desu ka');
        expect(note.textContent).toContain('Where is the cafe?');
        expect(note.querySelector<HTMLElement>('.academy-aakash-vocabulary')!.hidden).toBe(true);

        next(screen);
        expect(note.querySelector<HTMLElement>('.academy-aakash-vocabulary')!.hidden).toBe(false);
        expect(note.textContent).toContain('まっすぐ');
        expect(note.textContent).toContain('massugu');
        expect(note.textContent).toContain('straight ahead');
        expect(note.textContent).toContain('右');
        expect(note.textContent).toContain('migi');
        expect(screen.querySelector('.academy-constructed-response')).toBeNull();

        next(screen);
        guidedChoice(screen, 'left');
        expect(screen.querySelector('.academy-aakash-guided-feedback')?.textContent).toContain('左 (hidari), left');
        guidedChoice(screen, 'right');
        expect(screen.querySelector<HTMLElement>('.academy-aakash-guided-action')?.dataset.outcome).toBe('pass');
        guidedNext(screen);

        const frame = note.querySelector<HTMLElement>('.academy-aakash-frame-note')!;
        expect(frame.hidden).toBe(false);
        expect(frame.textContent).toContain('まっすぐ行って、左です。');
        expect(frame.textContent).toContain('massugu itte, hidari desu');
        expect(frame.textContent).toContain('Go straight, then it is on the left.');

        next(screen);
        guidedChoice(screen, 'side-then-path');
        expect(screen.querySelector<HTMLElement>('.academy-aakash-guided-action')?.dataset.outcome).toBe('lapse');
        guidedChoice(screen, 'path-then-side');
        expect(screen.querySelector<HTMLElement>('.academy-aakash-guided-action')?.dataset.outcome).toBe('pass');
        expect(screen.querySelector('.academy-constructed-response')).toBeNull();

        guidedNext(screen);
        expect(screen.querySelector('.academy-constructed-response')).not.toBeNull();
        expect(screen.textContent).not.toContain('まっすぐ行って、右です。');
        expect(screen.textContent).not.toContain('Go straight, then it is on the right.');
        expect(screen.querySelector<HTMLInputElement>('.academy-constructed-response-input')?.value).toBe('');
    });

    it('gives a pre-kana learner one post-attempt support sequence and fills only at the end', async () => {
        const onEvaluation = vi.fn();
        const onSupportUse = vi.fn();
        const screen = renderAakashMeetScreen({
            language: 'en',
            activity: model,
            completed: false,
            onEvaluation,
            onSupportUse,
            onContinue: vi.fn(),
        });
        document.body.append(screen);
        advanceToAssessment(screen);

        const input = screen.querySelector<HTMLInputElement>('.academy-constructed-response-input')!;
        const form = screen.querySelector<HTMLFormElement>('.academy-constructed-response-form')!;
        const support = screen.querySelector<HTMLElement>('.academy-lesson-repair-hints')!;
        const hint = screen.querySelector<HTMLButtonElement>('.academy-progressive-hint-button')!;
        expect([...screen.querySelectorAll('.academy-vn-line-tools button')].map(button => button.textContent))
            .toEqual(['記', '▶', '読', '訳']);
        expect(screen.querySelector('.academy-constructed-prompt-support-toggle')).toBeNull();
        expect(support.hidden).toBe(true);
        expect(screen.querySelector('.academy-progressive-hint-fill')).toBeNull();
        hint.click();
        expect(screen.textContent).not.toContain('まっすぐ (massugu)');

        input.value = 'この道をまっすぐ行って、左です。';
        form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
        await flush();
        settleDialogue(screen);

        hint.click();
        expect(screen.textContent).toContain('まっすぐ (massugu)');
        expect(screen.querySelector('.academy-progressive-hint-fill')).toBeNull();
        hint.click();
        expect(screen.textContent).toContain('[side] + です');
        expect(screen.querySelector('.academy-progressive-hint-fill')).toBeNull();
        hint.click();
        expect(screen.textContent).toContain('replace 左 with 右');
        expect(screen.querySelector('.academy-progressive-hint-fill')).toBeNull();
        hint.click();
        expect(screen.textContent).toContain('右 is right; 左 is left.');
        expect(screen.querySelector('.academy-progressive-hint-fill')).toBeNull();
        hint.click();

        const fill = screen.querySelector<HTMLButtonElement>('.academy-progressive-hint-fill')!;
        expect(fill).not.toBeNull();
        expect(input.value).toBe('この道をまっすぐ行って、左です。');
        fill.click();
        expect(input.value).toBe('まっすぐ行って、右です。');
        expect(document.activeElement).toBe(input);
        expect(onSupportUse.mock.calls.map(call => call[0].choiceId)).toEqual([
            'progressive-hint:1',
            'progressive-hint:2',
            'progressive-repair:1',
            'progressive-repair:2',
            'progressive-hint:3',
        ]);

        form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
        await flush();
        settleDialogue(screen);
        expect(onEvaluation).toHaveBeenCalledTimes(2);
        expect(onEvaluation.mock.calls[1]?.[0].result.outcome).toBe('pass');
        expect(screen.querySelector('.academy-vn-japanese')?.textContent).toBe('分かりました。ありがとうございます。');
    });

    it('keeps a wrong route editable, then answers in character after a passing retry', async () => {
        const onEvaluation = vi.fn();
        const onContinue = vi.fn();
        const screen = renderAakashMeetScreen({
            language: 'en',
            activity: model,
            completed: false,
            onEvaluation,
            onContinue,
        });
        document.body.append(screen);
        advanceToAssessment(screen);
        const input = screen.querySelector<HTMLInputElement>('.academy-constructed-response-input')!;
        const form = screen.querySelector<HTMLFormElement>('.academy-constructed-response-form')!;

        input.value = 'この道をまっすぐ行って、左です。';
        form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
        await flush();
        settleDialogue(screen);

        expect(input.disabled).toBe(false);
        expect(screen.querySelector('.academy-constructed-feedback-repair')).toBeNull();
        const hint = screen.querySelector<HTMLButtonElement>('.academy-lesson-repair-hints .academy-progressive-hint-button')!;
        hint.click();
        hint.click();
        hint.click();
        expect(screen.querySelector('.academy-constructed-feedback-repair')?.textContent).toContain('replace 左 with 右');
        expect(screen.querySelector('.academy-vn-japanese')?.textContent).toBe('カフェはどこですか。');

        input.value = 'この道をまっすぐ行って、右です。';
        form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
        await flush();
        settleDialogue(screen);

        expect(onEvaluation).toHaveBeenCalledTimes(2);
        expect(screen.querySelector('.academy-vn-japanese')?.textContent).toBe('分かりました。ありがとうございます。');
        const continueButton = screen.querySelector<HTMLButtonElement>('.academy-aakash-continue')!;
        expect(continueButton.textContent).toBe('Return to campus');
        continueButton.click();
        expect(onContinue).toHaveBeenCalledOnce();
    });

    it('restores the concise completed beat and disposes an active response', () => {
        const completed = renderAakashMeetScreen({
            language: 'ja',
            activity: model,
            completed: true,
            onEvaluation: vi.fn(),
            onContinue: vi.fn(),
        });
        document.body.append(completed);
        settleDialogue(completed);
        expect(completed.querySelector('.academy-aakash-route-note')).toBeNull();
        expect(completed.querySelector('.academy-constructed-response')).toBeNull();
        expect(completed.querySelector('.academy-vn-japanese')?.textContent).toBe('分かりました。ありがとうございます。');

        const active = renderAakashMeetScreen({
            language: 'en',
            activity: model,
            completed: false,
            onEvaluation: vi.fn(),
            onContinue: vi.fn(),
        });
        document.body.append(active);
        advanceToAssessment(active);
        expect(active.querySelector('.academy-constructed-response')).not.toBeNull();
        active.dispatchEvent(new CustomEvent('academy:dispose'));
        expect(active.isConnected).toBe(false);
        expect(active.querySelector('.academy-constructed-response')).toBeNull();
    });

    it('keeps teaching and IME support visible at phone widths and reduced motion', () => {
        const styles = fs.readFileSync(path.resolve('src/academy/styles/aakash-directions.css'), 'utf8');

        expect(styles).toMatch(/@media \(max-width: 700px\)[\s\S]*\.academy-aakash-route-note[\s\S]*max-height:\s*min\(28dvh, 260px\)/s);
        expect(styles).toMatch(/@media \(max-width: 700px\)[\s\S]*\.academy-aakash-response-host[\s\S]*max-height:\s*36dvh/s);
        expect(styles).toMatch(/@media \(max-width: 700px\)[\s\S]*\.academy-constructed-response-form\s*\{[^}]*grid-template-columns:\s*1fr/s);
        expect(styles).not.toMatch(/academy-constructed-response-support\s*\{[^}]*display:\s*none/s);
        expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    });
});
