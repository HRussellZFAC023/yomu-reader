import type { N2PolicyScopeModel } from './types';

export const N2_POLICY_SCOPE_PACKAGE_ID = 'n2-policy-scope-01' as const;

export const N2_POLICY_SCOPE_PROVENANCE = Object.freeze({
    packageId: N2_POLICY_SCOPE_PACKAGE_ID,
    sourceScope: 'japanese-library' as const,
    sourceId: 'japanese-library:9f71994c965a0fa9f7e44b9400fa5e6b9c2a97c09c8f28e2d9a1948ecb86967c:pdf-page-015:question-15',
    sourceFamily: 'shin-kanzen' as const,
    sourceTitle: '新完全マスター文法 N2' as const,
    relativePath: 'Resource Packs/Japanese Language Learning Pack - Learn Japanese!/07 Japanese N3-N1/新完全マスター N3-N1. Shin kanzen masutā/新完全マスター N2/新完全マスター文法, N2 Shin kanzen masutā bunpō, N2.pdf',
    sourceDocumentSha256: '9f71994c965a0fa9f7e44b9400fa5e6b9c2a97c09c8f28e2d9a1948ecb86967c',
    sourceDocumentByteLength: 69215273,
    sourcePageImageSha256: '19536c486a83cfa64311152208885cc24484d67f9380a05d0669b819e84b6b0b',
    sourceLocus: Object.freeze({
        pdfPage: 15 as const,
        printedPage: 4 as const,
        section: 'III:文章の文法' as const,
        item: '問題15:空所1-5' as const,
    }),
    sourceLocusSha256: '9801d34186954746ccd4c95839e55e69eeb9efe72910f70ba7fe0a5d11a0212a',
    rights: Object.freeze({
        state: 'user-permitted-local-reference-only' as const,
        sourceTextDelivery: 'not-delivered' as const,
        sourceMediaDelivery: 'not-delivered' as const,
        learnerActivityText: 'original-yomu-authored' as const,
    }),
}) satisfies N2PolicyScopeModel['provenance'];

export function canonicalN2PolicyScopeSourceLocus(): string {
    const { sourceLocus } = N2_POLICY_SCOPE_PROVENANCE;
    return [
        N2_POLICY_SCOPE_PROVENANCE.sourceId,
        N2_POLICY_SCOPE_PROVENANCE.sourceDocumentSha256,
        String(N2_POLICY_SCOPE_PROVENANCE.sourceDocumentByteLength),
        N2_POLICY_SCOPE_PROVENANCE.sourcePageImageSha256,
        String(sourceLocus.pdfPage),
        String(sourceLocus.printedPage),
        sourceLocus.section,
        sourceLocus.item,
    ].join('\n') + '\n';
}
