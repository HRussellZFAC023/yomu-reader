/**
 * Combine three fresh, identical scenario replays without treating
 * instrumented timing as authoritative. The metrics replay owns timings; the
 * CPU and coverage replays contribute only their respective function evidence.
 */
export function mergeScenarioFunctionProfiles(metricsReplay, cpuReplay, coverageReplay) {
    const steps = mergeProfileStepLists(metricsReplay.steps, cpuReplay.steps, coverageReplay.steps);
    return {
        ...metricsReplay,
        steps,
        mobileAmbient: mergeOptionalProfileSteps(metricsReplay.mobileAmbient, cpuReplay.mobileAmbient, coverageReplay.mobileAmbient),
        mobileStress: mergeOptionalProfileSteps(metricsReplay.mobileStress, cpuReplay.mobileStress, coverageReplay.mobileStress),
        replays: {
            metrics: replayDescriptor(metricsReplay, 'none'),
            cpu: replayDescriptor(cpuReplay, 'sampled-cpu'),
            coverage: replayDescriptor(coverageReplay, 'precise-call-counts'),
            workloadIdentity: 'asserted-across-all-replays',
        },
    };
}

/**
 * Legacy timing diagnostics are intentionally uninstrumented. Run them only
 * in the metrics replay: a CDP session configured for CPU sampling or precise
 * coverage cannot be switched back to the uninstrumented mode, and repeating
 * these non-comparable steps would not contribute evidence to the merged
 * report anyway.
 */
export function shouldRunUninstrumentedDiagnostics(profileMode, smokePreset) {
    return !smokePreset && profileMode === 'metrics';
}

function replayDescriptor(replay, instrumentation) {
    return {
        freshContext: true,
        instrumentation,
        comparableWorkload: comparableWorkloadLedger(replay),
    };
}

function comparableWorkloadLedger(replay) {
    return [...replay.steps, replay.mobileAmbient, replay.mobileStress].filter(isComparableProfileStep).map(profileStepWorkloadDescriptor);
}

function isComparableProfileStep(step) {
    if (!step) return false;
    const { interaction = {} } = step;
    return interaction.comparable === true || interaction.workload === 'lookup-transactions';
}

function mergeOptionalProfileSteps(metricsStep, cpuStep, coverageStep) {
    const presentSteps = [metricsStep, cpuStep, coverageStep].filter(Boolean);
    if (presentSteps.length === 0) return null;
    if (presentSteps.length !== 3) throw new Error('Profiler replay optional-step mismatch.');
    return mergeProfileSteps(metricsStep, cpuStep, coverageStep);
}

function mergeProfileStepLists(metricsSteps, cpuSteps, coverageSteps) {
    const cpuByName = uniqueProfileSteps(cpuSteps, 'CPU');
    const coverageByName = uniqueProfileSteps(coverageSteps, 'coverage');
    const merged = metricsSteps.map(metricsStep => {
        const cpuStep = cpuByName.get(metricsStep.name);
        const coverageStep = coverageByName.get(metricsStep.name);
        if (!cpuStep && !coverageStep) return metricsStep;
        if (!cpuStep || !coverageStep) throw new Error(`Profiler replay step mismatch: ${metricsStep.name}.`);
        cpuByName.delete(metricsStep.name);
        coverageByName.delete(metricsStep.name);
        return mergeProfileSteps(metricsStep, cpuStep, coverageStep);
    });
    if (cpuByName.size || coverageByName.size) {
        throw new Error(
            `Profiler replay has instrumented-only steps: cpu=${[...cpuByName.keys()]}, coverage=${[...coverageByName.keys()]}.`,
        );
    }
    return merged;
}

function uniqueProfileSteps(steps, replay) {
    const byName = new Map(steps.map(step => [step.name, step]));
    if (byName.size !== steps.length) throw new Error(`${replay} replay has duplicate step names.`);
    return byName;
}

function mergeProfileSteps(metricsStep, cpuStep, coverageStep) {
    if (new Set([metricsStep.name, cpuStep.name, coverageStep.name]).size !== 1) {
        throw new Error(`Profiler replay step mismatch: ${metricsStep.name}, ${cpuStep.name}, ${coverageStep.name}.`);
    }
    const workloadIdentities = [metricsStep, cpuStep, coverageStep].map(profileStepWorkloadIdentity);
    if (new Set(workloadIdentities).size !== 1) {
        throw new Error(`Profiler workload mismatch for ${metricsStep.name}.`);
    }
    assertExclusiveEvidenceChannels(metricsStep, cpuStep, coverageStep);
    const functionProfile = mergeStepFunctionProfiles(cpuStep, coverageStep, metricsStep.name);
    if (!functionProfile) return metricsStep;
    return { ...metricsStep, functionProfile };
}

function assertExclusiveEvidenceChannels(metricsStep, cpuStep, coverageStep) {
    if (metricsStep.functionProfile) throw new Error(`${metricsStep.name}: metrics replay carried function evidence.`);
    if (functionEvidence(cpuStep, 'calls')) throw new Error(`${cpuStep.name}: CPU replay carried coverage evidence.`);
    if (functionEvidence(coverageStep, 'sampled')) throw new Error(`${coverageStep.name}: coverage replay carried CPU evidence.`);
}

function functionEvidence(step, channel) {
    return step.functionProfile ? step.functionProfile[channel] : null;
}

function mergeStepFunctionProfiles(cpuStep, coverageStep, stepName) {
    const profiles = requiredFunctionProfiles(cpuStep.functionProfile, coverageStep.functionProfile, stepName);
    if (!profiles) return null;
    const [cpuProfile, coverageProfile] = profiles;
    if (!cpuProfile.sampled) throw new Error(`CPU sampled evidence is missing for ${stepName}.`);
    if (!coverageProfile.calls) throw new Error(`Coverage call evidence is missing for ${stepName}.`);
    return { sampled: cpuProfile.sampled, calls: coverageProfile.calls };
}

function requiredFunctionProfiles(cpuProfile, coverageProfile, stepName) {
    const presentCount = Number(Boolean(cpuProfile)) + Number(Boolean(coverageProfile));
    if (presentCount === 0) return null;
    if (presentCount !== 2) throw new Error(`CPU/coverage function evidence is incomplete for ${stepName}.`);
    return [cpuProfile, coverageProfile];
}

function profileStepWorkloadIdentity(step) {
    return JSON.stringify(profileStepWorkloadDescriptor(step));
}

function profileStepWorkloadDescriptor(step) {
    const { interaction = {} } = step;
    return {
        name: step.name,
        workload: nullable(interaction.workload),
        requestedCycles: nullable(interaction.requestedCycles),
        completedCycles: nullable(interaction.cycles),
        playbackTicks: nullable(interaction.playbackTicks),
        operations: nullable(interaction.operations),
        requestedDurationMs: nullable(interaction.requestedDurationMs),
        sampleCount: nullable(interaction.sampleCount),
        plan: profileLookupPlan(interaction.plan),
        viewport: nullable(step.viewport),
    };
}

function profileLookupPlan(plan) {
    if (!Array.isArray(plan)) return null;
    return plan.map(({ id, expression, lane, occurrence, sourceText, sampleIndex, sequenceIndex }) => ({
        id,
        expression,
        lane,
        occurrence,
        sourceText,
        sampleIndex,
        sequenceIndex,
    }));
}

function nullable(value) {
    return value === undefined ? null : value;
}
