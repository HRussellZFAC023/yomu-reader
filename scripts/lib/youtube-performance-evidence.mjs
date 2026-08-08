const DEFAULT_TRACKED_FUNCTION_NAMES = Object.freeze([
    'styleOf',
    'displayOf',
    'mutationContainsOnlyReaderPaint',
    'mutationAffectsProjection',
    'mutationMayExpandAnnotationScope',
    'mutationMayContainJapaneseText',
    'mutationMovesTrackedAnchor',
    'mirrorHostSourceGeometry',
    'readerWordMatchesPointerGeometry',
    'readerWordSourcePointScore',
    'sourceRectPointScore',
    'sourceRectPointDistance',
    'canHoverLookupReaderWord',
    'canHoverLookupReaderWordElement',
]);

export function fixedStressLookupPlan(sequence, sampleCount) {
    assertTargetSequence(sequence);
    assertSampleCount(sampleCount);
    return Array.from({ length: sampleCount }, (_, sampleIndex) => {
        const sequenceIndex = sampleIndex % sequence.length;
        return {
            ...sequence[sequenceIndex],
            sampleIndex,
            sequenceIndex,
        };
    });
}

export function summarizeCpuProfile(profile, artifactGraph = null) {
    const samples = arrayValue(profile.samples);
    const timeDeltas = arrayValue(profile.timeDeltas);
    const nodes = arrayValue(profile.nodes);
    const artifactByUrl = artifactIdentityByUrl(artifactGraph);
    const nodesById = new Map(nodes.map(node => [node.id, node]));
    const selfTimeByNode = sampledSelfTimeByNode(samples, timeDeltas);
    const selfTimeByFrame = new Map();
    const scopedFrames = [...selfTimeByNode]
        .map(([nodeId, selfUs]) => scopedCpuFrame(nodesById.get(nodeId), selfUs, artifactByUrl))
        .filter(Boolean);
    for (const frame of scopedFrames) mergeCpuFrame(selfTimeByFrame, frame);
    const selfTime = [...selfTimeByFrame.values()]
        .map(({ selfUs, ...entry }) => ({
            ...entry,
            selfMs: Math.round(selfUs / 100) / 10,
        }))
        .filter(entry => entry.selfMs > 0)
        .sort(compareCpuFrames);
    return {
        totalSampleCount: samples.length,
        totalSampledMs: millisecondsFromMicroseconds(timeDeltas.reduce((sum, value) => sum + value, 0)),
        sampleCount: samples.filter(nodeId => profileNodeIsInScope(nodesById.get(nodeId), artifactByUrl)).length,
        sampledMs: millisecondsFromMicroseconds(
            samples.reduce(
                (sum, nodeId, index) => sum + scopedSampleDuration(nodesById.get(nodeId), artifactByUrl, numberAt(timeDeltas, index)),
                0,
            ),
        ),
        framesWithSelfTime: selfTime.length,
        selfTime,
    };
}

function scopedCpuFrame(node, selfUs, artifactByUrl) {
    if (!node) return null;
    if (!artifactByUrl) return cpuFrameEntry(node, selfUs, null);
    const artifactSha256 = scopedArtifactSha256(cpuFrameUrl(node), artifactByUrl);
    if (!artifactSha256) return null;
    return cpuFrameEntry(node, selfUs, artifactSha256);
}

function cpuFrameUrl(node) {
    return node.callFrame ? node.callFrame.url : '';
}

function scopedSampleDuration(node, artifactByUrl, duration) {
    if (!profileNodeIsInScope(node, artifactByUrl)) return 0;
    return duration;
}

