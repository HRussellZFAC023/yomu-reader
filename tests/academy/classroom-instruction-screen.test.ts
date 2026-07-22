import fs from 'node:fs';
import path from 'node:path';
import {
    createLessonZeroFollowInstructionDefinition,
    LESSON_ZERO_FOLLOW_INSTRUCTION_ACTIVITY_ID,
} from '../../src/academy/content/lesson-zero-follow-instructions';
import { validateLessonZeroClassroomExpressions } from '../../src/academy/content/lesson-zero-classroom-expressions';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import {
    startClassroomInstructionSession,
    transitionClassroomInstructionSession,
} from '../../src/academy/domain/classroom-instruction-session';
import { createClassroomInstructionScreen } from '../../src/academy/ui/classroom-instruction-screen';

const CLASSROOM_PATH = path.resolve('public/academy/content/lessons/lesson-zero-classroom-expressions.v1.json');
const LESSON_PATH = path.resolve('public/academy/content/lessons/lesson-zero.v1.json');

function definition() {
    const classroom = validateLessonZeroClassroomExpressions(JSON.parse(fs.readFileSync(CLASSROOM_PATH, 'utf8')));
    const lesson = validateLessonZeroPackage(JSON.parse(fs.readFileSync(LESSON_PATH, 'utf8'))).lesson;
    const activity = lesson.activities.find(candidate => candidate.id === LESSON_ZERO_FOLLOW_INSTRUCTION_ACTIVITY_ID)!;
    return createLessonZeroFollowInstructionDefinition(classroom, activity);
}

describe('Classroom instruction screen', () => {
    it('accepts an action while pronunciation playback is still active', async () => {
        const content = definition();
        let persisted = startClassroomInstructionSession(content);
        const screen = createClassroomInstructionScreen({
            language: 'en',
            definition: content,
            initialState: persisted,
            pronunciation: { play: vi.fn(() => new Promise(() => undefined)) } as never,
            onTransition: async (_before, transition) => { persisted = transition.state; },
            onRestart: vi.fn(),
            onBack: vi.fn(),
        });

        screen.element.querySelector<HTMLButtonElement>('.academy-classroom-instruction-start')!.click();
        await vi.waitFor(() => expect(screen.element.querySelectorAll('[data-action-id]')).toHaveLength(7));
        screen.element.querySelector<HTMLButtonElement>('[data-action-id="write"]')!.click();
        await vi.waitFor(() => expect(screen.element.textContent).toContain('That was a different classroom action.'));
        expect(persisted.attempts).toHaveLength(1);
        screen.dispose();
    });

    it('hides the target until commitment, animates the chosen prop, and supports repair', async () => {
        const content = definition();
        let persisted = startClassroomInstructionSession(content);
        const play = vi.fn(async () => ({ dispose() {} }));
        const onTransition = vi.fn(async (_before, transition) => {
            persisted = transition.state;
        });
        const screen = createClassroomInstructionScreen({
            language: 'en',
            definition: content,
            initialState: persisted,
            pronunciation: { play } as never,
            onTransition,
            onRestart: vi.fn(),
            onBack: vi.fn(),
        });

        expect(screen.element.textContent).toContain('Make the classroom respond');
        expect(screen.element.textContent).not.toContain('みてください');
        expect(screen.element.querySelector('.academy-classroom-instruction-back')?.getAttribute('aria-label'))
            .toBe('Back');
        screen.element.querySelector<HTMLButtonElement>('.academy-classroom-instruction-start')!.click();
        await vi.waitFor(() => expect(play).toHaveBeenCalledWith('みてください', 'みてください'));
        await vi.waitFor(() => expect(screen.element.querySelectorAll('[data-action-id]')).toHaveLength(7));

        screen.element.querySelector<HTMLButtonElement>('[data-action-id="write"]')!.click();
        await vi.waitFor(() => expect(screen.element.textContent).toContain('That was a different classroom action.'));
        expect(screen.element.textContent).toContain('みてください');
        expect(screen.element.querySelector('.academy-classroom-instruction-room')?.getAttribute('data-room-action'))
            .toBe('write');
        expect(persisted.cursor).toBe(0);

        const retry = screen.element.querySelector<HTMLButtonElement>('.academy-classroom-instruction-continue')!;
        retry.click();
        await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(2));
        await vi.waitFor(() => expect(screen.element.textContent).not.toContain('みてください'));
        screen.element.querySelector<HTMLButtonElement>('[data-action-id="look"]')!.click();
        await vi.waitFor(() => expect(screen.element.textContent).toContain('The room followed her.'));
        expect(persisted.cursor).toBe(1);
        expect(screen.element.querySelector('.academy-classroom-instruction-progress')?.textContent)
            .toBe('1 of 7 instructions followed');
        screen.dispose();
    });

    it('offers replay only after all seven embodied responses are complete', async () => {
        const content = definition();
        let state = transitionClassroomInstructionSession(
            content,
            startClassroomInstructionSession(content),
            { kind: 'start' },
            1,
        ).state;
        for (const cue of content.cues) {
            state = transitionClassroomInstructionSession(
                content,
                state,
                { kind: 'choose', actionId: cue.actionId },
                state.cursor + 2,
            ).state;
        }
        const onRestart = vi.fn(async () => undefined);
        const screen = createClassroomInstructionScreen({
            language: 'en',
            definition: content,
            initialState: state,
            pronunciation: { play: vi.fn(async () => ({ dispose() {} })) } as never,
            onTransition: vi.fn(),
            onRestart,
            onBack: vi.fn(),
        });

        expect(screen.element.textContent).toContain('You can move with the class.');
        const replay = [...screen.element.querySelectorAll<HTMLButtonElement>('button')]
            .find(button => button.textContent?.includes('Run the room again'))!;
        replay.click();
        await vi.waitFor(() => expect(onRestart).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(screen.element.textContent).toContain('Start the rehearsal'));
        screen.dispose();
    });
});
