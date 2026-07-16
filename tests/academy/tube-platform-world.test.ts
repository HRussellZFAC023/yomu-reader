import fs from 'node:fs';
import path from 'node:path';
import { projectWorldPlace } from '../../src/academy/domain/world-locations';
import { renderWorldPlaceScreen } from '../../src/academy/ui/world-screen';

const FIRST_VISIT = {
    completedScenes: [],
    completedEncounterIds: [],
    metCharacterIds: ['aakash'],
    seenIntroductions: [],
    worldVisits: { 'station-platform': 0 },
} as const;

afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

describe('Academy Tube platform world', () => {
    it('projects permitted Moodle material with bounded Minna and Genki support across replay visits', () => {
        const first = projectWorldPlace('station-platform', FIRST_VISIT);
        const replay = projectWorldPlace('station-platform', {
            ...FIRST_VISIT,
            worldVisits: { 'station-platform': 1 },
        });

        expect(first.practice).toMatchObject({
            id: 'tube-platform-usual-thirty',
            audioLine: 'いつも ちかてつで ３０ぷん だけ です。',
            correctChoiceId: 'tube-30',
            source: {
                primary: {
                    corpus: 'moodle',
                    relation: 'source-sequenced-adaptation',
                    sourceId: expect.stringContaining('short-dialogues-2:item-1'),
                },
                supports: [
                    expect.objectContaining({ corpus: 'minna', relation: 'sequence-only' }),
                    expect.objectContaining({ corpus: 'genki', relation: 'sequence-only' }),
                ],
            },
        });
        expect(replay.practice).toMatchObject({
            id: 'tube-platform-usual-fifteen',
            audioLine: 'いつも ちかてつで １５ぷん だけ です。',
            correctChoiceId: 'tube-15',
            source: { primary: { sourceId: expect.stringContaining('short-dialogues-2:item-2') } },
        });
    });

    it('stages a consent-safe first visit before revealing one auditory route task', async () => {
        const onIntroductionComplete = vi.fn();
        const onListen = vi.fn(async () => true);
        const onPracticeComplete = vi.fn();
        const screen = renderWorldPlaceScreen({
            language: 'en', place: 'station-platform', route: 'world', progress: FIRST_VISIT,
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(),
            onIntroductionComplete, onListen, onPracticeComplete,
        });
        document.body.append(screen);

        const arrival = screen.querySelector<HTMLElement>('[data-world-arrival-dialogue="place:station-platform"]')!;
        const purpose = screen.querySelector<HTMLElement>('.academy-tube-route-board')!;
        const aakash = screen.querySelector<HTMLElement>('[data-world-character="aakash"]')!;
        expect(arrival.textContent).toContain('usual Tube journey');
        expect(purpose.hidden).toBe(true);
        expect(aakash.dataset.presence).toBe('waiting-by-platform-map');
        expect(aakash.querySelector('.academy-world-character-silhouette')).not.toBeNull();
        expect(aakash.querySelector('img')).toBeNull();
        expect(screen.querySelectorAll('[data-tube-primary-action]')).toHaveLength(1);
        expect(screen.querySelector('.academy-world-curriculum')).toBeNull();
        expect(screen.querySelector('[data-world-stamp]')).toBeNull();

        arrival.querySelector<HTMLButtonElement>('.academy-world-arrival-continue')!.click();
        expect(onIntroductionComplete).toHaveBeenCalledWith('place:station-platform');
        expect(purpose.hidden).toBe(false);
        expect(purpose.dataset.tubeMusicTheme).toBe('challenge.major');
        expect(purpose.dataset.tubeSignalCue).toBe('radio.tune');
        expect(purpose.dataset.sourceCorpus).toBe('moodle');

        const listen = purpose.querySelector<HTMLButtonElement>('[data-tube-primary-action="listen"]')!;
        listen.click();
        await Promise.resolve();
        expect(onListen).toHaveBeenCalledWith('いつも ちかてつで ３０ぷん だけ です。');
        expect(listen.dataset.tubePrimaryAction).toBe('replay');
        expect(purpose.querySelector<HTMLElement>('.academy-tube-transcript')?.hidden).toBe(false);
        expect(purpose.querySelector<HTMLElement>('.academy-tube-route-options')?.hidden).toBe(false);

        purpose.querySelector<HTMLButtonElement>('[data-choice-id="bus-2h"]')!.click();
        expect(purpose.querySelector('[role="status"]')?.textContent).toContain('usual route');
        purpose.querySelector<HTMLButtonElement>('[data-choice-id="tube-30"]')!.click();
        expect(onPracticeComplete).toHaveBeenCalledOnce();
        expect(onPracticeComplete).toHaveBeenCalledWith(
            'tube-platform-usual-thirty',
            'action:world-stamp:station-platform',
            expect.objectContaining({ attempt: expect.objectContaining({ sourceQuestionId: 'l1-l21/ex-l21-a46-strike-example' }) }),
        );
    });

    it('keeps exits, Back, sound, labels, and replay state operable', () => {
        const onTravel = vi.fn();
        const onBack = vi.fn();
        const onToggleAudio = vi.fn(() => true);
        const screen = renderWorldPlaceScreen({
            language: 'en', place: 'station-platform', route: 'world',
            progress: { ...FIRST_VISIT, seenIntroductions: ['place:station-platform'], worldVisits: { 'station-platform': 1 } },
            onTravel, onActivity: vi.fn(), onClaimStamp: vi.fn(), onBack, onToggleAudio,
        });
        document.body.append(screen);

        const purpose = screen.querySelector<HTMLElement>('.academy-tube-route-board')!;
        expect(purpose.dataset.tubeReplay).toBe('true');
        expect(purpose.textContent).toContain('Return replay');
        expect(screen.querySelectorAll('[data-exit-slot]')).toHaveLength(2);
        screen.querySelector<HTMLButtonElement>('[data-location="station"]')!.click();
        expect(onTravel).toHaveBeenCalledWith('station');
        screen.querySelector<HTMLButtonElement>('.academy-world-back')!.click();
        expect(onBack).toHaveBeenCalledOnce();
        screen.querySelector<HTMLButtonElement>('[data-world-object="tube-platform-signal"]')!.click();
        expect(onToggleAudio).toHaveBeenCalledOnce();

        const namedControls = [...screen.querySelectorAll<HTMLButtonElement>('button')].every(button => (
            Boolean(button.getAttribute('aria-label') || button.textContent?.trim())
        ));
        expect(namedControls).toBe(true);
        expect(purpose.getAttribute('aria-label')).toBe('Tube route announcement');
        expect(purpose.querySelector('[role="group"][aria-label="Choose the route you heard"]')).not.toBeNull();
        expect(purpose.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull();
    });

    it('owns full-bleed phone and reduced-motion treatments without generic card geometry', () => {
        const styles = fs.readFileSync(path.resolve('src/academy/styles/tube-platform-world.css'), 'utf8');
        expect(styles).toContain("data-current-place='station-platform'");
        expect(styles).toMatch(/height:\s*100dvh/);
        expect(styles).toMatch(/@media \(max-width: 760px\)[\s\S]*height:\s*calc\(66px \+ env\(safe-area-inset-bottom\)\)/);
        expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none !important/);
        expect(styles).toContain(".academy-world-living-scene");
        expect(styles).toContain('border-radius: 0');
        expect(styles).not.toContain('linear-gradient(to right, #5b6ee1, #8a5cf5)');
    });
});
