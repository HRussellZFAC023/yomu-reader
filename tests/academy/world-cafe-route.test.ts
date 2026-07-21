import { projectLearnerRecord } from '../../src/academy/domain/learner-record';
import { createWorldFlow } from '../../src/academy/routing/world-flow';
import type { AcademyShell } from '../../src/academy/ui/shell';
import { renderWorldPlaceScreen } from '../../src/academy/ui/world-screen';
import { worldChoiceButtonByLabel } from './helpers/world-choice';

afterEach(() => document.body.replaceChildren());

describe('World Cafe route', () => {
    it('navigates into Cafe and resumes it as a route whose return targets Campus', async () => {
        let current: HTMLElement | undefined;
        const shell = {
            screen: document.createElement('main'),
            replace(view: HTMLElement) { current = view; },
            setLanguage() {}, setNavigation() {}, setLearnerActionsVisible() {}, setClassBoardAccess() {},
            setPresentationMode() {}, setMuted() {}, announce() {}, dispose() {},
        } satisfies AcademyShell;
        const go = vi.fn(async () => undefined);
        const back = vi.fn(async () => undefined);
        const flow = createWorldFlow({
            evidence: {} as never,
            pronunciation: {} as never,
            audio: {} as never,
        });
        const context = {
            language: 'en' as const,
            checkpoint: {
                schemaVersion: 2 as const,
                route: 'campus' as const,
                routeHistory: [],
                presentationMode: 'course' as const,
                selectedFork: 'speaking' as const,
                updatedAt: 1,
            },
            projection: projectLearnerRecord([]),
            shell,
            go,
            back,
        };

        await flow.render('campus', context);
        current?.querySelector<HTMLButtonElement>('[data-location="cafe"]')?.click();
        expect(go).toHaveBeenCalledWith('cafe', { worldVisits: {} });

        await flow.render('cafe', {
            ...context,
            checkpoint: {
                ...context.checkpoint,
                route: 'cafe',
                routeHistory: [{ route: 'campus' }],
            },
        });
        expect(current?.dataset.currentPlace).toBe('cafe');

        current?.querySelector<HTMLButtonElement>('[data-exit-to="return"]')?.click();
        expect(back).toHaveBeenCalledOnce();
        expect(go).toHaveBeenCalledTimes(1);
    });

    it('presents one staged Cafe order in the approved room, then varies price into quantity on replay', async () => {
        const onIntroductionComplete = vi.fn();
        const onPracticeComplete = vi.fn();
        const onListen = vi.fn(async () => true);
        const onTravel = vi.fn();
        const first = renderWorldPlaceScreen({
            language: 'en',
            place: 'cafe',
            route: 'cafe',
            progress: { completedScenes: [], completedEncounterIds: [], metCharacterIds: ['aakash', 'felix'] },
            onTravel,
            onActivity: vi.fn(),
            onClaimStamp: vi.fn(),
            onIntroductionComplete,
            onListen,
            onPracticeComplete,
            onBack: vi.fn(),
        });
        document.body.append(first);

        expect(first.dataset.cafeVisit).toBe('first-order');
        expect(first.querySelector<HTMLImageElement>('.academy-background img')?.src)
            .toContain('/academy/art/locations/wide/cafe__night-rain--wide.webp');
        expect(first.querySelector('.academy-world-phase')?.textContent).toMatch(/Day 1.*Morning/);
        expect(first.querySelector('[data-world-arrival-dialogue="place:cafe"]')).not.toBeNull();
        expect(first.querySelector('[data-world-practice="cafe-coffee-price"]')?.getAttribute('data-cafe-order-mode')).toBe('price');
        expect(first.querySelector('.academy-world-practice')).toBeNull();
        expect(first.querySelector('[data-activity-route]')).toBeNull();
        expect(first.querySelector('.academy-world-reward')).toBeNull();
        expect(first.querySelectorAll('[data-cafe-primary-action="listen"]')).toHaveLength(1);
        expect(first.querySelector<HTMLElement>('.academy-cafe-order-options')?.hidden).toBe(true);
        const pendingProp = first.querySelector<HTMLElement>('[data-item-presentation="inspectable-source-prop"]')!;
        expect(pendingProp.dataset.itemAssetId).toBe('item.cafe-order-scene');
        expect(pendingProp.dataset.itemState).toBe('pending');
        expect(pendingProp.querySelector<HTMLButtonElement>('.academy-cafe-order-prop-trigger')?.disabled).toBe(true);
        expect(pendingProp.querySelector('img')).toBeNull();
        expect(first.querySelector('[data-world-character="aakash"] [data-world-person-action]')).toBeNull();
        expect(first.querySelector('[data-world-character="aakash"]')?.textContent).toContain('Comparing the coffee price');
        expect(first.querySelector('[data-world-character="felix"]')?.textContent).toContain('Holding the next menu');
        expect(first.querySelectorAll('.academy-world-character-silhouette')).toHaveLength(2);
        expect([...first.querySelectorAll<HTMLElement>('[data-location]')].map(exit => exit.dataset.location))
            .toEqual(['courtyard', 'classroom', 'cafeteria', 'street']);

        first.querySelector<HTMLButtonElement>('.academy-world-arrival-continue')?.click();
        expect(onIntroductionComplete).toHaveBeenCalledWith('place:cafe');
        first.querySelector<HTMLButtonElement>('[data-cafe-primary-action="listen"]')?.click();
        await Promise.resolve();
        expect(onListen).toHaveBeenCalledWith(
            'コーヒーは三百円です。',
            'world-practice:cafe-coffee-price',
        );
        expect(first.querySelector<HTMLElement>('.academy-cafe-order-options')?.hidden).toBe(false);
        expect(first.querySelectorAll('.academy-cafe-order-option .academy-assessed-japanese')).toHaveLength(3);
        expect(first.querySelectorAll('.academy-cafe-order-option [data-jpdb-reader-surface-ignore]')).toHaveLength(3);
        worldChoiceButtonByLabel(first, '三百円')?.click();
        expect(onPracticeComplete).toHaveBeenCalledWith(
            'cafe-coffee-price',
            'action:world-stamp:cafe',
            expect.objectContaining({ attempt: expect.objectContaining({ responseKind: 'world-listening-choice' }) }),
        );
        expect(pendingProp.dataset.itemState).toBe('claimed');
        const inspect = pendingProp.querySelector<HTMLButtonElement>('.academy-cafe-order-prop-trigger')!;
        expect(inspect.disabled).toBe(false);
        expect(inspect.getAttribute('aria-label')).toBe('Inspect cafe order scene');
        expect(inspect.querySelector<HTMLImageElement>('img')?.src)
            .toContain('/academy/art/items/cafe-order-scene__v001.jpg');
        inspect.click();
        const inspector = pendingProp.querySelector<HTMLDialogElement>('[data-cafe-order-inspector]')!;
        expect(inspector.hasAttribute('open')).toBe(true);
        expect(inspector.getAttribute('aria-modal')).toBe('true');
        expect(inspector.getAttribute('aria-labelledby')).toBeTruthy();
        expect(inspector.querySelector<HTMLImageElement>('img')?.loading).toBe('lazy');
        expect(inspector.querySelector<HTMLImageElement>('img')?.alt).toContain('two covered dishes');
        inspector.dispatchEvent(new Event('cancel', { cancelable: true }));
        expect(inspector.hasAttribute('open')).toBe(false);
        expect(document.activeElement).toBe(inspect);

        const replay = renderWorldPlaceScreen({
            language: 'en', place: 'cafe', route: 'cafe',
            progress: {
                completedScenes: [], completedEncounterIds: [],
                metCharacterIds: ['aakash', 'felix'],
                seenIntroductions: ['place:cafe', 'action:world-stamp:cafe'],
                worldVisits: { cafe: 1 },
            },
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(),
        });
        expect(replay.dataset.cafeVisit).toBe('replay');
        expect(replay.querySelector('[data-world-arrival-dialogue]')).toBeNull();
        expect(replay.querySelector('[data-world-practice="cafe-coffee-counter"]')?.getAttribute('data-cafe-order-mode')).toBe('quantity');
        expect(replay.querySelector('.academy-cafe-order-sequence')?.textContent).toContain('REPLAY 02');
        expect(replay.querySelector('[data-world-character="aakash"]')?.textContent).toContain('Checking the quantity');
        expect(replay.querySelector('[data-world-character="felix"]')?.textContent).toContain('Tuning the cafe radio');
        expect(replay.querySelector('[data-item-presentation="inspectable-source-prop"]')?.getAttribute('data-item-state')).toBe('claimed');
        expect(replay.querySelector<HTMLButtonElement>('.academy-cafe-order-prop-trigger')?.disabled).toBe(false);
    });

    it('does not mutate or refocus a disposed Cafe screen when playback settles late', async () => {
        let resolveListen!: (played: boolean) => void;
        const onListen = vi.fn(() => new Promise<boolean>(resolve => { resolveListen = resolve; }));
        const screen = renderWorldPlaceScreen({
            language: 'en',
            place: 'cafe',
            route: 'cafe',
            progress: {
                completedScenes: [],
                completedEncounterIds: [],
                metCharacterIds: ['aakash', 'felix'],
                seenIntroductions: ['place:cafe'],
            },
            onTravel: vi.fn(),
            onActivity: vi.fn(),
            onClaimStamp: vi.fn(),
            onListen,
        });
        document.body.append(screen);
        const status = screen.querySelector<HTMLElement>('[role="status"]')!;
        const focus = vi.spyOn(HTMLElement.prototype, 'focus');

        screen.querySelector<HTMLButtonElement>('[data-cafe-primary-action="listen"]')?.click();
        await vi.waitFor(() => expect(onListen).toHaveBeenCalledOnce());
        const statusAtDispose = status.textContent;
        const focusCallsAtDispose = focus.mock.calls.length;
        screen.dispatchEvent(new CustomEvent('academy:dispose'));

        resolveListen(false);
        await Promise.resolve();
        expect(status.textContent).toBe(statusAtDispose);
        expect(focus).toHaveBeenCalledTimes(focusCallsAtDispose);
    });

    it('keeps an accessible replay control reachable after a wrong Cafe answer', async () => {
        let resolveListen!: (played: boolean) => void;
        const onListen = vi.fn(() => new Promise<boolean>(resolve => { resolveListen = resolve; }));
        const screen = renderWorldPlaceScreen({
            language: 'en',
            place: 'cafe',
            route: 'cafe',
            progress: {
                completedScenes: [],
                completedEncounterIds: [],
                metCharacterIds: ['aakash', 'felix'],
                seenIntroductions: ['place:cafe'],
            },
            onTravel: vi.fn(),
            onActivity: vi.fn(),
            onClaimStamp: vi.fn(),
            onListen,
        });
        document.body.append(screen);
        const order = screen.querySelector<HTMLElement>('[data-world-practice="cafe-coffee-price"]')!;
        const replay = order.querySelector<HTMLButtonElement>('[data-cafe-primary-action="listen"]')!;

        expect(replay.tagName).toBe('BUTTON');
        expect(replay.type).toBe('button');
        expect(replay.getAttribute('aria-label')).toBe('Hear the order');
        replay.click();
        expect(replay.disabled).toBe(true);
        expect(replay.getAttribute('aria-busy')).toBe('true');
        resolveListen(true);
        await vi.waitFor(() => expect(replay.disabled).toBe(false));
        expect(replay.textContent).toBe('Replay order');
        expect(replay.getAttribute('aria-label')).toBe('Replay the order');
        expect(replay.hasAttribute('aria-busy')).toBe(false);

        const wrong = [...order.querySelectorAll<HTMLButtonElement>('.academy-cafe-order-option')]
            .find(button => !button.textContent?.includes('三百円'))!;
        wrong.click();
        expect(order.dataset.cafeOrderState).toBe('retry');
        expect(order.querySelector('[role="status"]')?.textContent).toContain('Listen again');
        expect(document.activeElement).toBe(replay);
        expect(replay.disabled).toBe(false);

        replay.click();
        expect(onListen).toHaveBeenCalledTimes(2);
        resolveListen(false);
        await vi.waitFor(() => expect(replay.disabled).toBe(false));
        expect(replay.hasAttribute('aria-busy')).toBe(false);
    });

    it('records a completed station announcement as an idempotent local stamp', async () => {
        let current: HTMLElement | undefined;
        const shell = {
            screen: document.createElement('main'),
            replace(view: HTMLElement) { current = view; },
            setLanguage() {}, setNavigation() {}, setLearnerActionsVisible() {}, setClassBoardAccess() {},
            setPresentationMode() {}, setMuted() {}, announce() {}, dispose() {},
        } satisfies AcademyShell;
        const play = vi.fn(async () => ({ dispose: vi.fn() }));
        const go = vi.fn(async () => undefined);
        const back = vi.fn(async () => undefined);
        const flow = createWorldFlow({
            evidence: {} as never,
            pronunciation: { play },
            audio: {} as never,
        });
        const context = {
            language: 'en' as const,
            checkpoint: {
                schemaVersion: 2 as const,
                route: 'station' as const,
                routeHistory: [{ route: 'street' as const }],
                presentationMode: 'course' as const,
                selectedFork: 'speaking' as const,
                updatedAt: 1,
            },
            projection: projectLearnerRecord([]),
            shell,
            go,
            back,
        };

        await flow.render('station', context);
        current?.querySelector<HTMLButtonElement>('[data-world-listen]')?.click();
        await Promise.resolve();
        expect(play).toHaveBeenCalledWith(
            '駅の前に本屋があります。',
            undefined,
            expect.any(AbortSignal),
        );
        vi.useFakeTimers();
        try {
            const stationBoard = current!;
            worldChoiceButtonByLabel(stationBoard, '本屋')?.click();
            worldChoiceButtonByLabel(stationBoard, '本屋')?.click();
            // The route re-render is deliberately held open briefly so the just-written
            // success confirmation survives long enough to paint (see world-flow.ts).
            await vi.advanceTimersByTimeAsync(1200);
        } finally {
            vi.useRealTimers();
        }
        expect(go).toHaveBeenCalledTimes(1);
        expect(go).toHaveBeenCalledWith('station', {
            seenIntroductions: ['action:world-stamp:station'],
        });

        current?.querySelector<HTMLButtonElement>('[data-exit-to="return"]')?.click();
        expect(back).toHaveBeenCalledOnce();
    });

    it('records Cafe replay evidence before returning to the same current-place route', async () => {
        let current: HTMLElement | undefined;
        const shell = {
            screen: document.createElement('main'),
            replace(view: HTMLElement) { current = view; },
            setLanguage() {}, setNavigation() {}, setLearnerActionsVisible() {}, setClassBoardAccess() {},
            setPresentationMode() {}, setMuted() {}, announce() {}, dispose() {},
        } satisfies AcademyShell;
        const recordWorldPractice = vi.fn(async () => undefined);
        const go = vi.fn(async () => undefined);
        const flow = createWorldFlow({
            evidence: { recordWorldPractice } as never,
            pronunciation: {} as never,
            audio: {} as never,
        });
        const context = {
            language: 'en' as const,
            checkpoint: {
                schemaVersion: 2 as const,
                route: 'cafe' as const,
                routeHistory: [{ route: 'campus' as const }],
                presentationMode: 'course' as const,
                selectedFork: 'speaking' as const,
                updatedAt: 1,
            },
            projection: projectLearnerRecord([]),
            shell,
            go,
            back: vi.fn(async () => undefined),
        };

        await flow.render('cafe', context);
        current?.querySelector<HTMLButtonElement>('[data-cafe-primary-action="listen"]')?.click();
        vi.useFakeTimers();
        try {
            worldChoiceButtonByLabel(current!.querySelector('[data-world-practice="cafe-coffee-price"]')!, '三百円')?.click();
            // The route re-render is deliberately held open briefly so the just-written
            // success confirmation survives long enough to paint (see world-flow.ts).
            await vi.advanceTimersByTimeAsync(1200);
        } finally {
            vi.useRealTimers();
        }

        expect(recordWorldPractice).toHaveBeenCalledWith(expect.objectContaining({
            attempt: expect.objectContaining({ activityId: 'activity:world:cafe-coffee-price' }),
            reviewSeeds: [expect.objectContaining({ id: 'review:world:cafe:coffee-price' })],
        }));
        expect(go).toHaveBeenCalledWith('cafe', {
            seenIntroductions: ['action:world-stamp:cafe'],
        });
    });

    it('persists a completed world practice in place when route-local save is available', async () => {
        let current: HTMLElement | undefined;
        const shell = {
            screen: document.createElement('main'),
            replace(view: HTMLElement) { current = view; },
            setLanguage() {}, setNavigation() {}, setLearnerActionsVisible() {}, setClassBoardAccess() {},
            setPresentationMode() {}, setMuted() {}, announce() {}, dispose() {},
        } satisfies AcademyShell;
        const save = vi.fn(async () => undefined);
        const go = vi.fn(async () => undefined);
        const flow = createWorldFlow({
            evidence: {} as never,
            pronunciation: {} as never,
            audio: {} as never,
        });

        await flow.render('cafe', {
            language: 'en',
            checkpoint: {
                schemaVersion: 2,
                route: 'cafe',
                routeHistory: [{ route: 'campus' }],
                presentationMode: 'course',
                selectedFork: 'speaking',
                updatedAt: 1,
            },
            projection: projectLearnerRecord([]),
            shell,
            go,
            back: vi.fn(async () => undefined),
            save,
        });

        const mounted = current!;
        mounted.querySelector<HTMLButtonElement>('[data-cafe-primary-action="listen"]')?.click();
        worldChoiceButtonByLabel(
            mounted.querySelector('[data-world-practice="cafe-coffee-price"]')!,
            '三百円',
        )?.click();

        expect(save).toHaveBeenCalledWith({
            seenIntroductions: ['action:world-stamp:cafe'],
        });
        expect(go).not.toHaveBeenCalled();
        expect(current).toBe(mounted);
        expect(mounted.querySelector<HTMLElement>('[data-world-practice="cafe-coffee-price"]')
            ?.dataset.practiceComplete).toBe('true');
        expect(mounted.textContent).toContain('You heard that the coffee costs 300 yen.');
    });

    it('records Street route replay evidence with its taught-source provenance', async () => {
        let current: HTMLElement | undefined;
        const shell = {
            screen: document.createElement('main'),
            replace(view: HTMLElement) { current = view; },
            setLanguage() {}, setNavigation() {}, setLearnerActionsVisible() {}, setClassBoardAccess() {},
            setPresentationMode() {}, setMuted() {}, announce() {}, dispose() {},
        } satisfies AcademyShell;
        const recordWorldPractice = vi.fn(async () => undefined);
        const go = vi.fn(async () => undefined);
        const flow = createWorldFlow({
            evidence: { recordWorldPractice } as never,
            pronunciation: {} as never,
            audio: {} as never,
        });
        const context = {
            language: 'en' as const,
            checkpoint: {
                schemaVersion: 2 as const,
                route: 'street' as const,
                routeHistory: [{ route: 'campus' as const }],
                presentationMode: 'course' as const,
                selectedFork: 'speaking' as const,
                updatedAt: 1,
            },
            projection: projectLearnerRecord([]),
            shell,
            go,
            back: vi.fn(async () => undefined),
        };

        await flow.render('street', context);
        vi.useFakeTimers();
        try {
            worldChoiceButtonByLabel(current!.querySelector('[data-world-practice="street-cafe-direction"]')!, 'まっすぐ行って、右です。')?.click();
            // The route re-render is deliberately held open briefly so the just-written
            // success confirmation survives long enough to paint (see world-flow.ts).
            await vi.advanceTimersByTimeAsync(1200);
        } finally {
            vi.useRealTimers();
        }

        expect(recordWorldPractice).toHaveBeenCalledWith(expect.objectContaining({
            attempt: expect.objectContaining({
                activityId: 'activity:world:street-cafe-direction',
                sourceQuestionId: 'activity:aakash-rainy-directions',
            }),
            reviewSeeds: [expect.objectContaining({
                id: 'review:world:street:cafe-direction',
                sourceQuestionId: 'activity:aakash-rainy-directions',
            })],
        }));
        expect(go).toHaveBeenCalledWith('street', {
            seenIntroductions: ['action:world-stamp:street'],
        });
    });

    it('persists the konbini welcome without adding a route-history frame', async () => {
        let current: HTMLElement | undefined;
        const shell = {
            screen: document.createElement('main'),
            replace(view: HTMLElement) { current = view; },
            setLanguage() {}, setNavigation() {}, setLearnerActionsVisible() {}, setClassBoardAccess() {},
            setPresentationMode() {}, setMuted() {}, announce() {}, dispose() {},
        } satisfies AcademyShell;
        const go = vi.fn(async () => undefined);
        const save = vi.fn(async () => undefined);
        const flow = createWorldFlow({ evidence: {} as never, pronunciation: {} as never, audio: {} as never });
        const context = {
            language: 'en' as const,
            checkpoint: {
                schemaVersion: 2 as const,
                route: 'konbini' as const,
                routeHistory: [{ route: 'street' as const }],
                presentationMode: 'course' as const,
                selectedFork: 'speaking' as const,
                updatedAt: 1,
            },
            projection: projectLearnerRecord([]),
            shell,
            go,
            save,
            back: vi.fn(async () => undefined),
        };

        await flow.render('konbini', context);
        current?.querySelector<HTMLButtonElement>('.academy-world-arrival-continue')?.click();
        expect(save).toHaveBeenCalledWith({ seenIntroductions: ['place:konbini'] });
        expect(go).not.toHaveBeenCalled();
        expect(context.checkpoint.routeHistory).toEqual([{ route: 'street' }]);
    });
});
