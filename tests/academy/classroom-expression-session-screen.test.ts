import fs from 'node:fs';
import path from 'node:path';
import {
    classroomStateForActivity,
    completedClassroomActivityIds,
} from '../../src/academy/content/lesson-zero-classroom-runtime';
import { validateLessonZeroClassroomExpressions } from '../../src/academy/content/lesson-zero-classroom-expressions';
import {
    startClassroomExpressionSession,
    transitionClassroomExpressionSession,
} from '../../src/academy/domain/classroom-expression-session';
import { createClassroomExpressionSessionScreen } from '../../src/academy/ui/classroom-expression-session-screen';

const CONTENT_PATH = path.resolve('public/academy/content/lessons/lesson-zero-classroom-expressions.v1.json');

function definition() {
    return validateLessonZeroClassroomExpressions(JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8')));
}

describe('Classroom expression session screen', () => {
    it('teaches before commitment, keeps the answer hidden, then earns repair and the model', async () => {
        const content = definition();
        const initial = classroomStateForActivity(
            content,
            startClassroomExpressionSession(content),
            'activity:lesson-zero-reconstruct-repair',
        );
        const onTransition = vi.fn(async () => undefined);
        const screen = createClassroomExpressionSessionScreen({
            language: 'en',
            activityId: 'activity:lesson-zero-reconstruct-repair',
            definition: content,
            initialState: initial,
            pronunciation: { play: vi.fn(async () => ({ dispose() {} })) } as never,
            onTransition,
            onRestart: vi.fn(),
            onBack: vi.fn(),
        });

        expect(screen.element.textContent).toContain('Notice the pattern');
        expect(screen.element.querySelector('.academy-classroom-expression-overall')?.textContent)
            .toBe('0 of 8 moments answered');
        expect(screen.element.querySelector<HTMLButtonElement>('.academy-classroom-expression-back')).toMatchObject({
            textContent: '←',
        });
        expect(screen.element.querySelector('.academy-classroom-expression-back')?.getAttribute('aria-label'))
            .toBe('Back');
        expect(screen.element.textContent).not.toContain('わかりますか');
        const input = screen.element.querySelector<HTMLInputElement>('.academy-classroom-expression-input')!;
        input.value = 'わかりました';
        screen.element.querySelector<HTMLFormElement>('.academy-classroom-expression-form')!
            .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        await vi.waitFor(() => expect(onTransition).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(screen.element.querySelector('[data-repair-earned="true"]')).not.toBeNull());
        expect(screen.element.textContent).not.toContain('わかりますか');
        screen.element.querySelector<HTMLButtonElement>('.academy-classroom-expression-reveal')?.click();
        await vi.waitFor(() => expect(onTransition).toHaveBeenCalledTimes(2));
        await vi.waitFor(() => expect(screen.element.textContent).toContain('わかりますか'));
        screen.dispose();
    });

    it('offers a full replay after the selected activity is complete', async () => {
        const content = definition();
        const answers = new Map(content.expressions.flatMap(expression =>
            expression.probes.map(probe => [probe.id, probe.modelAnswer] as const)));
        let state = classroomStateForActivity(
            content,
            startClassroomExpressionSession(content),
            'activity:lesson-zero-desk-language',
        );
        while (!completedClassroomActivityIds(content, state).includes('activity:lesson-zero-desk-language')) {
            state = transitionClassroomExpressionSession(content, state, {
                kind: 'submit', response: answers.get(state.cursor.probeId)!,
            }, state.attempts.length + 1).state;
        }
        const onRestart = vi.fn(async () => undefined);
        const screen = createClassroomExpressionSessionScreen({
            language: 'en',
            activityId: 'activity:lesson-zero-desk-language',
            definition: content,
            initialState: state,
            pronunciation: { play: vi.fn(async () => ({ dispose() {} })) } as never,
            onTransition: vi.fn(),
            onRestart,
            onBack: vi.fn(),
        });

        expect(screen.element.textContent).toContain('You can read the desk.');
        expect(screen.element.querySelector('.academy-classroom-expression-overall')?.textContent)
            .toBe('2 of 2 moments answered');
        expect(screen.element.querySelector<HTMLImageElement>('.academy-classroom-expression-desk-image')?.src)
            .toContain('/academy/art/items/classroom-belongings__v001.jpg');
        expect(screen.element.querySelector('[data-desk-slot="homework"]')?.textContent).toContain('しゅくだい');
        expect(screen.element.querySelector('[data-desk-slot="example"]')?.textContent).toContain('れい');
        const replay = [...screen.element.querySelectorAll<HTMLButtonElement>('button')]
            .find(button => button.textContent?.includes('Label the desk again'))!;
        replay.click();
        await vi.waitFor(() => expect(onRestart).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(screen.element.querySelector('.academy-classroom-expression-form')).not.toBeNull());
        screen.dispose();
    });

    it('keeps both desk labels blank until the learner earns each one', async () => {
        const content = definition();
        const initial = classroomStateForActivity(
            content,
            startClassroomExpressionSession(content),
            'activity:lesson-zero-desk-language',
        );
        const screen = createClassroomExpressionSessionScreen({
            language: 'en',
            activityId: 'activity:lesson-zero-desk-language',
            definition: content,
            initialState: initial,
            pronunciation: { play: vi.fn(async () => ({ dispose() {} })) } as never,
            onTransition: vi.fn(async () => undefined),
            onRestart: vi.fn(),
            onBack: vi.fn(),
        });

        const homework = screen.element.querySelector<HTMLElement>('[data-desk-slot="homework"]')!;
        const example = screen.element.querySelector<HTMLElement>('[data-desk-slot="example"]')!;
        expect(homework.dataset.earned).toBe('false');
        expect(example.dataset.earned).toBe('false');
        expect(homework.textContent).not.toContain('しゅくだい');
        expect(example.textContent).not.toContain('れい');

        const input = screen.element.querySelector<HTMLInputElement>('.academy-classroom-expression-input')!;
        input.value = 'しゅくだい';
        screen.element.querySelector<HTMLFormElement>('.academy-classroom-expression-form')!
            .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        await vi.waitFor(() => expect(
            screen.element.querySelector<HTMLElement>('[data-desk-slot="homework"]')?.dataset.earned,
        ).toBe('true'));
        expect(screen.element.querySelector('[data-desk-slot="homework"]')?.textContent).toContain('しゅくだい');
        expect(screen.element.querySelector<HTMLElement>('[data-desk-slot="example"]')?.dataset.earned).toBe('false');
        expect(screen.element.querySelector('[data-desk-slot="example"]')?.textContent).not.toContain('れい');
        screen.dispose();
    });
});
