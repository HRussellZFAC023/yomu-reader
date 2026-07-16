import type { N3N4SleepBridgeSourceSegment } from './types';

export const N3_N4_SLEEP_BRIDGE_PACKAGE_ID = 'n3-n4-sleep-bridge-01' as const;

export const N3_N4_SLEEP_BRIDGE_PROVENANCE = Object.freeze({
    packageId: N3_N4_SLEEP_BRIDGE_PACKAGE_ID,
    sourceScope: 'soya-research' as const,
    sourceId: 'soya-research:b438b2dffb09fb7db8f5b5e671ae61e97ad1b838627118614bf83c64d22b7b35:mock1_r_03',
    relativePath: 'data/courses/jlpt_n3/mock1_reading.js',
    payloadSha256: 'b438b2dffb09fb7db8f5b5e671ae61e97ad1b838627118614bf83c64d22b7b35',
    sourceItemId: 'mock1_r_03' as const,
    sourceItemSha256: '168a53a759bffa7cc9f2e4753cc60965437789ac04c70cfc24a941c3e72efd95',
    permission: 'user-permitted-local-educational-use' as const,
    originalMediaState: 'not-paired-not-delivered' as const,
});

export const N3_N4_SLEEP_BRIDGE_SOURCE_SEGMENTS: readonly N3N4SleepBridgeSourceSegment[] = Object.freeze([
    Object.freeze({
        id: 'source-sleep-habits',
        text: '昔の人は夜になると寝て、朝になると起きる生活をしていた。しかし、電気が発明されてから、夜遅くまで起きている人が多くなった。便利になった一方で、睡眠不足で疲れている人も増えているようだ。',
        translation: 'People in the past slept at night and woke in the morning. After electricity was invented, more people began staying up late. While life became more convenient, there also seem to be more people tired from insufficient sleep.',
    }),
]);

export function canonicalN3N4SleepBridgeSourceItemPayload(
    segments = N3_N4_SLEEP_BRIDGE_SOURCE_SEGMENTS,
): string {
    return `${N3_N4_SLEEP_BRIDGE_PROVENANCE.sourceItemId}\n${segments.map(segment => segment.text).join('\n')}\n`;
}
