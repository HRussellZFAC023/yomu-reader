import fs from 'node:fs';
import path from 'node:path';
import { createLessonZeroSoundDefinition } from '../../src/academy/content/lesson-zero-sound';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import { startLessonZeroSoundSession } from '../../src/academy/domain/lesson-zero-sound-session';
import { auditGroundedAnswerConcealmentSurface } from '../../src/academy/domain/grounded-answer-concealment-audit';
import { lessonZeroSoundAuditBinding } from '../../src/academy/domain/lesson-zero-sound-grounding';
import { createLessonZeroSoundScreen } from '../../src/academy/ui/lesson-zero-sound-screen';

const LESSON_PATH = path.resolve('public/academy/content/lessons/lesson-zero.v1.json');

function definition() {
    const data = validateLessonZeroPackage(JSON.parse(fs.readFileSync(LESSON_PATH, 'utf8')));
    return createLessonZeroSoundDefinition({
        lesson: data.lesson,
        sourceLibrary: {} as never,
        grounding: {} as never,
    });
}

function audioHarness() {
    const created: HTMLAudioElement[] = [];
    const factory = vi.fn((url: string) => {
        const audio = document.createElement('audio');
        audio.dataset.source = url;
        Object.defineProperty(audio, 'play', { configurable: true, value: vi.fn(async () => undefined) });
        Object.defineProperty(audio, 'pause', { configurable: true, value: vi.fn() });
        created.push(audio);
        return audio;
    });
    return {
        created,
        factory,
        finishLatest(): void {
            const audio = created.at(-1);
            if (!audio) throw new TypeError('No sound has started.');
            audio.dispatchEvent(new Event('ended'));
        },
    };
}

describe('Lesson Zero sound screen', () => {
    it('teaches the names before binding a real pre-commit answer-concealment surface', async () => {
        const content = definition();
        const audio = audioHarness();
        const screen = createLessonZeroSoundScreen({
            language: 'en',
            definition: content,
            initialState: startLessonZeroSoundSession(content),
            audioFactory: audio.factory,
            onTransition: vi.fn(),
            onRestart: vi.fn(),
            onBack: vi.fn(),
            onComplete: vi.fn(),
        });
        document.body.append(screen.element);

        expect(screen.element.dataset.sessionStage).toBe('meet');
        expect(screen.element.textContent).toContain('Xingyu');
        expect(screen.element.textContent).toContain('シンユ');
        expect(screen.element.textContent).not.toContain('こちらはシンユさんです。');
        for (const line of content.lines.filter(candidate => candidate.phase === 'introduction')) {
            await hear(screen.element, audio, line.id);
        }
        click(screen.element, 'Now listen for their names');
        await vi.waitFor(() => expect(screen.element.dataset.sessionStage).toBe('attempt'));

        const surface = screen.element.querySelector<HTMLElement>('.academy-sound-mission');
        if (!surface) throw new TypeError('Missing sound-mission pre-commit surface.');
        const checkLines = content.lines.filter(line => line.phase === 'check');
        const mappings = checkLines.map(line => `${line.id}=>${line.targetSpeakerId}`);
        const audit = auditGroundedAnswerConcealmentSurface(surface, {
            lessonId: 'lesson:foundation-00',
            subjectId: content.activityId,
            binding: lessonZeroSoundAuditBinding(content.contentRevision),
            forbiddenValues: {
                translations: checkLines.map(line => line.meaning.en),
                transcripts: [...new Set(checkLines.flatMap(line => [line.japanese, line.reading]))],
                modelAnswers: mappings,
                acceptedAnswers: mappings,
            },
        });

        expect(audit.result).toBe('pass');
        expect(audit.findings).toEqual([]);
        expect(audit.snapshot).toContain('data-grounded-commit-state="pre-commit"');
        screen.dispose();
    });

    it('uses changed-speaker audio, repairs only the missed name, and then completes', async () => {
        const content = definition();
        const audio = audioHarness();
        const transitions: Array<{ supportEvents: readonly unknown[]; evaluation?: { result: { outcome: string } } }> = [];
        const onComplete = vi.fn();
        const screen = createLessonZeroSoundScreen({
            language: 'en',
            definition: content,
            initialState: startLessonZeroSoundSession(content),
            audioFactory: audio.factory,
            onTransition: async (_before, transition) => { transitions.push(transition); },
            onRestart: vi.fn(),
            onBack: vi.fn(),
            onComplete,
        });
        document.body.append(screen.element);

        for (const line of content.lines.filter(candidate => candidate.phase === 'introduction')) {
            await hear(screen.element, audio, line.id);
            expect(screen.element.textContent).toContain(line.japanese);
        }
        click(screen.element, 'Now listen for their names');
        await vi.waitFor(() => expect(screen.element.dataset.sessionStage).toBe('attempt'));

        const [xingyuCheck, mikaCheck] = content.lines.filter(line => line.phase === 'check');
        expect(screen.element.textContent).not.toContain(xingyuCheck!.japanese);
        expect(turn(screen.element, xingyuCheck!.id).querySelector('fieldset')?.hasAttribute('disabled')).toBe(true);
        await hear(screen.element, audio, xingyuCheck!.id);
        await choose(screen.element, xingyuCheck!.id, 'xingyu');
        await hear(screen.element, audio, mikaCheck!.id);
        await choose(screen.element, mikaCheck!.id, 'xingyu');
        click(screen.element, 'Check the names');

        await vi.waitFor(() => expect(screen.element.dataset.sessionStage).toBe('repair'));
        expect(screen.element.textContent).not.toContain(mikaCheck!.japanese);
        const repairs = [...screen.element.querySelectorAll<HTMLButtonElement>('.academy-sound-action--listen')];
        expect(repairs).toHaveLength(1);
        expect(repairs[0]?.dataset.lineId).toBe(mikaCheck!.id);
        expect(button(screen.element, 'Try that name again').disabled).toBe(true);

        click(screen.element, 'Show the line');
        await vi.waitFor(() => expect(screen.element.textContent).toContain(mikaCheck!.japanese));
        expect(transitions.some(transition => transition.supportEvents.length === 3)).toBe(true);
        await hear(screen.element, audio, mikaCheck!.id);
        await vi.waitFor(() => expect(button(screen.element, 'Try that name again').disabled).toBe(false));
        click(screen.element, 'Try that name again');
        await vi.waitFor(() => expect(screen.element.dataset.sessionStage).toBe('attempt'));

        expect(screen.element.querySelectorAll('.academy-sound-turn')).toHaveLength(1);
        await hear(screen.element, audio, mikaCheck!.id);
        await choose(screen.element, mikaCheck!.id, 'mika');
        click(screen.element, 'Check the names');

        await vi.waitFor(() => expect(screen.element.dataset.sessionStatus).toBe('complete'));
        expect(screen.element.textContent).toContain('こちらはシンユさんです。');
        expect(transitions.filter(transition => transition.evaluation).map(transition => transition.evaluation?.result.outcome))
            .toEqual(['lapse', 'pass']);
        click(screen.element, 'Keep going');
        expect(onComplete).toHaveBeenCalledOnce();
        screen.dispose();
    });

    it('pauses active audio and persists the exact meet cursor before leaving', async () => {
        const content = definition();
        const audio = audioHarness();
        const onBack = vi.fn();
        const screen = createLessonZeroSoundScreen({
            language: 'en',
            definition: content,
            initialState: startLessonZeroSoundSession(content),
            audioFactory: audio.factory,
            onTransition: vi.fn(),
            onRestart: vi.fn(),
            onBack,
            onComplete: vi.fn(),
        });
        listen(screen.element, content.lines[0]!.id).click();
        await vi.waitFor(() => expect(audio.created).toHaveLength(1));
        screen.element.querySelector<HTMLButtonElement>('.academy-sound-back')!.click();
        await vi.waitFor(() => expect(onBack).toHaveBeenCalledOnce());
        expect(audio.created[0]!.pause).toHaveBeenCalledOnce();
        screen.dispose();
    });
});

