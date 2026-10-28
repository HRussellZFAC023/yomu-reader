import type { N1SoundDiscriminationModel } from './types';

export const N1_SOUND_DISCRIMINATION_PACKAGE_ID = 'n1-sound-discrimination-01' as const;

export const N1_SOUND_DISCRIMINATION_PROVENANCE = Object.freeze({
    packageId: N1_SOUND_DISCRIMINATION_PACKAGE_ID,
    sourceScope: 'japanese-library' as const,
    sourceId: 'japanese-library:cb9872226b092bc48b4f6c070247b15ea64e2ce9e250df555ac8898eab1d1ecf:pdf-page-023:similar-sound-discrimination',
    sourceFamily: 'shin-kanzen' as const,
    sourceTitle: '新完全マスター聴解 N1' as const,
    relativePath: 'Resource Packs/Japanese Language Learning Pack - Learn Japanese!/07 Japanese N3-N1/新完全マスター N3-N1. Shin kanzen masutā/新完全マスター N1/新完全マスター聴解, N1 Shin kanzen masutā chōkai/新完全マスター聴解, N1 Shin kanzen masutā chōkai, N1.pdf',
    sourceDocumentSha256: 'cb9872226b092bc48b4f6c070247b15ea64e2ce9e250df555ac8898eab1d1ecf',
    sourceDocumentByteLength: 21196731 as const,
    sourcePageImageSha256: '20e80db140403c64fdf813ab9d2dbc72cf94a3e65321f3890be4df722f55383e',
    sourcePageImageByteLength: 839734 as const,
    sourceAudioRelativePath: 'Resource Packs/Japanese Language Learning Pack - Learn Japanese!/07 Japanese N3-N1/新完全マスター N3-N1. Shin kanzen masutā/新完全マスター N1/新完全マスター聴解, N1 Shin kanzen masutā chōkai/CD1 - 新完全マスター聴解, N1 chōkai/07.mp3',
    sourceAudioSha256: 'c1d18d224b6036ae0fbe6beb63a6e705969fa38b4df2bac84cddc3a0df4ef72c',
    sourceAudioByteLength: 1456001 as const,
    sourceLocus: Object.freeze({
        pdfPage: 23 as const,
        printedPage: 14 as const,
        section: 'I 音声の特徴に慣れる' as const,
        item: '1 似ている音の聞き分け' as const,
        exercise: '練習1' as const,
        track: 'A07' as const,
    }),
    sourceLocusSha256: '0a1e5be735f75228af734e893b19da693b7199c5f65c49a364d9201f4d4f22e4',
    rights: Object.freeze({
        state: 'user-permitted-local-reference-only' as const,
        sourceTextDelivery: 'not-delivered' as const,
        sourceImageDelivery: 'not-delivered' as const,
        sourceAudioDelivery: 'not-delivered' as const,
        learnerActivityText: 'original-yomu-authored' as const,
    }),
    sourceMediaState: 'local-reference-not-delivered' as const,
}) satisfies N1SoundDiscriminationModel['provenance'];

export function canonicalN1SoundDiscriminationSourceLocus(): string {
    const source = N1_SOUND_DISCRIMINATION_PROVENANCE;
    return [
        source.sourceId,
        source.sourceDocumentSha256,
        String(source.sourceDocumentByteLength),
        source.sourcePageImageSha256,
        String(source.sourcePageImageByteLength),
        source.sourceAudioSha256,
        String(source.sourceAudioByteLength),
        String(source.sourceLocus.pdfPage),
        String(source.sourceLocus.printedPage),
        source.sourceLocus.section,
        source.sourceLocus.item,
        source.sourceLocus.exercise,
        source.sourceLocus.track,
    ].join('\n') + '\n';
}
