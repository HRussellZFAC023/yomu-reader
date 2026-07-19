import type { N2OpeningActivityModel, N2OpeningPackage, N2OpeningProvenance } from '../n2-opening-kit';

export const N2_PPOI_IMPRESSION_ACTIVITY_KIND = 'academy-n2-ppoi-impression' as const;
export const N2_PPOI_IMPRESSION_PACKAGE_ID = 'n2-home-life-opening-02-ppoi' as const;

export interface N2PpoiImpressionProvenance extends N2OpeningProvenance<typeof N2_PPOI_IMPRESSION_PACKAGE_ID> {
    readonly sourceScope: 'japanese-library';
    readonly sourceFamily: 'sou-matome';
    readonly sourceTitle: '日本語総まとめ N2 文法';
    readonly sourceId: string;
    readonly relativePath: string;
    readonly sourceDocumentSha256: string;
    readonly sourceDocumentByteLength: 102319991;
    readonly sourceLocus: Readonly<{
        pdfPage: 15;
        printedPage: 14;
        section: '第1週 おぼえずにはいられない';
        item: '1日目 熱っぽい / 〜っぽい';
    }>;
    readonly sourceLocusSha256: string;
    readonly rights: Readonly<{
        state: 'user-permitted-local-reference-only';
        sourceTextDelivery: 'not-delivered';
        sourceImageDelivery: 'not-delivered';
        learnerActivityText: 'original-yomu-authored';
    }>;
}

export type N2PpoiImpressionModel = N2OpeningActivityModel<
    typeof N2_PPOI_IMPRESSION_ACTIVITY_KIND,
    'n2-ppoi-impression-v1',
    typeof N2_PPOI_IMPRESSION_PACKAGE_ID,
    N2PpoiImpressionProvenance
>;

export type N2PpoiImpressionPackage = N2OpeningPackage<typeof N2_PPOI_IMPRESSION_PACKAGE_ID, N2PpoiImpressionModel>;
