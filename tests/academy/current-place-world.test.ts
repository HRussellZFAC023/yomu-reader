import fs from 'node:fs';
import path from 'node:path';
import { ACADEMY_ASSETS } from '../../src/academy/assets';
import { canRenderAcademyCastPortrait } from '../../src/academy/domain/cast-registry';
import {
    displayWorldPersonName,
    markWorldVisit,
    projectWorldPlace,
    WORLD_PLACE_IDS,
    WORLD_TIME_PHASE_LABELS,
    worldRegions,
    worldLocationIntroduction,
    worldStamp,
    worldTimePhase,
    worldTimePhaseLabel,
    type WorldPlaceId,
} from '../../src/academy/domain/world-locations';
import { renderWorldPlaceScreen } from '../../src/academy/ui/world-screen';
import { worldChoiceButton, worldChoiceButtonByLabel } from './helpers/world-choice';

const ALL_PLACES: readonly WorldPlaceId[] = [
    'courtyard', 'classroom', 'library', 'cafe', 'lab', 'street', 'station', 'konbini', 'ramen', 'japan-centre', 'home', 'park', 'station-platform',
];

const MATURE_PLACES = ALL_PLACES;

const PROGRESS = {
    completedScenes: ['scene:arrival'],
    completedEncounterIds: ['encounter:arrival'],
    metCharacterIds: ['rie', 'aakash', 'felix', 'peter', 'sophie', 'nanako'],
    worldVisits: { courtyard: 1, classroom: 1 },
} as const;

afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

