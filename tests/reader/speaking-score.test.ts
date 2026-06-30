import { describe, expect, it } from 'vitest';

import { scoreSpeakingSamples } from '../../src/reader/newtab/speaking-score';

const SAMPLE_RATE = 44_100;

function toneSequence(frequencies: number[], seconds = 0.32): Float32Array {
    const segmentLength = Math.round(SAMPLE_RATE * seconds);
    const samples = new Float32Array(segmentLength * frequencies.length);
    let phase = 0;
    for (let segment = 0; segment < frequencies.length; segment += 1) {
        const frequency = frequencies[segment] ?? 220;
        const phaseStep = 2 * Math.PI * frequency / SAMPLE_RATE;
        for (let index = 0; index < segmentLength; index += 1) {
            const envelope = Math.min(1, index / 200, (segmentLength - index) / 200);
            samples[segment * segmentLength + index] = Math.sin(phase) * 0.18 * envelope;
            phase += phaseStep;
        }
    }
    return samples;
}

describe('speaking pitch scoring', () => {
    it('scores a matching low-high contour as good', () => {
        const result = scoreSpeakingSamples(toneSequence([150, 245]), SAMPLE_RATE, 'LH');
        expect(result?.verdict).toBe('good');
        expect(result?.observedPattern).toBe('LH');
        expect(result?.score ?? 0).toBeGreaterThanOrEqual(82);
    });

    it('penalizes a reversed contour', () => {
        const result = scoreSpeakingSamples(toneSequence([245, 150]), SAMPLE_RATE, 'LH');
        expect(result?.observedPattern).toBe('HL');
        expect(result?.score ?? 100).toBeLessThan(62);
    });

    it('returns null when there is no voiced pitch to compare', () => {
        const result = scoreSpeakingSamples(new Float32Array(Math.round(SAMPLE_RATE * 0.5)), SAMPLE_RATE, 'LH');
        expect(result).toBeNull();
    });
});
