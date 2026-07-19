import type { N2OpeningActivityModel, N2OpeningPackage, N2OpeningProvenance } from '../n2-opening-kit';

export const N2_HOME_LIFE_READER_ACTIVITY_KIND = 'academy-n2-home-life-reader' as const;
export const N2_HOME_LIFE_READER_PACKAGE_ID = 'n2-home-life-opening-04-reader' as const;

interface ReferenceOnlyRights {
    readonly state: 'user-permitted-local-reference-only';
    readonly sourceTextDelivery: 'not-delivered';
    readonly sourceImageDelivery: 'not-delivered';
    readonly learnerActivityText: 'original-yomu-authored';
}

export interface N2HomeLifeReaderProvenance extends N2OpeningProvenance<typeof N2_HOME_LIFE_READER_PACKAGE_ID> {
    readonly readerReference: Readonly<{
        sourceScope: 'japanese-library';
        sourceFamily: 'japanese-graded-readers';
        sourceTitle: 'にほんご よむよむ文庫 レベル4「走れメロス」';
        sourceId: string;
        relativePath: string;
        sourceAssetSha256: string;
        sourceAssetByteLength: 363570;
        sourceLocus: Readonly<{
            imageFile: '003.jpg';
            printedPages: '4-5';
            item: 'opening spread / しかし transition';
        }>;
        sourceLocusSha256: string;
        rights: ReferenceOnlyRights;
    }>;
    readonly strategyReference: Readonly<{
        sourceScope: 'japanese-library';
        sourceFamily: 'shin-kanzen';
        sourceTitle: '新完全マスター読解 N2';
        sourceId: string;
        relativePath: string;
        sourceDocumentSha256: string;
        sourceDocumentByteLength: 114245558;
        sourceLocus: Readonly<{
            pdfPage: 12;
            printedPage: 5;
            section: '1 文章のしくみを理解する';
            item: '全体をつかもう';
        }>;
        sourceLocusSha256: string;
        rights: ReferenceOnlyRights;
    }>;
    readonly combinedSourceLocusSha256: string;
}

export type N2HomeLifeReaderModel = N2OpeningActivityModel<
    typeof N2_HOME_LIFE_READER_ACTIVITY_KIND,
    'n2-home-life-reader-v1',
    typeof N2_HOME_LIFE_READER_PACKAGE_ID,
    N2HomeLifeReaderProvenance
>;
export type N2HomeLifeReaderPackage = N2OpeningPackage<typeof N2_HOME_LIFE_READER_PACKAGE_ID, N2HomeLifeReaderModel>;
