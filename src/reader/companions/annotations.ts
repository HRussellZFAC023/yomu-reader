import {
    clearProjectedReadings,
    clearProjectedReadingsWithin,
    projectedReadingWordAtPoint,
    pruneProjectedReadings,
    syncProjectedReadings,
} from '../dom/detached-reading-overlay-impl';
import { registerYomuCompanion } from './registry';

registerYomuCompanion('annotations', {
    clearProjectedReadings,
    clearProjectedReadingsWithin,
    projectedReadingWordAtPoint,
    pruneProjectedReadings,
    syncProjectedReadings,
});
