import fs from 'node:fs';
import path from 'node:path';
import { constructedResponseActivityPlugin } from '../../src/academy/activities/constructed-response';
import { ACADEMY_ASSETS } from '../../src/academy/assets';
import {
    AAKASH_DIRECTIONS_READER_ANNOTATIONS,
    AAKASH_RAINY_DIRECTIONS_SCENE_ID,
    createAakashDirectionsActivity,
} from '../../src/academy/content/aakash-meet';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { renderAakashMeetScreen } from '../../src/academy/ui/character-scenes';

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

afterEach(() => document.body.replaceChildren());

describe('Aakash rainy-directions bond beat', () => {
    const runtime = createActivityRuntime([constructedResponseActivityPlugin]);
    const model = createAakashDirectionsActivity();

    it('records production evidence and preserves the authored review provenance', () => {
        expect(runtime.validate(model)).toEqual([]);
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

    it('uses an authored route repair after a left/right mistake, never pre-commit choices', () => {
        const result = runtime.evaluate(model, 'この道をまっすぐ行って、左です。');

        expect(result.result.outcome).toBe('lapse');
        expect(result.result.errorTags).toEqual(['direction-side-confusion']);
        expect(result.result.feedback.repairPrompt?.ja).toContain('「左」を「右」に');
        expect(result.result.feedback.nearbyExample?.ja).toContain('「左」は左側');
        expect(model).not.toHaveProperty('payload.options');
    });

    it('stages the cafe rain plate and Aakash sprite without leaking an answer', () => {
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
        expect(screen.querySelector<HTMLImageElement>('[data-character="aakash"] img')?.src).toContain(ACADEMY_ASSETS.characters.aakash);
        expect(screen.querySelector('[data-speaker="aakash"]')).not.toBeNull();
        expect(screen.querySelector('.academy-vn-speaker')?.textContent).toBe('Aakash');
        expect(screen.textContent).toContain('カフェはどこですか。');
        expect(screen.textContent).not.toContain('この道をまっすぐ行って、右です。');
        expect(screen.textContent).not.toContain('Go straight');
        expect(screen.querySelector('.academy-choice-options')).toBeNull();
        expect(screen.querySelector('.academy-choice-option')).toBeNull();
        expect(screen.querySelector<HTMLInputElement>('.academy-constructed-response-input')?.value).toBe('');
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
        const input = screen.querySelector<HTMLInputElement>('.academy-constructed-response-input')!;
        const form = screen.querySelector<HTMLFormElement>('.academy-constructed-response-form')!;

        input.value = 'この道をまっすぐ行って、左です。';
        form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
        await flush();

        expect(input.disabled).toBe(false);
        expect(screen.querySelector('.academy-constructed-feedback-repair')?.textContent).toContain('replace 左 with 右');
        expect(screen.querySelector('.academy-vn-japanese')?.textContent).toBe('カフェはどこですか。');

        input.value = 'この道をまっすぐ行って、右です。';
        form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
        await flush();

        expect(onEvaluation).toHaveBeenCalledTimes(2);
        expect(screen.querySelector('.academy-vn-japanese')?.textContent).toBe('分かりました。ありがとうございます。');
        const continueButton = screen.querySelector<HTMLButtonElement>('.academy-aakash-continue')!;
        expect(continueButton.textContent).toBe('Return to campus');
        continueButton.click();
        expect(onContinue).toHaveBeenCalledOnce();
    });

    it('restores the concise completed beat and disposes its mounted response', () => {
        const completed = renderAakashMeetScreen({
            language: 'ja',
            activity: model,
            completed: true,
            onEvaluation: vi.fn(),
            onContinue: vi.fn(),
        });
        document.body.append(completed);
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
        expect(active.querySelector('.academy-constructed-response')).not.toBeNull();
        active.dispatchEvent(new CustomEvent('academy:dispose'));
        expect(active.isConnected).toBe(false);
        expect(active.querySelector('.academy-constructed-response')).toBeNull();
    });

    it('keeps the IME surface usable on phone widths and reduced motion', () => {
        const styles = fs.readFileSync(path.resolve('src/academy/styles/aakash-directions.css'), 'utf8');

        expect(styles).toMatch(/@media \(max-width: 700px\)[\s\S]*\.academy-aakash-response-host[\s\S]*max-height:\s*36dvh/s);
        expect(styles).toMatch(/@media \(max-width: 700px\)[\s\S]*\.academy-constructed-response-form\s*\{[^}]*grid-template-columns:\s*1fr/s);
        expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    });
});