async function hear(root: HTMLElement, audio: ReturnType<typeof audioHarness>, lineId: string): Promise<void> {
    const previousCount = audio.created.length;
    listen(root, lineId).click();
    await vi.waitFor(() => expect(audio.created).toHaveLength(previousCount + 1));
    audio.finishLatest();
    await vi.waitFor(() => expect(listen(root, lineId).textContent).toContain('Replay'));
}

function turn(root: HTMLElement, lineId: string): HTMLElement {
    const value = root.querySelector<HTMLElement>(`.academy-sound-turn[data-line-id="${lineId}"]`);
    if (!value) throw new TypeError(`Missing sound turn ${lineId}.`);
    return value;
}

function listen(root: HTMLElement, lineId: string): HTMLButtonElement {
    const line = root.querySelector<HTMLElement>(`[data-line-id="${lineId}"]`);
    const value = line instanceof HTMLButtonElement && line.classList.contains('academy-sound-action--listen')
        ? line
        : line?.querySelector<HTMLButtonElement>('.academy-sound-listen');
    if (!value) throw new TypeError(`Missing listen button ${lineId}.`);
    return value;
}

async function choose(root: HTMLElement, lineId: string, speakerId: string): Promise<void> {
    const value = turn(root, lineId)
        .querySelector<HTMLButtonElement>(`.academy-sound-choice[data-speaker-id="${speakerId}"]`);
    if (!value) throw new TypeError(`Missing ${speakerId} choice for ${lineId}.`);
    value.click();
    await vi.waitFor(() => expect(
        turn(root, lineId)
            .querySelector<HTMLButtonElement>(`.academy-sound-choice[data-speaker-id="${speakerId}"]`)
            ?.getAttribute('aria-pressed'),
    ).toBe('true'));
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
    const value = [...root.querySelectorAll<HTMLButtonElement>('button')]
        .find(candidate => candidate.textContent?.includes(label));
    if (!value) throw new TypeError(`Missing button ${label}.`);
    return value;
}

function click(root: HTMLElement, label: string): void {
    button(root, label).click();
}
