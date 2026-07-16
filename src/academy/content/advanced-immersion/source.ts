import type { AdvancedImmersionQuarantine, AdvancedImmersionSourceSegment } from './types';

export const ADVANCED_IMMERSION_PACKAGE_ID = 'advanced-immersion-n3-n1-01' as const;

export const ADVANCED_IMMERSION_PROVENANCE = Object.freeze({
    packageId: ADVANCED_IMMERSION_PACKAGE_ID,
    sourceScope: 'soya-research' as const,
    sourceId: 'soya-research:b438b2dffb09fb7db8f5b5e671ae61e97ad1b838627118614bf83c64d22b7b35:mock1_r_03',
    relativePath: 'data/courses/jlpt_n3/mock1_reading.js',
    payloadSha256: 'b438b2dffb09fb7db8f5b5e671ae61e97ad1b838627118614bf83c64d22b7b35',
    sourceItemId: 'mock1_r_03' as const,
    sourceItemSha256: 'd9d430c574a31360ea57eb7dcf4ae32ae3d7bbd33788252b5dc8826c049c2d90',
    permission: 'user-permitted-local-educational-use' as const,
    originalMediaState: 'not-paired-not-delivered' as const,
});

export const ADVANCED_IMMERSION_SOURCE_SEGMENTS: readonly AdvancedImmersionSourceSegment[] = Object.freeze([
    segment(
        'source-before-electricity',
        '昔の人は夜になると寝て、朝になると起きる生活をしていた。',
        'People in the past used to sleep at night and wake in the morning.',
    ),
    segment(
        'source-change-after-electricity',
        'しかし、電気が発明されてから、夜遅くまで起きている人が多くなった。',
        'However, after electricity was invented, more people stayed awake late into the night.',
    ),
    segment(
        'source-qualified-consequence',
        '便利になった一方で、睡眠不足で疲れている人も増えているようだ。',
        'While life became more convenient, it seems that more people are also tired from lack of sleep.',
    ),
]);

export const ADVANCED_IMMERSION_QUARANTINE: readonly AdvancedImmersionQuarantine[] = Object.freeze([
    quarantine('tobira-n3-n1', 'tobira'),
    quarantine('shin-kanzen-n2-n1', 'shin-kanzen'),
    quarantine('sou-matome-n3-n1', 'sou-matome'),
    quarantine('soya-n3-reading-audio', 'soya-audio'),
]);

export function canonicalAdvancedImmersionSourceItemPayload(
    segments = ADVANCED_IMMERSION_SOURCE_SEGMENTS,
): string {
    return `${ADVANCED_IMMERSION_PROVENANCE.sourceItemId}\n${segments.map(segment => segment.text).join('\n')}\n`;
}

function segment(id: string, text: string, translation: string): AdvancedImmersionSourceSegment {
    return Object.freeze({ id, text, translation });
}

function quarantine(
    id: string,
    sourceFamily: AdvancedImmersionQuarantine['sourceFamily'],
): AdvancedImmersionQuarantine {
    return Object.freeze({
        id: `quarantine:${ADVANCED_IMMERSION_PACKAGE_ID}:${id}`,
        sourceFamily,
        state: 'quarantined-not-playable',
        gaps: Object.freeze(['rights-review-required', 'item-locus-unverified', 'transcript-audio-pairing-unverified'] as const),
    });
}
