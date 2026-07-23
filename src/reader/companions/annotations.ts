import {
    clearProjectedReadings,
    clearProjectedReadingsWithin,
    pruneProjectedReadings,
    syncProjectedReadings,
} from '../dom/detached-reading-overlay-impl';
import { registerYomuCompanion } from './registry';

registerYomuCompanion('annotations', {
    clearProjectedReadings,
    clearProjectedReadingsWithin,
    pruneProjectedReadings,
    syncProjectedReadings,
});
