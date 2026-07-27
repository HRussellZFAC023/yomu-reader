import fs from 'node:fs';
import path from 'node:path';
import { createLessonZeroNameCardDefinition } from '../../src/academy/content/lesson-zero-name-card';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import {
    startLessonZeroNameCardSession,
    type LessonZeroNameCardSessionTransition,
} from '../../src/academy/domain/lesson-zero-name-card-session';
import { createLessonZeroNameCardScreen } from '../../src/academy/ui/lesson-zero-name-card-screen';

const LESSON_PATH = path.resolve('public/academy/content/lessons/lesson-zero.v1.json');

function definition() {
    const lesson = validateLessonZeroPackage(JSON.parse(fs.readFileSync(LESSON_PATH, 'utf8'))).lesson;
    return createLessonZeroNameCardDefinition(
        lesson.activities.find(activity => activity.id === 'activity:lesson-zero-name-card-draft')!,
        'Henry',
    );
}

describe('Lesson Zero name-card screen', () => {
    it('uses katakana by default, plays accepted Rie lines, and earns changed-person transfer', async () => {
        const content = definition();
        const transitions: LessonZeroNameCardSessionTransition[] = [];
        const fallback = vi.fn(async () => ({ dispose() {} }));
        const playLine = vi.fn(async () => ({ status: 'playing' as const, playback: { dispose() {} } }));
        const screen = createLessonZeroNameCardScreen({
            language: 'en',
            definition: content,
            initialState: startLessonZeroNameCardSession(content),
            pronunciation: { play: fallback, playLine } as never,
            onTransition: async (_before, transition) => { transitions.push(transition); },
            onRestart: vi.fn(),
            onBack: vi.fn(),
            onComplete: vi.fn(),
        });
        document.body.append(screen.element);

        expect(screen.element.textContent).toContain('Choose the name for your card.');
        expect(screen.element.textContent).toContain('ヘンリー');
        expect(screen.element.textContent).not.toMatch(/One true role|language you study|truth|boundary/i);
        expect(screen.element.querySelector('input')).toBeNull();
        expect(nameVariant(screen.element, 'katakana').getAttribute('aria-pressed')).toBe('true');
        expect(nameVariant(screen.element, 'usual').textContent).toContain('Henry');

        click(screen.element, 'Hear Rie');
        await vi.waitFor(() => expect(playLine).toHaveBeenCalledWith(
            expect.objectContaining({
                lineId: 'lesson-zero:greeting-rie-model',
                japanese: 'こんばんは。はじめまして。りえです。よろしくお願いします。',
            }),
            expect.any(AbortSignal),
        ));
        expect(fallback).not.toHaveBeenCalled();

        token(screen.element, 'desu').click();
        await vi.waitFor(() => expect(screen.element.querySelectorAll('.academy-name-card-token-selected')).toHaveLength(1));
        token(screen.element, 'learner-name').click();
        await vi.waitFor(() => expect(screen.element.querySelectorAll('.academy-name-card-token-selected')).toHaveLength(2));
        click(screen.element, 'Check');
        await vi.waitFor(() => expect(screen.element.dataset.sessionStage).toBe('build-result'));
        expect(screen.element.textContent).not.toContain('1. your name');

        click(screen.element, 'Show the pattern');
        await vi.waitFor(() => expect(screen.element.textContent).toContain('1. your name'));
        click(screen.element, 'Try again');
        await vi.waitFor(() => expect(screen.element.dataset.sessionStage).toBe('build'));
        token(screen.element, 'learner-name').click();
        await vi.waitFor(() => expect(screen.element.querySelectorAll('.academy-name-card-token-selected')).toHaveLength(1));
        token(screen.element, 'desu').click();
        await vi.waitFor(() => expect(screen.element.querySelectorAll('.academy-name-card-token-selected')).toHaveLength(2));
        click(screen.element, 'Check');
        await vi.waitFor(() => expect(screen.element.dataset.sessionStage).toBe('transfer'));

        transfer(screen.element, 'learner').click();
        await vi.waitFor(() => expect(
            transfer(screen.element, 'learner').getAttribute('aria-pressed'),
        ).toBe('true'));
        click(screen.element, 'Check the card');
        await vi.waitFor(() => expect(screen.element.dataset.sessionStage).toBe('transfer-result'));
        expect(screen.element.textContent).not.toContain('1. りえ');
        click(screen.element, 'Show the pattern');
        await vi.waitFor(() => expect(screen.element.textContent).toContain('1. りえ'));
        expect(screen.element.textContent).not.toContain('1. your name');
        click(screen.element, 'Try again');
        await vi.waitFor(() => expect(screen.element.dataset.sessionStage).toBe('transfer'));
        transfer(screen.element, 'rie').click();
        await vi.waitFor(() => expect(
            transfer(screen.element, 'rie').getAttribute('aria-pressed'),
        ).toBe('true'));
        click(screen.element, 'Check the card');

        await vi.waitFor(() => expect(screen.element.dataset.sessionStatus).toBe('complete'));
        expect(screen.element.textContent).toContain('ヘンリーです。');
        expect(transitions.filter(value => value.evaluation).map(value => value.evaluation?.result.outcome))
            .toEqual(['lapse', 'pass', 'lapse', 'pass']);
        expect(transitions.slice(0, -1).flatMap(value => value.evaluation?.reviewSeeds ?? [])).toEqual([]);
        expect(transitions.at(-1)?.evaluation?.reviewSeeds).toEqual([
            expect.objectContaining({ id: 'review:lesson-zero:name-card:desu' }),
        ]);
        screen.dispose();
    });
});

function token(root: HTMLElement, id: string): HTMLButtonElement {
    const button = root.querySelector<HTMLButtonElement>(`.academy-name-card-token[data-token-id="${id}"]`);
    if (!button) throw new TypeError(`Missing token ${id}.`);
    return button;
}

function nameVariant(root: HTMLElement, variant: string): HTMLButtonElement {
    const button = root.querySelector<HTMLButtonElement>(`[data-name-variant="${variant}"]`);
    if (!button) throw new TypeError(`Missing name variant ${variant}.`);
    return button;
}

function transfer(root: HTMLElement, id: string): HTMLButtonElement {
    const button = root.querySelector<HTMLButtonElement>(`[data-transfer-id="${id}"]`);
    if (!button) throw new TypeError(`Missing transfer ${id}.`);
    return button;
}

function click(root: HTMLElement, label: string): void {
    const button = [...root.querySelectorAll<HTMLButtonElement>('button')]
        .find(candidate => candidate.textContent?.includes(label));
    if (!button) throw new TypeError(`Missing button ${label}.`);
    button.click();
}
