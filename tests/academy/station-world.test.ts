import { themeForRoute } from '../../src/academy/routing/contract';
import { renderWorldPlaceScreen } from '../../src/academy/ui/world-screen';

const PROGRESS = {
    completedScenes: [],
    completedEncounterIds: [],
    metCharacterIds: ['aakash'],
    seenIntroductions: ['place:station'],
    worldVisits: { station: 1 },
} as const;

afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

describe('Station world presentation', () => {
    it('presents one departure-board action with phase, character, ticket, music, exits, and Back', () => {
        const onBack = vi.fn();
        const onTravel = vi.fn();
        const onToggleAudio = vi.fn(() => true);
        const screen = renderWorldPlaceScreen({
            language: 'en', place: 'station', route: 'station', progress: PROGRESS,
            onTravel, onActivity: vi.fn(), onClaimStamp: vi.fn(), onBack, onToggleAudio,
        });

        expect(screen.querySelector('picture source')?.getAttribute('media')).toBe('(max-width: 700px)');
        expect(screen.querySelector('.academy-world-phase')?.textContent).toMatch(/Day 1/);
        expect(screen.querySelectorAll('[data-station-primary-action]')).toHaveLength(1);
        expect(screen.querySelector('[data-station-primary-action]')?.textContent).toBe('Listen to announcement');
        expect(screen.querySelector('[data-world-character="aakash"]')).not.toBeNull();
        expect(screen.querySelector('[data-world-character="aakash"] .academy-world-character-silhouette')).not.toBeNull();
        expect(screen.querySelector('[data-item-asset-id="item.station-ticket"] img')).not.toBeNull();
        expect(screen.querySelectorAll('[data-exit-slot]')).toHaveLength(4);
        expect(themeForRoute('station')).toBe('world.station');

        const ambience = screen.querySelector<HTMLButtonElement>('[data-world-object="station-platform-sound"]')!;
        expect(ambience.getAttribute('aria-pressed')).toBe('true');
        ambience.click();
        expect(onToggleAudio).toHaveBeenCalledOnce();

        screen.querySelector<HTMLButtonElement>('.academy-world-back')?.click();
        expect(onBack).toHaveBeenCalledOnce();
        screen.querySelector<HTMLButtonElement>('[data-location="street"]')?.click();
        expect(onTravel).toHaveBeenCalledWith('street');
    });

    it('turns Listen into replay without adding a second primary action', async () => {
        const onListen = vi.fn(async () => true);
        const screen = renderWorldPlaceScreen({
            language: 'en', place: 'station', route: 'station', progress: PROGRESS,
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(), onListen,
        });
        const practice = screen.querySelector<HTMLElement>('[data-world-practice]')!;
        const board = screen.querySelector<HTMLElement>('.academy-world-station-board')!;
        const action = screen.querySelector<HTMLButtonElement>('[data-station-primary-action]')!;

        action.click();
        await Promise.resolve();
        expect(board.dataset.listeningStarted).toBe('true');
        expect(board.dataset.listeningState).toBe('replay');
        expect(action.dataset.stationPrimaryAction).toBe('replay');
        expect(action.textContent).toBe('Replay announcement');
        expect(screen.querySelectorAll('[data-station-primary-action]')).toHaveLength(1);
        expect(practice.querySelector<HTMLElement>('.academy-world-transcript')?.hidden).toBe(false);
        expect(practice.querySelector<HTMLElement>('.academy-world-practice-options')?.hidden).toBe(false);

        action.click();
        await Promise.resolve();
        expect(onListen).toHaveBeenCalledTimes(2);
    });

    it('keeps the announcement semantics named and records completion once', async () => {
        const onPracticeComplete = vi.fn();
        const screen = renderWorldPlaceScreen({
            language: 'en', place: 'station', route: 'station', progress: PROGRESS,
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(), onPracticeComplete,
        });
        document.body.append(screen);
        const board = screen.querySelector<HTMLElement>('.academy-world-station-board')!;
        expect(board.getAttribute('aria-label')).toBe('Station announcement');
        expect(board.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull();
        expect(board.querySelector('[role="group"][aria-label="Choose an answer"]')).not.toBeNull();
        board.querySelector<HTMLButtonElement>('[data-station-primary-action]')?.click();
        await Promise.resolve();

        const correct = board.querySelector<HTMLButtonElement>('[data-choice-id="konbini"]')!;
        correct.click();
        correct.click();
        expect(onPracticeComplete).toHaveBeenCalledTimes(1);
        expect(onPracticeComplete).toHaveBeenCalledWith(
            'station-counter-location',
            'action:world-stamp:station',
            expect.objectContaining({
                attempt: expect.objectContaining({ responseKind: 'world-listening-choice', outcome: 'pass' }),
            }),
        );

        const controls = [...board.querySelectorAll<HTMLButtonElement>('button')];
        expect(controls.every(button => Boolean(button.getAttribute('aria-label') || button.textContent?.trim()))).toBe(true);
    });
});
