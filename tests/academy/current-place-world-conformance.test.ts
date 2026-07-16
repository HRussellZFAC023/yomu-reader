import fs from 'node:fs';
import path from 'node:path';
import { canRenderAcademyCastPortrait } from '../../src/academy/domain/cast-registry';
import { completedWorldPracticeEvaluation } from '../../src/academy/domain/world-practice-evidence';
import {
    projectWorldPlace,
    worldRouteForPlace,
    worldTimePhase,
    WORLD_TIME_PHASE_LABELS,
    type WorldPlaceId,
} from '../../src/academy/domain/world-locations';
import { transitionAcademyRoute, type AcademyRouteHistoryState } from '../../src/academy/routing/route-history';
import { renderLibraryIntroduction } from '../../src/academy/ui/library-screen';
import { renderWorldPlaceScreen } from '../../src/academy/ui/world-screen';
import { CURRENT_WORLD_AUDIO_PLACE_IDS, WORLD_LOCATION_AUDIO_PROFILES } from '../../src/academy/vn/world-location-audio';

const CURRENT_PLACES = CURRENT_WORLD_AUDIO_PLACE_IDS satisfies readonly WorldPlaceId[];
const PROGRESS = { completedScenes: [], completedEncounterIds: [] } as const;

function returningProgress(place: WorldPlaceId, visits = 1) {
    return {
        ...PROGRESS,
        worldVisits: { [place]: visits },
        seenIntroductions: [`place:${place}`],
    };
}

function routeState(): AcademyRouteHistoryState {
    return { route: 'campus', routeHistory: [], presentationMode: 'story' };
}

afterEach(() => document.body.replaceChildren());

describe('current-place world conformance gate', () => {
    it('keeps all 13 open places mechanically, purposefully, musically, and linguistically distinct', () => {
        const projections = CURRENT_PLACES.map(place => projectWorldPlace(place, PROGRESS));

        expect(new Set(projections.map(place => place.label.ja)).size).toBe(CURRENT_PLACES.length);
        expect(new Set(projections.map(place => place.composition?.purposeSurface)).size).toBe(CURRENT_PLACES.length);
        expect(new Set(projections.map(place => place.practice?.id)).size).toBe(CURRENT_PLACES.length);
        expect(new Set(CURRENT_PLACES.map(place => WORLD_LOCATION_AUDIO_PROFILES[place].music)).size)
            .toBe(CURRENT_PLACES.length);

        for (const place of CURRENT_PLACES) {
            const first = projectWorldPlace(place, PROGRESS);
            const replay = projectWorldPlace(place, returningProgress(place));
            const evaluation = first.practice && completedWorldPracticeEvaluation(first.practice);

            expect(first.availability.state).toBe('open');
            expect(first.composition?.purposeSurface).toBeTruthy();
            expect(first.activity.curriculum.state).toBe('grounded');
            expect(first.practice?.review?.id, place).toBeTruthy();
            expect(evaluation?.reviewSeeds).toHaveLength(1);
            expect(replay.practice?.id).not.toBe(first.practice?.id);
            expect(worldTimePhase(PROGRESS, place)).toBe(place === 'konbini' ? 'evening' : 'morning');
            expect(worldTimePhase({ ...PROGRESS, worldVisits: { [place]: 1 } }, place)).toBe(place === 'konbini' ? 'evening' : 'lunch');
        }
        expect(Object.values(WORLD_TIME_PHASE_LABELS).every(phase => phase.ja.trim() && phase.en.trim())).toBe(true);
    });

    it('keeps every destination route-backed, with Back restoring the actual prior frame', () => {
        for (const place of CURRENT_PLACES) {
            const route = worldRouteForPlace(place);
            if (route === 'campus') {
                expect(place).toBe('courtyard');
                continue;
            }
            const opened = transitionAcademyRoute(routeState(), {
                kind: 'push',
                route,
                ...(route === 'world' ? { context: { worldPlace: place } } : {}),
            });

            expect(transitionAcademyRoute(opened, { kind: 'back' })).toEqual(routeState());
            if (route === 'world') expect(opened.worldPlace).toBe(place);
        }
    });

    it('gives every place a first-visit dialogue, direct ordinary actions, and consent-safe people', () => {
        for (const place of CURRENT_PLACES) {
            const first = renderWorldPlaceScreen({
                language: 'en', place, route: worldRouteForPlace(place), progress: PROGRESS,
                onTravel() {}, onActivity() {}, onClaimStamp() {},
            });
            const returning = renderWorldPlaceScreen({
                language: 'en', place, route: worldRouteForPlace(place), progress: returningProgress(place),
                onTravel() {}, onActivity() {}, onClaimStamp() {},
            });

            if (place === 'library') {
                const introduction = renderLibraryIntroduction('en', () => undefined);
                expect(introduction.querySelector('.academy-library-dialogue')).not.toBeNull();
            } else {
                expect(first.querySelector(`[data-world-arrival-dialogue="place:${place}"]`)).not.toBeNull();
            }
            expect(returning.querySelector('[data-world-arrival-dialogue]')).toBeNull();
            expect(returning.querySelector('.academy-world-action-dock')).not.toBeNull();
            expect(returning.querySelector('[data-world-practice], [data-activity-route]')).not.toBeNull();
            expect(returning.querySelector('details, .academy-utility')).toBeNull();
            returning.querySelectorAll<HTMLElement>('[data-world-character]').forEach(character => {
                const id = character.dataset.worldCharacter!;
                const portraitAllowed = canRenderAcademyCastPortrait(id, 'story-runtime');
                expect(Boolean(character.querySelector('.academy-sprite'))).toBe(portraitAllowed);
                expect(Boolean(character.querySelector('.academy-world-character-silhouette'))).toBe(!portraitAllowed);
            });
        }
    });

    it('retains the shared phone projection for every open place', () => {
        const styles = fs.readFileSync(path.resolve('src/academy/styles/world.css'), 'utf8');

        expect(styles).toMatch(/@media \(max-width: 760px\)[\s\S]*academy-world-screen\[data-current-place\] \.academy-world-action-dock/s);
        expect(styles).toMatch(/@media \(max-width: 760px\)[\s\S]*academy-world-screen\[data-current-place\] \.academy-world-spatial-exits/s);
        CURRENT_PLACES.forEach(place => {
            const screen = renderWorldPlaceScreen({
                language: 'en', place, route: worldRouteForPlace(place), progress: returningProgress(place),
                onTravel() {}, onActivity() {}, onClaimStamp() {},
            });
            expect(screen.querySelector('picture source[media="(max-width: 700px)"]')).not.toBeNull();
            expect(screen.querySelector('.academy-world-spatial-exits')).not.toBeNull();
        });
    });
});
