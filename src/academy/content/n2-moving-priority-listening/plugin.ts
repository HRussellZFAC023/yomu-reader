import { createActivityRuntime, type ValidationIssue } from '../../domain/activity-runtime';
import { createN2OpeningPlugin } from '../n2-opening-kit';
import { N2_MOVING_PRIORITY_ANSWER, N2_MOVING_PRIORITY_LISTENING_PROVENANCE, N2_MOVING_PRIORITY_TRANSCRIPT } from './source';
import { N2_MOVING_PRIORITY_LISTENING_ACTIVITY_KIND, N2_MOVING_PRIORITY_LISTENING_PACKAGE_ID, type N2MovingPriorityListeningModel } from './types';

const contract = Object.freeze({
    kind: N2_MOVING_PRIORITY_LISTENING_ACTIVITY_KIND,
    packageId: N2_MOVING_PRIORITY_LISTENING_PACKAGE_ID,
    order: 5 as const,
    sourceDelivery: 'exact-media' as const,
    validateProvenance(model: N2MovingPriorityListeningModel): readonly ValidationIssue[] {
        return JSON.stringify(model.provenance) === JSON.stringify(N2_MOVING_PRIORITY_LISTENING_PROVENANCE)
            ? [] : [{ path: 'provenance', message: 'The exact listening-book and Soya source loci are required.' }];
    },
    validateMedia(model: N2MovingPriorityListeningModel): readonly ValidationIssue[] {
        const media = model.payload.media;
        const source = N2_MOVING_PRIORITY_LISTENING_PROVENANCE.sourceItem;
        return media?.kind === 'exact-soya-listening'
            && media.audioUrl === source.sourceAudio.packageUrl
            && media.imageUrl === source.sourceImage.packageUrl
            && media.transcriptVisibility === 'after-attempt'
            && media.answerVisibility === 'after-attempt'
            && media.correctAnswer === N2_MOVING_PRIORITY_ANSWER
            && JSON.stringify(media.transcript) === JSON.stringify(N2_MOVING_PRIORITY_TRANSCRIPT)
            ? [] : [{ path: 'payload.media', message: 'The exact pinned Soya media and after-attempt disclosure are required.' }];
    },
});
export const n2MovingPriorityListeningPlugin = createN2OpeningPlugin<N2MovingPriorityListeningModel>(contract);
export const validateN2MovingPriorityListening = n2MovingPriorityListeningPlugin.validate;
export function createN2MovingPriorityListeningRuntime() { return createActivityRuntime([n2MovingPriorityListeningPlugin]); }
