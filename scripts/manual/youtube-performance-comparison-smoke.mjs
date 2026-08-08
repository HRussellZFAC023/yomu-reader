#!/usr/bin/env node
// Standalone browser entrypoint executed by the opt-in E2E test through a child
// process; importing it would defeat the fresh-process provenance boundary.
import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, '../..');
const profilerPath = resolve(import.meta.dirname, 'youtube-performance-profile.mjs');
const baselineDir = requiredDirectory('YOMU_PROFILE_BASELINE_DIR');
const candidateDir = requiredDirectory('YOMU_PROFILE_CANDIDATE_DIR');
const outputRoot = resolve(
    process.env.YOMU_PROFILE_COMPARISON_OUTPUT ?? join(repositoryRoot, 'qa-artifacts/yomu-reader/youtube-performance/comparison-smoke'),
);
mkdirSync(outputRoot, { recursive: true });

const runs = [];
for (const target of [
    { name: 'baseline', artifactDir: baselineDir, allowTextMirrors: true },
    { name: 'candidate', artifactDir: candidateDir, allowTextMirrors: false },
]) {
    const outputDir = join(outputRoot, target.name);
    const result = await execFileAsync(process.execPath, [profilerPath], {
        cwd: repositoryRoot,
        maxBuffer: 20 * 1024 * 1024,
        env: {
            ...process.env,
            YOMU_PROFILE_ARTIFACT_DIR: target.artifactDir,
            YOMU_PROFILE_OUTPUT_DIR: outputDir,
            YOMU_PROFILE_LABEL: `${target.name}-comparison-smoke`,
            YOMU_PROFILE_PRESET: 'smoke',
            YOMU_PROFILE_CPU: '1',
            YOMU_PROFILE_SCENARIOS: 'api',
            YOMU_PROFILE_FIXED_CHURN_CYCLES: process.env.YOMU_PROFILE_FIXED_CHURN_CYCLES ?? '2',
            YOMU_PROFILE_LOOKUP_SAMPLES: process.env.YOMU_PROFILE_LOOKUP_SAMPLES ?? '2',
            YOMU_PROFILE_ALLOW_TEXT_MIRRORS: target.allowTextMirrors ? '1' : '0',
        },
    });
    writeFileSync(join(outputDir, 'stdout.log'), result.stdout);
    writeFileSync(join(outputDir, 'stderr.log'), result.stderr);
    const profile = JSON.parse(readFileSync(join(outputDir, 'profile.json'), 'utf8'));
    runs.push(validateSmokeProfile(target.name, profile));
}

const comparison = {
    schemaVersion: 1,
    status: 'complete',
    generatedAt: new Date().toISOString(),
    runs,
};
assertDistinctArtifactGraphs(runs);
writeFileSync(join(outputRoot, 'comparison-smoke.json'), JSON.stringify(comparison, null, 2));
console.log(JSON.stringify(comparison, null, 2));

function requiredDirectory(name) {
    const value = process.env[name];
    if (!value) throw new Error(`${name} must identify a split userscript artifact directory.`);
    return resolve(value);
}

function validateSmokeProfile(name, profile) {
    assertCompletedProfile(name, profile);
    assertCleanDriver(name, profile.profilerDriver);
    const scenario = requiredScenario(name, profile.scenarios, 'api');
    const fixed = requiredStep(name, scenario.steps, 'youtubeFixedAmbientBenchmark');
    const lookup = requiredStep(name, scenario.steps, 'youtubeLookupTransactions');
    assertFunctionEvidence(name, [fixed, lookup]);
    assertCompletedLookupPlan(name, lookup, profile.workload.lookupSampleCount);
    assertNoSoak(name, scenario);
    return {
        name,
        artifact: profile.artifacts.userscript,
        graph: {
            sha256: profile.artifacts.graph.sha256,
            sourceUrl: profile.artifacts.graph.sourceUrl,
        },
        profilerDriver: profile.profilerDriver,
        browser: profile.browser,
        fixedAmbient: {
            cycles: fixed.interaction.cycles,
            yomuSampledMs: fixed.functionProfile.sampled.sampledMs,
            functionsPresent: fixed.functionProfile.calls.functionsPresent,
            totalCalls: fixed.functionProfile.calls.totalCalls,
        },
        lookup: {
            samples: lookup.interaction.sampleCount,
            p95Ms: lookup.interaction.summary.p95Ms,
            yomuSampledMs: lookup.functionProfile.sampled.sampledMs,
            functionsPresent: lookup.functionProfile.calls.functionsPresent,
            totalCalls: lookup.functionProfile.calls.totalCalls,
        },
        replayModes: scenario.replays,
    };
}

function assertCompletedProfile(name, profile) {
    if (profile.status !== 'complete') throw new Error(`${name}: profiler did not complete.`);
}

function assertCleanDriver(name, profilerDriver) {
    if (process.env.YOMU_PROFILE_REQUIRE_CLEAN_DRIVER === '0') return;
    if (profilerDriver.dirtyPaths.length > 0) {
        throw new Error(`${name}: profiler driver closure is dirty: ${profilerDriver.dirtyPaths.join(', ')}`);
    }
}

function requiredScenario(profileName, scenarios, scenarioName) {
    const scenario = scenarios.find(entry => entry.name === scenarioName);
    if (!scenario) throw new Error(`${profileName}: scenario ${scenarioName} is missing.`);
    return scenario;
}

function requiredStep(profileName, steps, stepName) {
    const step = steps.find(entry => entry.name === stepName);
    if (!step) throw new Error(`${profileName}: comparable step ${stepName} is missing.`);
    return step;
}

function assertFunctionEvidence(profileName, steps) {
    for (const step of steps) assertStepFunctionEvidence(profileName, step);
}

function assertStepFunctionEvidence(profileName, step) {
    const functionProfile = step.functionProfile;
    if (!functionProfile) throw new Error(`${profileName} ${step.name}: function evidence is missing.`);
    assertPositiveEvidence(functionProfile.sampled, 'sampleCount', `${profileName} ${step.name}: Yomu-scoped CPU replay is empty.`);
    assertPositiveEvidence(functionProfile.calls, 'functionsCalled', `${profileName} ${step.name}: Yomu coverage has no called functions.`);
    assertPositiveEvidence(functionProfile.calls, 'totalCalls', `${profileName} ${step.name}: Yomu coverage has no calls.`);
}

function assertPositiveEvidence(evidence, field, message) {
    if (!evidence) throw new Error(message);
    if (evidence[field] <= 0) throw new Error(message);
}

function assertCompletedLookupPlan(name, lookup, lookupSampleCount) {
    if (lookup.interaction.summary.opened !== lookupSampleCount) {
        throw new Error(`${name}: exact lookup plan did not complete.`);
    }
}

function assertNoSoak(name, scenario) {
    if (scenario.ambientSoak) throw new Error(`${name}: smoke included the desktop throughput soak.`);
    if (scenario.mobileSoak) throw new Error(`${name}: smoke included the mobile throughput soak.`);
}

function assertDistinctArtifactGraphs(runs) {
    const graphShas = new Set(runs.map(run => run.graph.sha256));
    if (graphShas.size !== runs.length) throw new Error('Baseline and candidate resolved to the same userscript graph.');
}
