import type { N2EventInformationModel } from './types';

export const N2_EVENT_INFORMATION_PACKAGE_ID = 'n2-event-information-01' as const;

export const N2_EVENT_INFORMATION_PROVENANCE = Object.freeze({
    packageId: N2_EVENT_INFORMATION_PACKAGE_ID,
    sourceScope: 'soya-research' as const,
    sourceId: 'soya-research:4665de0aab5656717c930508ee9b92e60d11f71d5030482b86ea31b7a50b5aa5:n2_m1_reading_info_0_1',
    sourceFamily: 'soya-jlpt' as const,
    relativePath: 'data/courses/jlpt_n2/mock_test_no1.js' as const,
    sourceDocumentSha256: '4665de0aab5656717c930508ee9b92e60d11f71d5030482b86ea31b7a50b5aa5',
    sourceDocumentByteLength: 292617 as const,
    sourceItemId: 'n2_m1_reading_info_0_1' as const,
    sourceItemJsonSha256: '3e8263fd4d20f2da4d5aa20b5e6496bc7e08b48830cfcad696e57332f4835c22',
    sourceLocusSha256: '00635bd0c1c66b74eaa68363937b1aec767136affd57137b6c199cbf8dd2ade6',
    rights: Object.freeze({
        state: 'user-permitted-local-reference-only' as const,
        sourceTextDelivery: 'not-delivered' as const,
        sourceAnswerDelivery: 'not-delivered' as const,
        sourceMediaDelivery: 'not-delivered' as const,
        learnerActivityText: 'original-yomu-authored' as const,
    }),
}) satisfies N2EventInformationModel['provenance'];

export function canonicalN2EventInformationSourceLocus(): string {
    return [
        N2_EVENT_INFORMATION_PROVENANCE.sourceId,
        N2_EVENT_INFORMATION_PROVENANCE.sourceDocumentSha256,
        String(N2_EVENT_INFORMATION_PROVENANCE.sourceDocumentByteLength),
        N2_EVENT_INFORMATION_PROVENANCE.relativePath,
        N2_EVENT_INFORMATION_PROVENANCE.sourceItemId,
        N2_EVENT_INFORMATION_PROVENANCE.sourceItemJsonSha256,
    ].join('\n') + '\n';
}
