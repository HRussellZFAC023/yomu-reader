import type { N3PetHousingQuarantine, N3PetHousingSourceSegment } from './types';

export const N3_PET_HOUSING_PACKAGE_ID = 'n3-pet-housing-01' as const;

export const N3_PET_HOUSING_PROVENANCE = Object.freeze({
    packageId: N3_PET_HOUSING_PACKAGE_ID,
    sourceScope: 'soya-research' as const,
    sourceId: 'soya-research:b438b2dffb09fb7db8f5b5e671ae61e97ad1b838627118614bf83c64d22b7b35:mock1_r_04',
    relativePath: 'data/courses/jlpt_n3/mock1_reading.js',
    payloadSha256: 'b438b2dffb09fb7db8f5b5e671ae61e97ad1b838627118614bf83c64d22b7b35',
    sourceItemId: 'mock1_r_04' as const,
    sourceItemSha256: '14afa7120b21e62e1b95fc405b64d09a7b1c46b04e88ff0916e4673b3b33800b',
    permission: 'user-permitted-local-educational-use' as const,
    originalMediaState: 'not-paired-not-delivered' as const,
});

export const N3_PET_HOUSING_SOURCE_SEGMENTS: readonly N3PetHousingSourceSegment[] = Object.freeze([
    Object.freeze({
        id: 'source-pet-housing',
        text: 'ペットを飼うアパートが増えている。一人暮らしの寂しさを癒すために犬や猫を飼う人が多いからだ。しかし、鳴き声やにおいの問題で隣の人とトラブルになるケースも少なくない。',
        translation: 'More apartments allow pets. Many people keep dogs or cats to ease the loneliness of living alone. However, noise and smells can also lead to trouble with neighbours.',
    }),
]);

export const N3_PET_HOUSING_QUARANTINE: readonly N3PetHousingQuarantine[] = Object.freeze([
    quarantine('tobira-n3-reading', 'tobira'),
    quarantine('shin-kanzen-n3-reading', 'shin-kanzen'),
    quarantine('sou-matome-n3-reading', 'sou-matome'),
    quarantine('soya-source-audio', 'soya-audio'),
]);

export function canonicalN3PetHousingSourceItemPayload(
    segments = N3_PET_HOUSING_SOURCE_SEGMENTS,
): string {
    return `${N3_PET_HOUSING_PROVENANCE.sourceItemId}\n${segments.map(segment => segment.text).join('\n')}\n`;
}

function quarantine(
    id: string,
    sourceFamily: N3PetHousingQuarantine['sourceFamily'],
): N3PetHousingQuarantine {
    return Object.freeze({
        id: `quarantine:${N3_PET_HOUSING_PACKAGE_ID}:${id}`,
        sourceFamily,
        state: 'quarantined-not-playable',
        gaps: Object.freeze(['rights-review-required', 'item-locus-unverified', 'transcript-audio-pairing-unverified'] as const),
    });
}
