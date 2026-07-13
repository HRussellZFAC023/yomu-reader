import {
    createAcademyStudyCountdown,
    DEFAULT_ACADEMY_STUDY_DURATION_MS,
    mountAcademyStudyModule,
    type AcademyStudyMountContext,
} from '../../src/academy/integration/study-module';

afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
});

describe('Academy shared Study contract', () => {
    it('defaults to a 15:00 countdown and never exposes count-up time', () => {
        let now = 1_000;
        const countdown = createAcademyStudyCountdown(undefined, () => now);

        expect(DEFAULT_ACADEMY_STUDY_DURATION_MS).toBe(15 * 60 * 1_000);
        expect(countdown.mode).toBe('countdown');
        expect(countdown.snapshot()).toMatchObject({ label: '15:00', remainingMs: 900_000, complete: false });
        now += 61_000;
        expect(countdown.snapshot()).toMatchObject({ label: '13:59', remainingMs: 839_000, complete: false });
        now += 900_000;
        expect(countdown.snapshot()).toMatchObject({ label: '00:00', remainingMs: 0, complete: true });
    });

    it('accepts a configured duration and mounts the canonical module on the living-paper surface', async () => {
        vi.useFakeTimers();
        let now = 10_000;
        let context: AcademyStudyMountContext | undefined;
        const dispose = vi.fn();
        const onComplete = vi.fn();
        const module = {
            mount: vi.fn((host: HTMLElement, next: AcademyStudyMountContext) => {
                context = next;
                host.append(document.createElement('article'));
                return { dispose };
            }),
        };
        const host = document.createElement('section');
        document.body.append(host);

        const mounted = await mountAcademyStudyModule(host, module, {
            language: 'en',
            durationMs: 2 * 60 * 1_000,
            now: () => now,
            onExit: vi.fn(),
            onSessionComplete: onComplete,
        });

        expect(host.dataset).toMatchObject({
            studySurface: 'academy',
            studyTheme: 'living-paper',
            studySessionMode: 'countdown',
        });
        expect(context?.surface).toEqual({ id: 'academy', theme: 'living-paper' });
        expect(context?.countdown.durationMs).toBe(120_000);
        expect(host.querySelector('.academy-study-module-host article')).not.toBeNull();
        expect(host.querySelector('.academy-study-countdown')?.textContent).toBe('02:00');

        now += 1_000;
        vi.advanceTimersByTime(1_000);
        expect(host.querySelector('.academy-study-countdown')?.textContent).toBe('01:59');
        now += 120_000;
        vi.advanceTimersByTime(120_000);
        expect(host.querySelector('.academy-study-countdown')?.textContent).toBe('00:00');
        expect(host.querySelector('[role="status"]')?.textContent).toBe('Study time complete.');
        expect(onComplete).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);

        mounted.dispose();
        expect(dispose).toHaveBeenCalledOnce();
        expect(host.childElementCount).toBe(0);
    });

    it('rejects session durations outside the bounded configuration contract', () => {
        expect(() => createAcademyStudyCountdown(59_999)).toThrow(TypeError);
        expect(() => createAcademyStudyCountdown(3 * 60 * 60 * 1_000 + 1)).toThrow(TypeError);
    });
});
