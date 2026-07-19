import { createActivityRuntime, type ValidationIssue } from '../../domain/activity-runtime';
import { createN2OpeningPlugin } from '../n2-opening-kit';
import { N2_PPOI_IMPRESSION_PROVENANCE } from './source';
import { N2_PPOI_IMPRESSION_ACTIVITY_KIND, N2_PPOI_IMPRESSION_PACKAGE_ID, type N2PpoiImpressionModel } from './types';

const contract = Object.freeze({
    kind: N2_PPOI_IMPRESSION_ACTIVITY_KIND,
    packageId: N2_PPOI_IMPRESSION_PACKAGE_ID,
    order: 2 as const,
    sourceDelivery: 'reference-only' as const,
    validateProvenance(model: N2PpoiImpressionModel): readonly ValidationIssue[] {
        return JSON.stringify(model.provenance) === JSON.stringify(N2_PPOI_IMPRESSION_PROVENANCE)
            ? [] : [{ path: 'provenance', message: 'The exact Sou Matome N2 grammar locus is required.' }];
    },
});

export const n2PpoiImpressionPlugin = createN2OpeningPlugin<N2PpoiImpressionModel>(contract);
export const validateN2PpoiImpression = n2PpoiImpressionPlugin.validate;
export function createN2PpoiImpressionRuntime() { return createActivityRuntime([n2PpoiImpressionPlugin]); }
