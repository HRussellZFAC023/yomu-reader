import { createActivityRuntime } from '../../domain/activity-runtime';
import { advancedImmersionPlugin } from './plugin';

export function createAdvancedImmersionRuntime() {
    return createActivityRuntime([advancedImmersionPlugin]);
}

export {
    ADVANCED_IMMERSION_PACKAGE_ID,
    ADVANCED_IMMERSION_PROVENANCE,
    ADVANCED_IMMERSION_QUARANTINE,
    ADVANCED_IMMERSION_SOURCE_SEGMENTS,
    canonicalAdvancedImmersionSourceItemPayload,
} from './source';
export { createAdvancedImmersionPackage } from './package';
export { ADVANCED_IMMERSION_PACKAGES, resolveAdvancedImmersionPackage } from './registry';
export { advancedImmersionPlugin, advancedImmersionReviewSeeds, gradeAdvancedImmersion, validateAdvancedImmersion } from './plugin';
export type {
    AdvancedImmersionModel,
    AdvancedImmersionPackage,
    AdvancedImmersionPrerequisite,
    AdvancedImmersionQuarantine,
    AdvancedImmersionReaderSrsProjection,
    AdvancedImmersionResponse,
    AdvancedImmersionSourceSegment,
} from './types';
