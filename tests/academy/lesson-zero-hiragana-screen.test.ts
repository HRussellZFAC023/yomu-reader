import { describe, expect, it, vi } from 'vitest';
import { createLessonZeroHiraganaDefinition } from '../../src/academy/content/lesson-zero-hiragana';
import {
    lessonZeroHiraganaCurrentItem,
    startLessonZeroHiraganaSession,
} from '../../src/academy/domain/lesson-zero-hiragana-session';
import { createLessonZeroHiraganaScreen } from '../../src/academy/ui/lesson-zero-hiragana-screen';

describe('Lesson Zero hiragana screen', () => {
    it('shows all 46 up front, then keeps the drill compact and action-led', async () => {
        const definition = createLessonZeroHiraganaDefinition();
        let saved = startLessonZeroHiraganaSession(definition);
        const screen = createLessonZeroHiraganaScreen({
            language: 'en',
            definition,
            initialState: saved,
            pronunciation: { play: vi.fn(async () => ({ dispose() {} })) } as never,
            onTransition: async (_before, transition) => { saved = transition.state; },
            onRestart: async state => { saved = state; },
            onBack: vi.fn(),
            onComplete: vi.fn(),
        });
        document.body.append(screen.element);

        expect(screen.element.querySelectorAll('.academy-hiragana-chart-kana')).toHaveLength(46);
        expect(screen.element.textContent).toContain('The full hiragana chart');
        expect(screen.element.textContent).not.toContain('Compare the neighbours');

        click(screen.element, 'Start あ-row');
        await vi.waitFor(() => expect(screen.element.dataset.sessionStage).toBe('row-preview'));
        expect(screen.element.querySelectorAll('.academy-hiragana-row-item')).toHaveLength(5);
        expect(screen.element.querySelectorAll('[data-hiragana-anchor-image]')).toHaveLength(5);
        const firstAnchor = screen.element.querySelector('.academy-hiragana-row-item')!;
        expect(firstAnchor.querySelector('.academy-hiragana-row-anchor-headword')?.textContent).toBe('朝');
        expect(firstAnchor.querySelector('.academy-hiragana-row-word')?.textContent).toBe('あさ');
        expect(firstAnchor.querySelector('.academy-hiragana-row-anchor-pronunciation')?.textContent).toBe('asa');
        expect(firstAnchor.querySelector('.academy-hiragana-row-anchor-meaning')?.textContent).toBe('morning');
        expect(
            [...screen.element.querySelectorAll<HTMLImageElement>('[data-hiragana-anchor-image]')]
                .map(image => image.getAttribute('src')),
        ).toEqual([
            '/academy/art/lesson-zero/hiragana-anchors/hira-a.webp',
            '/academy/art/lesson-zero/hiragana-anchors/hira-i.webp',
            '/academy/art/lesson-zero/hiragana-anchors/hira-u.webp',
            '/academy/art/lesson-zero/hiragana-anchors/hira-e.webp',
            '/academy/art/lesson-zero/hiragana-anchors/hira-o.webp',
        ]);

        click(screen.element, 'Drill this row');
        await vi.waitFor(() => expect(screen.element.dataset.sessionStage).toBe('row-drill'));
        expect(screen.element.querySelectorAll('.academy-hiragana-choice')).toHaveLength(4);
        expect(screen.element.querySelectorAll('[data-hiragana-anchor-image]')).toHaveLength(1);
        expect(screen.element.textContent).toContain('What sound?');

        const item = lessonZeroHiraganaCurrentItem(definition, saved)!;
        click(screen.element, item.romaji);
        await vi.waitFor(() => expect(saved.attempts).toHaveLength(1));
        expect(screen.element.querySelector('.academy-hiragana-live')?.textContent).toBe(`${item.kana} = ${item.romaji}`);
        expect(screen.element.dataset.jpdbReaderInteractionIgnore).toBe('');
        screen.dispose();
    });

    it('offers one placement route rather than forcing known kana through ten rows', async () => {
        const definition = createLessonZeroHiraganaDefinition();
        let saved = startLessonZeroHiraganaSession(definition);
        const screen = createLessonZeroHiraganaScreen({
            language: 'en',
            definition,
            initialState: saved,
            pronunciation: { play: vi.fn(async () => ({ dispose() {} })) } as never,
            onTransition: async (_before, transition) => { saved = transition.state; },
            onRestart: vi.fn(),
            onBack: vi.fn(),
            onComplete: vi.fn(),
        });
        document.body.append(screen.element);

        click(screen.element, 'I know hiragana — test me');
        await vi.waitFor(() => expect(screen.element.dataset.sessionStage).toBe('mastery-ready'));
        expect(saved.route).toBe('placement');
        click(screen.element, 'Turn over the chart');
        await vi.waitFor(() => expect(screen.element.querySelector('input[name="romaji"]')).not.toBeNull());
        expect(screen.element.querySelector('.academy-hiragana-kana-mastery')?.textContent).toBe('あ');
        expect(screen.element.querySelectorAll('[data-hiragana-anchor-image]')).toHaveLength(0);
        screen.dispose();
    });
});

function click(root: HTMLElement, label: string): void {
    const button = [...root.querySelectorAll<HTMLButtonElement>('button')]
        .find(candidate => candidate.textContent?.trim() === label);
    if (!button) throw new TypeError(`Missing button ${label}.`);
    button.click();
}
