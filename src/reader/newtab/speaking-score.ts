import { splitMorae } from '../lookup/pitch-accent';
import type { PitchSrsItem } from './pitch-srs';

const MIN_PITCH_HZ = 70;
const MAX_PITCH_HZ = 500;
const FRAME_MS = 46;
const HOP_MS = 18;
const MIN_RMS = 0.006;
const MIN_CORRELATION = 0.55;
const MIN_VOICED_SECONDS = 0.12;

export type SpeakingPitchVerdict = 'good' | 'close' | 'retry';

export interface SpeakingPitchScore {
    score: number;
    verdict: SpeakingPitchVerdict;
    expectedPattern: string;
    observedPattern: string;
    voicedRatio: number;
    frameCount: number;
}

interface PitchFrame {
    time: number;
    hz: number;
}

interface BinPitch {
    hz: number | null;
    count: number;
}

type AudioContextCtor = new () => AudioContext;

export async function scoreSpeakingBlob(blob: Blob, item: PitchSrsItem): Promise<SpeakingPitchScore | null> {
    const Ctor = globalThis.AudioContext ?? (globalThis as typeof globalThis & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) return null;
    const context = new Ctor();
    try {
        const buffer = await context.decodeAudioData(await blob.arrayBuffer());
        const samples = monoSamples(buffer);
        return scoreSpeakingSamples(samples, buffer.sampleRate, expectedPatternForItem(item));
    } finally {
        void context.close().catch(() => undefined);
    }
}

export function scoreSpeakingSamples(samples: Float32Array, sampleRate: number, expectedPattern: string): SpeakingPitchScore | null {
    const expected = normalizeExpectedPattern(expectedPattern);
    if (!samples.length || !Number.isFinite(sampleRate) || sampleRate <= 0 || !expected) return null;
    const frames = pitchFrames(samples, sampleRate);
    const durationSeconds = samples.length / sampleRate;
    const voicedRatio = durationSeconds > 0 ? voicedDuration(frames) / durationSeconds : 0;
    if (!frames.length || voicedRatio * durationSeconds < MIN_VOICED_SECONDS) return null;

    const bins = pitchBins(frames, expected.length);
    const observed = observedPatternFromBins(bins, expected);
    if (!observed) return null;
    const score = scoreObservedPattern(expected, observed, bins);
    return {
        score,
        verdict: score >= 82 ? 'good' : score >= 62 ? 'close' : 'retry',
        expectedPattern: expected,
        observedPattern: observed,
        voicedRatio: Math.min(1, Math.max(0, voicedRatio)),
        frameCount: frames.length,
    };
}

function expectedPatternForItem(item: PitchSrsItem): string {
    const moraCount = splitMorae(item.reading).length;
    return normalizeExpectedPattern(item.pattern).slice(0, moraCount || undefined);
}

function normalizeExpectedPattern(pattern: string): string {
    return Array.from(pattern).filter(level => level === 'H' || level === 'L').join('');
}

function monoSamples(buffer: AudioBuffer): Float32Array {
    const channelCount = Math.max(1, buffer.numberOfChannels);
    const length = buffer.length;
    if (channelCount === 1) return new Float32Array(buffer.getChannelData(0));
    const output = new Float32Array(length);
    for (let channel = 0; channel < channelCount; channel += 1) {
        const data = buffer.getChannelData(channel);
        for (let index = 0; index < length; index += 1) output[index] += data[index] / channelCount;
    }
    return output;
}

function pitchFrames(samples: Float32Array, sampleRate: number): PitchFrame[] {
    const frameSize = Math.max(1024, Math.round(sampleRate * FRAME_MS / 1000));
    const hopSize = Math.max(256, Math.round(sampleRate * HOP_MS / 1000));
    const frames: PitchFrame[] = [];
    for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
        const hz = estimatePitch(samples, start, frameSize, sampleRate);
        if (hz != null) frames.push({ time: (start + frameSize / 2) / sampleRate, hz });
    }
    return smoothPitchFrames(frames);
}

