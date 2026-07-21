#!/usr/bin/env node
/**
 * Supervised proof for the deployed PLAT-001 account lifecycle.
 *
 * Google authentication happens in two real, visible Chrome profiles. This
 * runner never accepts provider tokens or synthesizes an OAuth callback.
 */
import { execFileSync } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import {
    existsSync,
    lstatSync,
    mkdtempSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    realpathSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path, { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import {
    assertCloudflareArtifactMatches,
    createReviewedWorkerArtifact,
    localWorkerSettings,
    parseCloudflareWorkerVersion,
    parseCloudflareWorkerVersionDetail,
    parseWranglerConfig,
    readLocalWorkerModules,
} from './lib/academy-worker-artifact.mjs';
import { loadLocalEnv } from './lib/qa-env.mjs';

const D1_DATABASE = 'yomu-academy';
const WRANGLER_CONFIG = 'wrangler.academy.jsonc';
const SESSION_COOKIE = '__Host-academy_session';
const PAIRING_INFO = 'yomu-academy-device-pairing-v1';
const EVIDENCE_PATH = resolve('artifacts/academy-account-lifecycle/live-proof-results.json');
const PROFILE_MARKER = '.yomu-academy-lifecycle-profile.json';
const PROFILE_MARKER_OWNER = 'yomu-academy-account-lifecycle-live-proof';
const MIGRATIONS_DIR = resolve('workers/yomu-academy/migrations');
const HOSTED_APP_PATH = resolve('docs/public/academy/app.js');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const INVITE_PATTERN = /^[A-Z0-9-]{7,64}$/u;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const PROOF_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const CLOUDFLARE_ACCOUNT_PATTERN = /^[0-9a-f]{32}$/u;

export function readLiveProofConfig(env = process.env) {
    const required = [
        'ACADEMY_LIFECYCLE_PROOF_ORIGIN',
        'ACADEMY_LIFECYCLE_PROOF_INVITE_CODE_A',
        'ACADEMY_LIFECYCLE_PROOF_INVITE_CODE_B',
        'ACADEMY_LIFECYCLE_PROOF_DEVICE_A_DIR',
        'ACADEMY_LIFECYCLE_PROOF_DEVICE_B_DIR',
        'ACADEMY_LIFECYCLE_PROOF_PROOF_TOKEN',
        'ACADEMY_LIFECYCLE_PROOF_RUN_NONCE',
        'ACADEMY_LIFECYCLE_PROOF_REVIEWED_COMMIT',
        'ACADEMY_LIFECYCLE_PROOF_EVIDENCE_HMAC_KEY',
        'CLOUDFLARE_ACCOUNT_ID',
        'CLOUDFLARE_API_TOKEN',
    ];
    const missing = required.filter(name => !env[name]?.trim());
    if (missing.length > 0) throw new Error(`Missing live proof configuration: ${missing.join(', ')}.`);

    const origin = strictHttpsOrigin(env.ACADEMY_LIFECYCLE_PROOF_ORIGIN);
    const inviteCodeA = normalizeInvite(env.ACADEMY_LIFECYCLE_PROOF_INVITE_CODE_A);
    const inviteCodeB = normalizeInvite(env.ACADEMY_LIFECYCLE_PROOF_INVITE_CODE_B);
    const deviceADir = path.resolve(env.ACADEMY_LIFECYCLE_PROOF_DEVICE_A_DIR);
    const deviceBDir = path.resolve(env.ACADEMY_LIFECYCLE_PROOF_DEVICE_B_DIR);
    if (!path.isAbsolute(env.ACADEMY_LIFECYCLE_PROOF_DEVICE_A_DIR)
        || !path.isAbsolute(env.ACADEMY_LIFECYCLE_PROOF_DEVICE_B_DIR)) {
        throw new Error('Both live proof browser profile paths must be absolute.');
    }
    if (deviceADir === deviceBDir) throw new Error('Live proof devices must use different browser profile directories.');
    const proofToken = env.ACADEMY_LIFECYCLE_PROOF_PROOF_TOKEN.trim();
    const runNonce = env.ACADEMY_LIFECYCLE_PROOF_RUN_NONCE.trim();
    if (!PROOF_SECRET_PATTERN.test(proofToken) || !PROOF_SECRET_PATTERN.test(runNonce)) {
        throw new Error('Lifecycle proof token and run nonce must each be one 32-byte base64url value.');
    }
    const reviewedCommit = env.ACADEMY_LIFECYCLE_PROOF_REVIEWED_COMMIT.trim().toLowerCase();
    if (!COMMIT_PATTERN.test(reviewedCommit)) {
        throw new Error('ACADEMY_LIFECYCLE_PROOF_REVIEWED_COMMIT must be one full git commit.');
    }
    const evidenceHmacKey = env.ACADEMY_LIFECYCLE_PROOF_EVIDENCE_HMAC_KEY;
    if (Buffer.byteLength(evidenceHmacKey, 'utf8') < 32) {
        throw new Error('ACADEMY_LIFECYCLE_PROOF_EVIDENCE_HMAC_KEY must contain at least 32 bytes.');
    }
    const cloudflareAccountId = env.CLOUDFLARE_ACCOUNT_ID.trim().toLowerCase();
    if (!CLOUDFLARE_ACCOUNT_PATTERN.test(cloudflareAccountId)) {
        throw new Error('CLOUDFLARE_ACCOUNT_ID must be one full Cloudflare account id.');
    }

    return Object.freeze({
        origin,
        inviteCodeA,
        inviteCodeB,
        deviceADir,
        deviceBDir,
        proofToken,
        runNonce,
        reviewedCommit,
        evidenceHmacKey,
        cloudflareAccountId,
        cloudflareApiToken: env.CLOUDFLARE_API_TOKEN,
        timeoutMs: boundedInteger(env.ACADEMY_LIFECYCLE_PROOF_TIMEOUT_MS, 5 * 60_000, 60_000, 15 * 60_000),
    });
}

export function prepareDedicatedProfileDirectories(deviceADir, deviceBDir, options = {}) {
    const repositoryRoot = canonicalPath(options.repositoryRoot ?? process.cwd());
    const homeRoot = canonicalPath(options.homeRoot ?? homedir());
    const browserRoots = (options.browserRoots ?? defaultBrowserProfileRoots(homeRoot)).map(canonicalPlannedPath);
    const candidates = [deviceADir, deviceBDir].map(candidate => inspectDedicatedProfileDirectory(
        candidate,
        { repositoryRoot, homeRoot, browserRoots },
    ));
    if (pathsOverlap(candidates[0].canonicalPath, candidates[1].canonicalPath)) {
        throw new Error('Live proof browser profile directories must not overlap by canonical ancestry.');
    }
    for (const candidate of candidates) resetOwnedProfileDirectory(candidate);
    return Object.freeze({ deviceADir: candidates[0].canonicalPath, deviceBDir: candidates[1].canonicalPath });
}

export function cleanupDedicatedProfileDirectories(profileDirs) {
    for (const profileDir of profileDirs) {
        const candidate = inspectMarkerOwnedDirectory(profileDir);
        if (!candidate) throw new Error(`Refusing to remove an unowned browser profile directory: ${profileDir}`);
        rmSync(candidate, { recursive: true, force: false });
    }
}

function inspectDedicatedProfileDirectory(candidate, protectedPaths) {
    if (!path.isAbsolute(candidate)) throw new Error('Live proof browser profile paths must be absolute.');
    assertNoSymlinkComponents(candidate);
    const canonical = canonicalPlannedPath(candidate);
    if (canonical === path.parse(canonical).root || canonical === protectedPaths.homeRoot) {
        throw new Error('A live proof browser profile cannot be the filesystem root or HOME.');
    }
    if (pathsOverlap(canonical, protectedPaths.repositoryRoot)) {
        throw new Error('A live proof browser profile cannot overlap the repository.');
    }
    if (protectedPaths.browserRoots.some(browserRoot => pathsOverlap(canonical, browserRoot))) {
        throw new Error('A live proof browser profile cannot overlap an existing browser profile root.');
    }
    if (!existsSync(canonical)) return { canonicalPath: canonical, markerOwned: false };
    const stats = lstatSync(canonical);
    if (!stats.isDirectory()) throw new Error('A live proof browser profile path must be a directory.');
    if (typeof process.getuid === 'function' && stats.uid !== process.getuid()) {
        throw new Error('A live proof browser profile directory must be owned by the current user.');
    }
    const entries = readdirSync(canonical);
    if (entries.length === 0) return { canonicalPath: canonical, markerOwned: false };
    if (!inspectMarkerOwnedDirectory(canonical)) {
        throw new Error('A non-empty live proof browser profile must carry this runner\'s bound ownership marker.');
    }
    return { canonicalPath: canonical, markerOwned: true };
}

function resetOwnedProfileDirectory(candidate) {
    if (candidate.markerOwned) {
        const rechecked = inspectMarkerOwnedDirectory(candidate.canonicalPath);
        if (rechecked !== candidate.canonicalPath) throw new Error('Browser profile ownership changed before reset.');
        rmSync(candidate.canonicalPath, { recursive: true, force: false });
    }
    mkdirSync(candidate.canonicalPath, { recursive: true, mode: 0o700 });
    const realized = realpathSync.native(candidate.canonicalPath);
    if (realized !== candidate.canonicalPath) throw new Error('Browser profile canonical path changed during preparation.');
    writeFileSync(path.join(realized, PROFILE_MARKER), `${JSON.stringify({
        schemaVersion: 1,
        owner: PROFILE_MARKER_OWNER,
        canonicalPath: realized,
        createdAt: new Date().toISOString(),
    })}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
}

function inspectMarkerOwnedDirectory(candidate) {
    if (!existsSync(candidate)) return null;
    assertNoSymlinkComponents(candidate);
    const canonical = realpathSync.native(candidate);
    if (canonical !== candidate) return null;
    const markerPath = path.join(canonical, PROFILE_MARKER);
    if (!existsSync(markerPath) || lstatSync(markerPath).isSymbolicLink() || !lstatSync(markerPath).isFile()) return null;
    try {
        const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
        return marker?.schemaVersion === 1
            && marker?.owner === PROFILE_MARKER_OWNER
            && marker?.canonicalPath === canonical
            ? canonical
            : null;
    } catch {
        return null;
    }
}

function assertNoSymlinkComponents(candidate) {
    const absolute = path.resolve(candidate);
    const root = path.parse(absolute).root;
    let current = root;
    for (const segment of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
        current = path.join(current, segment);
        if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
            throw new Error(`Live proof browser profile paths cannot contain symlinks: ${current}`);
        }
    }
}

function canonicalPath(candidate) {
    assertNoSymlinkComponents(candidate);
    return realpathSync.native(path.resolve(candidate));
}

function canonicalPlannedPath(candidate) {
    const absolute = path.resolve(candidate);
    assertNoSymlinkComponents(absolute);
    let existing = absolute;
    while (!existsSync(existing)) {
        const parent = path.dirname(existing);
        if (parent === existing) throw new Error(`Could not resolve browser profile ancestry: ${candidate}`);
        existing = parent;
    }
    return path.resolve(realpathSync.native(existing), path.relative(existing, absolute));
}

function pathsOverlap(left, right) {
    return left === right || left.startsWith(`${right}${path.sep}`) || right.startsWith(`${left}${path.sep}`);
}

function defaultBrowserProfileRoots(homeRoot) {
    return [
        path.join(homeRoot, 'Library/Application Support/Google/Chrome'),
        path.join(homeRoot, 'Library/Application Support/Google/Chrome Beta'),
        path.join(homeRoot, 'Library/Application Support/Google/Chrome Canary'),
        path.join(homeRoot, 'Library/Application Support/Chromium'),
        path.join(homeRoot, 'Library/Application Support/Firefox'),
    ];
}

export function sanitizeLifecycleEvidenceDetail(detail, secrets = []) {
    let safe = String(detail ?? '');
    for (const secret of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)) {
        safe = safe.replaceAll(secret, '<redacted>');
    }
    return safe
        .replace(/(__Host-academy_(?:session|oidc)=)[^;\s]+/gu, '$1<redacted>')
        .replace(/((?:[?&]|\b)(?:code|state|id_token|access_token)=)[^&\s]+/giu, '$1<redacted>')
        .replace(/\bBearer\s+[^\s]+/giu, 'Bearer <redacted>')
        .replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/giu, '<redacted:id>');
}

function strictHttpsOrigin(raw) {
    let url;
    try { url = new URL(raw); } catch { throw new Error('ACADEMY_LIFECYCLE_PROOF_ORIGIN must be a valid URL.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
        throw new Error('ACADEMY_LIFECYCLE_PROOF_ORIGIN must be one exact HTTPS origin without credentials, path, query, or hash.');
    }
    return url.origin;
}

function normalizeInvite(raw) {
    const code = raw.normalize('NFKC').trim().toUpperCase().replaceAll(/\s+/gu, '');
    if (!INVITE_PATTERN.test(code)) throw new Error('A live proof invite code is malformed.');
    return code;
}

function boundedInteger(raw, fallback, minimum, maximum) {
    const value = Number(raw);
    return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function createRecorder(initialSecrets) {
    const secrets = new Set(initialSecrets.filter(Boolean));
    const results = [];
    return {
        results,
        secret(value) {
            if (typeof value === 'string' && value) secrets.add(value);
            return value;
        },
        record(step, outcome, detail = '') {
            const safeDetail = sanitizeLifecycleEvidenceDetail(detail, secrets);
            results.push({ step, outcome, detail: safeDetail, at: new Date().toISOString() });
            console.log(`${outcome.toUpperCase()}  ${step}${safeDetail ? ` - ${safeDetail}` : ''}`);
        },
    };
}

export function parseDeploymentStatus(value) {
    const root = Array.isArray(value) ? value[0] : value;
    if (!root || typeof root !== 'object') throw new Error('Wrangler deployment status was malformed.');
    const deploymentId = stringField(root, ['id', 'deployment_id', 'deploymentId']);
    const versions = Array.isArray(root.versions) ? root.versions : [];
    const active = versions.find(version => version && typeof version === 'object'
        && Number(version.percentage ?? version.traffic ?? 0) === 100);
    const workerVersionId = active ? stringField(active, ['version_id', 'versionId', 'id']) : null;
    if (!deploymentId || !workerVersionId) {
        throw new Error('Wrangler did not report one 100% active Worker deployment version.');
    }
    return { deploymentId, workerVersionId };
}

export function signLifecycleEvidence(payload, key) {
    const canonical = canonicalJson(payload);
    return {
        payload,
        integrity: {
            algorithm: 'HMAC-SHA-256',
            payloadSha256: createHash('sha256').update(canonical).digest('hex'),
            signature: createHmac('sha256', key).update(canonical).digest('hex'),
        },
    };
}

export function verifyLifecycleEvidence(document, key) {
    if (!document || typeof document !== 'object' || !document.payload || !document.integrity) return false;
    const expected = signLifecycleEvidence(document.payload, key).integrity;
    return expected.payloadSha256 === document.integrity.payloadSha256
        && expected.signature === document.integrity.signature;
}

function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function stringField(value, names) {
    for (const name of names) {
        if (typeof value[name] === 'string' && value[name]) return value[name];
    }
    return null;
}

function commandText(command, args) {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function wranglerJson(args) {
    const output = commandText('npx', ['wrangler', ...args, '--config', WRANGLER_CONFIG]);
    const objectStart = output.indexOf('{');
    const arrayStart = output.indexOf('[');
    const jsonStart = [objectStart, arrayStart].filter(index => index >= 0).sort((a, b) => a - b)[0];
    if (jsonStart === undefined) throw new Error('Wrangler returned no JSON result.');
    return JSON.parse(output.slice(jsonStart));
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function localReviewedWorkerArtifact(gitCommit) {
    const outputDirectory = mkdtempSync(path.join(tmpdir(), 'yomu-academy-worker-artifact-'));
    try {
        commandText('npx', [
            'wrangler', 'deploy', '--dry-run', '--outdir', outputDirectory,
            '--config', WRANGLER_CONFIG,
        ]);
        const configBytes = readFileSync(WRANGLER_CONFIG);
        const config = parseWranglerConfig(configBytes.toString('utf8'), WRANGLER_CONFIG);
        const modules = readLocalWorkerModules(outputDirectory);
        const mainModule = path.basename(config.main).replace(/\.[cm]?ts$/u, '.js');
        const migrations = readdirSync(MIGRATIONS_DIR)
            .filter(file => /^\d{4}_[a-z0-9_]+\.sql$/u.test(file))
            .sort()
            .map(name => ({ name, content: readFileSync(path.join(MIGRATIONS_DIR, name)) }));
        return createReviewedWorkerArtifact({
            reviewedCommit: gitCommit,
            modules,
            settings: localWorkerSettings(config, mainModule),
            configBytes,
            migrations,
        });
    } finally {
        rmSync(outputDirectory, { recursive: true, force: true });
    }
}

async function activeCloudflareWorkerVersion(config, workerVersionId) {
    const endpoint = 'https://api.cloudflare.com/client/v4/accounts/'
        + `${config.cloudflareAccountId}/workers/workers/yomu-academy/versions/${workerVersionId}?include=modules`;
    const response = await fetch(endpoint, {
        headers: { authorization: `Bearer ${config.cloudflareApiToken}`, accept: 'application/json' },
        cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Cloudflare Worker version content returned HTTP ${response.status}.`);
    const document = await response.json();
    if (document?.success !== true) throw new Error('Cloudflare Worker version content request was unsuccessful.');
    return parseCloudflareWorkerVersion(document, workerVersionId);
}

async function activeCloudflareWorkerVersionDetail(config, workerVersionId) {
    const endpoint = 'https://api.cloudflare.com/client/v4/accounts/'
        + `${config.cloudflareAccountId}/workers/scripts/yomu-academy/versions/${workerVersionId}`;
    const response = await fetch(endpoint, {
        headers: { authorization: `Bearer ${config.cloudflareApiToken}`, accept: 'application/json' },
        cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Cloudflare Worker version detail returned HTTP ${response.status}.`);
    const document = await response.json();
    if (document?.success !== true) throw new Error('Cloudflare Worker version detail request was unsuccessful.');
    return parseCloudflareWorkerVersionDetail(document, workerVersionId);
}

async function reviewedDeploymentIdentity(config) {
    const repositoryRoot = realpathSync.native(commandText('git', ['rev-parse', '--show-toplevel']));
    if (repositoryRoot !== realpathSync.native(process.cwd())) throw new Error('Live proof must run from the reviewed worktree root.');
    const gitCommit = commandText('git', ['rev-parse', 'HEAD']).toLowerCase();
    if (gitCommit !== config.reviewedCommit) throw new Error('Configured reviewed commit does not match HEAD.');
    if (commandText('git', ['status', '--porcelain'])) throw new Error('Live proof requires a clean reviewed worktree.');

    const healthResponse = await fetch(`${config.origin}/academy/api/health`, { cache: 'no-store' });
    if (!healthResponse.ok) throw new Error(`Deployed Worker health returned HTTP ${healthResponse.status}.`);
    const health = await healthResponse.json();
    if (health?.ok !== true || health.apiBase !== `${config.origin}/academy/api`
        || health.artifactProof !== 'cloudflare-version-modules-v1') {
        throw new Error('Deployed Worker API base does not match the reviewed live origin.');
    }
    if (!UUID_PATTERN.test(health.workerVersionId ?? '')) throw new Error('Deployed Worker did not expose an immutable version id.');

    const deployment = parseDeploymentStatus(wranglerJson(['deployments', 'status', '--json']));
    if (deployment.workerVersionId !== health.workerVersionId) {
        throw new Error('Active Worker deployment version does not match the executing API version.');
    }
    const reviewedArtifact = localReviewedWorkerArtifact(gitCommit);
    const remoteVersion = await activeCloudflareWorkerVersion(config, deployment.workerVersionId);
    const remoteVersionDetail = await activeCloudflareWorkerVersionDetail(config, deployment.workerVersionId);
    const artifactBinding = assertCloudflareArtifactMatches(reviewedArtifact, remoteVersion);

    const hostedResponse = await fetch(`${config.origin}/academy/app.js`, { cache: 'no-store' });
    if (!hostedResponse.ok) throw new Error(`Hosted Academy app returned HTTP ${hostedResponse.status}.`);
    const hostedAppHash = sha256(new Uint8Array(await hostedResponse.arrayBuffer()));
    const localAppHash = sha256(readFileSync(HOSTED_APP_PATH));
    if (hostedAppHash !== localAppHash) throw new Error('Hosted Academy app hash does not match reviewed app.js.');

    const localMigrations = readdirSync(MIGRATIONS_DIR)
        .filter(file => /^\d{4}_[a-z0-9_]+\.sql$/u.test(file))
        .sort();
    const remoteMigrations = d1Rows('SELECT name FROM d1_migrations ORDER BY name;')
        .map(row => row.name)
        .filter(name => typeof name === 'string');
    if (JSON.stringify(remoteMigrations) !== JSON.stringify(localMigrations)) {
        throw new Error('Remote D1 migration set does not match the reviewed worktree.');
    }
    return Object.freeze({
        gitCommit,
        workerDeploymentId: deployment.deploymentId,
        workerVersionId: deployment.workerVersionId,
        workerScriptEtag: remoteVersionDetail.scriptEtag,
        reviewedArtifactSha256: artifactBinding.reviewedArtifactSha256,
        workerModuleSetSha256: artifactBinding.moduleSetSha256,
        workerSettingsSha256: artifactBinding.settingsSha256,
        workerConfigSha256: reviewedArtifact.configSha256,
        workerMigrationSetSha256: reviewedArtifact.migrationSetSha256,
        hostedAppSha256: hostedAppHash,
        schemaMigrations: localMigrations,
        apiBase: health.apiBase,
    });
}

async function requestJson(page, requestPath, options = {}) {
    if (!requestPath.startsWith('/academy/api/')) throw new Error('Proof requests must stay on the Academy API origin.');
    return page.evaluate(async ({ requestPath: pathname, requestOptions }) => {
        const response = await fetch(pathname, {
            method: requestOptions.method ?? 'GET',
            credentials: 'include',
            cache: 'no-store',
            headers: {
                accept: 'application/json',
                ...(requestOptions.body === undefined ? {} : { 'content-type': 'application/json' }),
            },
            ...(requestOptions.body === undefined ? {} : { body: JSON.stringify(requestOptions.body) }),
        });
        let body = null;
        try { body = await response.json(); } catch { /* The status remains authoritative. */ }
        return { status: response.status, body };
    }, { requestPath, requestOptions: options });
}

function requireStatus(result, status, step) {
    if (result.status !== status) throw new Error(`${step} returned HTTP ${result.status}.`);
    return result.body;
}

async function exchangeInvite(page, code) {
    return requireStatus(await requestJson(page, '/academy/api/session', {
        method: 'POST', body: { code },
    }), 200, 'Invite exchange');
}

async function completeRealGoogle(page, config, expectedOutcome = 'linked') {
    let returned = null;
    const callback = page.waitForURL(url => {
        if (url.origin !== config.origin || url.pathname !== '/academy/') return false;
        const outcome = url.searchParams.get('account');
        if (outcome !== 'linked' && outcome !== 'failed') return false;
        returned = new URL(url.href);
        return true;
    }, { timeout: config.timeoutMs });
    await page.goto(`${config.origin}/academy/api/auth/google/start`, { waitUntil: 'domcontentloaded' });
    console.log('ACTION Complete Google sign-in in the visible Chrome window. Use only the dedicated PLAT-001 test account.');
    await callback;
    if (!returned) throw new Error('Google callback navigation was not observed.');
    const outcome = returned.searchParams.get('account');
    if (returned.searchParams.has('code') || returned.searchParams.has('state')) {
        throw new Error('OAuth code or state remained in the callback URL.');
    }
    if (outcome !== expectedOutcome) throw new Error(`Google callback returned account=${outcome ?? 'missing'}.`);
    await page.waitForURL(url => url.origin === config.origin
        && url.pathname === '/academy/'
        && !url.searchParams.has('account')
        && !url.searchParams.has('code')
        && !url.searchParams.has('state'), { timeout: config.timeoutMs });
}

async function startRecovery(page) {
    requireStatus(await requestJson(page, '/academy/api/auth/google/recovery', { method: 'POST', body: {} }), 201, 'Recovery start');
}

function d1Execute(command) {
    const output = execFileSync('npx', [
        'wrangler', 'd1', 'execute', D1_DATABASE, '--remote', '--json',
        '--config', WRANGLER_CONFIG, '--command', command,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const jsonStart = output.indexOf('[');
    if (jsonStart < 0) throw new Error('Wrangler returned no D1 JSON result.');
    return JSON.parse(output.slice(jsonStart));
}

function d1Rows(command) {
    const batches = d1Execute(command);
    return Array.isArray(batches) && Array.isArray(batches[0]?.results) ? batches[0].results : [];
}

function d1Count(command) {
    const count = d1Rows(command)[0]?.count;
    if (!Number.isSafeInteger(count)) throw new Error('D1 count query returned an invalid result.');
    return count;
}

function uuidSql(value) {
    if (!UUID_PATTERN.test(value)) throw new Error('Refusing to query D1 with a malformed proof identifier.');
    return `'${value.toLowerCase()}'`;
}

function base64Url(bytes) {
    return Buffer.from(bytes).toString('base64url');
}

function fromBase64Url(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('Encrypted proof data was malformed.');
    return new Uint8Array(Buffer.from(value, 'base64url'));
}

async function keyCommitment(key) {
    return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', key)));
}

async function encryptEvent(key, payload, keyVersion = 1) {
    const id = crypto.randomUUID();
    const occurredAt = Date.now();
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const aad = new TextEncoder().encode(`event:${id}:${occurredAt}:v${keyVersion}`);
    const aes = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']);
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: aad }, aes,
        new TextEncoder().encode(JSON.stringify(payload)),
    );
    return { id, occurredAt, keyVersion, nonce: base64Url(nonce), ciphertext: base64Url(new Uint8Array(ciphertext)) };
}

async function decryptEvent(key, event) {
    const aad = new TextEncoder().encode(`event:${event.id}:${event.occurredAt}:v${event.keyVersion}`);
    const aes = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64Url(event.nonce), additionalData: aad }, aes,
        fromBase64Url(event.ciphertext),
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
}

async function wrappingKey(code, salt) {
    const compact = code.normalize('NFKC').trim().toUpperCase().replaceAll(/[-\s]/gu, '');
    const source = await crypto.subtle.importKey('raw', new TextEncoder().encode(compact), 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey({
        name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode(PAIRING_INFO),
    }, source, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function wrapProfileKey(key, code, pairingId, keyVersion) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const wrapping = await wrappingKey(code, salt);
    const aad = new TextEncoder().encode(`pairing:${pairingId}:v${keyVersion}`);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad }, wrapping, key);
    return { keyVersion, salt: base64Url(salt), nonce: base64Url(nonce), ciphertext: base64Url(new Uint8Array(ciphertext)) };
}

async function unwrapProfileKey(envelope, code, pairingId) {
    const salt = fromBase64Url(envelope.salt);
    const wrapping = await wrappingKey(code, salt);
    const aad = new TextEncoder().encode(`pairing:${pairingId}:v${envelope.keyVersion}`);
    const key = await crypto.subtle.decrypt({
        name: 'AES-GCM', iv: fromBase64Url(envelope.nonce), additionalData: aad,
    }, wrapping, fromBase64Url(envelope.ciphertext));
    return new Uint8Array(key);
}

async function exportWithDeployedClient(page) {
    await page.evaluate(() => {
        Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
    });
    const exportButton = page.getByRole('button', { name: /Export encrypted data|暗号化データを書き出す/u });
    await exportButton.waitFor({ state: 'visible' });
    const downloadPromise = page.waitForEvent('download');
    await exportButton.click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    if (!stream) throw new Error('The deployed Academy client produced no export stream.');
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        throw new Error('The deployed Academy client produced malformed export JSON.');
    }
}

async function launchDevice(profileDir, origin) {
    const context = await chromium.launchPersistentContext(profileDir, {
        channel: 'chrome', headless: false, viewport: { width: 1180, height: 820 },
    });
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(`${origin}/academy/`, { waitUntil: 'domcontentloaded' });
    return { context, page };
}

async function verifyLifecycleProofGrant(page, config, accountId) {
    const proof = requireStatus(await requestJson(page, '/academy/api/account/lifecycle-proof/verify', {
        method: 'POST',
        body: { proofToken: config.proofToken, runNonce: config.runNonce },
    }), 200, 'Production lifecycle proof grant verification');
    if (proof?.verified !== true || proof.accountId !== accountId || proof.environment !== 'production'
        || proof.scope !== 'account-lifecycle-production-test'
        || !Number.isSafeInteger(proof.expiresAt) || proof.expiresAt <= Date.now()) {
        throw new Error('Production lifecycle proof grant was not bound to this authenticated account and run.');
    }
}

function equalBytes(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function expireAndResume(device, sessionId) {
    const before = (await device.context.cookies()).find(cookie => cookie.name === SESSION_COOKIE)?.value ?? '';
    d1Execute(`UPDATE sessions SET expires_at = ${Date.now() - 60_000} WHERE public_id = ${uuidSql(sessionId)};`);
    if ((await requestJson(device.page, '/academy/api/session')).status !== 401) throw new Error('Expired session remained active.');
    requireStatus(await requestJson(device.page, '/academy/api/session/resume', { method: 'POST', body: {} }), 200, 'Session resume');
    const after = (await device.context.cookies()).find(cookie => cookie.name === SESSION_COOKIE)?.value ?? '';
    if (!before || !after || before === after) throw new Error('Session resume did not rotate the cookie.');
}

async function main() {
    if (!process.argv.includes('--live')) {
        console.error('Refusing to run without --live. This proof deletes a dedicated deployed test account.');
        return 1;
    }
    loadLocalEnv(process.cwd());
    let config;
    try { config = readLiveProofConfig(); } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        return 1;
    }
    const recorder = createRecorder([
        config.inviteCodeA,
        config.inviteCodeB,
        config.proofToken,
        config.runNonce,
        config.evidenceHmacKey,
        process.env.CLOUDFLARE_API_TOKEN,
    ]);
    const resources = [];
    const preparedProfileDirs = [];
    let deployment = null;
    try {
        deployment = await reviewedDeploymentIdentity(config);
        recorder.record('reviewed commit, active Worker version, hosted app, API base, and D1 migrations match', 'pass');

        const prepared = prepareDedicatedProfileDirectories(config.deviceADir, config.deviceBDir);
        preparedProfileDirs.push(prepared.deviceADir, prepared.deviceBDir);
        config = Object.freeze({ ...config, ...prepared });
        recorder.record('canonical marker-owned disposable browser profiles prepared', 'pass');

        const deviceA = await launchDevice(config.deviceADir, config.origin);
        resources.push(deviceA.context);
        const deviceB = await launchDevice(config.deviceBDir, config.origin);
        resources.push(deviceB.context);

        const localEvent = {
            schemaVersion: 1,
            eventId: crypto.randomUUID(),
            at: Date.now(),
            kind: 'profile-changed',
            profile: { displayName: 'PLAT-001 live proof', learningReason: 'synthetic', portraitId: 'map' },
        };

        await exchangeInvite(deviceA.page, config.inviteCodeA);
        await completeRealGoogle(deviceA.page, config);
        recorder.record('device A completed a real Google callback with a scrubbed return URL', 'pass');
        const profileA = requireStatus(await requestJson(deviceA.page, '/academy/api/profile'), 200, 'Device A profile');
        const accountId = recorder.secret(profileA.accountId);
        const originalProfileId = recorder.secret(profileA.profileId);
        if (!UUID_PATTERN.test(accountId) || !UUID_PATTERN.test(originalProfileId)) throw new Error('Device A received malformed public ids.');
        await verifyLifecycleProofGrant(deviceA.page, config, accountId);
        recorder.record('single-use production proof grant matched the authenticated account, environment, and run nonce', 'pass');

        const profileKey = crypto.getRandomValues(new Uint8Array(32));
        requireStatus(await requestJson(deviceA.page, '/academy/api/profile/key', {
            method: 'POST', body: { keyCommitment: await keyCommitment(profileKey) },
        }), 200, 'Profile key initialization');
        const firstEnvelope = await encryptEvent(profileKey, localEvent, profileA.keyVersion);
        recorder.secret(firstEnvelope.id);
        const firstPush = requireStatus(await requestJson(deviceA.page, '/academy/api/srs/push', {
            method: 'POST', body: { events: [firstEnvelope] },
        }), 200, 'Local event migration');
        if (firstPush.inserted !== 1) throw new Error('The local event was not inserted exactly once.');
        const retryPush = requireStatus(await requestJson(deviceA.page, '/academy/api/srs/push', {
            method: 'POST', body: { events: [firstEnvelope] },
        }), 200, 'Local event migration retry');
        if (retryPush.inserted !== 0 || retryPush.duplicates !== 1) {
            throw new Error('The retried local event was not deduplicated.');
        }
        recorder.record('local-only progress migrated idempotently into the account profile', 'pass');

        await exchangeInvite(deviceB.page, config.inviteCodeB);
        await completeRealGoogle(deviceB.page, config);
        const profileB = requireStatus(await requestJson(deviceB.page, '/academy/api/profile'), 200, 'Device B profile');
        if (profileB.accountId !== accountId || profileB.profileId !== originalProfileId) {
            throw new Error('The two Google callbacks did not bind to one isolated account profile.');
        }
        const ticket = requireStatus(await requestJson(deviceA.page, '/academy/api/pairings', { method: 'POST', body: {} }), 201, 'Pairing start');
        recorder.secret(ticket.pairingId);
        recorder.secret(ticket.code);
        const keyEnvelope = await wrapProfileKey(profileKey, ticket.code, ticket.pairingId, profileA.keyVersion);
        requireStatus(await requestJson(deviceA.page, `/academy/api/pairings/${ticket.pairingId}`, {
            method: 'PUT', body: keyEnvelope,
        }), 200, 'Pairing completion');
        const claim = requireStatus(await requestJson(deviceB.page, '/academy/api/pairings/claim', {
            method: 'POST', body: { code: ticket.code },
        }), 200, 'Pairing claim');
        const pairedKey = await unwrapProfileKey(claim.keyEnvelope, ticket.code, ticket.pairingId);
        if (!equalBytes(profileKey, pairedKey)) throw new Error('Device B did not unwrap the source profile key.');
        const pulled = requireStatus(await requestJson(deviceB.page, '/academy/api/srs/pull?cursor=0&limit=200'), 200, 'Device B pull');
        if (pulled.events?.length !== 1 || JSON.stringify(await decryptEvent(pairedKey, pulled.events[0])) !== JSON.stringify(localEvent)) {
            throw new Error('Device B did not receive and decrypt the migrated event.');
        }
        recorder.record('two real browser profiles paired a client-held key and decrypted one synced record', 'pass');

        const exported = await exportWithDeployedClient(deviceA.page);
        if (exported.account?.accountId !== accountId || exported.eventPage.events.length !== 1) {
            throw new Error('Account export did not include the complete synced profile.');
        }
        recorder.record('deployed Academy client exported the account profile and all encrypted records', 'pass');

        const activeSessionA = requireStatus(await requestJson(deviceA.page, '/academy/api/session'), 200, 'Active session');
        recorder.secret(activeSessionA.sessionId);
        await expireAndResume(deviceA, activeSessionA.sessionId);
        recorder.record('expired session resumed inside its fixed window with cookie rotation', 'pass');

        requireStatus(await requestJson(deviceB.page, '/academy/api/logout', { method: 'POST', body: {} }), 200, 'Logout');
        if ((await requestJson(deviceB.page, '/academy/api/session')).status !== 401) throw new Error('Logout did not revoke device B.');
        await startRecovery(deviceB.page);
        await completeRealGoogle(deviceB.page, config);
        const recovered = requireStatus(await requestJson(deviceB.page, '/academy/api/profile'), 200, 'Recovered profile');
        if (recovered.accountId !== accountId || recovered.profileId !== originalProfileId) {
            throw new Error('Recovery did not restore ownership of the original account profile.');
        }
        recorder.record('logout revoked the session and real Google recovery restored only the owned profile', 'pass');

        const profileDeletion = requireStatus(await requestJson(deviceB.page, '/academy/api/profile', {
            method: 'DELETE', body: { confirmation: 'delete-profile' },
        }), 200, 'Profile deletion');
        const profileDeletionId = recorder.secret(profileDeletion.deletionReceipt?.deletionId);
        if (!UUID_PATTERN.test(profileDeletionId)
            || d1Count(`SELECT COUNT(*) AS count FROM profiles WHERE public_id = ${uuidSql(originalProfileId)}`) !== 0
            || d1Count(`SELECT COUNT(*) AS count FROM accounts WHERE public_id = ${uuidSql(accountId)}`) !== 1
            || d1Count(`SELECT COUNT(*) AS count FROM deletion_receipts WHERE id = ${uuidSql(profileDeletionId)} AND scope = 'profile'`) !== 1) {
            throw new Error('Remote D1 did not retain the expected privacy-safe profile deletion receipt.');
        }
        recorder.record('profile reset removed synced data but retained account ownership and a minimized receipt', 'pass');

        await startRecovery(deviceB.page);
        await completeRealGoogle(deviceB.page, config);
        const replacement = requireStatus(await requestJson(deviceB.page, '/academy/api/profile'), 200, 'Replacement profile');
        recorder.secret(replacement.profileId);
        if (replacement.accountId !== accountId || replacement.profileId === originalProfileId) {
            throw new Error('Corrupt-profile recovery did not create a fresh owned profile.');
        }
        const replacementKey = crypto.getRandomValues(new Uint8Array(32));
        requireStatus(await requestJson(deviceB.page, '/academy/api/profile/key', {
            method: 'POST', body: { keyCommitment: await keyCommitment(replacementKey) },
        }), 200, 'Replacement key initialization');
        const replacementEnvelope = await encryptEvent(replacementKey, localEvent, replacement.keyVersion);
        recorder.secret(replacementEnvelope.id);
        requireStatus(await requestJson(deviceB.page, '/academy/api/srs/push', {
            method: 'POST', body: { events: [replacementEnvelope] },
        }), 200, 'Replacement sync');
        const finalExport = await exportWithDeployedClient(deviceB.page);
        if (finalExport.eventPage.events.length !== 1
            || JSON.stringify(await decryptEvent(replacementKey, finalExport.eventPage.events[0])) !== JSON.stringify(localEvent)) {
            throw new Error('Recovered profile export did not preserve the synthetic local record.');
        }
        recorder.record('corrupt-profile reset recreated encryption state and exported restored local progress', 'pass');

        await verifyLifecycleProofGrant(deviceB.page, config, accountId);
        const accountDeletion = requireStatus(await requestJson(deviceB.page, '/academy/api/account/lifecycle-proof', {
            method: 'DELETE',
            body: {
                confirmation: 'delete-account',
                proofToken: config.proofToken,
                runNonce: config.runNonce,
            },
        }), 200, 'Account deletion');
        const accountDeletionId = recorder.secret(accountDeletion.deletionReceipt?.deletionId);
        if (!UUID_PATTERN.test(accountDeletionId)
            || d1Count(`SELECT COUNT(*) AS count FROM accounts WHERE public_id = ${uuidSql(accountId)}`) !== 0
            || d1Count(`SELECT COUNT(*) AS count FROM profiles WHERE public_id = ${uuidSql(replacement.profileId)}`) !== 0
            || d1Count(`SELECT COUNT(*) AS count FROM srs_events WHERE event_id = ${uuidSql(replacementEnvelope.id)}`) !== 0
            || d1Count(`SELECT COUNT(*) AS count FROM deletion_receipts WHERE id = ${uuidSql(accountDeletionId)} AND scope = 'account'`) !== 1) {
            throw new Error('Remote D1 did not prove account learning-data deletion and its minimized receipt.');
        }
        if ((await requestJson(deviceB.page, '/academy/api/session')).status !== 401) throw new Error('Account deletion did not clear the session.');
        recorder.record('server atomically consumed the account-bound production proof grant at deletion', 'pass');
        recorder.record('account deletion removed identity, profile, sessions, and synced records while retaining declared audit records', 'pass');

        await startRecovery(deviceB.page);
        await completeRealGoogle(deviceB.page, config, 'failed');
        if (d1Count(`SELECT COUNT(*) AS count FROM accounts WHERE public_id = ${uuidSql(accountId)}`) !== 0) {
            throw new Error('Deleted account reappeared after recovery.');
        }
        recorder.record('deleted identity could not be recovered without new invite ownership', 'pass');
    } catch (error) {
        recorder.record('live proof runner', 'fail', error instanceof Error ? error.message : String(error));
    } finally {
        await Promise.all(resources.map(context => context.close().catch(() => undefined)));
        if (preparedProfileDirs.length > 0) {
            try {
                cleanupDedicatedProfileDirectories(preparedProfileDirs);
                recorder.record('marker-owned disposable browser profiles removed', 'pass');
            } catch (error) {
                recorder.record('browser profile cleanup', 'fail', error instanceof Error ? error.message : String(error));
            }
        }
    }

    const complete = recorder.results.every(result => result.outcome === 'pass');
    mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
    const evidence = signLifecycleEvidence({
        schemaVersion: 3,
        ranAt: new Date().toISOString(),
        complete,
        deployment,
        results: recorder.results,
    }, config.evidenceHmacKey);
    writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
    const written = JSON.parse(readFileSync(EVIDENCE_PATH, 'utf8'));
    if (!verifyLifecycleEvidence(written, config.evidenceHmacKey)) {
        console.error('LIVE PROOF FAILED - evidence integrity verification failed after write.');
        return 1;
    }
    console.log(`\n${complete ? 'LIVE PROOF PASSED' : 'LIVE PROOF FAILED'} - signed redacted result at ${EVIDENCE_PATH}`);
    return complete ? 0 : 1;
}

const directRun = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (directRun) process.exitCode = await main();
