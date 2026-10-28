// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error The artifact verifier is intentionally plain ESM for the deployment runner.
import { assertCloudflareArtifactMatches, createReviewedWorkerArtifact, localWorkerSettings, parseCloudflareWorkerVersion, parseCloudflareWorkerVersionDetail, parseWranglerConfig } from '../../scripts/lib/academy-worker-artifact.mjs';
// @ts-expect-error The executable proof harness is intentionally plain ESM.
import { cleanupDedicatedProfileDirectories, parseDeploymentStatus, prepareDedicatedProfileDirectories, readLiveProofConfig, sanitizeLifecycleEvidenceDetail, signLifecycleEvidence, verifyLifecycleEvidence } from '../../scripts/academy-account-lifecycle-live-proof.mjs';

const baseEnv = {
    ACADEMY_LIFECYCLE_PROOF_ORIGIN: 'https://academy.example.test',
    ACADEMY_LIFECYCLE_PROOF_INVITE_CODE_A: 'DEVICE-A-2026',
    ACADEMY_LIFECYCLE_PROOF_INVITE_CODE_B: 'DEVICE-B-2026',
    ACADEMY_LIFECYCLE_PROOF_DEVICE_A_DIR: '/tmp/yomu-proof-a',
    ACADEMY_LIFECYCLE_PROOF_DEVICE_B_DIR: '/tmp/yomu-proof-b',
    ACADEMY_LIFECYCLE_PROOF_PROOF_TOKEN: 'p'.repeat(43),
    ACADEMY_LIFECYCLE_PROOF_RUN_NONCE: 'r'.repeat(43),
    ACADEMY_LIFECYCLE_PROOF_REVIEWED_COMMIT: 'a'.repeat(40),
    ACADEMY_LIFECYCLE_PROOF_EVIDENCE_HMAC_KEY: 'test-only-evidence-hmac-key-with-32-bytes',
    CLOUDFLARE_ACCOUNT_ID: '1'.repeat(32),
    CLOUDFLARE_API_TOKEN: 'never-print-this',
};