export function summarizePreciseCoverage(scripts, artifactGraph = null, trackedFunctionNames = DEFAULT_TRACKED_FUNCTION_NAMES) {
    const artifactByUrl = artifactIdentityByUrl(artifactGraph);
    const callCounts = scripts
        .flatMap(script => {
            const artifactSha256 = scopedArtifactSha256(script.url, artifactByUrl);
            if (artifactByUrl && !artifactSha256) return [];
            return arrayValue(script.functions)
                .map(fn => preciseCoverageCall(script, fn, artifactSha256))
                .filter(Boolean);
        })
        .sort(compareCallCounts);
    return {
        functionsPresent: callCounts.length,
        functionsCalled: callCounts.filter(entry => entry.callCount > 0).length,
        totalCalls: callCounts.reduce((sum, entry) => sum + entry.callCount, 0),
        callCounts,
        trackedFunctions: trackedFunctionNames.map(functionName => trackedFunctionFrames(functionName, callCounts)),
    };
}

export function summarizeStressSamples(samples) {
    const opened = samples
        .filter(sample => sample.opened === true && typeof sample.expectedMs === 'number')
        .map(sample => sample.expectedMs)
        .sort((left, right) => left - right);
    return {
        count: samples.length,
        opened: opened.length,
        skipped: samples.filter(sample => sample.skipped === true).length,
        timedOut: samples.filter(sample => sample.skipped !== true && sample.opened !== true).length,
        wrongPopover: samples.filter(sample => sample.wrongPopoverVisible === true).length,
        targetMismatch: samples.filter(sample => !stressTargetMatchesRequest(sample)).length,
        p50Ms: percentile(opened, 0.5),
        p95Ms: percentile(opened, 0.95),
        maxMs: opened.at(-1) ?? null,
        over250Ms: opened.filter(ms => ms > 250).length,
        over1000Ms: opened.filter(ms => ms > 1000).length,
    };
}

export function assertCompleteStressInteraction(interaction, expectedPlan, context) {
    const samples = interactionSamples(interaction);
    const summary = summarizeStressSamples(samples);
    const prefix = evidenceContextPrefix(context);
    if (samples.length !== expectedPlan.length) {
        throw new Error(`${prefix}expected ${expectedPlan.length} lookup samples, collected ${samples.length}`);
    }
    const invalid = samples.flatMap((sample, index) => stressSampleFailures(sample, expectedPlan[index], index));
    if (invalid.length > 0) {
        throw new Error(`${prefix}lookup evidence is incomplete; failures=${JSON.stringify(invalid)}`);
    }
    return summary;
}

function assertTargetSequence(sequence) {
    if (!Array.isArray(sequence)) throw new Error('The YouTube lookup target sequence must be an array.');
    if (sequence.length === 0) throw new Error('The YouTube lookup target sequence must contain at least one target.');
}

function assertSampleCount(sampleCount) {
    if (!Number.isSafeInteger(sampleCount)) {
        throw new Error(`The YouTube lookup sample count must be a positive integer; received ${sampleCount}.`);
    }
    if (sampleCount <= 0) {
        throw new Error(`The YouTube lookup sample count must be a positive integer; received ${sampleCount}.`);
    }
}

function sampledSelfTimeByNode(samples, timeDeltas) {
    return samples.reduce((selfTimeByNode, nodeId, index) => {
        const deltaUs = numberAt(timeDeltas, index);
        selfTimeByNode.set(nodeId, (selfTimeByNode.get(nodeId) ?? 0) + deltaUs);
        return selfTimeByNode;
    }, new Map());
}

function cpuFrameEntry(node, selfUs, artifactSha256) {
    const { callFrame: frame = {}, hitCount = 0 } = node;
    const { functionName = '', url = '', lineNumber = -1, columnNumber = -1 } = frame;
    return {
        functionName: functionName || '(anonymous)',
        url,
        artifactSha256,
        line: lineNumber + 1,
        column: columnNumber + 1,
        selfUs,
        samples: hitCount,
    };
}

function mergeCpuFrame(selfTimeByFrame, entry) {
    const key = `${entry.url}\n${entry.line}:${entry.column}\n${entry.functionName}`;
    const current = selfTimeByFrame.get(key);
    if (!current) {
        selfTimeByFrame.set(key, entry);
        return;
    }
    current.selfUs += entry.selfUs;
    current.samples += entry.samples;
}

