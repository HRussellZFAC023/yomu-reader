import { describe, expect, it } from 'vitest';
import {
    assertCompleteStressInteraction,
    fixedStressLookupPlan,
    summarizeCpuProfile,
    summarizePreciseCoverage,
    summarizeStressSamples,
} from '../../scripts/lib/youtube-performance-evidence.mjs';

const sequence = [
    {
        id: 'teacher',
        expression: '先生',
        lane: 'portal',
        occurrence: 0,
        sourceText: '先生のコメント',
    },
    {
        id: 'today',
        expression: '今日',
        lane: 'portal',
        occurrence: 0,
        sourceText: '今日のコメント',
    },
];
const artifactGraph = {
    sourceUrl: 'yomu-profile://artifact-graph/test.js',
    sha256: 'abc123',
};

describe('YouTube performance evidence', () => {
    it('builds an exact sample-count plan from a stable target sequence', () => {
        expect(fixedStressLookupPlan(sequence, 5)).toEqual([
            { ...sequence[0], sampleIndex: 0, sequenceIndex: 0 },
            { ...sequence[1], sampleIndex: 1, sequenceIndex: 1 },
            { ...sequence[0], sampleIndex: 2, sequenceIndex: 0 },
            { ...sequence[1], sampleIndex: 3, sequenceIndex: 1 },
            { ...sequence[0], sampleIndex: 4, sequenceIndex: 0 },
        ]);
        expect(() => fixedStressLookupPlan(sequence, 0)).toThrow(/positive integer/u);
    });

    it('retains every precise-coverage call count and explicit tracked totals', () => {
        const functions = Array.from({ length: 101 }, (_, index) => ({
            functionName: index === 100 ? 'trackedHotPath' : `function${index}`,
            ranges: [
                {
                    startOffset: index * 10,
                    endOffset: index * 10 + 5,
                    count: index + 1,
                },
            ],
        }));

        const summary = summarizePreciseCoverage(
            [
                { url: artifactGraph.sourceUrl, functions },
                {
                    url: 'https://www.youtube.com/page.js',
                    functions: [
                        {
                            functionName: 'pageHotPath',
                            ranges: [{ startOffset: 0, endOffset: 1, count: 999 }],
                        },
                    ],
                },
            ],
            artifactGraph,
            ['trackedHotPath', 'notCalled'],
        );

        expect(summary.functionsPresent).toBe(101);
        expect(summary.functionsCalled).toBe(101);
        expect(summary.callCounts).toHaveLength(101);
        expect(summary).not.toHaveProperty('topCallCounts');
        expect(summary.totalCalls).toBe(5151);
        expect(summary.trackedFunctions).toEqual([
            {
                functionName: 'trackedHotPath',
                present: true,
                frames: [
                    {
                        functionName: 'trackedHotPath',
                        url: artifactGraph.sourceUrl,
                        artifactSha256: artifactGraph.sha256,
                        startOffset: 1000,
                        callCount: 101,
                    },
                ],
            },
            { functionName: 'notCalled', present: false, frames: [] },
        ]);
    });

    it('retains zero-count Yomu functions and never conflates matching bare names', () => {
        const summary = summarizePreciseCoverage(
            [
                {
                    url: artifactGraph.sourceUrl,
                    functions: [
                        {
                            functionName: 'sameName',
                            ranges: [{ startOffset: 10, endOffset: 20, count: 0 }],
                        },
                        {
                            functionName: 'sameName',
                            ranges: [{ startOffset: 30, endOffset: 40, count: 3 }],
                        },
                    ],
                },
            ],
            artifactGraph,
            ['sameName'],
        );

        expect(summary).toMatchObject({
            functionsPresent: 2,
            functionsCalled: 1,
            totalCalls: 3,
        });
        expect(summary.callCounts).toHaveLength(2);
        expect(summary.trackedFunctions[0]).toMatchObject({
            functionName: 'sameName',
            present: true,
        });
        expect(summary.trackedFunctions[0]).not.toHaveProperty('callCount');
        expect(summary.trackedFunctions[0].frames as Array<Record<string, unknown>>).toHaveLength(2);
    });

    it('retains every sampled self-time frame rather than truncating the profile', () => {
        const nodes = Array.from({ length: 45 }, (_, index) => ({
            id: index + 1,
            hitCount: 1,
            callFrame: {
                functionName: `frame${index}`,
                url: '/dist/yomu.user.js',
                lineNumber: index,
                columnNumber: 0,
            },
        }));
        nodes.forEach(node => {
            node.callFrame.url = artifactGraph.sourceUrl;
        });
        const pageNode = {
            id: 1000,
            hitCount: 500,
            callFrame: {
                functionName: 'pageHotPath',
                url: 'https://www.youtube.com/page.js',
                lineNumber: 0,
                columnNumber: 0,
            },
        };
        const summary = summarizeCpuProfile(
            {
                nodes: [...nodes, pageNode],
                samples: [...nodes.map(node => node.id), pageNode.id],
                timeDeltas: [...nodes.map(() => 1000), 50_000],
            },
            artifactGraph,
        );

        expect(summary.totalSampleCount).toBe(46);
        expect(summary.sampleCount).toBe(45);
        expect(summary.framesWithSelfTime).toBe(45);
        expect(summary.selfTime).toHaveLength(45);
        expect(summary.selfTime).not.toContainEqual(expect.objectContaining({ functionName: 'pageHotPath' }));
        expect(summary).not.toHaveProperty('topSelfTime');
    });

    it('accepts only a complete sequence of exact successful lookups', () => {
        const plan = fixedStressLookupPlan(sequence, 2);
        const samples = plan.map(request => successfulSample(request));
        const interaction = { samples, summary: summarizeStressSamples(samples) };

        expect(assertCompleteStressInteraction(interaction, plan, 'api desktop')).toMatchObject({
            count: 2,
            opened: 2,
            skipped: 0,
            timedOut: 0,
            wrongPopover: 0,
            targetMismatch: 0,
        });
    });

    it.each([
        [
            'skipped target',
            (sample: ReturnType<typeof successfulSample>) => ({
                ...sample,
                skipped: true,
                opened: false,
            }),
        ],
        [
            'lookup timeout',
            (sample: ReturnType<typeof successfulSample>) => ({
                ...sample,
                opened: false,
                expectedMs: null,
            }),
        ],
        [
            'missing latency',
            (sample: ReturnType<typeof successfulSample>) => ({
                ...sample,
                expectedMs: null,
            }),
        ],
        [
            'wrong popover',
            (sample: ReturnType<typeof successfulSample>) => ({
                ...sample,
                wrongPopoverVisible: true,
                wrongPopoverText: '字幕',
            }),
        ],
        [
            'target mismatch',
            (sample: ReturnType<typeof successfulSample>) => ({
                ...sample,
                target: { ...sample.target, expression: '字幕' },
            }),
        ],
    ])('rejects a %s', (_label, corrupt) => {
        const plan = fixedStressLookupPlan(sequence, 2);
        const samples = [corrupt(successfulSample(plan[0])), successfulSample(plan[1])];
        const interaction = { samples, summary: summarizeStressSamples(samples) };

        expect(() => assertCompleteStressInteraction(interaction, plan, 'api desktop')).toThrow(/lookup evidence is incomplete/u);
    });
});

function successfulSample(request: ReturnType<typeof fixedStressLookupPlan>[number]) {
    return {
        request,
        target: {
            expression: request.expression,
            lane: request.lane,
            occurrence: request.occurrence,
            sourceText: request.sourceText,
        },
        opened: true,
        expectedMs: 42,
        wrongPopoverVisible: false,
    };
}
