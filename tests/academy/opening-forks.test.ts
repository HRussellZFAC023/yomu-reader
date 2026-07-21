import fs from 'node:fs';
import path from 'node:path';
import {
    createOpeningForkActivity,
    loadVerticalSliceContent,
    openingForkActivityId,
    type LessonFork,
} from '../../src/academy/content/vertical-slice';
import type { PronunciationService } from '../../src/academy/integration/yomu-bridge';
import { renderSourceActivityScreen } from '../../src/academy/ui/lesson-screen';

const FORKS = ['sound', 'text', 'speaking'] as const satisfies readonly LessonFork[];

function contentFetcher(): typeof fetch {
    return vi.fn(async (value: string | URL | Request) => {
        const name = String(value).split('/').at(-1) ?? '';
        return new Response(fs.readFileSync(path.resolve('public/academy/content/vertical-slice', name)), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as unknown as typeof fetch;
}

function pronunciation(): PronunciationService {
    return { play: vi.fn(async () => ({ dispose: vi.fn() })) };
}

describe('Lesson 0 opening forks', () => {
    it('keeps one immutable source question while producing independent evidence ids', async () => {
        const content = await loadVerticalSliceContent(contentFetcher());
        const activities = FORKS.map(fork => createOpeningForkActivity(content.activity, fork));

        expect(activities.map(activity => activity.id)).toEqual(FORKS.map(openingForkActivityId));
        expect(new Set(activities.map(activity => activity.sourceQuestionId))).toEqual(new Set([
            'source-question:classroom-phrase-09',
        ]));
        expect(new Set(activities.map(activity => activity.payload.reviewSeedId))).toEqual(new Set([
            'review:classroom-repair-repeat',
        ]));
        expect(new Set(activities.map(activity => activity.prompt.en)).size).toBe(3);
    });

    it('keeps each consequential mission in its own location and interaction order', async () => {
        const content = await loadVerticalSliceContent(contentFetcher());
        const soundService = pronunciation();
        const sound = renderSourceActivityScreen('en', content, 'sound', soundService, vi.fn(), vi.fn());
        expect(sound.dataset.plate).toBe('languageLab');
        expect(sound.dataset.locationId).toBe('location:language-lab');
        expect(sound.querySelector<HTMLElement>('.academy-activity-host')?.hidden).toBe(true);
        sound.querySelector<HTMLButtonElement>('[lang="en"].academy-button-secondary')?.click();
        await vi.waitFor(() => expect(sound.querySelector<HTMLElement>('.academy-activity-host')?.hidden).toBe(false));
        expect(soundService.play).toHaveBeenCalledOnce();

        const text = renderSourceActivityScreen('en', content, 'text', pronunciation(), vi.fn(), vi.fn());
        expect(text.dataset.plate).toBe('library');
        expect(text.dataset.locationId).toBe('location:library');
        expect(text.querySelector<HTMLElement>('.academy-activity-host')?.hidden).toBe(false);
        expect(text.querySelector('.academy-fork-board-line')?.textContent).toContain('教科書');

        const speaking = renderSourceActivityScreen('en', content, 'speaking', pronunciation(), vi.fn(), vi.fn());
        expect(speaking.dataset.plate).toBe('entrance');
        expect(speaking.dataset.locationId).toBe('location:classroom-entrance');
        expect(speaking.querySelector<HTMLElement>('.academy-activity-host')?.hidden).toBe(true);
        speaking.querySelector<HTMLButtonElement>('.academy-fork-prelude .academy-button-secondary')?.click();
        expect(speaking.querySelector<HTMLElement>('.academy-activity-host')?.hidden).toBe(false);

        expect(new Set([sound.dataset.locationId, text.dataset.locationId, speaking.dataset.locationId])).toHaveLength(3);
    });

    it('records the selected fork id in the committed attempt', async () => {
        const content = await loadVerticalSliceContent(contentFetcher());
        const onEvaluation = vi.fn();
        const screen = renderSourceActivityScreen('en', content, 'text', pronunciation(), onEvaluation, vi.fn());
        screen.querySelector<HTMLButtonElement>('[data-choice-id="repeat"]')?.click();

        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        expect(onEvaluation.mock.calls[0][0].attempt.activityId).toBe(openingForkActivityId('text'));
    });

    it('aborts pending sound playback on unmount without revealing or focusing disposed UI', async () => {
        const content = await loadVerticalSliceContent(contentFetcher());
        let resolvePlayback: (value: { dispose(): void }) => void = () => undefined;
        let requestSignal: AbortSignal | undefined;
        const stalePlayback = { dispose: vi.fn() };
        const service: PronunciationService = {
            play: vi.fn((_term, _reading, signal) => {
                requestSignal = signal;
                return new Promise(resolve => { resolvePlayback = resolve; });
            }),
        };
        const screen = renderSourceActivityScreen('en', content, 'sound', service, vi.fn(), vi.fn());
        const host = screen.querySelector<HTMLElement>('.academy-activity-host')!;
        const play = screen.querySelector<HTMLButtonElement>('.academy-fork-prelude .academy-button-secondary')!;
        const focus = vi.spyOn(HTMLElement.prototype, 'focus');

        play.click();
        await vi.waitFor(() => expect(requestSignal).toBeDefined());
        screen.dispatchEvent(new Event('academy:dispose'));
        expect(requestSignal?.aborted).toBe(true);
        resolvePlayback(stalePlayback);

        await vi.waitFor(() => expect(stalePlayback.dispose).toHaveBeenCalledOnce());
        expect(host.hidden).toBe(true);
        expect(focus).not.toHaveBeenCalled();
    });
});
