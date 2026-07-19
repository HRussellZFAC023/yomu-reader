import type { N2OpeningActivityModel, N2OpeningPackage, N2OpeningProvenance } from '../n2-opening-kit';

export const N2_MOVING_COUPON_ACTIVITY_KIND = 'academy-n2-moving-coupon' as const;
export const N2_MOVING_COUPON_PACKAGE_ID = 'n2-home-life-opening-03-coupon' as const;

export interface N2MovingCouponProvenance extends N2OpeningProvenance<typeof N2_MOVING_COUPON_PACKAGE_ID> {
    readonly sourceScope: 'japanese-library';
    readonly sourceFamily: 'sou-matome';
    readonly sourceTitle: '日本語総まとめ N2 読解';
    readonly sourceId: string;
    readonly relativePath: string;
    readonly sourceDocumentSha256: string;
    readonly sourceDocumentByteLength: 88223010;
    readonly sourceLocus: Readonly<{
        pdfPage: 13;
        printedPage: 12;
        section: '第1週 身の回りの文書を読もう';
        item: '1日目 割引券・クーポン';
    }>;
    readonly sourceLocusSha256: string;
    readonly rights: Readonly<{
        state: 'user-permitted-local-reference-only';
        sourceTextDelivery: 'not-delivered';
        sourceImageDelivery: 'not-delivered';
        learnerActivityText: 'original-yomu-authored';
    }>;
}

export type N2MovingCouponModel = N2OpeningActivityModel<
    typeof N2_MOVING_COUPON_ACTIVITY_KIND,
    'n2-moving-coupon-v1',
    typeof N2_MOVING_COUPON_PACKAGE_ID,
    N2MovingCouponProvenance
>;
export type N2MovingCouponPackage = N2OpeningPackage<typeof N2_MOVING_COUPON_PACKAGE_ID, N2MovingCouponModel>;
