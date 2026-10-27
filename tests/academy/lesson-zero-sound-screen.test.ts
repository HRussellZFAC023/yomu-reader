import fs from 'node:fs';
import path from 'node:path';
import { createLessonZeroSoundDefinition } from '../../src/academy/content/lesson-zero-sound';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import { startLessonZeroSoundSession } from '../../src/academy/domain/lesson-zero-sound-session';
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

function listen(root: HTMLElement, lineId: string): HTMLButtonElement {
    const line = root.querySelector<HTMLElement>(`[data-line-id="${lineId}"]`);
    const value = line instanceof HTMLButtonElement && line.classList.contains('academy-sound-action--listen')
        ? line
        : line?.querySelector<HTMLButtonElement>('.academy-sound-listen');
    if (!value) throw new TypeError(`Missing listen button ${lineId}.`);
    return value;
}
