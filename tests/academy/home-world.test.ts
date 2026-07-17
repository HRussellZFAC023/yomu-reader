import { ACADEMY_ASSETS, ACADEMY_PLATE_RESPONSIVE_PRESENTATION } from '../../src/academy/assets';
import { markWorldVisit, projectWorldPlace, type WorldProgress } from '../../src/academy/domain/world-locations';
import { renderWorldPlaceScreen } from '../../src/academy/ui/world-screen';

const HOME_PROGRESS: WorldProgress = {
    completedScenes: [],
    completedEncounterIds: [],
    metCharacterIds: ['aakash'],
    worldVisits: { home: 0 },
};

describe('Academy Home world', () => {
    it('uses the authorized responsive Home plate and an ungraded first-visit reflection', () => {
        const onIntroductionComplete = vi.fn();
        const screen = renderWorldPlaceScreen({
            language: 'en',
            place: 'home',
            route: 'home',
            progress: HOME_PROGRESS,
            onTravel: vi.fn(),
            onActivity: vi.fn(),
            onClaimStamp: vi.fn(),
            onIntroductionComplete,
            onBack: vi.fn(),
            random: () => 0,
        });

        expect(projectWorldPlace('home', HOME_PROGRESS).scene).toBe('home');
        expect(screen.dataset.plate).toBe('home');
        expect(screen.querySelector<HTMLImageElement>('.academy-background img')?.getAttribute('src'))
            .toBe(ACADEMY_ASSETS.locations.home.wide);
        expect(screen.querySelector<HTMLSourceElement>('.academy-background source')?.getAttribute('srcset'))
            .toBe(ACADEMY_ASSETS.locations.home.mobile);
        expect(screen.querySelector<HTMLElement>('.academy-background')?.dataset.mobilePresentation).toBe('art-directed-crop');
        expect(ACADEMY_PLATE_RESPONSIVE_PRESENTATION.home?.mobile?.objectPosition).toBe('62% center');

        const dialogue = screen.querySelector<HTMLElement>('[data-world-arrival-dialogue="place:home"]')!;
        expect(dialogue.dataset.homeDialogueStep).toBe('reflection');
        expect(dialogue.textContent).toContain('What kind of day have you had');
        expect(dialogue.querySelectorAll('[data-home-reflection]')).toHaveLength(3);
        expect(screen.querySelector<HTMLElement>('[data-purpose-surface="journal-desk"]')?.hidden).toBe(true);

        dialogue.querySelector<HTMLButtonElement>('[data-home-reflection="still-arriving"]')?.click();
        expect(dialogue.dataset.homeReflection).toBe('still-arriving');
        expect(dialogue.dataset.homeDialogueStep).toBe('welcome');
        expect(dialogue.textContent).toContain('A routine is allowed to be small');
        dialogue.querySelector<HTMLButtonElement>('.academy-home-arrival-continue')?.click();

        expect(onIntroductionComplete).toHaveBeenCalledWith('place:home');
        expect(screen.dataset.homeReflection).toBe('still-arriving');
        expect(screen.dataset.firstVisit).toBe('false');
        expect(dialogue.hidden).toBe(true);
        expect(screen.querySelector<HTMLElement>('[data-purpose-surface="journal-desk"]')?.hidden).toBe(false);
    });

    it('offers one living-paper routine gesture with grounded replay and review evidence', async () => {
        const onListen = vi.fn(async () => true);
        const onPaperTurn = vi.fn();
        const onPracticeComplete = vi.fn();
        const onActivity = vi.fn();
        const screen = renderWorldPlaceScreen({
            language: 'en',
            place: 'home',
            route: 'home',
            progress: { ...HOME_PROGRESS, seenIntroductions: ['place:home'] },
            onTravel: vi.fn(),
            onActivity,
            onClaimStamp: vi.fn(),
            onListen,
            onPaperTurn,
            onPracticeComplete,
            random: () => 0,
        });
        const purpose = screen.querySelector<HTMLElement>('[data-purpose-surface="journal-desk"]')!;
        const notebook = purpose.querySelector<HTMLElement>('[data-home-practice="living-paper-routine"]')!;

        expect(notebook.dataset.homeSource).toBe(
            'japanese-genki-interactive:cfe95821ca45cc8f5c4225bfa555f967fcf5875f6fd2cd8b41f9ce99a5e2a83f:workbook-5:item-4',
        );
        expect(notebook.textContent).toContain('Genki I · Lesson 3 · Workbook 5 · item 4');
        expect(notebook.textContent).toContain('メアリーさんはたいてい六時ごろ家に帰ります。');
        expect(notebook.textContent).toContain('Mary usually returns home at about six.');
        expect(purpose.querySelectorAll('.academy-card, .academy-panel, details')).toHaveLength(0);
        expect(purpose.querySelectorAll('[data-home-practice]')).toHaveLength(1);

        purpose.querySelector<HTMLButtonElement>('[data-world-listen]')?.click();
        await Promise.resolve();
        expect(onListen).toHaveBeenCalledWith('メアリーさんはたいてい六時ごろ家に帰ります。');

        for (const token of ['mary', 'usually', 'six', 'home', 'return']) {
            notebook.querySelector<HTMLButtonElement>(`[data-world-token="${token}"]`)?.click();
        }
        expect(onPracticeComplete).toHaveBeenCalledWith(
            'home-usually-return',
            'action:world-stamp:home',
            expect.objectContaining({
                attempt: expect.objectContaining({
                    responseKind: 'world-token-order',
                    sourceQuestionId: expect.stringContaining('workbook-5:item-4'),
                }),
                reviewSeeds: [expect.objectContaining({ id: 'review:world:home:usually-return' })],
            }),
        );

        notebook.querySelector<HTMLButtonElement>('.academy-home-lift-strips')?.click();
        expect(notebook.dataset.homeReplayCount).toBe('1');
        expect(onPaperTurn).toHaveBeenCalledTimes(1);
        expect(onPracticeComplete).toHaveBeenCalledTimes(1);
        expect(notebook.querySelector<HTMLButtonElement>('[data-world-token]:not(:disabled)')).not.toBeNull();

        notebook.querySelector<HTMLButtonElement>('[data-activity-route="journal"]')?.click();
        expect(onActivity).toHaveBeenCalledWith('journal');
    });

    it('rotates to a second exact routine on return and preserves exits and Back', () => {
        const onTravel = vi.fn();
        const onBack = vi.fn();
        const progress = {
            ...HOME_PROGRESS,
            seenIntroductions: ['place:home'],
            worldVisits: markWorldVisit(HOME_PROGRESS.worldVisits, 'home'),
        };
        const projection = projectWorldPlace('home', progress);
        const screen = renderWorldPlaceScreen({
            language: 'en', place: 'home', route: 'home', progress,
            onTravel, onActivity: vi.fn(), onClaimStamp: vi.fn(), onBack, random: () => 0,
        });

        expect(projection.practice).toMatchObject({
            id: 'home-usually-sleep',
            source: { primary: { relation: 'exact-task', sourceId: expect.stringContaining('workbook-5:item-5') } },
            review: { id: 'review:world:home:usually-sleep' },
        });
        expect(screen.querySelector('[data-world-practice="home-usually-sleep"]')).not.toBeNull();
        expect(screen.querySelectorAll('[data-exit-slot]')).toHaveLength(2);
        screen.querySelector<HTMLButtonElement>('[data-exit-slot="0"]')?.click();
        screen.querySelector<HTMLButtonElement>('.academy-world-back')?.click();
        expect(onTravel).toHaveBeenCalledWith('street');
        expect(onBack).toHaveBeenCalledTimes(1);
    });
});
