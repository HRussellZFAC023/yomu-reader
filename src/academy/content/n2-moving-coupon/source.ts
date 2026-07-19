import { N2_MOVING_COUPON_PACKAGE_ID, type N2MovingCouponProvenance } from './types';

export const N2_MOVING_COUPON_PROVENANCE = Object.freeze({
    packageId: N2_MOVING_COUPON_PACKAGE_ID,
    answerVisibility: 'after-attempt' as const,
    sourceScope: 'japanese-library' as const,
    sourceFamily: 'sou-matome' as const,
    sourceTitle: '日本語総まとめ N2 読解' as const,
    sourceId: 'japanese-library:7cc4618d2b36bb78b12217a4fc6a398c3bce99aa441cfab9514c4a5e72922fdd:pdf-page-013:coupon-constraints',
    relativePath: 'Resource Packs/Japanese Language Learning Pack - Learn Japanese!/07 Japanese N3-N1/日本語総まとめ N1-N3. Nihongo sōmatome/日本語総まとめ N2/日本語総まとめ N2, 読解  Nihongo sōmatome N2, Dokkai.pdf',
    sourceDocumentSha256: '7cc4618d2b36bb78b12217a4fc6a398c3bce99aa441cfab9514c4a5e72922fdd',
    sourceDocumentByteLength: 88223010 as const,
    sourceLocus: Object.freeze({
        pdfPage: 13 as const,
        printedPage: 12 as const,
        section: '第1週 身の回りの文書を読もう' as const,
        item: '1日目 割引券・クーポン' as const,
    }),
    sourceLocusSha256: '368ba64fb118e9b9f706d2867959f8e9a849745321ef6e33e2977005b9aaa2d4',
    rights: Object.freeze({
        state: 'user-permitted-local-reference-only' as const,
        sourceTextDelivery: 'not-delivered' as const,
        sourceImageDelivery: 'not-delivered' as const,
        learnerActivityText: 'original-yomu-authored' as const,
    }),
}) satisfies N2MovingCouponProvenance;

export function canonicalN2MovingCouponSourceLocus(): string {
    const source = N2_MOVING_COUPON_PROVENANCE;
    return [source.sourceId, source.sourceDocumentSha256, String(source.sourceDocumentByteLength), source.relativePath,
        String(source.sourceLocus.pdfPage), String(source.sourceLocus.printedPage), source.sourceLocus.section, source.sourceLocus.item,
    ].join('\n') + '\n';
}