describe('Academy current-place world', () => {
    it('uses Japanese-first labels, scene plates, occupants, activities, and exits for every place', () => {
        expect(ALL_PLACES.map(place => projectWorldPlace(place, PROGRESS).label.ja)).toEqual([
            '中庭', '教室', '図書館', 'カフェ', '語学ラボ', '通り', '駅', 'コンビニ', 'ラーメン屋', 'ジャパンセンター', '家', '公園', '地下鉄ホーム',
        ]);
        ALL_PLACES.forEach(place => {
            const projection = projectWorldPlace(place, PROGRESS);
            expect(projection.scene).toBeTruthy();
            expect(projection.activity.label.ja).toBeTruthy();
            expect(projection.exits.length).toBeGreaterThan(0);
        });
        (['street', 'station', 'konbini', 'ramen', 'japan-centre', 'park', 'station-platform'] as const).forEach(place => {
            const projection = projectWorldPlace(place, PROGRESS);
            expect(projection.availability.state).toBe('open');
            expect(projection.people.length).toBeGreaterThan(0);
            expect(projection.practice).toBeDefined();
        });

        const onActivity = vi.fn();
        const screen = renderWorldPlaceScreen({
            language: 'en',
            place: 'courtyard',
            route: 'campus',
            progress: PROGRESS,
            onTravel: vi.fn(),
            onActivity,
            onClaimStamp: vi.fn(),
        });

        expect(screen.dataset.academyRoute).toBe('campus');
        expect(screen.dataset.currentPlace).toBe('courtyard');
        expect(screen.querySelector('.academy-world-title')?.textContent).toBe('中庭');
        expect(screen.querySelector('.academy-world-phase')?.textContent).toMatch(/Day 1.*Lunch break/);
        expect(screen.querySelector('.academy-background img')).not.toBeNull();
        expect(screen.querySelector('[data-world-character="aakash"] .academy-world-character-name')?.textContent).toBe('Aakash-san');
        expect(screen.querySelector('[data-world-character="aakash"] .academy-world-character-silhouette')).not.toBeNull();
        expect(screen.querySelector('.academy-world-action-dock')).not.toBeNull();
        expect(screen.querySelectorAll('.academy-world-action-dock').length).toBe(1);
        expect(screen.querySelector<HTMLElement>('.academy-world-action-dock')?.dataset.worldActivity).toBe('moodle:class-journal');
        expect(screen.querySelector<HTMLElement>('.academy-world-action-dock')?.dataset.primaryPerson).toBe('rie');
        expect(screen.querySelector<HTMLElement>('.academy-world-action-dock')?.dataset.hasPractice).toBe('true');
        expect(screen.querySelector('.academy-world-action-speaker')?.textContent).toBe('Rie-sensei');
        const personAction = screen.querySelector<HTMLButtonElement>('[data-world-person-action="rie"]')!;
        expect(personAction.getAttribute('aria-controls')).toBe('academy-world-purpose-courtyard');
        expect(personAction.getAttribute('aria-label')).toBe('Talk to Rie-sensei');
        personAction.click();
        expect(onActivity).not.toHaveBeenCalled();
        expect(screen.querySelector('.academy-world-spatial-exits')).not.toBeNull();
        const map = screen.querySelector<HTMLElement>('[data-world-map]')!;
        expect(map.dataset.worldMap).toBe('courtyard');
        expect(map.querySelector('[data-world-map-current="courtyard"]')?.textContent).toBe('中庭');
        expect(map.querySelectorAll('[data-exit-slot]')).toHaveLength(6);
        expect(screen.querySelector('[data-location="classroom"]')?.getAttribute('data-direction')).toBe('west');
        expect(screen.querySelector<HTMLButtonElement>('[data-world-stamp]')?.dataset.rewardProp).toBe('notebook');
        expect(screen.querySelector('[data-world-stamp]')?.textContent).toContain('Earn it by completing today’s activity.');
        expect(screen.querySelector('[data-location="lab"]')?.textContent).toContain('語学ラボ');
        expect(screen.querySelector<HTMLButtonElement>('[data-location="lab"]')?.disabled).toBe(false);
    });

    it('uses complete verb-first route purposes instead of clipping activity detail', () => {
        const english = renderWorldPlaceScreen({
            language: 'en', place: 'courtyard', route: 'campus', progress: PROGRESS,
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(),
        });
        const japanese = renderWorldPlaceScreen({
            language: 'ja', place: 'courtyard', route: 'campus', progress: PROGRESS,
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(),
        });

        const englishPurposes = [...english.querySelectorAll('.academy-world-exit-reason')];
        expect(english.querySelector('[data-location="classroom"] .academy-world-exit-reason')?.textContent)
            .toBe('Read the board and enter class');
        expect(english.querySelector('[data-location="library"] .academy-world-exit-reason')?.textContent)
            .toBe('Find a book on the shelves');
        expect(english.textContent).not.toContain('Open the current lesson plan, syllabus, and practice path.');
        expect(englishPurposes.every(node => node.classList.contains('academy-primary-purpose'))).toBe(true);
        expect(englishPurposes.every(node => !node.textContent?.includes('...') && !node.textContent?.includes('…'))).toBe(true);
        expect(japanese.querySelector('[data-location="classroom"] .academy-world-exit-reason')?.textContent)
            .toBe('黒板の授業予定を見る');
    });

    it('keeps place names and time tags Japanese-first, natural, and localized', () => {
        expect(projectWorldPlace('street', PROGRESS).label).toEqual({ ja: '通り', en: 'Street' });
        expect(projectWorldPlace('station-platform', PROGRESS).label).toEqual({ ja: '地下鉄ホーム', en: 'Tube platform' });
        WORLD_PLACE_IDS.forEach(place => {
            const label = projectWorldPlace(place, PROGRESS).label;
            expect(label.ja.trim()).not.toBe('');
            expect(label.en.trim()).not.toBe('');
            expect(label.ja).not.toMatch(/[A-Za-z]/);
            expect(label.en).not.toMatch(/\b(now|current location|unknown)\b/i);
        });

        expect(WORLD_TIME_PHASE_LABELS).toEqual({
            morning: { ja: '朝', en: 'Morning' },
            lunch: { ja: '昼休み', en: 'Lunch break' },
            'after-class': { ja: '放課後', en: 'After class' },
            evening: { ja: '夕方', en: 'Early evening' },
            night: { ja: '夜', en: 'Night' },
        });
        (Object.keys(WORLD_TIME_PHASE_LABELS) as Array<keyof typeof WORLD_TIME_PHASE_LABELS>).forEach((phase, visits) => {
            const progress = { completedScenes: [], completedEncounterIds: [], worldVisits: { street: visits } };
            expect(worldTimePhase(progress, 'street')).toBe(phase);
            expect(worldTimePhaseLabel(phase)).toBe(WORLD_TIME_PHASE_LABELS[phase]);
            expect(projectWorldPlace('street', progress).moment).toEqual({
                ja: `春・1日目・${WORLD_TIME_PHASE_LABELS[phase].ja}`,
                en: `Spring · Day 1 · ${WORLD_TIME_PHASE_LABELS[phase].en}`,
            });
        });
    });

    it('uses the recovered no-likeness plates for open ramen, park, and station-platform activities', () => {
        expect(projectWorldPlace('ramen', PROGRESS).scene).toBe('ramen');
        expect(projectWorldPlace('park', PROGRESS).scene).toBe('park');
        expect(projectWorldPlace('station-platform', PROGRESS).scene).toBe('stationPlatform');
        expect(projectWorldPlace('japan-centre', PROGRESS).scene).toBe('japanCentre');
        expect(ACADEMY_ASSETS.locations.ramen).toEqual({
            wide: '/academy/art/locations/wide/ramen__evening-steam--wide.webp',
            mobile: '/academy/art/locations/mobile/ramen__evening-steam--mobile.webp',
        });
        expect(ACADEMY_ASSETS.locations.park).toEqual({
            wide: '/academy/art/locations/wide/park__day-overcast--wide.webp',
            mobile: '/academy/art/locations/mobile/park__day-overcast--mobile.webp',
        });
        expect(ACADEMY_ASSETS.locations.stationPlatform).toEqual({
            wide: '/academy/art/locations/wide/tube-platform__blue-hour-rain--wide.webp',
            mobile: '/academy/art/locations/mobile/tube-platform__blue-hour-rain--mobile.webp',
        });
        expect(ACADEMY_ASSETS.locations.japanCentre).toEqual({
            wide: '/academy/art/locations/wide/japan-centre__rain-evening-gifts--wide.png',
            mobile: '/academy/art/locations/mobile/japan-centre__rain-evening-gifts--mobile.png',
        });
        expect(ACADEMY_ASSETS.locations.japanCentre).not.toEqual(ACADEMY_ASSETS.locations.konbini);
    });

    it('uses the reusable classmate honorific policy without changing canonical names', () => {
        expect(displayWorldPersonName('aakash', 'en')).toBe('Aakash-san');
        expect(displayWorldPersonName('felix', 'ja')).toBe('Felix-san');
        expect(displayWorldPersonName('rie', 'ja')).toBe('りえ先生');
    });

    it.each([
        ['station', 'item.station-ticket', ACADEMY_ASSETS.items.stationTicket, 'locked'],
        ['konbini', 'item.konbini-shopping-list', ACADEMY_ASSETS.items.konbiniShoppingList, 'locked'],
        ['ramen', 'item.ramen-quantity-board', ACADEMY_ASSETS.items.ramenQuantityBoard, 'locked'],
        ['japan-centre', 'item.japan-centre-omiyage-tag', ACADEMY_ASSETS.items.japanCentreOmiyageTag, 'locked'],
        ['classroom', 'item.classroom-belongings', ACADEMY_ASSETS.items.classroomBelongings, 'locked'],
        ['library', 'item.library-photo-album', ACADEMY_ASSETS.items.libraryPhotoAlbum, 'locked'],
        ['street', 'item.street-direction-map', ACADEMY_ASSETS.items.streetDirectionMap, 'locked'],
    ] as const)('mounts the recovered %s item as a local reward prop', (place, assetId, assetPath, itemState) => {
        const projection = projectWorldPlace(place, PROGRESS);
        const screen = renderWorldPlaceScreen({
            language: 'en', place, route: place, progress: PROGRESS,
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(),
        });

        expect(projection.stamp.art).toBe(assetPath);
        expect(projection.stamp.itemAssetId).toBe(assetId);
        const reward = screen.querySelector<HTMLButtonElement>('[data-world-stamp]')!;
        expect(reward.dataset.itemAssetId).toBe(assetId);
        expect(reward.dataset.itemPresentation).toBe('world-reward-prop');
        expect(reward.dataset.itemState).toBe(itemState);
        const rewardArt = reward.querySelector<HTMLImageElement>('.academy-world-reward-prop img');
        expect(rewardArt?.src).toContain(assetPath);
        expect(rewardArt?.alt).toBe('');
        expect(rewardArt?.loading).toBe('eager');
    });

    it('rotates open-place occupants and time phase deterministically from story day and visits', () => {
        const first = projectWorldPlace('classroom', PROGRESS);
        const laterProgress = { ...PROGRESS, worldVisits: markWorldVisit(PROGRESS.worldVisits, 'classroom') };
        const later = projectWorldPlace('classroom', laterProgress);

        expect(first.moment.ja).toBe('春・1日目・昼休み');
        expect(later.moment.ja).toBe('春・1日目・放課後');
        expect(later.people).not.toEqual(first.people);
        expect(projectWorldPlace('classroom', laterProgress)).toEqual(later);

        const firstStationPractice = projectWorldPlace('station', PROGRESS).practice;
        const laterStationPractice = projectWorldPlace('station', {
            ...PROGRESS,
            worldVisits: markWorldVisit(PROGRESS.worldVisits, 'station'),
        }).practice;
        const thirdStationPractice = projectWorldPlace('station', {
            ...PROGRESS,
            worldVisits: markWorldVisit(markWorldVisit(PROGRESS.worldVisits, 'station'), 'station'),
        }).practice;
        expect(laterStationPractice?.id).not.toBe(firstStationPractice?.id);
        expect(thirdStationPractice?.id).not.toBe(firstStationPractice?.id);
        expect(thirdStationPractice?.id).not.toBe(laterStationPractice?.id);
        expect(projectWorldPlace('station', {
            ...PROGRESS,
            worldVisits: markWorldVisit(PROGRESS.worldVisits, 'station'),
        }).practice).toEqual(laterStationPractice);
    });

    it('gives Library and Cafe rotating local practice while Cafe keeps ordering as its sole primary action', () => {
        const library = projectWorldPlace('library', PROGRESS);
        const returningLibrary = projectWorldPlace('library', {
            ...PROGRESS,
            worldVisits: markWorldVisit(PROGRESS.worldVisits, 'library'),
        });
        const cafe = projectWorldPlace('cafe', PROGRESS);
        const returningCafe = projectWorldPlace('cafe', {
            ...PROGRESS,
            worldVisits: markWorldVisit(PROGRESS.worldVisits, 'cafe'),
        });

        expect(library.practice?.id).toBe('library-dictionary-location');
        expect(returningLibrary.practice?.id).toBe('library-bookshop-location');
        expect(cafe.practice?.id).toBe('cafe-coffee-price');
        expect(returningCafe.practice?.id).toBe('cafe-coffee-counter');

        const onActivity = vi.fn();
        const onPracticeComplete = vi.fn();
        const screen = renderWorldPlaceScreen({
            language: 'en', place: 'library', route: 'world', progress: PROGRESS,
            onTravel: vi.fn(), onActivity, onClaimStamp: vi.fn(), onPracticeComplete,
        });

        screen.querySelector<HTMLButtonElement>('[data-activity-route="review"]')?.click();
        expect(onActivity).toHaveBeenCalledWith('review');
        worldChoiceButtonByLabel(screen.querySelector('[data-world-practice="library-dictionary-location"]')!, '図書館')?.click();
        expect(onPracticeComplete).toHaveBeenCalledWith(
            'library-dictionary-location',
            'action:world-stamp:library',
            expect.objectContaining({
                attempt: expect.objectContaining({ activityId: 'activity:world:library-dictionary-location', outcome: 'pass' }),
                reviewSeeds: [expect.objectContaining({ id: 'review:world:library:dictionary-location', reason: 'new-learning' })],
            }),
        );

        const cafeScreen = renderWorldPlaceScreen({
            language: 'en', place: 'cafe', route: 'cafe', progress: PROGRESS,
            onTravel: vi.fn(), onActivity, onClaimStamp: vi.fn(), onPracticeComplete,
        });
        expect(cafeScreen.querySelector('[data-activity-route="aakash-meet"]')).toBeNull();
        expect(onActivity).toHaveBeenCalledTimes(1);
        cafeScreen.querySelector<HTMLButtonElement>('[data-cafe-primary-action="listen"]')?.click();
        worldChoiceButtonByLabel(cafeScreen.querySelector('[data-world-practice="cafe-coffee-price"]')!, '三百円')?.click();
        expect(onPracticeComplete).toHaveBeenLastCalledWith(
            'cafe-coffee-price',
            'action:world-stamp:cafe',
            expect.objectContaining({
                reviewSeeds: [expect.objectContaining({ content: expect.objectContaining({ expression: 'コーヒーは三百円です。' }) })],
            }),
        );
    });

    it('mounts one progressive station listening action in the full-scene platform', () => {
        const screen = renderWorldPlaceScreen({
            language: 'en',
            place: 'station',
            route: 'station',
            progress: PROGRESS,
            onTravel: vi.fn(),
            onActivity: vi.fn(),
            onClaimStamp: vi.fn(),
        });

        expect(projectWorldPlace('station', PROGRESS).people).toEqual(['aakash']);
        expect(screen.querySelector('.academy-world-station-foreground')).toBeNull();
        expect(screen.querySelector('.academy-world-station-ticket-gate')).toBeNull();
        expect(screen.querySelector('.academy-world-station-board [data-world-practice]')).not.toBeNull();
        expect(screen.querySelector('.academy-world-station-board')?.getAttribute('aria-label')).toBe('Station announcement');
        expect(screen.querySelector('.academy-world-station-task-kicker')?.textContent).toBe("Today's mission");
        expect(screen.querySelector('.academy-world-station-task-number')?.textContent).toBe('01');
        expect(screen.querySelector('.academy-world-station-board-label')?.textContent).toBe('Station-front notice');
        expect(screen.querySelector('.academy-world-station-board .academy-world-section-title')?.textContent)
            .toBe('Listen to station notices');
        expect(screen.querySelector('.academy-world-station-board .academy-world-activity-detail')?.textContent)
            .toBe('Listen for what is in front of, inside, or far from the station.');
        expect(screen.querySelector<HTMLDivElement>('.academy-world-station-board .academy-world-practice-options')?.hidden).toBe(true);
        expect(screen.querySelector<HTMLParagraphElement>('.academy-world-station-board .academy-world-practice-prompt')?.hidden).toBe(true);
        screen.querySelector<HTMLButtonElement>('.academy-world-station-board [data-world-listen]')?.click();
        expect(screen.querySelector('.academy-world-station-board')?.getAttribute('data-listening-started')).toBe('true');
        expect(screen.querySelector<HTMLDivElement>('.academy-world-station-board .academy-world-practice-options')?.hidden).toBe(false);
        expect(screen.querySelectorAll('.academy-world-exit[data-exit-slot]').length).toBeGreaterThanOrEqual(4);
        expect(screen.querySelector('.academy-world-station-route-heading')?.textContent).toBe('Where next?');
        expect(screen.querySelector('[data-world-map-current="station"]')?.textContent).toBe('駅');
        expect(screen.querySelectorAll('.academy-world-map-routes .academy-world-exit-reason')).toHaveLength(4);
        expect(screen.querySelector('[data-world-stamp]')?.getAttribute('data-reward-prop')).toBe('ticket');
        expect(screen.querySelector('.academy-world-reward-prop img')?.getAttribute('src'))
            .toBe(ACADEMY_ASSETS.items.stationTicket);
        expect(screen.querySelector<HTMLElement>('[data-world-stamp]')?.dataset.itemState).toBe('locked');
        expect(screen.dataset.plate).toBe('station');
        expect(screen.querySelector<HTMLImageElement>('.academy-background img')?.src).toContain('railway-station__day-commute--wide.webp');
    });

    it('marks an earned item prop as claimed without turning it into a new visual asset', () => {
        const screen = renderWorldPlaceScreen({
            language: 'en', place: 'ramen', route: 'ramen',
            progress: { ...PROGRESS, seenIntroductions: ['action:world-stamp:ramen'] },
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(),
        });
        const reward = screen.querySelector<HTMLButtonElement>('[data-world-stamp]')!;

        expect(reward.dataset.itemAssetId).toBe('item.ramen-quantity-board');
        expect(reward.dataset.itemState).toBe('claimed');
        expect(reward.disabled).toBe(true);
    });

    it('keeps a practice-backed item prop locked until its local replay has been completed', () => {
        const onClaimStamp = vi.fn();
        const screen = renderWorldPlaceScreen({
            language: 'en', place: 'classroom', route: 'classroom', progress: PROGRESS,
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp,
        });
        const reward = screen.querySelector<HTMLButtonElement>('[data-world-stamp]')!;

        expect(reward.dataset.itemState).toBe('locked');
        expect(reward.disabled).toBe(true);
        reward.click();
        expect(reward.dataset.itemState).toBe('locked');
        expect(onClaimStamp).not.toHaveBeenCalled();
        expect(reward.querySelector('img')?.getAttribute('src')).toBe(ACADEMY_ASSETS.items.classroomBelongings);
    });

    it('keeps item-prop animation, touch sizing, and reduced-motion fallback scoped to approved rewards', () => {
        const styles = fs.readFileSync(path.resolve('src/academy/styles/world.css'), 'utf8');
        const itemStyles = styles.slice(styles.lastIndexOf('Final item-prop cascade'));

        expect(itemStyles).toContain("data-item-presentation='world-reward-prop'");
        expect(itemStyles).toContain("data-item-state='locked'");
        expect(itemStyles).toContain("data-item-state='claiming'");
        expect(itemStyles).toContain("data-item-state='claimed'");
        expect(itemStyles).toContain('@keyframes academy-world-item-settle');
        expect(itemStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*width:\s*42px/);
        expect(itemStyles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none/);
    });

    it('authors every mature place as a unique living-paper scene with local purpose and ambience', () => {
        const motifs = new Set<string>();
        const purposeSurfaces = new Set<string>();

        MATURE_PLACES.forEach(place => {
            const projection = projectWorldPlace(place, PROGRESS);
            expect(projection.composition?.motif).toBe(place);
            expect(projection.composition?.landmarks).toHaveLength(3);
            expect(projection.objects?.some(object => object.kind === 'audio')).toBe(true);
            expect(projection.people.length).toBeGreaterThan(0);

            const screen = renderWorldPlaceScreen({
                language: 'en', place, route: 'world', progress: PROGRESS,
                onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(), onToggleAudio: vi.fn(() => false),
            });
            expect(screen.dataset.sceneMotif).toBe(place);
            expect(screen.querySelector<HTMLElement>('[data-scene-composition]')?.dataset.sceneComposition).toBe(place);
            expect(screen.querySelectorAll('[data-landmark]')).toHaveLength(3);
            expect(screen.querySelector('[data-scene-composition]')?.getAttribute('aria-hidden')).toBe('true');
            expect(screen.querySelector<HTMLElement>('[data-purpose-surface]')?.dataset.purposeSurface)
                .toBe(projection.composition?.purposeSurface);
            expect(screen.querySelector('[data-world-object]')).not.toBeNull();
            expect(screen.querySelectorAll('[data-exit-slot]').length).toBeGreaterThan(0);
            expect(screen.querySelector('[data-world-character]')).not.toBeNull();

            motifs.add(projection.composition!.motif);
            purposeSurfaces.add(projection.composition!.purposeSurface);
        });

        expect(motifs.size).toBe(MATURE_PLACES.length);
        expect(purposeSurfaces.size).toBe(MATURE_PLACES.length);
        expect(projectWorldPlace('home', PROGRESS).scene).toBe('home');
    });

    it('stages home as a responsive late-night journal call with a desk-key incentive', () => {
        const projection = projectWorldPlace('home', PROGRESS);
        const screen = renderWorldPlaceScreen({
            language: 'en', place: 'home', route: 'home', progress: PROGRESS,
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(),
        });

        expect(projection).toMatchObject({
            scene: 'home',
            people: ['aakash'],
            composition: { motif: 'home', purposeSurface: 'journal-desk' },
            activity: { route: 'journal', curriculum: { id: 'moodle:journal-replay' } },
            stamp: { prop: 'key' },
        });
        expect(screen.querySelector('[data-scene-composition="home"]')).not.toBeNull();
        expect(screen.querySelector('[data-world-character="aakash"]')?.getAttribute('data-presence')).toBe('remote-journal-call');
        expect(screen.querySelector('.academy-world-character-presence')?.textContent).toBe('Aakash-san · Calling from his own desk');
        expect(screen.querySelector('[data-world-person-action="aakash"]')?.getAttribute('aria-controls'))
            .toBe('academy-world-purpose-home');
        expect(screen.querySelector<HTMLElement>('[data-world-activity]')?.dataset.worldActivity)
            .toBe('moodle:journal-replay');
        expect(screen.querySelector('[data-world-object="home-radio"]')).not.toBeNull();
        expect(screen.querySelector<HTMLElement>('[data-world-stamp]')?.dataset.rewardProp).toBe('key');
        expect(screen.querySelectorAll('[data-exit-slot]')).toHaveLength(2);

        const styles = fs.readFileSync(path.resolve('src/academy/styles/world.css'), 'utf8');
        const homeStyles = styles.slice(styles.indexOf('Stream 2 home'));
        expect(homeStyles).toContain("data-current-place='home'");
        expect(homeStyles).toContain("data-landmark='rainy-rooftops'");
        expect(homeStyles).toContain("data-landmark='desk-lamp'");
        expect(homeStyles).toContain("data-landmark='tied-journal'");
        expect(homeStyles).toMatch(/@keyframes academy-home-(room-in|thread-draw|call-in|ledger-in|key-in)/);
        expect(homeStyles).toContain('--home-paper: rgba(226, 218, 196, 0.78)');
        expect(homeStyles).toContain('rgba(220, 210, 186, 0.78)');
        expect(homeStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*height:\s*100svh[\s\S]*academy-world-spatial-exits[\s\S]*flex-wrap:\s*nowrap/s);
        expect(homeStyles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*data-current-place='home'[\s\S]*animation:\s*none !important/s);
        const visualQaStyles = styles.slice(styles.indexOf('Visual QA correction'));
        expect(visualQaStyles).toContain("data-current-place='home'] .academy-world-character-presence");
        expect(visualQaStyles).toMatch(/academy-world-character-presence \{[\s\S]*top:\s*-4%[\s\S]*left:\s*4%/);
        expect(visualQaStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*academy-world-character-presence \{[\s\S]*top:\s*-5%[\s\S]*left:\s*-6%/);
    });

    it('replays source-grounded Home journal routines in-world without treating Aakash as co-present', () => {
        const onActivity = vi.fn();
        const onPracticeComplete = vi.fn();
        const homeProgress = { ...PROGRESS, seenIntroductions: ['place:home'] };
        const first = projectWorldPlace('home', homeProgress);
        const returning = projectWorldPlace('home', {
            ...homeProgress,
            worldVisits: markWorldVisit(homeProgress.worldVisits, 'home'),
        });
        expect(first.practice?.id).toBe('home-usually-return');
        expect(first.practice?.review?.sourceQuestionId).toBe(
            'japanese-genki-interactive:cfe95821ca45cc8f5c4225bfa555f967fcf5875f6fd2cd8b41f9ce99a5e2a83f:workbook-5:item-4',
        );
        expect(returning.practice?.id).toBe('home-usually-sleep');
        expect(returning.practice?.review?.sourceQuestionId).toBe(
            'japanese-genki-interactive:cfe95821ca45cc8f5c4225bfa555f967fcf5875f6fd2cd8b41f9ce99a5e2a83f:workbook-5:item-5',
        );

        const screen = renderWorldPlaceScreen({
            language: 'en', place: 'home', route: 'home', progress: homeProgress,
            onTravel: vi.fn(), onActivity, onClaimStamp: vi.fn(), onPracticeComplete,
        });
        const purpose = screen.querySelector<HTMLElement>('[data-purpose-surface="journal-desk"]')!;
        const practice = purpose.querySelector<HTMLElement>('[data-world-practice="home-usually-return"]')!;
        expect(practice.dataset.homePractice).toBe('living-paper-routine');
        expect(practice.dataset.worldInteraction).toBe('token-order');
        expect(screen.querySelector('[data-world-character="aakash"]')?.getAttribute('data-presence')).toBe('remote-journal-call');
        expect(screen.querySelector('[data-world-character="aakash"] .academy-world-character-presence')?.textContent)
            .toContain('from his own desk');
        purpose.querySelector<HTMLButtonElement>('[data-activity-route="journal"]')?.click();
        expect(onActivity).toHaveBeenCalledWith('journal');

        ['mary', 'usually', 'six', 'home', 'return'].forEach(token => {
            practice.querySelector<HTMLButtonElement>(`[data-world-token="${token}"]`)?.click();
        });
        expect(onPracticeComplete).toHaveBeenCalledWith(
            'home-usually-return',
            'action:world-stamp:home',
            expect.objectContaining({
                attempt: expect.objectContaining({
                    responseKind: 'world-token-order',
                    sourceQuestionId: 'japanese-genki-interactive:cfe95821ca45cc8f5c4225bfa555f967fcf5875f6fd2cd8b41f9ce99a5e2a83f:workbook-5:item-4',
                }),
                reviewSeeds: [expect.objectContaining({ id: 'review:world:home:usually-return' })],
            }),
        );

        const returnScreen = renderWorldPlaceScreen({
            language: 'en', place: 'home', route: 'home',
            progress: { ...homeProgress, worldVisits: { home: 1 } },
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(),
        });
        expect(returnScreen.querySelector('[data-world-practice]')?.getAttribute('data-world-practice')).toBe('home-usually-sleep');
        expect(returnScreen.querySelector('[data-world-character="aakash"]')?.getAttribute('data-presence')).toBe('remote-voice-note');
    });

    it('replays Courtyard noticeboard instructions as rotating source-grounded word-order tasks', () => {
        const projection = projectWorldPlace('courtyard', PROGRESS);
        const onPracticeComplete = vi.fn();
        const screen = renderWorldPlaceScreen({
            language: 'en', place: 'courtyard', route: 'campus', progress: PROGRESS,
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(), onPracticeComplete,
        });

        expect(projection).toMatchObject({
            scene: 'entrance',
            people: ['rie', 'aakash'],
            composition: { motif: 'courtyard', purposeSurface: 'noticeboard' },
            activity: { route: 'journal', curriculum: { id: 'moodle:class-journal' } },
            stamp: { prop: 'notebook' },
        });
        expect(screen.querySelectorAll('[data-scene-composition="courtyard"] [data-landmark]')).toHaveLength(3);
        expect(screen.querySelector('[data-landmark="cherry-canopy"]')).not.toBeNull();
        expect(screen.querySelector('[data-landmark="garden-path"]')).not.toBeNull();
        expect(screen.querySelector('[data-landmark="notice-post"]')).not.toBeNull();
        expect(screen.querySelector('[data-world-character="rie"]')).not.toBeNull();
        expect(screen.querySelector('[data-world-character="aakash"]')).not.toBeNull();
        expect(screen.querySelector('[data-purpose-surface="noticeboard"]')).not.toBeNull();
        expect(screen.querySelector<HTMLElement>('[data-world-activity]')?.dataset.worldActivity)
            .toBe('moodle:class-journal');
        expect(screen.querySelector<HTMLElement>('[data-world-stamp]')?.dataset.rewardProp).toBe('notebook');
        expect(screen.querySelector('[data-world-object="courtyard-bell"]')).not.toBeNull();
        expect(screen.querySelectorAll('[data-exit-slot]')).toHaveLength(6);
        const purpose = screen.querySelector<HTMLElement>('[data-purpose-surface="noticeboard"]')!;
        const practice = screen.querySelector<HTMLElement>('[data-courtyard-practice="noticeboard-order"]')!;
        const practiceToggle = screen.querySelector<HTMLButtonElement>('.academy-courtyard-practice-toggle')!;
        const journalAction = screen.querySelector<HTMLButtonElement>('[data-activity-route="journal"]')!;
        expect(purpose.dataset.courtyardMode).toBe('journal');
        expect(practice.hidden).toBe(true);
        expect(practiceToggle.getAttribute('aria-controls')).toBe(practice.id);
        expect(practiceToggle.getAttribute('aria-expanded')).toBe('false');
        expect(journalAction.textContent).toBe('Open journal');
        practiceToggle.click();
        expect(purpose.dataset.courtyardMode).toBe('practice');
        expect(practice.hidden).toBe(false);
        expect(practiceToggle.hidden).toBe(true);
        expect(journalAction.hidden).toBe(true);
        expect(practice.dataset.worldPractice).toBe('courtyard-notice-write');
        expect(practice.dataset.worldInteraction).toBe('token-order');
        expect(screen.querySelector<HTMLElement>('[data-world-character="rie"]')?.dataset.presence).toBe('filing-board-notes');
        expect(screen.querySelector<HTMLElement>('[data-world-character="aakash"]')?.dataset.presence).toBe('checking-own-route');
        practice.querySelector<HTMLButtonElement>('[data-world-token="write"]')?.click();
        practice.querySelector<HTMLButtonElement>('[data-world-token="please"]')?.click();
        expect(onPracticeComplete).toHaveBeenCalledWith(
            'courtyard-notice-write',
            'action:world-stamp:courtyard',
            expect.objectContaining({
                attempt: expect.objectContaining({
                    responseKind: 'world-token-order',
                    sourceQuestionId: 'source-question:classroom-phrase-07',
                }),
                reviewSeeds: [expect.objectContaining({ id: 'review:world:courtyard:notice-write' })],
            }),
        );
        const composingEscape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
        Object.defineProperty(composingEscape, 'isComposing', { value: true });
        practice.dispatchEvent(composingEscape);
        expect(purpose.dataset.courtyardMode).toBe('practice');
        expect(practice.hidden).toBe(false);
        practice.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(purpose.dataset.courtyardMode).toBe('journal');
        expect(practice.hidden).toBe(true);
        expect(practiceToggle.hidden).toBe(false);
        expect(journalAction.hidden).toBe(false);
        const returning = projectWorldPlace('courtyard', {
            ...PROGRESS,
            worldVisits: { courtyard: 2 },
        });
        expect(returning.practice?.id).toBe('courtyard-notice-look');

        const styles = fs.readFileSync(path.resolve('src/academy/styles/world.css'), 'utf8');
        const courtyardStyles = styles.slice(styles.indexOf('Stream 2 courtyard'));
        expect(courtyardStyles).toContain("data-current-place='courtyard'");
        expect(courtyardStyles).toContain("data-landmark='cherry-canopy'");
        expect(courtyardStyles).toContain("data-landmark='garden-path'");
        expect(courtyardStyles).toContain("data-landmark='notice-post'");
        expect(courtyardStyles).toMatch(/--courtyard-route-rail:\s*calc\(min\(154px, 15vw\) \+ 44px\)/);
        expect(courtyardStyles).toMatch(/data-landmark='notice-post'[\s\S]*right:\s*var\(--courtyard-route-rail\)/);
        expect(courtyardStyles).toMatch(/data-purpose-surface='noticeboard'[\s\S]*right:\s*var\(--courtyard-route-rail\)/);
        expect(courtyardStyles).toMatch(/@keyframes academy-courtyard-(gate-in|notice-in|rie-in|aakash-in|journal-in|notebook-in)/);
        expect(courtyardStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*height:\s*100svh[\s\S]*data-landmark='notice-post'[\s\S]*right:\s*-8%[\s\S]*academy-world-spatial-exits[\s\S]*flex-wrap:\s*nowrap/s);
        expect(courtyardStyles).toMatch(/academy-world-spatial-exits[\s\S]*scroll-snap-type:\s*none/s);
        expect(courtyardStyles).toMatch(/academy-world-map-routes \.academy-world-exit[\s\S]*scroll-margin-inline:\s*8px/s);
        expect(courtyardStyles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*data-current-place='courtyard'[\s\S]*animation:\s*none !important/s);
    });

    it('replays Classroom board listening checks with rotating source-grounded outcomes', () => {
        const projection = projectWorldPlace('classroom', PROGRESS);
        const onActivity = vi.fn();
        const onTravel = vi.fn();
        const onPracticeComplete = vi.fn();
        const screen = renderWorldPlaceScreen({
            language: 'en', place: 'classroom', route: 'classroom', progress: PROGRESS,
            onTravel, onActivity, onClaimStamp: vi.fn(), onPracticeComplete,
        });

        expect(projection).toMatchObject({
            scene: 'classroom',
            composition: { motif: 'classroom', purposeSurface: 'blackboard' },
            activity: { route: 'class', curriculum: { id: 'moodle:class-path' } },
            stamp: { prop: 'notebook' },
        });
        expect(new Set(projection.people)).toEqual(new Set(['rie', 'aakash', 'felix']));
        expect(screen.dataset.academyRoute).toBe('classroom');
        expect(screen.dataset.currentPlace).toBe('classroom');
        expect(screen.querySelectorAll('[data-scene-composition="classroom"] [data-landmark]')).toHaveLength(3);
        expect(screen.querySelector('[data-world-character="rie"] .academy-sprite')).not.toBeNull();
        ['aakash', 'felix'].forEach(id => {
            expect(screen.querySelector(`[data-world-character="${id}"] .academy-world-character-silhouette`)).not.toBeNull();
        });

        const leadPerson = projection.people[0]!;
        const personAction = screen.querySelector<HTMLButtonElement>(`[data-world-person-action="${leadPerson}"]`)!;
        expect(personAction.getAttribute('aria-controls')).toBe('academy-world-purpose-classroom');
        const purpose = screen.querySelector<HTMLElement>('[data-purpose-surface="blackboard"]')!;
        expect(purpose.dataset.worldActivity).toBe('moodle:class-path');
        expect(purpose.querySelector('[data-activity-route="class"]')).not.toBeNull();
        const practice = purpose.querySelector<HTMLElement>('[data-classroom-practice="board-listen-check"]')!;
        expect(practice.dataset.worldPractice).toBe('classroom-board-confirmation');
        expect(practice.dataset.worldInteraction).toBeUndefined();
        expect(screen.querySelector<HTMLElement>('[data-world-character="rie"]')?.dataset.presence).toBe('erasing-board-corner');
        expect(screen.querySelector<HTMLElement>('[data-world-character="aakash"]')?.dataset.presence).toBe('packing-own-notes');
        expect(screen.querySelector<HTMLElement>('[data-world-character="felix"]')?.dataset.presence).toBe('checking-own-example');
        worldChoiceButtonByLabel(practice, 'あってます。')?.click();
        expect(onPracticeComplete).toHaveBeenCalledWith(
            'classroom-board-confirmation',
            'action:world-stamp:classroom',
            expect.objectContaining({
                attempt: expect.objectContaining({
                    responseKind: 'world-listening-choice',
                    sourceQuestionId: 'source-question:classroom-phrase-11',
                }),
                reviewSeeds: [expect.objectContaining({ id: 'review:world:classroom:board-confirmation' })],
            }),
        );
        expect(projectWorldPlace('classroom', {
            ...PROGRESS,
            worldVisits: { classroom: 2 },
        }).practice?.id).toBe('classroom-board-understanding');
        expect(screen.querySelector('[data-world-object="classroom-rain"]')).not.toBeNull();
        const stamp = screen.querySelector<HTMLButtonElement>('[data-world-stamp]')!;
        expect(stamp.dataset.rewardProp).toBe('notebook');
        expect(stamp.disabled).toBe(true);
        expect(screen.querySelectorAll('[data-exit-slot]')).toHaveLength(4);

        personAction.click();
        expect(onActivity).not.toHaveBeenCalled();
        purpose.querySelector<HTMLButtonElement>('[data-activity-route="class"]')?.click();
        expect(onActivity).toHaveBeenCalledWith('class');
        screen.querySelector<HTMLButtonElement>('[data-location="library"]')?.click();
        expect(onTravel).toHaveBeenCalledWith('library');

        const styles = fs.readFileSync(path.resolve('src/academy/styles/world.css'), 'utf8');
        const classroomStyles = styles.slice(styles.indexOf('Stream 2 classroom'));
        expect(classroomStyles).toContain("data-current-place='classroom'");
        expect(classroomStyles).toContain("data-landmark='rain-window'");
        expect(classroomStyles).toContain("data-landmark='chalk-notes'");
        expect(classroomStyles).toContain("data-landmark='front-desks'");
        expect(classroomStyles).toMatch(/@keyframes academy-classroom-(room-in|chalk-in|desks-in|left-in|right-in|center-in|briefing-in|note-in)/);
        expect(classroomStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*height:\s*100svh[\s\S]*academy-world-spatial-exits[\s\S]*flex-wrap:\s*nowrap/s);
        expect(classroomStyles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*data-current-place='classroom'[\s\S]*animation:\s*none !important/s);
    });

    it('stages the library as an occupied full-scene review folio with four useful exits', () => {
        const projection = projectWorldPlace('library', PROGRESS);
        const onActivity = vi.fn();
        const onTravel = vi.fn();
        const screen = renderWorldPlaceScreen({
            language: 'en', place: 'library', route: 'library', progress: PROGRESS,
            onTravel, onActivity, onClaimStamp: vi.fn(),
        });

        expect(projection).toMatchObject({
            scene: 'library',
            composition: { motif: 'library', purposeSurface: 'reading-desk' },
            activity: { route: 'review', curriculum: { id: 'moodle:spaced-review', state: 'grounded' } },
        });
        expect(new Set(projection.people)).toEqual(new Set(['rie', 'sophie']));
        expect(screen.querySelector<HTMLSourceElement>('.academy-background source')?.srcset)
            .toContain('library__rain-evening--mobile.webp');
        expect(screen.querySelector<HTMLImageElement>('.academy-background img')?.src)
            .toContain('library__rain-evening--wide.webp');
        expect(screen.querySelector('[data-world-character="rie"] .academy-sprite')).not.toBeNull();
        expect(screen.querySelector('[data-world-character="sophie"] .academy-sprite')).not.toBeNull();
        ['book-stacks', 'green-lamps', 'open-book'].forEach(landmark => {
            expect(screen.querySelector(`[data-scene-composition="library"] [data-landmark="${landmark}"]`)).not.toBeNull();
        });

        const purpose = screen.querySelector<HTMLElement>('[data-purpose-surface="reading-desk"]')!;
        const start = purpose.querySelector<HTMLButtonElement>('[data-activity-route="review"]')!;
        expect(purpose.dataset.worldActivity).toBe('moodle:spaced-review');
        expect(purpose.querySelectorAll('[data-activity-route]')).toHaveLength(1);
        expect(purpose.querySelector('[data-world-practice="library-dictionary-location"]')).not.toBeNull();
        start.click();
        expect(onActivity).toHaveBeenCalledOnce();
        expect(onActivity).toHaveBeenCalledWith('review');

        expect(screen.querySelector('[data-world-object="library-rain"]')).not.toBeNull();
        expect(screen.querySelectorAll('[data-exit-slot]')).toHaveLength(4);
        screen.querySelector<HTMLButtonElement>('[data-location="courtyard"]')?.click();
        expect(onTravel).toHaveBeenCalledWith('courtyard');

        const styles = fs.readFileSync(path.resolve('src/academy/styles/world.css'), 'utf8');
        const libraryStyles = styles.slice(styles.indexOf('Stream 2 library'));
        expect(libraryStyles).toContain("data-current-place='library'");
        expect(libraryStyles).toContain("data-purpose-surface='reading-desk'");
        expect(libraryStyles).toContain("data-landmark='book-stacks'");
        expect(libraryStyles).toContain("data-landmark='green-lamps'");
        expect(libraryStyles).toContain("data-landmark='open-book'");
        expect(libraryStyles).toMatch(/@keyframes academy-library-(room-in|stacks-in|lamp-breathe|rie-in|sophie-in|folio-in|index-in)/);
        expect(libraryStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*height:\s*100svh[\s\S]*academy-world-spatial-exits[\s\S]*flex-wrap:\s*nowrap/s);
        expect(libraryStyles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*data-current-place='library'[\s\S]*animation:\s*none !important[\s\S]*transition:\s*none !important/s);
    });

    it('stages the cafe as a two-classmate listening room with one order action and a working radio', () => {
        const projection = projectWorldPlace('cafe', PROGRESS);
        const onActivity = vi.fn();
        const onToggleAudio = vi.fn(() => true);
        const screen = renderWorldPlaceScreen({
            language: 'en', place: 'cafe', route: 'cafe', progress: PROGRESS,
            onTravel: vi.fn(), onActivity, onClaimStamp: vi.fn(), onToggleAudio,
        });

        expect(projection).toMatchObject({
            scene: 'cafe',
            composition: { motif: 'cafe', purposeSurface: 'cafe-menu' },
            activity: { route: 'aakash-meet', curriculum: { id: 'story:aakash-meet', state: 'grounded' } },
            stamp: { prop: 'receipt' },
        });
        expect(new Set(projection.people)).toEqual(new Set(['aakash', 'felix']));
        ['rain-glass', 'counter-lamp', 'coffee-table'].forEach(landmark => {
            expect(screen.querySelector(`[data-scene-composition="cafe"] [data-landmark="${landmark}"]`)).not.toBeNull();
        });
        expect(screen.querySelector('[data-world-character="aakash"] .academy-world-character-silhouette')).not.toBeNull();
        expect(screen.querySelector('[data-world-character="felix"] .academy-world-character-silhouette')).not.toBeNull();

        const purpose = screen.querySelector<HTMLElement>('[data-purpose-surface="cafe-menu"]')!;
        expect(purpose.dataset.worldActivity).toBe('story:aakash-meet');
        expect(purpose.querySelectorAll('[data-activity-route]')).toHaveLength(0);
        expect(purpose.querySelectorAll('[data-cafe-primary-action="listen"]')).toHaveLength(1);
        expect(purpose.querySelector('.academy-world-practice')).toBeNull();
        expect(screen.querySelector('.academy-world-reward')).toBeNull();
        expect(onActivity).not.toHaveBeenCalled();

        const radio = screen.querySelector<HTMLButtonElement>('[data-world-object="cafe-radio"]')!;
        expect(radio.getAttribute('aria-pressed')).toBe('true');
        radio.click();
        expect(onToggleAudio).toHaveBeenCalledOnce();
        expect(radio.dataset.muted).toBe('true');
        expect(radio.getAttribute('aria-pressed')).toBe('false');
        expect(radio.textContent).toContain('Sound on');
        expect(screen.querySelectorAll('[data-exit-slot]')).toHaveLength(4);

        const styles = fs.readFileSync(path.resolve('src/academy/styles/world.css'), 'utf8');
        const cafeStyles = styles.slice(styles.indexOf('Stream 2 cafe'));
        expect(cafeStyles).toContain("data-current-place='cafe'");
        expect(cafeStyles).toContain("data-purpose-surface='cafe-menu'");
        expect(cafeStyles).toContain("data-landmark='rain-glass'");
        expect(cafeStyles).toContain("data-landmark='counter-lamp'");
        expect(cafeStyles).toContain("data-landmark='coffee-table'");
        expect(cafeStyles).toContain("data-world-object='cafe-radio'");
        expect(cafeStyles).toMatch(/@keyframes academy-cafe-(room-in|rain-write|lamp-in|left-in|right-in|menu-in|radio-live)/);
        expect(cafeStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*height:\s*100svh[\s\S]*academy-world-spatial-exits[\s\S]*flex-wrap:\s*nowrap/s);
        expect(cafeStyles).toMatch(/@media \(max-width: 360px\)[\s\S]*academy-world-hud/);
        expect(cafeStyles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*data-current-place='cafe'[\s\S]*animation:\s*none !important[\s\S]*transition:\s*none !important/s);
    });

    it('keeps first-visit introductions and exploration stamps stable and idempotent', () => {
        expect(worldLocationIntroduction('station', []).id).toBe('place:station');
        expect(worldLocationIntroduction('station', []).isFirstVisit).toBe(true);
        expect(worldStamp('station', []).claimed).toBe(false);
        expect(worldStamp('station', ['action:world-stamp:station']).claimed).toBe(true);
    });

    it('hands the first konbini welcome into its counter practice once', () => {
        const onIntroductionComplete = vi.fn();
        const firstVisit = renderWorldPlaceScreen({
            language: 'en', place: 'konbini', route: 'konbini', progress: PROGRESS,
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(), onIntroductionComplete,
        });
        document.body.append(firstVisit);
        const dialogue = firstVisit.querySelector<HTMLElement>('[data-world-arrival-dialogue="place:konbini"]')!;
        const purpose = firstVisit.querySelector<HTMLElement>('[data-purpose-surface="checkout-counter"]')!;
        expect(dialogue.textContent).toContain('Nanako-san');
        expect(dialogue.textContent).toContain('値段を聞いて、千円札を数えてください');
        expect(dialogue.textContent).toContain('Listen for the price, then count the ¥1,000 notes');
        expect(purpose.hidden).toBe(true);

        dialogue.querySelector<HTMLButtonElement>('.academy-world-arrival-continue')?.click();
        expect(dialogue.hidden).toBe(true);
        expect(purpose.hidden).toBe(false);
        expect(firstVisit.dataset.firstVisit).toBe('false');
        expect(firstVisit.querySelector('.academy-world-arrival')).toBeNull();
        expect(onIntroductionComplete).toHaveBeenCalledWith('place:konbini');
        expect(document.activeElement).toBe(purpose.querySelector('[data-world-listen]'));

        const returnVisit = renderWorldPlaceScreen({
            language: 'en', place: 'konbini', route: 'konbini',
            progress: { ...PROGRESS, seenIntroductions: ['place:konbini'] },
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(),
        });
        expect(returnVisit.querySelector('[data-world-arrival-dialogue]')).toBeNull();
        expect(returnVisit.querySelector<HTMLElement>('[data-purpose-surface="checkout-counter"]')?.hidden).toBe(false);
    });

    it('stages the konbini as a staffed, full-scene checkout with mobile exits and bounded motion', () => {
        const screen = renderWorldPlaceScreen({
            language: 'en', place: 'konbini', route: 'konbini',
            progress: { ...PROGRESS, seenIntroductions: ['place:konbini'] },
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(),
        });

        expect(screen.querySelector('[data-world-character="nanako"]')).not.toBeNull();
        expect(screen.querySelector('[data-purpose-surface="checkout-counter"]')).not.toBeNull();
        expect(screen.querySelector('[data-world-practice^="konbini-"] [data-world-listen]')).not.toBeNull();
        expect(screen.querySelectorAll('[data-exit-slot]')).toHaveLength(4);
        expect(screen.querySelectorAll('[data-scene-composition="konbini"] [data-landmark]')).toHaveLength(3);

        const styles = fs.readFileSync(path.resolve('src/academy/styles/world.css'), 'utf8');
        const konbiniStyles = styles.slice(styles.lastIndexOf('Stream 2 konbini'));
        expect(konbiniStyles).toContain("data-current-place='konbini'");
        expect(konbiniStyles).toContain("data-landmark='store-stripes'");
        expect(konbiniStyles).toContain("data-landmark='warm-shelves'");
        expect(konbiniStyles).toContain("data-landmark='checkout-basket'");
        expect(konbiniStyles).toContain('CHECKOUT');
        expect(konbiniStyles).toMatch(/@keyframes academy-konbini-(room-in|awning-in|shelves-in|counter-in|cashier-in|receipt-in)/);
        expect(konbiniStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*height:\s*100svh[\s\S]*academy-world-spatial-exits[\s\S]*flex-wrap:\s*nowrap/);
        expect(konbiniStyles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*data-current-place='konbini'[\s\S]*animation:\s*none !important[\s\S]*transition:\s*none !important/);
    });

    it.each([
        {
            place: 'ramen' as const,
            route: 'ramen',
            person: 'Rie-sensei',
            japanese: 'まず聞いて、品物と数をそろえましょう',
            english: 'Listen first, then match each item and quantity',
            surface: 'noren-menu',
            curriculum: 'moodle:l1-l19:a43-order-grid',
        },
        {
            place: 'home' as const,
            route: 'home',
            person: 'Aakash-san',
            japanese: 'どんな一日でしたか',
            english: 'What kind of day have you had',
            surface: 'journal-desk',
            curriculum: 'moodle:journal-replay',
        },
    ])('hands the first $place visit into its grounded local activity', ({ place, route, person, japanese, english, surface, curriculum }) => {
        const onIntroductionComplete = vi.fn();
        const firstVisit = renderWorldPlaceScreen({
            language: 'en', place, route, progress: PROGRESS,
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(), onIntroductionComplete,
        });
        document.body.append(firstVisit);
        const dialogue = firstVisit.querySelector<HTMLElement>(`[data-world-arrival-dialogue="place:${place}"]`)!;
        const purpose = firstVisit.querySelector<HTMLElement>(`[data-purpose-surface="${surface}"]`)!;

        expect(dialogue.textContent).toContain(person);
        expect(dialogue.textContent).toContain(japanese);
        expect(dialogue.textContent).toContain(english);
        expect(purpose.hidden).toBe(true);
        expect(purpose.dataset.worldActivity).toBe(curriculum);

        dialogue.querySelector<HTMLButtonElement>('[data-home-reflection="quiet"]')?.click();
        dialogue.querySelector<HTMLButtonElement>('.academy-world-arrival-continue')?.click();
        expect(dialogue.hidden).toBe(true);
        expect(purpose.hidden).toBe(false);
        expect(firstVisit.dataset.firstVisit).toBe('false');
        expect(onIntroductionComplete).toHaveBeenCalledWith(`place:${place}`);

        const returnVisit = renderWorldPlaceScreen({
            language: 'en', place, route,
            progress: { ...PROGRESS, seenIntroductions: [`place:${place}`] },
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(),
        });
        expect(returnVisit.querySelector('[data-world-arrival-dialogue]')).toBeNull();
        expect(returnVisit.querySelector<HTMLElement>(`[data-purpose-surface="${surface}"]`)?.hidden).toBe(false);
    });

    it.each([
        {
            place: 'lab' as const,
            route: 'lab',
            person: 'Xingyu-san',
            japanese: '聞こえた言葉を、そのまま繰り返してみましょう',
            english: 'Try repeating the words exactly as you hear them',
            surface: 'listening-console',
            curriculum: 'lesson-zero:classroom-repair',
            scene: 'languageLab',
            object: 'lab-console',
            mobileArt: 'language-lab__evening-listening--mobile.webp',
            wideArt: 'language-lab__evening-listening--wide.webp',
        },
        {
            place: 'bookshop' as const,
            route: 'world',
            person: 'Sophie-san',
            japanese: '辞書をお探しですか。棚を一緒に見ましょう',
            english: 'Are you looking for a dictionary? Let us check the shelves together',
            surface: 'bookshop-shelf',
            curriculum: 'l1-l14:things-available',
            scene: 'bookshop',
            object: 'bookshop-catalogue',
            mobileArt: 'bookshop__rain-evening-shelves--mobile.webp',
            wideArt: 'bookshop__rain-evening-shelves--wide.webp',
        },
    ])('makes the first $place arrival a distinct, grounded, responsive local scene', ({
        place, route, person, japanese, english, surface, curriculum, scene, object, mobileArt, wideArt,
    }) => {
        const onIntroductionComplete = vi.fn();
        const first = projectWorldPlace(place, PROGRESS);
        const later = projectWorldPlace(place, {
            ...PROGRESS,
            worldVisits: markWorldVisit(PROGRESS.worldVisits, place),
        });
        const screen = renderWorldPlaceScreen({
            language: 'en', place, route, progress: PROGRESS,
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(), onIntroductionComplete,
        });
        document.body.append(screen);
        const dialogue = screen.querySelector<HTMLElement>(`[data-world-arrival-dialogue="place:${place}"]`)!;
        const purpose = screen.querySelector<HTMLElement>(`[data-purpose-surface="${surface}"]`)!;

        expect(first).toMatchObject({
            scene,
            availability: { state: 'open' },
            composition: { motif: place, purposeSurface: surface },
            activity: { curriculum: { id: curriculum, state: 'grounded' } },
        });
        expect(first.people.length).toBeGreaterThan(0);
        expect(first.exits).toHaveLength(2);
        expect(first.practice).toBeDefined();
        expect(first.practice?.id).not.toBe(later.practice?.id);
        expect(first.moment).not.toEqual(later.moment);
        expect(screen.dataset.sceneMotif).toBe(place);
        expect(screen.dataset.plate).toBe(scene);
        expect(screen.querySelector<HTMLSourceElement>('.academy-background source')?.srcset).toContain(mobileArt);
        expect(screen.querySelector<HTMLImageElement>('.academy-background img')?.src).toContain(wideArt);
        expect(screen.querySelectorAll(`[data-scene-composition="${place}"] [data-landmark]`)).toHaveLength(3);
        expect(screen.querySelector('[data-world-character]')).not.toBeNull();
        expect(screen.querySelector(`[data-world-object="${object}"]`)).not.toBeNull();
        expect(screen.querySelectorAll('[data-exit-slot]')).toHaveLength(2);
        expect(dialogue.textContent).toContain(person);
        expect(dialogue.textContent).toContain(japanese);
        expect(dialogue.textContent).toContain(english);
        expect(purpose.hidden).toBe(true);
        expect(purpose.dataset.worldActivity).toBe(curriculum);

        dialogue.querySelector<HTMLButtonElement>('.academy-world-arrival-continue')?.click();
        expect(dialogue.hidden).toBe(true);
        expect(purpose.hidden).toBe(false);
        expect(onIntroductionComplete).toHaveBeenCalledWith(`place:${place}`);

        const returnVisit = renderWorldPlaceScreen({
            language: 'en', place, route,
            progress: { ...PROGRESS, seenIntroductions: [`place:${place}`] },
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(),
        });
        expect(returnVisit.querySelector('[data-world-arrival-dialogue]')).toBeNull();
    });

    it.each([
        {
            place: 'park' as const,
            route: 'world',
            person: 'Felix-san',
            japanese: '今日は天気がよくないですね',
            english: 'leave one colour from the sky on paper',
            surface: 'weather-sketchbook',
            curriculum: 'source:l1-l11:park-weather-description',
            scene: 'park',
            object: 'park-sketchbook',
            exits: 3,
            mobileArt: 'park__day-overcast--mobile.webp',
            wideArt: 'park__day-overcast--wide.webp',
        },
        {
            place: 'station-platform' as const,
            route: 'world',
            person: 'Aakash-san',
            japanese: 'いつもの地下鉄が何分か、アナウンスを一緒に聞きましょう',
            english: 'how long the usual Tube journey takes',
            surface: 'transfer-board',
            curriculum: 'textbook:station-announcements',
            scene: 'stationPlatform',
            object: 'tube-platform-signal',
            exits: 2,
            mobileArt: 'tube-platform__blue-hour-rain--mobile.webp',
            wideArt: 'tube-platform__blue-hour-rain--wide.webp',
        },
    ])('makes the first $place arrival a distinct living-paper scene with a local task', ({
        place, route, person, japanese, english, surface, curriculum, scene, object, exits, mobileArt, wideArt,
    }) => {
        const onIntroductionComplete = vi.fn();
        const first = projectWorldPlace(place, PROGRESS);
        const later = projectWorldPlace(place, {
            ...PROGRESS,
            worldVisits: markWorldVisit(PROGRESS.worldVisits, place),
        });
        const screen = renderWorldPlaceScreen({
            language: 'en', place, route, progress: PROGRESS,
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(), onIntroductionComplete,
        });
        document.body.append(screen);
        const dialogue = screen.querySelector<HTMLElement>(`[data-world-arrival-dialogue="place:${place}"]`)!;
        const purpose = screen.querySelector<HTMLElement>(`[data-purpose-surface="${surface}"]`)!;

        expect(first).toMatchObject({
            scene,
            availability: { state: 'open' },
            composition: { motif: place, purposeSurface: surface },
            activity: { curriculum: { id: curriculum, state: 'grounded' } },
        });
        expect(first.people.length).toBeGreaterThan(0);
        expect(first.exits).toHaveLength(exits);
        expect(first.practice).toBeDefined();
        expect(first.practice?.id).not.toBe(later.practice?.id);
        expect(first.moment).not.toEqual(later.moment);
        expect(screen.dataset.sceneMotif).toBe(place);
        expect(screen.dataset.plate).toBe(scene);
        expect(screen.querySelector<HTMLSourceElement>('.academy-background source')?.srcset).toContain(mobileArt);
        expect(screen.querySelector<HTMLImageElement>('.academy-background img')?.src).toContain(wideArt);
        expect(screen.querySelectorAll(`[data-scene-composition="${place}"] [data-landmark]`)).toHaveLength(3);
        expect(screen.querySelector('[data-world-character]')).not.toBeNull();
        expect(screen.querySelector(`[data-world-object="${object}"]`)).not.toBeNull();
        expect(screen.querySelectorAll('[data-exit-slot]')).toHaveLength(exits);
        expect(dialogue.textContent).toContain(person);
        expect(dialogue.textContent).toContain(japanese);
        expect(dialogue.textContent).toContain(english);
        expect(purpose.hidden).toBe(true);
        expect(purpose.dataset.worldActivity).toBe(curriculum);

        dialogue.querySelector<HTMLButtonElement>('.academy-world-arrival-continue')?.click();
        expect(dialogue.hidden).toBe(true);
        expect(purpose.hidden).toBe(false);
        expect(onIntroductionComplete).toHaveBeenCalledWith(`place:${place}`);

        const returnVisit = renderWorldPlaceScreen({
            language: 'en', place, route,
            progress: { ...PROGRESS, seenIntroductions: [`place:${place}`] },
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(),
        });
        expect(returnVisit.querySelector('[data-world-arrival-dialogue]')).toBeNull();
    });

    it('uses independently composed wide and phone art for the konbini', () => {
        const projection = projectWorldPlace('konbini', PROGRESS);
        const screen = renderWorldPlaceScreen({
            language: 'en', place: 'konbini', route: 'konbini', progress: PROGRESS,
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(),
        });
        expect(projection.scene).toBe('konbini');
        expect(screen.querySelector<HTMLSourceElement>('.academy-background source')?.srcset)
            .toContain('konbini__rain-evening-checkout--mobile.webp');
        expect(screen.querySelector<HTMLImageElement>('.academy-background img')?.src)
            .toContain('konbini__rain-evening-checkout--wide.webp');
        expect(screen.querySelector('[data-world-character="nanako"]')).not.toBeNull();
        expect(screen.querySelector('[data-world-object="konbini-register-sound"]')).not.toBeNull();
        expect(screen.querySelectorAll('[data-exit-slot]')).toHaveLength(4);
    });

    it('uses the recovered responsive street plate in the reachable rainy-directions practice', () => {
        const projection = projectWorldPlace('street', PROGRESS);
        const screen = renderWorldPlaceScreen({
            language: 'en', place: 'street', route: 'street', progress: PROGRESS,
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(),
        });

        expect(projection.scene).toBe('street');
        expect(projection.availability.state).toBe('open');
        expect(projection.practice?.kind).toBe('direction');
        expect(screen.querySelector<HTMLSourceElement>('.academy-background source')?.srcset)
            .toContain('bloomsbury-street__day-route--mobile.webp');
        expect(screen.querySelector<HTMLImageElement>('.academy-background img')?.src)
            .toContain('bloomsbury-street__day-route--wide.webp');
        expect(screen.querySelector(`[data-world-practice="${projection.practice?.id}"]`)).not.toBeNull();
        expect(new Set(projection.people)).toEqual(new Set(['aakash', 'peter']));
        expect(screen.querySelectorAll('[data-world-character]')).toHaveLength(2);
        expect(screen.querySelector('[data-purpose-surface="street-sign"]')).not.toBeNull();
        expect(screen.querySelector('[data-world-object="street-rain"]')).not.toBeNull();
        expect(screen.querySelector<HTMLElement>('[data-world-stamp]')?.dataset.rewardProp).toBe('notebook');
        expect(screen.querySelectorAll('[data-exit-slot]')).toHaveLength(6);

        const styles = fs.readFileSync(path.resolve('src/academy/styles/world.css'), 'utf8');
        const streetStyles = styles.slice(styles.indexOf('Stream 2 street'));
        expect(streetStyles).toContain("data-current-place='street'");
        expect(streetStyles).toContain("data-purpose-surface='street-sign'");
        expect(streetStyles).toContain("data-landmark='rainy-blocks'");
        expect(streetStyles).toContain("data-landmark='crossing-sign'");
        expect(streetStyles).toContain("data-landmark='wet-pavement'");
        expect(streetStyles).toMatch(/@keyframes academy-street-(scene-in|rain|sign-in|left-in|right-in|route-in|note-in)/);
        expect(streetStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*height:\s*100svh[\s\S]*academy-world-spatial-exits[\s\S]*flex-wrap:\s*nowrap/s);
        expect(streetStyles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*data-current-place='street'[\s\S]*animation:\s*none !important[\s\S]*transition:\s*none !important/s);
    });

    it('keeps ramen and home as distinct responsive, animated locations with deterministic return variation', () => {
        const firstRamen = projectWorldPlace('ramen', PROGRESS);
        const laterRamen = projectWorldPlace('ramen', {
            ...PROGRESS,
            worldVisits: markWorldVisit(PROGRESS.worldVisits, 'ramen'),
        });
        const laterHome = projectWorldPlace('home', {
            ...PROGRESS,
            worldVisits: markWorldVisit(PROGRESS.worldVisits, 'home'),
        });
        const styles = fs.readFileSync(path.resolve('src/academy/styles/world.css'), 'utf8');

        expect(firstRamen.practice?.id).not.toBe(laterRamen.practice?.id);
        expect(laterHome.moment).not.toEqual(projectWorldPlace('home', PROGRESS).moment);
        for (const place of ['ramen', 'home'] as const) {
            const placeStyles = styles.slice(styles.indexOf(`data-current-place='${place}'`));
            expect(placeStyles).toContain(`data-current-place='${place}'`);
            expect(placeStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*height:\s*100svh/);
            expect(placeStyles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none !important/s);
            expect(placeStyles).toContain('.academy-world-arrival-dialogue');
        }
        expect(styles).toMatch(/@keyframes academy-ramen-(lanterns-in|steam)/);
        expect(styles).toMatch(/@keyframes academy-home-(rain|radio-signal)/);
        const visualQaStyles = styles.slice(styles.indexOf('Visual QA correction'));
        expect(visualQaStyles).toContain("data-current-place='ramen'] .academy-world-stage::after");
        expect(visualQaStyles).toContain("data-landmark='red-noren']::after");
        expect(visualQaStyles).toContain("content: 'ラーメン'");
    });

    it('replays source-backed ramen order tickets with rotating order grids and consent-safe presence', async () => {
        const onListen = vi.fn(async () => true);
        const onObjectInteract = vi.fn();
        const onPracticeComplete = vi.fn();
        const screen = renderWorldPlaceScreen({
            language: 'en', place: 'ramen', route: 'ramen',
            progress: { ...PROGRESS, metCharacterIds: [...PROGRESS.metCharacterIds!, 'shin'], seenIntroductions: ['place:ramen'] },
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(), onListen, onObjectInteract, onPracticeComplete,
        });
        document.body.append(screen);

        expect(screen.querySelector('[data-ramen-service-scene="counter-window"]')).not.toBeNull();
        expect(screen.querySelectorAll('[data-ramen-service-mark]')).toHaveLength(3);
        expect(screen.querySelectorAll('[data-world-character]')).toHaveLength(2);
        expect(screen.querySelector('[data-world-character="shin"]')).not.toBeNull();
        expect(screen.querySelector('[data-world-character="rie"]')).not.toBeNull();
        expect(screen.querySelector('[data-world-character="peter"]')).toBeNull();
        expect(screen.querySelector<HTMLElement>('[data-world-character="shin"]')?.dataset.presence).toBe('marking-menu-counters');
        expect(screen.querySelector<HTMLElement>('[data-world-character="rie"]')?.dataset.presence).toBe('waiting-at-counter');
        (['shin', 'rie'] as const).forEach(personId => {
            if (!canRenderAcademyCastPortrait(personId, 'story-runtime')) {
                expect(screen.querySelector(`[data-world-character="${personId}"] img`)).toBeNull();
            }
        });
        const ticket = screen.querySelector<HTMLElement>('[data-ramen-order-ticket]')!;
        expect(ticket.textContent).toContain('何をいくつ注文しましたか。');
        expect(ticket.textContent).toContain('CD A-43・注文 1');
        expect(ticket.textContent).toContain('Moodle CD A-43 order grid');
        expect(ticket.textContent).toContain('Minna no Nihongo I Lesson 11 sequence');
        expect(ticket.textContent).toContain('Genki I Lesson 3 一つ/二つ recognition');
        expect(ticket.querySelector<HTMLElement>('[data-ramen-source-primary]')?.dataset.ramenSourceSupport).toBe('minna genki');
        expect(ticket.textContent).not.toContain('紅茶一つ、ビール一つ、サンドイッチ二つ');
        const practice = screen.querySelector<HTMLElement>('[data-ramen-practice="tally-source-order"]')!;
        expect(practice.dataset.ramenOutcome).toBe('ramen-a43-order-one');
        practice.querySelector<HTMLButtonElement>('[data-world-listen="ramen-a43-order-one"]')?.click();
        await Promise.resolve();
        expect(onListen).toHaveBeenCalledWith('紅茶一つ、ビール一つ、サンドイッチ二つですね。');
        practice.querySelector<HTMLButtonElement>('[data-ramen-order-row="tea"][data-choice-id="one"]')?.click();
        practice.querySelector<HTMLButtonElement>('[data-ramen-order-row="beer"][data-choice-id="one"]')?.click();
        practice.querySelector<HTMLButtonElement>('[data-ramen-order-row="sandwich"][data-choice-id="two"]')?.click();
        expect(onObjectInteract).toHaveBeenCalledTimes(3);
        practice.querySelector<HTMLButtonElement>('[data-ramen-check="ramen-a43-order-one"]')?.click();
        expect(onPracticeComplete).toHaveBeenCalledWith(
            'ramen-a43-order-one',
            'action:world-stamp:ramen',
            expect.objectContaining({
                attempt: expect.objectContaining({
                    responseKind: 'world-order-grid',
                    sourceQuestionId: 'l1-l19/ex-l19-a43-order-1',
                }),
                reviewSeeds: [expect.objectContaining({ id: 'review:world:ramen:a43-order-one' })],
            }),
        );
        expect(screen.querySelectorAll('.academy-world-exit')).toHaveLength(4);
        expect(screen.querySelectorAll('.academy-world-exit:not(:disabled)')).toHaveLength(2);

        const returning = renderWorldPlaceScreen({
            language: 'en', place: 'ramen', route: 'ramen',
            progress: { ...PROGRESS, metCharacterIds: [...PROGRESS.metCharacterIds!, 'shin'], seenIntroductions: ['place:ramen'], worldVisits: { ramen: 1 } },
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(),
        });
        expect(returning.querySelector<HTMLElement>('[data-ramen-practice="tally-source-order"]')?.dataset.ramenOutcome)
            .toBe('ramen-a43-order-two');
        expect(returning.querySelector<HTMLElement>('[data-world-character="shin"]')?.dataset.presence).toBe('checking-ticket-rail');
        expect(returning.querySelector<HTMLElement>('[data-world-character="rie"]')?.dataset.presence).toBe('reading-order-slip');

        const styles = fs.readFileSync(path.resolve('src/academy/styles/world.css'), 'utf8');
        const ramenStyles = styles.slice(styles.lastIndexOf('Stream 2 ramen'));
        expect(ramenStyles).toContain('.academy-ramen-service-scene');
        expect(ramenStyles).toContain('.academy-ramen-order-ticket');
        expect(ramenStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*data-current-place='ramen'[\s\S]*height:\s*100svh/s);
        expect(ramenStyles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*data-current-place='ramen'[\s\S]*animation:\s*none !important/s);
    });

    it('keeps the lab and bookshop readable as desktop and phone worlds with bounded motion', () => {
        const styles = fs.readFileSync(path.resolve('src/academy/styles/world.css'), 'utf8');
        const streamStyles = styles.slice(styles.indexOf('Stream 4: lab and bookshop'));

        for (const place of ['lab', 'bookshop'] as const) {
            expect(streamStyles).toContain(`data-current-place='${place}'`);
            expect(streamStyles).toMatch(new RegExp(`@media \\(max-width: 760px\\)[\\s\\S]*data-current-place='${place}'`));
            expect(streamStyles).toMatch(new RegExp(`@media \\(prefers-reduced-motion: reduce\\)[\\s\\S]*data-current-place='${place}'[\\s\\S]*animation:\\s*none !important`));
        }
        expect(streamStyles).toMatch(/@keyframes academy-lab-(room-in|wave)/);
        expect(streamStyles).toMatch(/@keyframes academy-bookshop-(room-in|shelves-in)/);
        expect(streamStyles).toContain("data-landmark='headphone-booths'");
        expect(streamStyles).toContain("data-landmark='towering-shelves'");
        const finalCascade = styles.slice(styles.indexOf('Stream 4 final cascade guard'));
        expect(finalCascade).toContain("data-current-place='lab'] .academy-world-curriculum");
        expect(finalCascade).toContain("data-current-place='bookshop'] .academy-world-curriculum");
    });

    it('makes 語学ラボ a listen, repeat aloud, then answer scene with people and usable exits', async () => {
        let resolveListen: ((played: boolean) => void) | undefined;
        const onListen = vi.fn(() => new Promise<boolean>(resolve => { resolveListen = resolve; }));
        const onPracticeComplete = vi.fn();
        const onTravel = vi.fn();
        const screen = renderWorldPlaceScreen({
            language: 'en', place: 'lab', route: 'lab',
            progress: {
                ...PROGRESS,
                metCharacterIds: [...PROGRESS.metCharacterIds, 'xingyu', 'mika'],
                seenIntroductions: ['place:lab'],
            },
            onTravel, onActivity: vi.fn(), onClaimStamp: vi.fn(), onListen, onPracticeComplete,
        });
        document.body.append(screen);

        expect(screen.querySelector('.academy-world-title')?.textContent).toBe('語学ラボ');
        expect(screen.querySelectorAll('[data-world-character]')).toHaveLength(2);
        expect(screen.querySelector('[data-world-character="xingyu"]')).not.toBeNull();
        expect(screen.querySelector('[data-world-character="mika"]')).not.toBeNull();
        expect(screen.querySelectorAll('[data-exit-slot]')).toHaveLength(2);

        const practice = screen.querySelector<HTMLElement>('[data-lab-practice="listen-repeat-answer"]')!;
        const cue = screen.querySelector<HTMLElement>('[data-lab-speaking]')!;
        const line = screen.querySelector<HTMLElement>('.academy-lab-speaking-line')!;
        const repeat = screen.querySelector<HTMLButtonElement>('.academy-lab-speaking-button')!;
        const listen = screen.querySelector<HTMLButtonElement>('[data-world-listen]')!;
        expect(cue.dataset.labSpeaking).toBe('awaiting-listen');
        expect(line.hidden).toBe(true);
        expect(repeat.disabled).toBe(true);

        listen.click();
        await vi.waitFor(() => expect(onListen).toHaveBeenCalledWith('もう一度お願いします。'));
        expect(cue.dataset.labSpeaking).toBe('ready');
        expect(line.hidden).toBe(false);
        expect(line.textContent).toBe('もう一度お願いします。');
        expect(repeat.disabled).toBe(false);

        repeat.click();
        expect(practice.dataset.shadowed).toBe('true');
        expect(cue.dataset.labSpeaking).toBe('spoken');
        resolveListen?.(true);
        await Promise.resolve();
        expect(screen.querySelector('.academy-world-practice-status')?.textContent).toBe('Good. Now choose the final word.');

        worldChoiceButtonByLabel(screen, 'お願いします')!.click();
        expect(practice.dataset.practiceComplete).toBe('true');
        expect(onPracticeComplete).toHaveBeenCalledWith(
            'lab-classroom-repair',
            'action:world-stamp:lab',
            expect.objectContaining({
                attempt: expect.objectContaining({ sourceQuestionId: 'source-question:classroom-phrase-09' }),
                reviewSeeds: [expect.objectContaining({ id: 'review:world:lab:classroom-repair' })],
            }),
        );

        screen.querySelector<HTMLButtonElement>('[data-location="library"]')!.click();
        expect(onTravel).toHaveBeenCalledWith('library');

        const styles = fs.readFileSync(path.resolve('src/academy/styles/world.css'), 'utf8');
        const labStyles = styles.slice(styles.lastIndexOf('Stream 2: the Language Lab'));
        expect(labStyles).toContain('.academy-lab-speaking-cue');
        expect(labStyles).toContain('語学ラボ　聞く・話す');
        expect(labStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*max-height:\s*43svh/);
        expect(labStyles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*academy-lab-speaking-cue[\s\S]*animation:\s*none !important/);
    });

    it('keeps the park and station platform as distinct responsive places rather than card collections', () => {
        const worldStyles = fs.readFileSync(path.resolve('src/academy/styles/world.css'), 'utf8');
        const parkStyles = fs.readFileSync(path.resolve('src/academy/styles/park-world.css'), 'utf8');

        expect(parkStyles).toContain("data-current-place='park'");
        expect(parkStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*data-current-place='park'[\s\S]*height:\s*100svh/);
        expect(parkStyles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*data-current-place='park'[\s\S]*animation:\s*none !important/);
        expect(parkStyles).toContain("data-landmark='weather-ribbon'");
        expect(parkStyles).toContain("data-landmark='park-bench'");
        expect(parkStyles).toContain("data-purpose-surface='weather-sketchbook'");
        expect(parkStyles).not.toContain('border-radius: 12px');

        const streamStyles = worldStyles.slice(worldStyles.indexOf("data-current-place='station-platform'"));
        expect(streamStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*data-current-place='station-platform'[\s\S]*height:\s*100svh/);
        expect(streamStyles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*data-current-place='station-platform'[\s\S]*animation:\s*none !important/);
        expect(streamStyles).toContain("data-landmark='carriage-door'");
        expect(streamStyles).toContain("data-landmark='transfer-map'");
        expect(streamStyles).toContain("data-current-place='station-platform'] .academy-world-section-title");
        expect(streamStyles).toMatch(/@keyframes academy-platform-(door-in|map-in)/);
    });

    it('stages Park as a sourced weather sketchbook with replay variation and consent-safe presence', () => {
        const replay = [0, 1, 2, 3].map(parkVisits => projectWorldPlace('park', {
            ...PROGRESS,
            worldVisits: { ...PROGRESS.worldVisits, park: parkVisits },
        }).practice!);
        expect(replay.map(practice => practice.id)).toEqual([
            'park-overcast-weather',
            'park-hyde-description',
            'park-blossom-description',
            'park-overcast-weather',
        ]);
        expect(replay.slice(0, 3).map(practice => practice.source?.primary.sourceId)).toEqual([
            'genki-2e:l1-l11:lesson-5-workbook-2:slot-9',
            'moodle:6053028:dfec00d8:p1:q1:2',
            'moodle:6053028:dfec00d8:p2:q2:5',
        ]);

        const onIntroductionComplete = vi.fn();
        const onPracticeComplete = vi.fn();
        const onSketch = vi.fn();
        const onBack = vi.fn();
        const firstVisit = renderWorldPlaceScreen({
            language: 'en', place: 'park', route: 'world', progress: PROGRESS,
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(), onIntroductionComplete, onPracticeComplete,
            onObjectInteract: onSketch, onBack,
        });
        document.body.append(firstVisit);

        const arrival = firstVisit.querySelector<HTMLElement>('[data-world-arrival-dialogue="place:park"]')!;
        const purpose = firstVisit.querySelector<HTMLElement>('[data-purpose-surface="weather-sketchbook"]')!;
        expect(arrival.textContent).toContain('leave one colour from the sky on paper');
        expect(purpose.hidden).toBe(true);
        expect(firstVisit.querySelector<HTMLElement>('[data-world-character="felix"]')?.dataset.presence).toBe('comparing-sky-paper');
        expect(firstVisit.querySelector<HTMLElement>('[data-world-character="peter"]')?.dataset.presence).toBe('collecting-leaf');
        expect(firstVisit.querySelectorAll('[data-world-character] img')).toHaveLength(0);

        arrival.querySelector<HTMLButtonElement>('.academy-world-arrival-continue')?.click();
        expect(onIntroductionComplete).toHaveBeenCalledWith('place:park');
        expect(purpose.hidden).toBe(false);
        const practice = purpose.querySelector<HTMLElement>('[data-park-practice="weather-sketchbook"]')!;
        expect(practice.dataset.parkSource).toBe('genki-2e:l1-l11:lesson-5-workbook-2:slot-9');
        expect(practice.textContent).toContain('天気はよくないです');
        expect(purpose.querySelector('.academy-world-curriculum')).toBeNull();
        expect(purpose.querySelector('input, textarea, [contenteditable="true"], [data-choice-id]')).toBeNull();
        const seal = purpose.querySelector<HTMLButtonElement>('[data-park-weather-seal]')!;
        const firstMark = practice.dataset.weatherMark;
        seal.click();
        expect(practice.dataset.weatherMark).not.toBe(firstMark);
        expect(practice.dataset.sketchPressed).toBe('true');
        expect(onSketch).toHaveBeenCalledTimes(1);
        expect(onPracticeComplete).toHaveBeenCalledWith(
            'park-overcast-weather',
            'action:world-stamp:park',
            expect.objectContaining({
                attempt: expect.objectContaining({ sourceQuestionId: 'genki-2e:l1-l11:lesson-5-workbook-2:slot-9' }),
                reviewSeeds: [expect.objectContaining({ id: 'review:world:park:overcast-weather' })],
            }),
        );
        const secondMark = practice.dataset.weatherMark;
        seal.click();
        expect(practice.dataset.weatherMark).not.toBe(secondMark);
        expect(onSketch).toHaveBeenCalledTimes(2);
        expect(onPracticeComplete).toHaveBeenCalledTimes(1);
        expect(firstVisit.querySelectorAll('[data-exit-slot]')).toHaveLength(3);
        firstVisit.querySelector<HTMLButtonElement>('.academy-world-back')?.click();
        expect(onBack).toHaveBeenCalledTimes(1);

        const returnVisit = renderWorldPlaceScreen({
            language: 'en', place: 'park', route: 'world',
            progress: { ...PROGRESS, seenIntroductions: ['place:park'], worldVisits: markWorldVisit(PROGRESS.worldVisits, 'park') },
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(),
        });
        expect(returnVisit.querySelector('[data-world-arrival-dialogue]')).toBeNull();
        expect(returnVisit.querySelector<HTMLElement>('[data-world-character="felix"]')?.dataset.presence).toBe('holding-page-to-light');
        expect(returnVisit.querySelector<HTMLElement>('[data-world-character="peter"]')?.dataset.presence).toBe('watching-cloud-break');
        expect(returnVisit.querySelector('[data-world-practice="park-hyde-description"]')).not.toBeNull();
        expect(returnVisit.querySelector('[data-world-character="felix"] img')).toBeNull();
        expect(returnVisit.querySelector('[data-world-character="peter"] img')).toBeNull();

        const parkStyles = fs.readFileSync(path.resolve('src/academy/styles/park-world.css'), 'utf8');
        expect(parkStyles).toContain('academy-park-sketchbook');
        expect(parkStyles).toContain("data-presence='comparing-sky-paper'");
        expect(parkStyles).toContain('rgba(249, 241, 202, 0.82)');
        expect(parkStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*academy-park-sketchbook/);
        expect(parkStyles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*data-current-place='park'[\s\S]*animation:\s*none !important/);
    });

    it('makes Japan Centre a first-visit gift counter with changing people and useful exits', async () => {
        const onIntroductionComplete = vi.fn();
        const onListen = vi.fn(async () => true);
        const onPracticeComplete = vi.fn();
        const onTravel = vi.fn();
        const firstVisit = renderWorldPlaceScreen({
            language: 'en', place: 'japan-centre', route: 'world', progress: PROGRESS,
            onTravel, onActivity: vi.fn(), onClaimStamp: vi.fn(), onIntroductionComplete, onListen, onPracticeComplete,
        });
        document.body.append(firstVisit);

        expect(projectWorldPlace('konbini', PROGRESS).exits).toContain('japan-centre');
        expect(firstVisit.querySelector('.academy-world-title')?.textContent).toBe('ジャパンセンター');
        expect(firstVisit.querySelector<HTMLElement>('[data-purpose-surface="gift-counter"]')?.hidden).toBe(true);
        const arrival = firstVisit.querySelector<HTMLElement>('[data-world-arrival-dialogue="place:japan-centre"]')!;
        expect(arrival.textContent).toContain('Are you looking for a gift?');
        expect(firstVisit.querySelector<HTMLElement>('[data-world-character="sophie"]')?.dataset.presence).toBe('reading-labels');
        expect(firstVisit.querySelector<HTMLElement>('[data-world-character="aakash"]')?.dataset.presence).toBe('browsing-shelves');
        expect(firstVisit.querySelector<HTMLElement>('[data-world-character="felix"]')?.dataset.presence).toBe('checking-display');

        arrival.querySelector<HTMLButtonElement>('.academy-world-arrival-continue')?.click();
        expect(onIntroductionComplete).toHaveBeenCalledWith('place:japan-centre');
        const purpose = firstVisit.querySelector<HTMLElement>('[data-purpose-surface="gift-counter"]')!;
        expect(purpose.hidden).toBe(false);
        const counter = purpose.querySelector<HTMLElement>('[data-japan-centre-practice="read-tag-then-respond"]')!;
        expect(counter.dataset.japanCentreOutcome).toBe('japan-centre-bag-request');
        const listen = purpose.querySelector<HTMLButtonElement>('[data-world-listen="japan-centre-bag-request"]')!;
        listen.click();
        await Promise.resolve();
        expect(onListen).toHaveBeenCalledWith('このかばんをください。');
        counter.querySelector<HTMLButtonElement>('[data-counter-tag="bag"]')?.click();
        worldChoiceButtonByLabel(purpose, 'このかばんをください。')?.click();
        expect(onPracticeComplete).toHaveBeenCalledWith(
            'japan-centre-bag-request',
            'action:world-stamp:japan-centre',
            expect.objectContaining({
                attempt: expect.objectContaining({
                    responseKind: 'world-counter-tag',
                    sourceQuestionId: 'l1-l07/ex-kudasai',
                }),
                reviewSeeds: [expect.objectContaining({ id: 'review:world:japan-centre:bag-request' })],
            }),
        );
        expect(firstVisit.querySelector<HTMLButtonElement>('[data-world-stamp]')?.dataset.itemAssetId)
            .toBe('item.japan-centre-omiyage-tag');
        expect(firstVisit.querySelector<HTMLImageElement>('[data-world-stamp] .academy-world-reward-prop img')?.src)
            .toContain(ACADEMY_ASSETS.items.japanCentreOmiyageTag);

        expect(firstVisit.querySelector('[data-location="konbini"]')?.textContent).toContain('Shop at the counter');
        expect(firstVisit.querySelector('[data-location="bookshop"]')?.textContent).toContain('Ask whether a dictionary is available');
        expect(firstVisit.querySelector('[data-location="ramen"]')?.textContent).toContain('Complete the order ticket');
        firstVisit.querySelector<HTMLButtonElement>('[data-location="bookshop"]')?.click();
        expect(onTravel).toHaveBeenCalledWith('bookshop');

        const returning = renderWorldPlaceScreen({
            language: 'en', place: 'japan-centre', route: 'world',
            progress: { ...PROGRESS, seenIntroductions: ['place:japan-centre'], worldVisits: { 'japan-centre': 1 } },
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(),
        });
        expect(returning.querySelector('[data-world-arrival-dialogue]')).toBeNull();
        expect(returning.querySelector<HTMLElement>('[data-world-character="sophie"]')?.dataset.presence).toBe('comparing-tags');
        expect(returning.querySelector<HTMLElement>('[data-world-character="aakash"]')?.dataset.presence).toBe('holding-bag');
        expect(returning.querySelector<HTMLElement>('[data-world-character="felix"]')?.dataset.presence).toBe('choosing-snack');
        expect(returning.querySelector<HTMLElement>('[data-japan-centre-practice="read-tag-then-respond"]')?.dataset.japanCentreOutcome)
            .toBe('japan-centre-bag-price');
        (['sophie', 'aakash', 'felix'] as const).forEach(personId => {
            if (!canRenderAcademyCastPortrait(personId, 'story-runtime')) {
                expect(returning.querySelector(`[data-world-character="${personId}"] img`)).toBeNull();
            }
        });

        const styles = fs.readFileSync(path.resolve('src/academy/styles/japan-centre-world.css'), 'utf8');
        expect(styles).toContain("data-current-place='japan-centre'");
        expect(styles).toContain("data-purpose-surface='gift-counter'");
        expect(styles).toMatch(/academy-world-action-dock[\s\S]*background:\s*transparent/);
        expect(styles).toMatch(/@media \(max-width: 760px\)[\s\S]*data-current-place='japan-centre'[\s\S]*height:\s*100svh/);
        expect(styles).toMatch(/@media \(max-width: 760px\)[\s\S]*academy-world-map-routes[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
        expect(styles).toMatch(/@media \(max-width: 760px\)[\s\S]*academy-world-spatial-exits[\s\S]*overflow-x:\s*hidden/);
        expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*data-current-place='japan-centre'[\s\S]*animation:\s*none !important/);
    });

    it('derives an expandable regional registry with honest future-place unlock reasons', () => {
        expect(worldRegions().map(region => region.id)).toEqual(['campus', 'bloomsbury', 'commute', 'home', 'japan']);
        expect(worldRegions().find(region => region.id === 'bloomsbury')?.places).toContain('clinic');
        const clinic = projectWorldPlace('clinic', PROGRESS);
        expect(clinic.label.ja).toBe('クリニック');
        expect(clinic.scene).toBeTruthy();
        expect(clinic.activity.label.ja).toBeTruthy();
        expect(clinic.people).toContain('rie');
        expect(clinic.availability).toEqual(expect.objectContaining({ state: 'locked' }));
        expect(clinic.availability.reason?.en).toContain('safety-reviewed');
        expect(clinic.activity.curriculum).toMatchObject({ surface: 'moodle', state: 'planned' });
        expect(projectWorldPlace('street', PROGRESS).activity.curriculum).toMatchObject({
            id: 'textbook:rainy-directions', surface: 'textbook', state: 'grounded',
        });

        const onTravel = vi.fn();
        const screen = renderWorldPlaceScreen({
            language: 'en', place: 'street', route: 'street', progress: PROGRESS,
            onTravel, onActivity: vi.fn(), onClaimStamp: vi.fn(),
        });
        expect(screen.dataset.worldRegion).toBe('bloomsbury');
        expect(screen.querySelector<HTMLElement>('.academy-world-curriculum')?.dataset.curriculumSurface).toBe('textbook');
        expect(screen.querySelector('.academy-world-curriculum')?.textContent).toContain('Rainy-day directions');
        expect(screen.querySelector<HTMLElement>('[data-world-map]')?.dataset.worldMap).toBe('street');
        expect(screen.querySelectorAll('[data-exit-slot]').length).toBeGreaterThan(0);
        screen.querySelector<HTMLButtonElement>('[data-location="station"]')?.click();
        expect(onTravel).toHaveBeenCalledWith('station');
    });

    it('keeps audio as a local place object, not an app-wide shortcut', () => {
        const onToggleAudio = vi.fn(() => true);
        const cafe = renderWorldPlaceScreen({
            language: 'en', place: 'cafe', route: 'cafe', progress: PROGRESS,
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(), onToggleAudio,
        });
        const radio = cafe.querySelector<HTMLButtonElement>('[data-world-object="cafe-radio"]')!;
        expect(radio.textContent).toContain('店内ラジオ');
        radio.click();
        expect(onToggleAudio).toHaveBeenCalledOnce();
        expect(radio.dataset.muted).toBe('true');
        const street = renderWorldPlaceScreen({
            language: 'en', place: 'street', route: 'street', progress: PROGRESS,
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(),
        });
        expect(street.querySelector('[data-world-object="street-rain"]')).not.toBeNull();
        expect(street.querySelector('[data-world-object="cafe-radio"]')).toBeNull();
    });

    it('keeps the phone world as one scene with a wayfinding rail and honors reduced motion', () => {
        const styles = fs.readFileSync(path.resolve('src/academy/styles/world.css'), 'utf8');
        const purposeStyles = fs.readFileSync(path.resolve('src/academy/styles/primary-purpose.css'), 'utf8');

        expect(styles).toContain('World presentation v3');
        expect(styles).toMatch(/@media \(max-width: 760px\)[\s\S]*academy-world-spatial-exits[\s\S]*flex-wrap:\s*nowrap/s);
        expect(styles).toMatch(/@media \(max-width: 760px\)[\s\S]*academy-world-action-dock[\s\S]*position:\s*absolute/s);
        expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*academy-world-screen\[data-scene-motif\][\s\S]*animation:\s*none !important/s);
        expect(styles).toContain('Map-first route rail');
        expect(styles).toMatch(/academy-world-map-routes[\s\S]*academy-world-exit[\s\S]*background:\s*rgba\(15, 22, 22, 0\.84\)/s);
        const stationStyles = styles.slice(styles.indexOf('Stream 2 station: departure-board mission'));
        expect(stationStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*data-current-place='station'[\s\S]*height:\s*100svh/s);
        expect(stationStyles).toMatch(/academy-world-spatial-exits[\s\S]*overflow-x:\s*auto/s);
        expect(stationStyles).toMatch(/data-listening-started='true'[\s\S]*overflow-y:\s*auto/s);
        expect(stationStyles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*data-current-place='station'[\s\S]*animation:\s*none !important[\s\S]*scroll-behavior:\s*auto !important/s);
        expect(purposeStyles).toMatch(/academy-world-exit \.academy-primary-purpose[\s\S]*display:\s*block[\s\S]*overflow:\s*visible[\s\S]*overflow-wrap:\s*anywhere[\s\S]*-webkit-line-clamp:\s*unset/s);
        expect(purposeStyles).toMatch(/@media \(max-width: 760px\)[\s\S]*academy-world-spatial-exits[\s\S]*height:\s*auto[\s\S]*academy-world-map-routes[\s\S]*height:\s*auto[\s\S]*academy-world-exit[\s\S]*max-height:\s*none/s);
    });

    it('keeps desktop and tablet current places as full-art scenes with transparent paper wayfinding', () => {
        const styles = fs.readFileSync(path.resolve('src/academy/styles/world.css'), 'utf8');
        const stagingStyles = fs.readFileSync(path.resolve('src/academy/styles/speaker-staging.css'), 'utf8');
        const presentationStart = styles.lastIndexOf('Stream 4 desktop/tablet presentation');
        const mobileStart = styles.indexOf('@media (max-width: 760px)', presentationStart);
        expect(presentationStart).toBeGreaterThanOrEqual(0);
        expect(mobileStart).toBeGreaterThan(presentationStart);
        const presentation = styles.slice(presentationStart, mobileStart);

        expect(presentation).toMatch(/@media \(min-width: 761px\)[\s\S]*--world-paper:\s*rgba\(250, 244, 222, 0\.70\)/s);
        expect(presentation).toMatch(/academy-background img[\s\S]*filter:\s*saturate\(1\.04\) contrast\(1\.03\) brightness\(1\.02\)/s);
        expect(presentation).toMatch(/academy-world-stage::before[\s\S]*rgba\(7, 13, 15, 0\.22\)/s);
        expect(presentation).toMatch(/academy-world-action-dock[\s\S]*academy-world-arrival-dialogue[\s\S]*blur\(2px\)/s);
        expect(presentation).toMatch(/academy-world-activity-button[\s\S]*academy-world-listen[\s\S]*academy-world-arrival-continue/s);
        expect(presentation).toContain("data-purpose-person='true'");
        expect(presentation).toMatch(/academy-world-character-action[\s\S]*background:\s*rgba\(8, 17, 19, 0\.74\) !important/s);
        expect(presentation).toMatch(/academy-world-exit[\s\S]*background:\s*rgba\(8, 17, 19, 0\.66\) !important/s);
        expect(presentation).not.toContain('100svh');
        expect(stagingStyles).toMatch(/data-purpose-person='true'[\s\S]*z-index:\s*9[\s\S]*opacity:\s*1/s);
        expect(stagingStyles).toMatch(/:not\(\[data-purpose-person='true'\]\)[\s\S]*opacity:\s*0\.64/s);
        expect(stagingStyles).toMatch(/@media \(min-width: 761px\)[\s\S]*academy-world-arrival-dialogue[\s\S]*background-color:\s*rgb\(250, 244, 222\) !important[\s\S]*backdrop-filter:\s*none/s);
        expect(stagingStyles).toContain(":not([data-current-place='bookshop'])");
    });

    it('runs grounded direction, announcement, counter, and ordering practices before awarding a stamp', async () => {
        expect(projectWorldPlace('street', PROGRESS).practice?.kind).toBe('direction');
        expect(projectWorldPlace('station', PROGRESS).practice?.kind).toBe('listening');
        expect(projectWorldPlace('konbini', PROGRESS).practice?.kind).toBe('counter');
        expect(projectWorldPlace('ramen', PROGRESS).practice?.kind).toBe('ordering');

        const onListen = vi.fn(async () => true);
        const onPracticeComplete = vi.fn();
        const screen = renderWorldPlaceScreen({
            language: 'en',
            place: 'station',
            route: 'station',
            progress: PROGRESS,
            onTravel: vi.fn(),
            onActivity: vi.fn(),
            onClaimStamp: vi.fn(),
            onListen,
            onPracticeComplete,
        });
        const practice = projectWorldPlace('station', PROGRESS).practice!;
        expect(screen.querySelector<HTMLElement>('.academy-world-station-board')?.dataset.stationEvent).toBe(practice.id);
        expect(screen.querySelector('.academy-world-station-board-label')?.textContent).toBe('Station-front notice');
        expect(screen.querySelector('[data-world-character="aakash"] .academy-world-character-silhouette')).not.toBeNull();
        const listen = screen.querySelector<HTMLButtonElement>(`[data-world-listen="${practice.id}"]`)!;
        const transcript = screen.querySelector<HTMLElement>('.academy-world-transcript')!;
        expect(transcript.hidden).toBe(true);
        listen.click();
        await Promise.resolve();
        expect(screen.querySelector<HTMLElement>('.academy-world-station-board')?.dataset.listeningStarted).toBe('true');
        expect(screen.querySelector<HTMLDivElement>('.academy-world-practice-options')?.hidden).toBe(false);
        expect(onListen).toHaveBeenCalledWith(practice.audioLine);
        expect(transcript.hidden).toBe(false);

        const incorrect = practice.choices.find(choice => choice.id !== practice.correctChoiceId)!;
        worldChoiceButton(screen, practice.choices, incorrect.id)?.click();
        expect(onPracticeComplete).not.toHaveBeenCalled();
        expect(screen.querySelector('.academy-world-practice-status')?.textContent).toContain('choose another answer');

        worldChoiceButton(screen, practice.choices, practice.correctChoiceId)?.click();
        worldChoiceButton(screen, practice.choices, practice.correctChoiceId)?.click();
        expect(screen.querySelector<HTMLElement>('[data-world-practice]')?.dataset.practiceComplete).toBe('true');
        expect(onPracticeComplete).toHaveBeenCalledTimes(1);
        expect(onPracticeComplete).toHaveBeenCalledWith(
            practice.id,
            'action:world-stamp:station',
            expect.objectContaining({
                attempt: expect.objectContaining({ responseKind: 'world-listening-choice', outcome: 'pass' }),
                reviewSeeds: [expect.objectContaining({ id: 'review:world:station:bookshop-location' })],
            }),
        );
        expect(screen.querySelector<HTMLButtonElement>('[data-world-stamp]')?.disabled).toBe(true);
    });

    it('replays source-grounded station listens and konbini checkout rebuilds with rotating outcomes', () => {
        const returningStation = projectWorldPlace('station', {
            ...PROGRESS,
            worldVisits: markWorldVisit(PROGRESS.worldVisits, 'station'),
        });
        const returningKonbini = projectWorldPlace('konbini', {
            ...PROGRESS,
            worldVisits: markWorldVisit(PROGRESS.worldVisits, 'konbini'),
        });
        expect(returningStation.practice?.id).toBe('station-counter-location');
        expect(returningStation.practice?.sceneLabel?.en).toBe('Inside-station notice');
        expect(returningKonbini.practice?.id).toBe('konbini-cd-price');

        const onStationComplete = vi.fn();
        const station = renderWorldPlaceScreen({
            language: 'en', place: 'station', route: 'station', progress: PROGRESS,
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(), onPracticeComplete: onStationComplete,
        });
        station.querySelector<HTMLButtonElement>('[data-world-listen="station-bookshop-location"]')?.click();
        worldChoiceButtonByLabel(station.querySelector('[data-world-practice="station-bookshop-location"]')!, '本屋')?.click();
        expect(onStationComplete).toHaveBeenCalledWith(
            'station-bookshop-location',
            'action:world-stamp:station',
            expect.objectContaining({ reviewSeeds: [expect.objectContaining({ id: 'review:world:station:bookshop-location' })] }),
        );

        const onKonbiniComplete = vi.fn();
        const konbini = renderWorldPlaceScreen({
            language: 'en', place: 'konbini', route: 'konbini',
            progress: { ...PROGRESS, seenIntroductions: ['place:konbini'] },
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(), onPracticeComplete: onKonbiniComplete,
        });
        const practice = konbini.querySelector<HTMLElement>('[data-world-practice="konbini-shirt-price"]')!;
        expect(practice.dataset.worldInteraction).toBe('cash-count');
        practice.querySelector<HTMLButtonElement>('[data-world-listen]')?.click();
        practice.querySelector<HTMLButtonElement>('.academy-konbini-counter-button:last-of-type')?.click();
        practice.querySelector<HTMLButtonElement>('[data-world-listen]')?.click();
        expect(onKonbiniComplete).not.toHaveBeenCalled();
        practice.querySelectorAll<HTMLButtonElement>('.academy-konbini-counter-button')[1]?.click();
        practice.querySelectorAll<HTMLButtonElement>('.academy-konbini-counter-button')[1]?.click();
        practice.querySelector<HTMLButtonElement>('[data-world-listen]')?.click();
        expect(practice.dataset.practiceComplete).toBe('true');
        expect(onKonbiniComplete).toHaveBeenCalledWith(
            'konbini-shirt-price',
            'action:world-stamp:konbini',
            expect.objectContaining({
                attempt: expect.objectContaining({ responseKind: 'world-cash-count' }),
                reviewSeeds: [expect.objectContaining({ id: 'review:world:konbini:shirt-price' })],
            }),
        );
    });

    it('keeps Street and Station as distinct, rotating commute replays with consent-gated presence', () => {
        const firstStreet = projectWorldPlace('street', PROGRESS);
        const returningStreet = projectWorldPlace('street', {
            ...PROGRESS,
            worldVisits: markWorldVisit(PROGRESS.worldVisits, 'street'),
        });
        expect(firstStreet.practice?.id).toBe('street-cafe-direction');
        expect(firstStreet.practice?.review?.sourceQuestionId).toBe('activity:aakash-rainy-directions');
        expect(returningStreet.practice?.id).toBe('street-station-direction');
        expect(returningStreet.practice?.review?.sourceQuestionId).toBe('aakash-directions:guided-frame');

        const onStreetComplete = vi.fn();
        const street = renderWorldPlaceScreen({
            language: 'en', place: 'street', route: 'street', progress: PROGRESS,
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(), onPracticeComplete: onStreetComplete,
        });
        expect(street.querySelector('[data-world-practice]')?.getAttribute('data-world-interaction')).toBeNull();
        expect(street.querySelector('[data-world-character="aakash"]')?.getAttribute('data-presence')).toBe('holding-route-note');
        expect(street.querySelector('[data-world-character="peter"]')?.getAttribute('data-presence')).toBe('reading-street-sign');
        if (!canRenderAcademyCastPortrait('peter', 'story-runtime')) {
            expect(street.querySelector('[data-world-character="peter"] .academy-sprite')).toBeNull();
            expect(street.querySelector('[data-world-character="peter"] .academy-world-character-silhouette')).not.toBeNull();
        }
        worldChoiceButtonByLabel(street.querySelector('[data-world-practice="street-cafe-direction"]')!, 'まっすぐ行って、右です。')?.click();
        expect(onStreetComplete).toHaveBeenCalledWith(
            'street-cafe-direction',
            'action:world-stamp:street',
            expect.objectContaining({
                attempt: expect.objectContaining({
                    responseKind: 'world-listening-choice',
                    sourceQuestionId: 'activity:aakash-rainy-directions',
                }),
                reviewSeeds: [expect.objectContaining({ id: 'review:world:street:cafe-direction' })],
            }),
        );

        const station = renderWorldPlaceScreen({
            language: 'en', place: 'station', route: 'station',
            progress: { ...PROGRESS, seenIntroductions: ['place:station'], worldVisits: { station: 1 } },
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(),
        });
        expect(station.querySelector('[data-world-practice]')?.classList.contains('academy-world-station-practice')).toBe(true);
        expect(station.querySelector('[data-world-character="aakash"]')?.getAttribute('data-presence')).toBe('checking-departures');
        if (!canRenderAcademyCastPortrait('aakash', 'story-runtime')) {
            expect(station.querySelector('[data-world-character="aakash"] .academy-sprite')).toBeNull();
            expect(station.querySelector('[data-world-character="aakash"] .academy-world-character-silhouette')).not.toBeNull();
        }
    });

    it('keeps station and konbini presence consent-safe when their cast has no likeness approval', () => {
        (['station', 'konbini'] as const).forEach(place => {
            const screen = renderWorldPlaceScreen({
                language: 'en', place, route: place,
                progress: { ...PROGRESS, seenIntroductions: [`place:${place}`] },
                onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(),
            });
            expect(screen.querySelector('[data-world-character] .academy-sprite')).toBeNull();
            expect(screen.querySelector('[data-world-character] .academy-world-character-silhouette')).not.toBeNull();
        });
    });

    it('supports keyboard exits and route-backed returns without a synthetic campus reset', () => {
        const onTravel = vi.fn();
        const onBack = vi.fn();
        const screen = renderWorldPlaceScreen({
            language: 'en',
            place: 'courtyard',
            route: 'campus',
            progress: PROGRESS,
            onTravel,
            onActivity: vi.fn(),
            onClaimStamp: vi.fn(),
        });
        document.body.append(screen);
        const classroom = screen.querySelector<HTMLButtonElement>('[data-location="classroom"]')!;
        const library = screen.querySelector<HTMLButtonElement>('[data-location="library"]')!;
        const street = screen.querySelector<HTMLButtonElement>('[data-location="street"]')!;
        const lab = screen.querySelector<HTMLButtonElement>('[data-location="lab"]')!;
        const scrollLabIntoView = vi.fn();
        lab.scrollIntoView = scrollLabIntoView;
        classroom.focus();
        classroom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(document.activeElement).toBe(library);
        library.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
        expect(document.activeElement).toBe(lab);
        expect(scrollLabIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
        street.click();
        expect(onTravel).toHaveBeenCalledWith('street');

        const cafe = renderWorldPlaceScreen({
            language: 'en',
            place: 'cafe',
            route: 'cafe',
            progress: PROGRESS,
            onTravel: vi.fn(),
            onActivity: vi.fn(),
            onClaimStamp: vi.fn(),
            onBack,
        });
        cafe.querySelector<HTMLButtonElement>('[data-exit-to="return"]')?.click();
        expect(onBack).toHaveBeenCalledOnce();
    });
});
