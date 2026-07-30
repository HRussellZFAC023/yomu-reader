// The production monitor's contract with the deployment.
//
// Two failures this locks down. First, nothing watched production at all, so a
// Worker could answer errors indefinitely; the probe table has to stay in step
// with the routes the wrangler configs create, or a new Worker ships unwatched.
// Second, no health payload named a build, so "is production running main?" had
// no answer — the Academy reported only an opaque Cloudflare UUID.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    PRODUCTION_HEALTH_ENDPOINTS,
    evaluateHealthResponse,
    // @ts-expect-error -- plain Node probe script, deliberately not part of the typed bundle
} from '../../scripts/production-health-check.mjs';
import { SERVICE_VERSION, serviceRevision } from '../../workers/shared/service-revision';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

interface HealthEndpoint {
    service: string;
    url: string;
}

const endpoints = PRODUCTION_HEALTH_ENDPOINTS as HealthEndpoint[];

// Every deployed Worker, with the config that creates its route and the source
// file that answers its health path.
const WORKERS = [
    { service: 'yomu-dictionaries', config: 'workers/yomu-dictionaries/wrangler.jsonc', source: 'workers/yomu-dictionaries/src/index.ts' },
    { service: 'yomu-audio', config: 'workers/yomu-audio/wrangler.jsonc', source: 'workers/yomu-audio/src/index.ts' },
    { service: 'yomu-support', config: 'workers/yomu-support/wrangler.jsonc', source: 'workers/yomu-support/src/index.ts' },
    { service: 'yomu-academy', config: 'wrangler.academy.jsonc', source: 'workers/yomu-academy/src/index.ts' },
    { service: 'yomu-jpdb-public-proxy', config: 'workers/jpdb-public-proxy/wrangler.toml', source: 'workers/jpdb-public-proxy/src/index.ts' },
];

function read(file: string): string {
    return readFileSync(path.join(ROOT, file), 'utf8');
}

describe('production health monitoring', () => {
    it('probes every deployed Worker', () => {
        expect(endpoints.map(endpoint => endpoint.service).sort())
            .toEqual(WORKERS.map(worker => worker.service).sort());
        for (const endpoint of endpoints) {
            expect(endpoint.url).toMatch(/^https:\/\/[a-z.]*yomureader\.com\//u);
        }
    });

    it('probes each Worker on a host its own wrangler config routes', () => {
        for (const { service, config } of WORKERS) {
            const endpoint = endpoints.find(candidate => candidate.service === service);
            const host = new URL(endpoint!.url).host;
            expect(read(config), `${config} does not route ${host}, which the monitor probes`).toContain(host);
        }
    });

    it('is run by a scheduled workflow, not only by hand', () => {
        const workflow = read('.github/workflows/production-health.yml');
        expect(workflow).toContain('node scripts/production-health-check.mjs');
        expect(workflow).toMatch(/cron: *"[^"]+"/u);
        expect(workflow).toContain('workflow_dispatch');
    });

    it('fails on a dead endpoint and passes on a healthy one', () => {
        // The measured shapes: `edge.yomureader.com/health` answers 400 with
        // "Missing url parameter." (a sweep read that as a broken route), a
        // Pages 404 answers with HTML, and a disabled Worker answers 200.
        expect(evaluateHealthResponse(400, 'Missing url parameter.').ok).toBe(false);
        expect(evaluateHealthResponse(404, '<!DOCTYPE html><title>404</title>').ok).toBe(false);
        expect(evaluateHealthResponse(200, '<!DOCTYPE html>').ok).toBe(false);
        expect(evaluateHealthResponse(200, JSON.stringify({ service: 'x', status: 'disabled' })).ok).toBe(false);
        expect(evaluateHealthResponse(200, JSON.stringify({ service: 'x', status: 'unconfigured' })).ok).toBe(false);

        const healthy = evaluateHealthResponse(200, JSON.stringify({
            service: 'yomu-audio',
            status: 'ok',
            revision: { version: '9.9.9', deploymentId: 'abc', deployedAt: '2026-07-30T00:00:00Z' },
        }));
        expect(healthy.ok).toBe(true);
        expect(healthy.version).toBe('9.9.9');
        // The academy shape, which reports `ok: true` rather than a status word.
        expect(evaluateHealthResponse(200, JSON.stringify({ ok: true })).ok).toBe(true);
    });
});

describe('health payload revision', () => {
    it('reports the repository version and the Cloudflare deployment', () => {
        const packageVersion = JSON.parse(read('package.json')).version;
        expect(SERVICE_VERSION).toBe(packageVersion);

        expect(serviceRevision({})).toEqual({
            version: packageVersion,
            deploymentId: null,
            deployedAt: null,
        });
        expect(serviceRevision({
            CF_VERSION_METADATA: { id: 'dep-1', tag: '', timestamp: '2026-07-30T00:00:00Z' },
        })).toEqual({
            version: packageVersion,
            deploymentId: 'dep-1',
            deployedAt: '2026-07-30T00:00:00Z',
        });
    });

    it('puts the revision in every Worker health response, with the binding to fill it', () => {
        for (const { service, config, source } of WORKERS) {
            expect(read(source), `${service} does not report serviceRevision()`).toContain('serviceRevision(env)');
            expect(read(config), `${config} has no version_metadata binding, so deploymentId is always null`)
                .toContain('CF_VERSION_METADATA');
        }
    });
});
