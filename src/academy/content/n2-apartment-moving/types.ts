import type { N2OpeningActivityModel, N2OpeningPackage, N2OpeningProvenance } from '../n2-opening-kit';

export const N2_APARTMENT_MOVING_ACTIVITY_KIND = 'academy-n2-apartment-moving' as const;
export const N2_APARTMENT_MOVING_PACKAGE_ID = 'n2-home-life-opening-01-apartment-moving' as const;

export interface N2ApartmentMovingProvenance extends N2OpeningProvenance<typeof N2_APARTMENT_MOVING_PACKAGE_ID> {
    readonly sourceScope: 'japanese-library';
    readonly sourceFamily: 'sou-matome';
    readonly sourceTitle: '日本語総まとめ N2 語彙';
    readonly sourceId: string;
    readonly relativePath: string;
    readonly sourceDocumentSha256: string;
    readonly sourceDocumentByteLength: 103130943;
    readonly sourceLocus: Readonly<{
        pdfPages: '13-16';
        printedPages: '12-15';
        section: '第1週 楽しく暮らしていますか？';
        item: '1日目 アパートを探しています / 2日目 引っ越しは大変です';
    }>;
    readonly sourceLocusSha256: string;
    readonly rights: Readonly<{
        state: 'user-permitted-local-reference-only';
        sourceTextDelivery: 'not-delivered';
        sourceImageDelivery: 'not-delivered';
        learnerActivityText: 'original-yomu-authored';
    }>;
}

export type N2ApartmentMovingModel = N2OpeningActivityModel<
    typeof N2_APARTMENT_MOVING_ACTIVITY_KIND,
    'n2-apartment-moving-v1',
    typeof N2_APARTMENT_MOVING_PACKAGE_ID,
    N2ApartmentMovingProvenance
>;

export type N2ApartmentMovingPackage = N2OpeningPackage<
    typeof N2_APARTMENT_MOVING_PACKAGE_ID,
    N2ApartmentMovingModel
>;
