import {
    createStudySessionClock,
    formatStudySessionRemaining,
    mountStudySessionClockControl,
    type StudySessionVisibilitySource,
} from '../../src/reader/newtab/session-clock';

class FakeVisibility implements StudySessionVisibilitySource {
    hidden = false;
    private readonly listeners = new Set<() => void>();

    addEventListener(_type: 'visibilitychange', listener: () => void): void {
        this.listeners.add(listener);
    }

    removeEventListener(_type: 'visibilitychange', listener: () => void): void {
        this.listeners.delete(listener);
    }

    setHidden(hidden: boolean): void {
        this.hidden = hidden;
        this.listeners.forEach(listener => listener());
    }
}

afterEach(() => {
    document.body.replaceChildren();
});

describe('shared Study session clock', () => {
    it('counts down from 15:00 and shares one ticker across subscribers', () => {
        let now = 1_000;
        let tick: (() => void) | undefined;
        const schedule = vi.fn((listener: () => void) => {
            tick = listener;
            return 17;
        });
        const cancel = vi.fn();
        const clock = createStudySessionClock({ now: () => now, schedule, cancel });
        const first = vi.fn();
        const second = vi.fn();

        const firstSubscription = clock.subscribe(first);
        const secondSubscription = clock.subscribe(second);
        expect(first.mock.lastCall?.[0]).toMatchObject({ label: '15:00', remainingMs: 900_000, state: 'running' });
        expect(schedule).toHaveBeenCalledTimes(1);

        now += 1_000;
        tick?.();
        expect(first.mock.lastCall?.[0]).toMatchObject({ label: '14:59', remainingMs: 899_000 });
        expect(second.mock.lastCall?.[0]).toMatchObject({ label: '14:59', remainingMs: 899_000 });

        firstSubscription.dispose();
        expect(cancel).not.toHaveBeenCalled();
        secondSubscription.dispose();
        expect(cancel).toHaveBeenCalledWith(17);
    });

    it('keeps user pause independent from tab visibility', () => {
        let now = 2_000;
        const visibility = new FakeVisibility();
        const clock = createStudySessionClock({ now: () => now, visibility, schedule: () => 1, cancel: () => undefined });

        now += 5_000;
        expect(clock.pause()).toMatchObject({ label: '14:55', state: 'paused', pausedByUser: true });
        now += 60_000;
        expect(clock.snapshot()).toMatchObject({ label: '14:55', elapsedMs: 5_000 });

        visibility.setHidden(true);
        visibility.setHidden(false);
        expect(clock.snapshot()).toMatchObject({ state: 'paused', pausedByUser: true, pausedByVisibility: false });

        clock.resume();
        now += 1_000;
        expect(clock.snapshot()).toMatchObject({ label: '14:54', state: 'running', elapsedMs: 6_000 });
    });

    it('pauses hidden time and clamps completion without touching caller state', () => {
        let now = 10_000;
        const visibility = new FakeVisibility();
        const queue = ['due-a', 'due-b'];
        const clock = createStudySessionClock({
            durationMs: 60_000,
            now: () => now,
            visibility,
            schedule: () => 1,
            cancel: () => undefined,
        });

        now += 10_000;
        visibility.setHidden(true);
        now += 300_000;
        expect(clock.snapshot()).toMatchObject({ label: '00:50', state: 'paused' });
        visibility.setHidden(false);
        now += 50_000;
        expect(clock.snapshot()).toMatchObject({ label: '00:00', state: 'complete', complete: true });
        expect(queue).toEqual(['due-a', 'due-b']);
    });

    it('mounts the same pause control used by both Study surfaces', () => {
        let now = 0;
        const clock = createStudySessionClock({ now: () => now, schedule: () => 1, cancel: () => undefined });
        const host = document.createElement('div');
        document.body.append(host);
        const mounted = mountStudySessionClockControl(host, clock, {
            labels: { pause: 'Pause', resume: 'Resume' },
        });

        const button = host.querySelector<HTMLButtonElement>('[data-study-clock-action="toggle"]')!;
        expect(host.querySelector('[data-study-clock="countdown"]')?.textContent).toBe('15:00');
        button.click();
        now += 20_000;
        expect(clock.snapshot()).toMatchObject({ label: '15:00', state: 'paused' });
        expect(button.textContent).toBe('Resume');
        button.click();
        now += 1_000;
        expect(clock.snapshot().label).toBe('14:59');

        mounted.dispose();
        expect(host.childElementCount).toBe(0);
    });

    it('formats longer configured sessions without reverting to elapsed time', () => {
        expect(formatStudySessionRemaining(-1)).toBe('00:00');
        expect(formatStudySessionRemaining(185_000)).toBe('03:05');
        expect(formatStudySessionRemaining(3_723_000)).toBe('1:02:03');
    });
});
