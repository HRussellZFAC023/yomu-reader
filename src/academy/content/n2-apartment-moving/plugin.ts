import { createActivityRuntime, type ValidationIssue } from '../../domain/activity-runtime';
import { createN2OpeningPlugin } from '../n2-opening-kit';
import { N2_APARTMENT_MOVING_PROVENANCE } from './source';
import { N2_APARTMENT_MOVING_ACTIVITY_KIND, N2_APARTMENT_MOVING_PACKAGE_ID, type N2ApartmentMovingModel } from './types';

const contract = Object.freeze({
    kind: N2_APARTMENT_MOVING_ACTIVITY_KIND,
    packageId: N2_APARTMENT_MOVING_PACKAGE_ID,
    order: 1 as const,
    sourceDelivery: 'reference-only' as const,
    validateProvenance(model: N2ApartmentMovingModel): readonly ValidationIssue[] {
        return JSON.stringify(model.provenance) === JSON.stringify(N2_APARTMENT_MOVING_PROVENANCE)
            ? [] : [{ path: 'provenance', message: 'The exact Sou Matome N2 vocabulary locus is required.' }];
    },
});

export const n2ApartmentMovingPlugin = createN2OpeningPlugin<N2ApartmentMovingModel>(contract);
export const validateN2ApartmentMoving = n2ApartmentMovingPlugin.validate;

export function createN2ApartmentMovingRuntime() {
    return createActivityRuntime([n2ApartmentMovingPlugin]);
}
