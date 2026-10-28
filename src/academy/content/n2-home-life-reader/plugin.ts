import { createActivityRuntime, type ValidationIssue } from '../../domain/activity-runtime';
import { createN2OpeningPlugin } from '../n2-opening-kit';
import { N2_HOME_LIFE_READER_PROVENANCE } from './source';
import { N2_HOME_LIFE_READER_ACTIVITY_KIND, N2_HOME_LIFE_READER_PACKAGE_ID, type N2HomeLifeReaderModel } from './types';

const contract = Object.freeze({
    kind: N2_HOME_LIFE_READER_ACTIVITY_KIND,
    packageId: N2_HOME_LIFE_READER_PACKAGE_ID,
    order: 4 as const,
    sourceDelivery: 'reference-only' as const,
    validateProvenance(model: N2HomeLifeReaderModel): readonly ValidationIssue[] {
        return JSON.stringify(model.provenance) === JSON.stringify(N2_HOME_LIFE_READER_PROVENANCE)
            ? [] : [{ path: 'provenance', message: 'The exact graded-reader and Shin Kanzen loci are required.' }];
    },
});
export const n2HomeLifeReaderPlugin = createN2OpeningPlugin<N2HomeLifeReaderModel>(contract);
export const validateN2HomeLifeReader = n2HomeLifeReaderPlugin.validate;
export function createN2HomeLifeReaderRuntime() { return createActivityRuntime([n2HomeLifeReaderPlugin]); }
