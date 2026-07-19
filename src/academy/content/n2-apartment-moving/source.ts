import type { N2ApartmentMovingProvenance } from './types';
import { N2_APARTMENT_MOVING_PACKAGE_ID } from './types';

export const N2_APARTMENT_MOVING_PROVENANCE = Object.freeze({
    packageId: N2_APARTMENT_MOVING_PACKAGE_ID,
    answerVisibility: 'after-attempt' as const,
    sourceScope: 'japanese-library' as const,
    sourceFamily: 'sou-matome' as const,
    sourceTitle: '日本語総まとめ N2 語彙' as const,
    sourceId: 'japanese-library:882fde25c946fd491f6078be41a41265e3e971d215bd89382215572f2cefa5cf:pdf-pages-013-016:apartment-and-moving',
    relativePath: 'Resource Packs/Japanese Language Learning Pack - Learn Japanese!/07 Japanese N3-N1/日本語総まとめ N1-N3. Nihongo sōmatome/日本語総まとめ N2/日本語総まとめ N2, 語彙  Nihongo sōmatome N2, Goi.pdf',
    sourceDocumentSha256: '882fde25c946fd491f6078be41a41265e3e971d215bd89382215572f2cefa5cf',
    sourceDocumentByteLength: 103130943 as const,
    sourceLocus: Object.freeze({
        pdfPages: '13-16' as const,
        printedPages: '12-15' as const,
        section: '第1週 楽しく暮らしていますか？' as const,
        item: '1日目 アパートを探しています / 2日目 引っ越しは大変です' as const,
    }),
    sourceLocusSha256: '72f9fd3eaa79ab877be9d7bfe0281fdf8f4e15d2c9ae5fca588b902e8928a0eb',
    rights: Object.freeze({
        state: 'user-permitted-local-reference-only' as const,
        sourceTextDelivery: 'not-delivered' as const,
        sourceImageDelivery: 'not-delivered' as const,
        learnerActivityText: 'original-yomu-authored' as const,
    }),
}) satisfies N2ApartmentMovingProvenance;

export function canonicalN2ApartmentMovingSourceLocus(): string {
    const source = N2_APARTMENT_MOVING_PROVENANCE;
    return [
        source.sourceId,
        source.sourceDocumentSha256,
        String(source.sourceDocumentByteLength),
        source.relativePath,
        source.sourceLocus.pdfPages,
        source.sourceLocus.printedPages,
        source.sourceLocus.section,
        source.sourceLocus.item,
    ].join('\n') + '\n';
}
