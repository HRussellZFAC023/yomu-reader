import { isWorldPlaceId } from '../domain/world-locations';
import type { AcademyCheckpoint } from '../persistence/indexeddb';
import type { AcademyRouteFrame } from './route-history';

const PLACE_ROUTES = new Set([
    'campus', 'classroom', 'cafe', 'lab', 'street', 'station', 'konbini', 'ramen', 'home', 'review',
    'journal', 'story',
]);

/** Return completed class work to the last real place, not the Class intermediary. */
export function lessonCompletionReturn(checkpoint: Pick<AcademyCheckpoint, 'routeHistory'>): AcademyRouteFrame {
    const place = [...checkpoint.routeHistory].reverse().find(isPlaceFrame);
    if (place?.route === 'classroom' && place.lessonId === 'authored-week:l1-l01') {
        return clearLessonContext(place);
    }
    return place ?? { route: 'class' };
}

function clearLessonContext(frame: AcademyRouteFrame): AcademyRouteFrame {
    return {
        route: frame.route,
        ...(frame.selectedBand ? { selectedBand: frame.selectedBand } : {}),
        ...(frame.selectedFork ? { selectedFork: frame.selectedFork } : {}),
        ...(frame.placementOverride !== undefined ? { placementOverride: frame.placementOverride } : {}),
        ...(frame.worldPlace ? { worldPlace: frame.worldPlace } : {}),
    };
}

function isPlaceFrame(frame: AcademyRouteFrame): boolean {
    if (PLACE_ROUTES.has(frame.route)) return true;
    return frame.route === 'world' && isWorldPlaceId(frame.worldPlace);
}