function estimatePitch(samples: Float32Array, start: number, frameSize: number, sampleRate: number): number | null {
    let sumSquares = 0;
    let dc = 0;
    for (let index = 0; index < frameSize; index += 1) {
        const sample = samples[start + index] ?? 0;
        dc += sample;
        sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / frameSize);
    if (rms < MIN_RMS) return null;
    dc /= frameSize;

    const minLag = Math.max(1, Math.floor(sampleRate / MAX_PITCH_HZ));
    const maxLag = Math.min(frameSize - 2, Math.ceil(sampleRate / MIN_PITCH_HZ));
    let bestLag = 0;
    let bestCorrelation = 0;
    const correlations: number[] = [];
    for (let lag = minLag; lag <= maxLag; lag += 1) {
        let leftEnergy = 0;
        let rightEnergy = 0;
        let correlation = 0;
        const limit = frameSize - lag;
        for (let index = 0; index < limit; index += 1) {
            const left = (samples[start + index] ?? 0) - dc;
            const right = (samples[start + index + lag] ?? 0) - dc;
            correlation += left * right;
            leftEnergy += left * left;
            rightEnergy += right * right;
        }
        const denominator = Math.sqrt(leftEnergy * rightEnergy);
        if (!denominator) continue;
        const normalized = correlation / denominator;
        correlations[lag] = normalized;
        if (normalized > bestCorrelation) {
            bestCorrelation = normalized;
            bestLag = lag;
        }
    }
    for (let lag = minLag + 1; lag < maxLag; lag += 1) {
        const value = correlations[lag] ?? 0;
        if (value < MIN_CORRELATION) continue;
        if (value >= (correlations[lag - 1] ?? 0) && value >= (correlations[lag + 1] ?? 0)) return sampleRate / lag;
    }
    if (bestCorrelation < MIN_CORRELATION || !bestLag) return null;
    return sampleRate / bestLag;
}

function smoothPitchFrames(frames: PitchFrame[]): PitchFrame[] {
    if (frames.length < 3) return frames;
    const smoothed: PitchFrame[] = [];
    for (let index = 0; index < frames.length; index += 1) {
        const hz = median(frames.slice(Math.max(0, index - 1), index + 2).map(frame => frame.hz));
        const previous = smoothed[smoothed.length - 1]?.hz;
        if (previous && (hz > previous * 1.9 || hz < previous / 1.9)) continue;
        smoothed.push({ time: frames[index]?.time ?? 0, hz });
    }
    return smoothed;
}

function voicedDuration(frames: PitchFrame[]): number {
    if (frames.length < 2) return frames.length ? HOP_MS / 1000 : 0;
    return (frames[frames.length - 1]?.time ?? 0) - (frames[0]?.time ?? 0) + HOP_MS / 1000;
}

function pitchBins(frames: PitchFrame[], binCount: number): BinPitch[] {
    const firstTime = frames[0]?.time ?? 0;
    const lastTime = frames[frames.length - 1]?.time ?? firstTime;
    const span = Math.max(0.001, lastTime - firstTime);
    const values = Array.from({ length: binCount }, () => [] as number[]);
    for (const frame of frames) {
        const index = Math.min(binCount - 1, Math.max(0, Math.floor(((frame.time - firstTime) / span) * binCount)));
        values[index]?.push(frame.hz);
    }
    return values.map(bucket => ({ hz: bucket.length ? median(bucket) : null, count: bucket.length }));
}

function observedPatternFromBins(bins: BinPitch[], expected: string): string {
    const pitches = bins.map(bin => bin.hz).filter((hz): hz is number => hz != null);
    if (!pitches.length) return '';
    if (expected.length === 1) return pitches.length ? expected : '';
    const logPitches = pitches.map(hz => Math.log2(hz));
    const low = Math.min(...logPitches);
    const high = Math.max(...logPitches);
    const center = (low + high) / 2;
    const observed = bins.map(bin => {
        if (bin.hz == null) return '?';
        if (high - low < 0.08) return expected[0] ?? 'H';
        return Math.log2(bin.hz) >= center ? 'H' : 'L';
    }).join('');
    return observed;
}

function scoreObservedPattern(expected: string, observed: string, bins: BinPitch[]): number {
    const aligned = Array.from(expected).map((level, index) => ({ level, observed: observed[index], bin: bins[index] }));
    const voiced = aligned.filter(entry => entry.observed === 'H' || entry.observed === 'L');
    if (!voiced.length) return 0;
    const levelScore = voiced.filter(entry => entry.level === entry.observed).length / expected.length;
    const coverage = voiced.length / expected.length;
    const expectedTransitions = transitions(expected);
    const observedTransitions = transitions(observed.replace(/\?/gu, ''));
    const transitionScore = expectedTransitions.length
        ? expectedTransitions.filter((transition, index) => transition === observedTransitions[index]).length / expectedTransitions.length
        : levelScore;
    return Math.round((levelScore * 0.68 + transitionScore * 0.22 + coverage * 0.10) * 100);
}

function transitions(pattern: string): string[] {
    const clean = Array.from(pattern).filter(level => level === 'H' || level === 'L');
    const result: string[] = [];
    for (let index = 1; index < clean.length; index += 1) result.push(`${clean[index - 1]}${clean[index]}`);
    return result;
}

function median(values: number[]): number {
    const sorted = values.slice().sort((a, b) => a - b);
    const midpoint = Math.floor(sorted.length / 2);
    return sorted.length % 2
        ? sorted[midpoint] ?? 0
        : ((sorted[midpoint - 1] ?? 0) + (sorted[midpoint] ?? 0)) / 2;
}
