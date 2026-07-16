import fs from 'node:fs';
import path from 'node:path';
import { renderWorldPlaceScreen } from '../../src/academy/ui/world-screen';

const progress = {
    completedScenes: [],
    completedEncounterIds: [],
    metCharacterIds: ['sophie'],
};

afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

describe('Bookshop world', () => {
    it('turns a first visit into a grounded catalogue search and availability question', async () => {
        const onIntroductionComplete = vi.fn();
        const onPracticeComplete = vi.fn();
        const onListen = vi.fn(async () => true);
        const screen = renderWorldPlaceScreen({
            language: 'en', place: 'bookshop', route: 'world', progress,
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(),
            onIntroductionComplete, onPracticeComplete, onListen,
        });
        document.body.append(screen);

        expect(screen.dataset.plate).toBe('bookshop');
        expect(screen.querySelector<HTMLImageElement>('.academy-background img')?.src).toContain('bookshop__rain-evening-shelves--wide.webp');

        const arrival = screen.querySelector<HTMLButtonElement>('.academy-world-arrival-continue')!;
        expect(arrival.parentElement?.textContent).toContain('Are you looking for a dictionary?');
        arrival.click();
        expect(onIntroductionComplete).toHaveBeenCalledWith('place:bookshop');

        const catalogue = screen.querySelector<HTMLElement>('[data-bookshop-catalogue]')!;
        const search = catalogue.querySelector<HTMLInputElement>('input[type="search"]')!;
        expect(catalogue.dataset.bookshopPhase).toBe('browse');
        expect(catalogue.querySelector('.academy-bookshop-catalogue-results')?.hasAttribute('role')).toBe(false);
        expect(catalogue.querySelector('[data-catalogue-entry]')?.hasAttribute('role')).toBe(false);
        search.value = 'じしょ';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        expect(catalogue.querySelector<HTMLButtonElement>('[data-catalogue-entry="dictionary"]')?.hidden).toBe(false);
        expect(catalogue.querySelector<HTMLButtonElement>('[data-catalogue-entry="novel"]')?.hidden).toBe(true);

        catalogue.querySelector<HTMLButtonElement>('[data-catalogue-entry="dictionary"]')?.click();
        expect(catalogue.dataset.bookshopPhase).toBe('ask');
        const listen = catalogue.querySelector<HTMLButtonElement>('[data-bookshop-listen]')!;
        listen.click();
        await Promise.resolve();
        expect(onListen).toHaveBeenCalledWith('じしょが ありますか。');
        catalogue.querySelector<HTMLButtonElement>('[data-choice-id="correct"]')?.click();
        expect(onPracticeComplete).toHaveBeenCalledWith(
            'bookshop-dictionary-available',
            'action:world-stamp:bookshop',
            expect.objectContaining({
                attempt: expect.objectContaining({ sourceQuestionId: 'moodle:6097314:f7854a77:p2:q2:1' }),
                reviewSeeds: [expect.objectContaining({ id: 'review:world:bookshop:dictionary-available' })],
            }),
        );
        const reading = catalogue.querySelector<HTMLElement>('[data-bookshop-reading]')!;
        expect(reading.hidden).toBe(false);
        expect(reading.dataset.sourceId).toContain('mega-pack:');
        expect(reading.textContent).toContain('ばさま 川へ せんたくに いったと');
        reading.querySelector<HTMLButtonElement>('[data-reading-choice="old-woman"]')?.click();
        expect(reading.dataset.readingComplete).toBe('true');
    });

    it('changes the catalogue outcome and Sophie’s recovered presence on return', async () => {
        const first = renderWorldPlaceScreen({
            language: 'en', place: 'bookshop', route: 'world', progress,
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(),
        });
        const returning = renderWorldPlaceScreen({
            language: 'en', place: 'bookshop', route: 'world',
            progress: { ...progress, worldVisits: { bookshop: 1 }, seenIntroductions: ['place:bookshop'] },
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(),
        });

        expect(first.querySelector<HTMLElement>('[data-world-character="sophie"]')?.dataset.presence).toBe('cataloguing');
        expect(first.querySelector('[data-world-character="sophie"] img')).toBeNull();
        expect(first.querySelector('[data-world-character="sophie"] .academy-world-character-silhouette')).not.toBeNull();
        expect(returning.querySelector<HTMLElement>('[data-world-character="sophie"]')?.dataset.presence).toBe('reshelving');
        expect(returning.querySelector('[data-world-character="sophie"] img')).toBeNull();
        expect(returning.querySelector('[data-exit-slot="0"]')?.textContent).toContain('Review the words you found in the library.');
        expect(returning.querySelector('[data-exit-slot="1"]')?.textContent).toContain('Take the book back out to the street.');
        const catalogue = returning.querySelector<HTMLElement>('[data-bookshop-catalogue]')!;
        expect(catalogue.dataset.bookshopCatalogue).toBe('bookshop-small-change-available');
        expect(catalogue.dataset.bookshopOutcome).toBe('small-change');
        catalogue.querySelector<HTMLButtonElement>('[data-catalogue-entry="small-change"]')?.click();
        catalogue.querySelector<HTMLButtonElement>('[data-bookshop-listen]')?.click();
        await Promise.resolve();
        catalogue.querySelector<HTMLButtonElement>('[data-choice-id="correct"]')?.click();
        expect(catalogue.querySelector<HTMLElement>('[data-bookshop-question]')?.dataset.practiceComplete).toBe('true');
        const reading = catalogue.querySelector<HTMLElement>('[data-bookshop-reading]')!;
        expect(reading.textContent).toContain('川から 大きな もも');
    });

    it('uses Sophie’s current painterly cutout and translucent living paper without duplicate chrome', () => {
        const styles = fs.readFileSync(path.resolve('src/academy/styles/bookshop-world.css'), 'utf8');
        const sophie = path.resolve('public/academy/art/characters/sophie/sophie__bookshop-neutral__halfbody__v003.png');
        expect(styles).toContain("data-current-place='bookshop'");
        expect(styles).toMatch(/academy-world-action-dock[\s\S]*background:\s*transparent/);
        expect(styles).toContain("url('/academy/art/characters/sophie/sophie__bookshop-neutral__halfbody__v003.png')");
        expect(styles).toMatch(/academy-world-arrival-dialogue[\s\S]*rgba\(251, 244, 218, 0\.78\) !important/);
        expect(styles).toMatch(/academy-world-hud::before[\s\S]*display:\s*none/);
        expect(styles).toMatch(/academy-world-back[\s\S]*position:\s*fixed/);
        expect(styles).toMatch(/academy-world-back[\s\S]*right:\s*max\(20px/);
        expect(styles).toMatch(/academy-world-back[\s\S]*min-height:\s*44px/);
        expect(styles).toMatch(/academy-world-map-current\s*\{\s*display:\s*none/);
        expect(styles).toMatch(/academy-world-reward[\s\S]*top:\s*max\(86px/);
        expect(fs.statSync(sophie).size).toBeGreaterThan(1_000_000);
        const sprite = fs.readFileSync(sophie);
        expect(sprite.subarray(1, 4).toString('ascii')).toBe('PNG');
        expect(sprite[25]).toBe(6); // PNG colour type 6: RGBA, not a baked rectangular portrait.
        const inventory = JSON.parse(fs.readFileSync(
            path.resolve('public/academy/art/CLASSMATE-SPRITE-INVENTORY.json'),
            'utf8',
        )) as {
            characters: Array<{ id: string; currentAssets: Array<{ path: string }> }>;
            migrations: Array<{ character: string; status: string }>;
        };
        expect(inventory.characters.find(character => character.id === 'sophie')?.currentAssets)
            .toEqual(expect.arrayContaining([
                expect.objectContaining({ path: expect.stringContaining('sophie__bookshop-neutral__halfbody__v003.png') }),
            ]));
        expect(inventory.migrations.find(migration => migration.character === 'sophie')?.status)
            .toBe('deprecated-file-removed-after-zero-runtime-reference-scan');
        expect(fs.existsSync(path.resolve(
            'public/academy/art/characters/sophie/sophie__neutral__halfbody__v002.png',
        ))).toBe(false);
    });

    it('keeps Bookshop responsive and quiet under reduced motion', () => {
        const styles = fs.readFileSync(path.resolve('src/academy/styles/bookshop-world.css'), 'utf8');
        expect(styles).toMatch(/@media \(max-width: 760px\)[\s\S]*max-height:\s*42svh/);
        expect(styles).toMatch(/@media \(max-width: 760px\)[\s\S]*academy-world-back[\s\S]*left:\s*max\(10px/);
        expect(styles).toMatch(/@media \(max-width: 760px\)[\s\S]*academy-world-map-current[\s\S]*display:\s*none/);
        expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none !important/);
    });

    it('ships dedicated wide and mobile bookshop plates', () => {
        const wide = path.resolve('public/academy/art/locations/wide/bookshop__rain-evening-shelves--wide.webp');
        const mobile = path.resolve('public/academy/art/locations/mobile/bookshop__rain-evening-shelves--mobile.webp');
        expect(fs.statSync(wide).size).toBeGreaterThan(100_000);
        expect(fs.statSync(mobile).size).toBeGreaterThan(60_000);
    });
});