function compareCpuFrames(left, right) {
    return right.selfMs - left.selfMs;
}

function preciseCoverageCall(script, fn, artifactSha256) {
    const range = arrayValue(fn.ranges)[0];
    if (!range) return null;
    return {
        functionName: nonEmptyText(fn.functionName, '(anonymous)'),
        url: textValue(script.url),
        artifactSha256,
        startOffset: range.startOffset,
        callCount: range.count,
    };
}

function compareCallCounts(left, right) {
    return right.callCount - left.callCount;
}

function trackedFunctionFrames(functionName, callCounts) {
    const frames = callCounts.filter(entry => entry.functionName === functionName);
    return {
        functionName,
        present: frames.length > 0,
        frames,
    };
}

function artifactIdentityByUrl(artifactGraph) {
    if (!artifactGraph) return null;
    if (!artifactGraph.sourceUrl || !artifactGraph.sha256) {
        throw new Error('Artifact graph scope requires sourceUrl and sha256.');
    }
    return new Map([[artifactGraph.sourceUrl, artifactGraph.sha256]]);
}

function scopedArtifactSha256(url, artifactByUrl) {
    if (!artifactByUrl) return null;
    return artifactByUrl.get(textValue(url)) ?? null;
}

function profileNodeIsInScope(node, artifactByUrl) {
    return !artifactByUrl || artifactByUrl.has(textValue(node?.callFrame?.url));
}

function millisecondsFromMicroseconds(value) {
    return Math.round(value / 100) / 10;
}

function stressTargetMatchesRequest(sample) {
    const request = sample.request;
    const target = sample.target;
    if (!request) return false;
    if (!target) return false;
    const expected = stressTargetIdentity(request);
    return stressTargetIdentity(target).every((value, index) => value === expected[index]);
}

function stressSampleFailures(sample, request, index) {
    const diagnostic = { index, request, target: valueOr(sample.target, null) };
    return [
        evidenceFailure(sample.skipped === true, 'skipped', diagnostic),
        evidenceFailure(stressSampleTimedOut(sample), 'timed-out', diagnostic),
        evidenceFailure(stressSampleMissingLatency(sample), 'missing-latency', diagnostic),
        evidenceFailure(sample.wrongPopoverVisible === true, 'wrong-popover', diagnostic),
        evidenceFailure(!stressTargetMatchesRequest({ ...sample, request }), 'target-mismatch', diagnostic),
    ].flat();
}

function stressSampleTimedOut(sample) {
    if (sample.skipped === true) return false;
    return sample.opened !== true;
}

function stressSampleMissingLatency(sample) {
    if (sample.opened !== true) return false;
    return typeof sample.expectedMs !== 'number';
}

function evidenceFailure(failed, kind, diagnostic) {
    return failed ? [{ ...diagnostic, kind }] : [];
}

function stressTargetIdentity(target) {
    return [target.expression, target.lane, Number(valueOr(target.occurrence, 0)), String(valueOr(target.sourceText, ''))];
}

function interactionSamples(interaction) {
    if (!interaction) return [];
    return arrayValue(interaction.samples);
}

function evidenceContextPrefix(context) {
    return context ? `${context}: ` : '';
}

function arrayValue(value) {
    return Array.isArray(value) ? value : [];
}

function numberAt(values, index) {
    return Number(valueOr(values[index], 0));
}

function nonEmptyText(value, fallback) {
    return value ? String(value) : fallback;
}

function textValue(value) {
    return String(valueOr(value, ''));
}

function valueOr(value, fallback) {
    return value === undefined ? fallback : value;
}

function percentile(values, percentileValue) {
    if (!values.length) return null;
    const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * percentileValue) - 1));
    return Math.round(values[index] * 10) / 10;
}
