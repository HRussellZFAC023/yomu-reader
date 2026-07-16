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
    return place ?? { route: 'class' };
}

function isPlaceFrame(frame: AcademyRouteFrame): boolean {
    if (PLACE_ROUTES.has(frame.route)) return true;
    return frame.route === 'world' && isWorldPlaceId(frame.worldPlace);
}
