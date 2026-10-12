import {
    clearProjectedReadings,
    clearProjectedReadingsWithin,
    projectedReadingWordAtPoint,
    pruneProjectedReadings,
    syncProjectedReadings,
    withProjectedReadingBatch,
} from '../dom/detached-reading-overlay-impl';
import { registerYomuCompanion } from './registry';

registerYomuCompanion('annotations', {
    clearProjectedReadings,
    clearProjectedReadingsWithin,
    projectedReadingWordAtPoint,
    pruneProjectedReadings,
    syncProjectedReadings,
    withProjectedReadingBatch,
});