describe('Academy account lifecycle live proof harness', () => {
    it('requires every destructive live-proof prerequisite', () => {
        expect(() => readLiveProofConfig({ ...baseEnv, CLOUDFLARE_API_TOKEN: '' })).toThrow('CLOUDFLARE_API_TOKEN');
        expect(() => readLiveProofConfig({
            ...baseEnv,
            ACADEMY_LIFECYCLE_PROOF_PROOF_TOKEN: 'yes',
        })).toThrow('32-byte base64url');
    });

    it('accepts only one exact HTTPS origin and separate absolute device profiles', () => {
        expect(() => readLiveProofConfig({
            ...baseEnv,
            ACADEMY_LIFECYCLE_PROOF_ORIGIN: 'https://academy.example.test/academy/',
        })).toThrow('exact HTTPS origin');
        expect(() => readLiveProofConfig({
            ...baseEnv,
            ACADEMY_LIFECYCLE_PROOF_DEVICE_B_DIR: '/tmp/yomu-proof-a',
        })).toThrow('different browser profile');
        expect(readLiveProofConfig(baseEnv)).toMatchObject({ origin: 'https://academy.example.test' });
    });

    it('redacts credentials, OAuth parameters, cookies, and public ids from evidence', () => {
        const secret = 'DEVICE-A-2026';
        const detail = 'Bearer token code=oauth-code __Host-academy_session=cookie '
            + '11111111-1111-4111-8111-111111111111 DEVICE-A-2026';
        const safe = sanitizeLifecycleEvidenceDetail(detail, [secret]);
        expect(safe).not.toContain('oauth-code');
        expect(safe).not.toContain('cookie');
        expect(safe).not.toContain('11111111');
        expect(safe).not.toContain(secret);
    });

    it('creates, resets, and removes only marker-owned disposable browser profiles', () => {
        const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'yomu-proof-profiles-')));
        const deviceA = path.join(root, 'device-a');
        const deviceB = path.join(root, 'device-b');
        try {
            const prepared = prepareDedicatedProfileDirectories(deviceA, deviceB, { browserRoots: [] });
            writeFileSync(path.join(prepared.deviceADir, 'browser-state'), 'disposable');
            const reset = prepareDedicatedProfileDirectories(deviceA, deviceB, { browserRoots: [] });
            expect(() => readFileSync(path.join(reset.deviceADir, 'browser-state'))).toThrow();
            expect(readFileSync(path.join(reset.deviceADir, '.yomu-academy-lifecycle-profile.json'), 'utf8'))
                .toContain('yomu-academy-account-lifecycle-live-proof');
            cleanupDedicatedProfileDirectories([reset.deviceADir, reset.deviceBDir]);
            expect(() => readFileSync(reset.deviceADir)).toThrow();
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('rejects unowned state, symlinks, canonical overlap, HOME, repo, and browser profile roots', () => {
        const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'yomu-proof-rejections-')));
        const homeRoot = path.join(root, 'home');
        const browserRoot = path.join(homeRoot, 'browser');
        const unowned = path.join(root, 'unowned');
        const symlink = path.join(root, 'linked');
        mkdirSync(homeRoot);
        mkdirSync(browserRoot);
        mkdirSync(unowned);
        writeFileSync(path.join(unowned, 'Preferences'), '{}');
        symlinkSync(unowned, symlink);
        const options = { homeRoot, browserRoots: [browserRoot] };
        try {
            expect(() => prepareDedicatedProfileDirectories(unowned, path.join(root, 'b'), options)).toThrow('ownership marker');
            expect(() => prepareDedicatedProfileDirectories(symlink, path.join(root, 'b'), options)).toThrow('symlinks');
            expect(() => prepareDedicatedProfileDirectories(path.join(root, 'a'), path.join(root, 'a/child'), options)).toThrow('overlap');
            expect(() => prepareDedicatedProfileDirectories(homeRoot, path.join(root, 'b'), options)).toThrow('HOME');
            expect(() => prepareDedicatedProfileDirectories(process.cwd(), path.join(root, 'b'), options)).toThrow('repository');
            expect(() => prepareDedicatedProfileDirectories(path.join(browserRoot, 'Default'), path.join(root, 'b'), options)).toThrow('browser profile');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('parses one active deployment version and detects evidence tampering', () => {
        expect(parseDeploymentStatus({
            id: 'deployment-123',
            versions: [{ version_id: '11111111-1111-4111-8111-111111111111', percentage: 100 }],
        })).toEqual({
            deploymentId: 'deployment-123',
            workerVersionId: '11111111-1111-4111-8111-111111111111',
        });
        const key = 'another-test-only-evidence-key-over-32-bytes';
        const signed = signLifecycleEvidence({ complete: true, gitCommit: 'a'.repeat(40) }, key);
        expect(verifyLifecycleEvidence(signed, key)).toBe(true);
        expect(verifyLifecycleEvidence({ ...signed, payload: { ...signed.payload, complete: false } }, key)).toBe(false);
        expect(() => parseDeploymentStatus({ id: 'deployment-123', versions: [] })).toThrow('100% active');
    });

    it('binds the active immutable version to raw modules and reviewed settings, not a mutable commit variable', () => {
        const configText = JSON.stringify({
            compatibility_date: '2026-07-12',
            compatibility_flags: ['nodejs_compat'],
            vars: { ACADEMY_ORIGIN: 'https://yomureader.com', ACADEMY_ENVIRONMENT: 'production' },
        });
        const config = parseWranglerConfig(configText);
        const settings = localWorkerSettings(config, 'payment-entrypoint.js');
        const reviewedCommit = 'a'.repeat(40);
        const reviewed = createReviewedWorkerArtifact({
            reviewedCommit,
            modules: [{
                name: 'payment-entrypoint.js',
                contentType: 'application/javascript+module',
                content: Buffer.from('export default { fetch() { return new Response("reviewed"); } };'),
            }],
            settings,
            configBytes: Buffer.from(configText),
            migrations: [{ name: '0001.sql', content: Buffer.from('SELECT 1;') }],
        });
        const versionId = '11111111-1111-4111-8111-111111111111';
        const remote = parseCloudflareWorkerVersion({ result: {
            id: versionId,
            main_module: 'payment-entrypoint.js',
            compatibility_date: '2026-07-12',
            compatibility_flags: ['nodejs_compat'],
            bindings: [
                { type: 'plain_text', name: 'ACADEMY_ORIGIN', text: 'https://yomureader.com' },
                { type: 'plain_text', name: 'ACADEMY_ENVIRONMENT', text: 'production' },
            ],
            modules: [{
                name: 'payment-entrypoint.js',
                content_type: 'application/javascript+module',
                content_base64: Buffer.from('export default { fetch() { return new Response("reviewed"); } };').toString('base64'),
            }],
        } }, versionId);
        expect(assertCloudflareArtifactMatches(reviewed, remote)).toMatchObject({
            workerVersionId: versionId,
            reviewedArtifactSha256: reviewed.artifactSha256,
        });
        expect(parseCloudflareWorkerVersionDetail({ result: {
            id: versionId,
            resources: { script: { etag: 'e'.repeat(64) } },
        } }, versionId)).toEqual({ versionId, scriptEtag: 'e'.repeat(64) });

        const differentBundle = parseCloudflareWorkerVersion({ result: {
            id: versionId,
            main_module: 'payment-entrypoint.js',
            compatibility_date: '2026-07-12',
            compatibility_flags: ['nodejs_compat'],
            bindings: [
                { type: 'plain_text', name: 'ACADEMY_ORIGIN', text: 'https://yomureader.com' },
                { type: 'plain_text', name: 'ACADEMY_ENVIRONMENT', text: 'production' },
            ],
            modules: [{
                name: 'payment-entrypoint.js',
                content_type: 'application/javascript+module',
                content_base64: Buffer.from('export default { fetch() { return new Response("different"); } };').toString('base64'),
            }],
        } }, versionId);
        expect(() => assertCloudflareArtifactMatches(reviewed, differentBundle)).toThrow('modules do not match');

        const differentSettings = parseCloudflareWorkerVersion({ result: {
            id: versionId,
            main_module: 'payment-entrypoint.js',
            compatibility_date: '2026-07-12',
            compatibility_flags: ['nodejs_compat'],
            bindings: [
                { type: 'plain_text', name: 'ACADEMY_ORIGIN', text: 'https://yomureader.com' },
                { type: 'plain_text', name: 'ACADEMY_ENVIRONMENT', text: 'staging' },
            ],
            modules: [{
                name: 'payment-entrypoint.js',
                content_type: 'application/javascript+module',
                content_base64: Buffer.from('export default { fetch() { return new Response("reviewed"); } };').toString('base64'),
            }],
        } }, versionId);
        expect(() => assertCloudflareArtifactMatches(reviewed, differentSettings)).toThrow('settings do not match');
    });
});
