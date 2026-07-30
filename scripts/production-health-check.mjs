#!/usr/bin/env node
// Ask every deployed Worker whether it is alive, and say which build answered.
//
// WHAT WAS MISSING
//
// Nothing watched production. `grep -rn wrangler .github/` finds no deploy, by
// design — publication is an explicit operator action — but nothing checked the
// result either. The only cron that touched production was the D1/R2 backup;
// the nightly workflow runs fixture-served smokes. So a Worker could return
// errors indefinitely and the first report would come from a user.
//
// WHY A SCHEDULED WORKFLOW AND NOT A HOSTED MONITOR
//
// The endpoint list lives beside the wrangler configs that create the routes,
// and a contract test fails when a route has no probe, so the monitor cannot
// drift from the deployment. It needs no account, no secret and no paid zone
// feature; a failed scheduled run on the default branch already emails the repo
// owner. A Cloudflare Health Check or a third-party uptime service would be
// configured outside the repository, where no review or test can see it, and
// would still not know which build is meant to be live.
//
// WHAT COUNTS AS FAILURE
//
// A non-200, a body that is not JSON, or a payload whose `status`/`ok` says the
// service is unhealthy. Build drift is reported, never failed on: deploys are
// manual, so a Worker legitimately runs an older version until the owner
// redeploys, and failing on that would train everyone to ignore a red run.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const REPOSITORY_VERSION = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const TIMEOUT_MS = Number(process.env.YOMU_HEALTH_TIMEOUT_MS || 20_000);
const ATTEMPTS = 3;

/**
 * Every deployed Worker, at the health path it actually serves.
 *
 * `edge` is here as `/healthz`, not `/health`: a sweep probed
 * `edge.yomureader.com/health`, got a 400, and recorded a broken route. That
 * path is the proxy's normal request path, which requires a `?url=` parameter —
 * `/healthz` and `/status` both return 200. Keeping the table in the repo is how
 * the next probe asks the right question.
 */
export const PRODUCTION_HEALTH_ENDPOINTS = [
    { service: 'yomu-dictionaries', url: 'https://dictionaries.yomureader.com/healthz' },
    { service: 'yomu-audio', url: 'https://audio.yomureader.com/status' },
    { service: 'yomu-support', url: 'https://support.yomureader.com/status' },
    { service: 'yomu-academy', url: 'https://yomureader.com/academy/api/health' },
    { service: 'yomu-jpdb-public-proxy', url: 'https://edge.yomureader.com/healthz' },
];

const UNHEALTHY_STATUSES = new Set(['disabled', 'unconfigured', 'error']);

if (import.meta.filename === process.argv[1]) await main();

async function main() {
    const results = [];
    for (const endpoint of PRODUCTION_HEALTH_ENDPOINTS) results.push(await probe(endpoint));

    console.log(`Repository version: ${REPOSITORY_VERSION}`);
    console.log('');
    for (const result of results) {
        console.log(`${result.ok ? 'ok  ' : 'FAIL'}  ${result.service.padEnd(24)} ${result.detail}`);
    }

    const drifted = results.filter(result => result.ok && result.version && result.version !== REPOSITORY_VERSION);
    if (drifted.length) {
        console.log('');
        console.log('Deploys behind this checkout (manual deployment, not a failure):');
        for (const result of drifted) console.log(`  ${result.service}: running ${result.version}`);
    }
    const unversioned = results.filter(result => result.ok && !result.version);
    if (unversioned.length) {
        console.log('');
        console.log(`Health payload names no version yet — redeploy to stamp it: ${unversioned.map(r => r.service).join(', ')}`);
    }

    const failures = results.filter(result => !result.ok);
    if (!failures.length) {
        console.log(`\nAll ${results.length} production health endpoints answered.`);
        return;
    }
    console.error(`\n${failures.length} of ${results.length} production health endpoints are unhealthy:`);
    for (const failure of failures) console.error(`  ${failure.service} ${failure.url} — ${failure.detail}`);
    process.exitCode = 1;
}

/** One endpoint, retried so a single dropped connection is not an alert. */
async function probe({ service, url }) {
    let detail = 'not attempted';
    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
        const result = await probeOnce(url);
        if (result.ok) return { service, url, ...result };
        detail = `${result.detail} (attempt ${attempt}/${ATTEMPTS})`;
        if (attempt < ATTEMPTS) await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
    return { service, url, ok: false, detail, version: null };
}

async function probeOnce(url) {
    const started = Date.now();
    let response;
    try {
        response = await fetch(url, {
            redirect: 'manual',
            headers: { accept: 'application/json', 'user-agent': 'yomu-production-health-check' },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
    } catch (error) {
        return { ok: false, detail: `request failed: ${error instanceof Error ? error.message : String(error)}`, version: null };
    }
    const elapsed = Date.now() - started;
    const body = await response.text().catch(() => '');
    return evaluateHealthResponse(response.status, body, elapsed);
}

/**
 * Verdict for one health response. Pure, so the classification is testable
 * without the network: this is what decides whether the schedule goes red.
 */
export function evaluateHealthResponse(httpStatus, body, elapsed = 0) {
    if (httpStatus !== 200) {
        return { ok: false, detail: `HTTP ${httpStatus} in ${elapsed}ms: ${body.slice(0, 120)}`, version: null };
    }
    let payload;
    try {
        payload = JSON.parse(body);
    } catch {
        return { ok: false, detail: `200 but not JSON in ${elapsed}ms: ${body.slice(0, 120)}`, version: null };
    }
    const status = typeof payload.status === 'string' ? payload.status : payload.ok === true ? 'ok' : 'unknown';
    const version = typeof payload.revision?.version === 'string' ? payload.revision.version : null;
    if (UNHEALTHY_STATUSES.has(status)) {
        return { ok: false, detail: `200 but status="${status}" in ${elapsed}ms`, version };
    }
    const deployed = payload.revision?.deployedAt ?? payload.workerVersionId ?? 'unknown deployment';
    return { ok: true, detail: `200 status="${status}" version=${version ?? 'unstamped'} deployed=${deployed} ${elapsed}ms`, version };
}
