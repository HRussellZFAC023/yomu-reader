import { N2_HOME_LIFE_READER_PACKAGE_ID, type N2HomeLifeReaderProvenance } from './types';

const RIGHTS = Object.freeze({
    state: 'user-permitted-local-reference-only' as const,
    sourceTextDelivery: 'not-delivered' as const,
    sourceImageDelivery: 'not-delivered' as const,
    learnerActivityText: 'original-yomu-authored' as const,
});

export const N2_HOME_LIFE_READER_PROVENANCE = Object.freeze({
    packageId: N2_HOME_LIFE_READER_PACKAGE_ID,
    answerVisibility: 'after-attempt' as const,
    readerReference: Object.freeze({
        sourceScope: 'japanese-library' as const,
        sourceFamily: 'japanese-graded-readers' as const,
        sourceTitle: 'にほんご よむよむ文庫 レベル4「走れメロス」' as const,
        sourceId: 'japanese-library:5106c21695ef2916ef39c9307e4b1d1d9134500d6e2cee618c2385979e4dc2a7:hashire-merosu-page-003:narrative-turn',
        relativePath: "Resource Packs/Japanese Mega Learning Pack/05.Children's Books, Readers/Japanese Readers/Japanese graded readers level 4 vol 1/Books/hashire merosu/003.jpg",
        sourceAssetSha256: '5106c21695ef2916ef39c9307e4b1d1d9134500d6e2cee618c2385979e4dc2a7',
        sourceAssetByteLength: 363570 as const,
        sourceLocus: Object.freeze({ imageFile: '003.jpg' as const, printedPages: '4-5' as const, item: 'opening spread / しかし transition' as const }),
        sourceLocusSha256: '392d7ae2d8e8aa9840958fae4382c326254c33e8d81bb8a49f951fbfcc3a1321',
        rights: RIGHTS,
    }),
    strategyReference: Object.freeze({
        sourceScope: 'japanese-library' as const,
        sourceFamily: 'shin-kanzen' as const,
        sourceTitle: '新完全マスター読解 N2' as const,
        sourceId: 'japanese-library:a5b8b80a6d58d48f43fe92a3eac5e12999e58e86cea942b86a8c79723f6491f5:pdf-page-012:whole-text-grasp',
        relativePath: 'Resource Packs/Japanese Language Learning Pack - Learn Japanese!/07 Japanese N3-N1/新完全マスター N3-N1. Shin kanzen masutā/新完全マスター N2/新完全マスター読解, N2 Shin kanzen masutā dokkai, N2.pdf',
        sourceDocumentSha256: 'a5b8b80a6d58d48f43fe92a3eac5e12999e58e86cea942b86a8c79723f6491f5',
        sourceDocumentByteLength: 114245558 as const,
        sourceLocus: Object.freeze({ pdfPage: 12 as const, printedPage: 5 as const, section: '1 文章のしくみを理解する' as const, item: '全体をつかもう' as const }),
        sourceLocusSha256: '4cc02d3ada2626c5395923c97560f6b7472b00639c1fa17198debe109a98e06b',
        rights: RIGHTS,
    }),
    combinedSourceLocusSha256: '9e42671a88024719ee128da839f71cf2fca9be0bb26fa6b48a45c0e60da6a492',
}) satisfies N2HomeLifeReaderProvenance;

export function canonicalN2HomeLifeReaderImageLocus(): string {
    const source = N2_HOME_LIFE_READER_PROVENANCE.readerReference;
    return [source.sourceId, source.sourceAssetSha256, String(source.sourceAssetByteLength), source.relativePath,
        source.sourceLocus.imageFile, source.sourceLocus.printedPages, 'にほんご よむよむ文庫 レベル4', '走れメロス opening spread / しかし transition',
    ].join('\n') + '\n';
}

export function canonicalN2HomeLifeReaderStrategyLocus(): string {
    const source = N2_HOME_LIFE_READER_PROVENANCE.strategyReference;
    return [source.sourceId, source.sourceDocumentSha256, String(source.sourceDocumentByteLength), source.relativePath,
        String(source.sourceLocus.pdfPage), String(source.sourceLocus.printedPage), source.sourceLocus.section, source.sourceLocus.item,
    ].join('\n') + '\n';
}

export function canonicalN2HomeLifeReaderCombinedLocus(): string {
    return `${N2_HOME_LIFE_READER_PROVENANCE.readerReference.sourceLocusSha256}\n${N2_HOME_LIFE_READER_PROVENANCE.strategyReference.sourceLocusSha256}\n`;
}
