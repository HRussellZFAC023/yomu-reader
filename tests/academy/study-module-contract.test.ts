import {
    createCanonicalAcademyStudyModule,
    createAcademyStudyCountdown,
    DEFAULT_ACADEMY_STUDY_DURATION_MS,
    mountAcademyStudyModule,
    type AcademyStudyMountContext,
} from '../../src/academy/integration/study-module';
import { newTabText } from '../../src/reader/newtab/i18n';

afterEach(() => {
    document.querySelectorAll('.academy-study-mount').forEach(host => host.dispatchEvent(new Event('academy:dispose')));
    vi.useRealTimers();
    document.body.replaceChildren();
});

describe('Academy shared Study contract', () => {
    it.each(['en', 'ja'] as const)('keeps a failed chunk load retryable with exit and reload available (%s)', async language => {
        const dispose = vi.fn();
        const mount = vi.fn(async (host: HTMLElement) => {
            host.textContent = 'Reader Study ready';
            return { dispose };
        });
        const loader = vi.fn().mockRejectedValueOnce(new Error('missing chunk')).mockResolvedValue({ mountNewTabStudySurface: mount });
        const host = document.createElement('section');
        document.body.append(host);
        const onExit = vi.fn();
        const lifetime = await mountAcademyStudyModule(host, createCanonicalAcademyStudyModule(loader), { language, onExit });
        expect(host.querySelector('[role="alert"]')).not.toBeNull();
        expect(host.querySelector('a')?.href).toBe(location.href);
        expect(host.querySelector<HTMLButtonElement>('.academy-study-clock-toggle')?.disabled).toBe(true);
        expect(mount).not.toHaveBeenCalled();
        host.querySelector<HTMLButtonElement>('[data-academy-study-retry]')!.click();
        await vi.waitFor(() => expect(host.textContent).toContain('Reader Study ready'));
        expect(loader).toHaveBeenCalledTimes(2);
        expect(mount).toHaveBeenCalledOnce();
        expect(host.querySelector('[role="alert"]')).toBeNull();
        expect(host.querySelector<HTMLButtonElement>('.academy-study-clock-toggle')?.disabled).toBe(false);
        host.querySelector<HTMLButtonElement>('.academy-study-back')!.click();
        expect(onExit).toHaveBeenCalledOnce();
        lifetime.dispose();
        lifetime.dispose();
        expect(dispose).toHaveBeenCalledOnce();
    });

    it('does not start Reader Study after leaving during the import', async () => {
        const mount = vi.fn(async () => ({ dispose() {} }));
        let resolve!: (value: { mountNewTabStudySurface: typeof mount }) => void;
        const loader = () => new Promise<{ mountNewTabStudySurface: typeof mount }>(done => { resolve = done; });
        const host = document.createElement('section');
        document.body.append(host);
        const pending = mountAcademyStudyModule(host, createCanonicalAcademyStudyModule(loader), { language: 'en', onExit() {} });
        host.dispatchEvent(new Event('academy:dispose'));
        resolve({ mountNewTabStudySurface: mount });
        const lifetime = await pending;
        expect(mount).not.toHaveBeenCalled();
        expect(host.childElementCount).toBe(0);
        lifetime.dispose();
    });

    it('disposes a mount which finishes after the screen was left', async () => {
        let resolve!: (value: { dispose(): void }) => void;
        const dispose = vi.fn();
        const host = document.createElement('section');
        document.body.append(host);
        const pending = mountAcademyStudyModule(host, { mount: () => new Promise(done => { resolve = done; }) }, { language: 'en', onExit() {} });
        host.dispatchEvent(new Event('academy:dispose'));
        resolve({ dispose });
        await pending;
        expect(dispose).toHaveBeenCalledOnce();
        expect(host.classList.contains('academy-study-mount')).toBe(false);
    });

    it('offers reload rather than mounting over a rejected Reader initialization', async () => {
        const host = document.createElement('section');
        document.body.append(host);
        const lifetime = await mountAcademyStudyModule(host, { mount: async () => { throw new Error('initialization failed'); } }, { language: 'en', onExit() {} });
        expect(host.querySelector('[role="alert"]')).not.toBeNull();
        expect(host.querySelector('[data-academy-study-retry]')).toBeNull();
        expect(host.querySelector('a')?.href).toBe(location.href);
        lifetime.dispose();
    });

    it('ships explicit English and Japanese clock controls and completion copy', () => {
        expect(newTabText('en', 'sessionPause')).toBe('Pause');
        expect(newTabText('ja', 'sessionPause')).toBe('一時停止');
        expect(newTabText('en', 'sessionComplete')).toBe('Study time complete');
        expect(newTabText('ja', 'sessionComplete')).toBe('学習時間が終わりました');
        expect(newTabText('ja', 'sessionComplete')).not.toBe('未翻訳');
    });

    it('adapts the production Reader Study mount without copying its queue or grading UI', async () => {
        const dispose = vi.fn();
        const mountNewTabStudySurface = vi.fn(async () => ({ dispose }));
        const module = createCanonicalAcademyStudyModule(async () => ({ mountNewTabStudySurface }));
        const host = document.createElement('section');
        const countdown = createAcademyStudyCountdown();

        const mounted = await module.mount(host, {
            language: 'ja',
            surface: { id: 'academy', theme: 'living-paper' },
            countdown,
            onExit() {},
        });

        expect(mountNewTabStudySurface).toHaveBeenCalledWith(host, {
            language: 'ja',
            sessionClock: countdown,
        });
        mounted.dispose();
        expect(dispose).toHaveBeenCalledOnce();
        countdown.dispose();
    });

    it('keeps session vocabulary optional and forwards it when Academy has a grounded syllabus', async () => {
        const mountNewTabStudySurface = vi.fn(async () => ({ dispose: vi.fn() }));
        const module = createCanonicalAcademyStudyModule(async () => ({ mountNewTabStudySurface }));
        const host = document.createElement('section');
        const countdown = createAcademyStudyCountdown();
        const sessionVocabulary = [{
            id: 'lesson-01:read',
            expression: '読む',
            reading: 'よむ',
            meaning: 'to read',
            source: 'academy:lesson-01',
            audioAvailable: true,
        }] as const;

        const mounted = await module.mount(host, {
            language: 'en',
            surface: { id: 'academy', theme: 'living-paper' },
            countdown,
            sessionVocabulary,
            onExit() {},
        });

        expect(mountNewTabStudySurface).toHaveBeenCalledWith(host, {
            language: 'en',
            sessionClock: countdown,
            sessionVocabulary,
        });
        mounted.dispose();
        countdown.dispose();
    });

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
        expect(host.querySelector('[role="status"]')?.textContent).toBe('Study time complete');
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
