import { N2_PPOI_IMPRESSION_PACKAGE_ID, type N2PpoiImpressionProvenance } from './types';

export const N2_PPOI_IMPRESSION_PROVENANCE = Object.freeze({
    packageId: N2_PPOI_IMPRESSION_PACKAGE_ID,
    answerVisibility: 'after-attempt' as const,
    sourceScope: 'japanese-library' as const,
    sourceFamily: 'sou-matome' as const,
    sourceTitle: '日本語総まとめ N2 文法' as const,
    sourceId: 'japanese-library:75f4a987b5f6071ed72c1dc079382f5f996dc2965eb4bf2ef1832c55dddbc9b8:pdf-page-015:ppoi',
    relativePath: 'Resource Packs/Japanese Language Learning Pack - Learn Japanese!/07 Japanese N3-N1/日本語総まとめ N1-N3. Nihongo sōmatome/日本語総まとめ N2/日本語総まとめ N2, 文法  Nihongo sōmatome N2, Bunpō.pdf',
    sourceDocumentSha256: '75f4a987b5f6071ed72c1dc079382f5f996dc2965eb4bf2ef1832c55dddbc9b8',
    sourceDocumentByteLength: 102319991 as const,
    sourceLocus: Object.freeze({
        pdfPage: 15 as const,
        printedPage: 14 as const,
        section: '第1週 おぼえずにはいられない' as const,
        item: '1日目 熱っぽい / 〜っぽい' as const,
    }),
    sourceLocusSha256: 'e4b18c4cd8c217b2bb0d3b65ef4ecd0471d1d140e97e71b6946808fc09e42f0c',
    rights: Object.freeze({
        state: 'user-permitted-local-reference-only' as const,
        sourceTextDelivery: 'not-delivered' as const,
        sourceImageDelivery: 'not-delivered' as const,
        learnerActivityText: 'original-yomu-authored' as const,
    }),
}) satisfies N2PpoiImpressionProvenance;

export function canonicalN2PpoiImpressionSourceLocus(): string {
    const source = N2_PPOI_IMPRESSION_PROVENANCE;
    return [source.sourceId, source.sourceDocumentSha256, String(source.sourceDocumentByteLength), source.relativePath,
        String(source.sourceLocus.pdfPage), String(source.sourceLocus.printedPage), source.sourceLocus.section, source.sourceLocus.item,
    ].join('\n') + '\n';
}
