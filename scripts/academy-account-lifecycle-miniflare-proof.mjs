#!/usr/bin/env node
/**
 * Credential-free PLAT-001 smoke against Wrangler's local Miniflare runtime.
 * The deeper lifecycle matrix remains in Vitest, where the same migrations run
 * against an isolated SQLite D1 adapter.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path, { resolve } from 'node:path';

const ROOT = process.cwd();
const WRANGLER_BIN = resolve(ROOT, 'node_modules/wrangler/bin/wrangler.js');
const CONFIG = resolve(ROOT, 'wrangler.academy.jsonc');
const MIGRATIONS = resolve(ROOT, 'workers/yomu-academy/migrations');
const EVIDENCE_PATH = resolve(ROOT, 'artifacts/academy-account-lifecycle/local-miniflare-proof.json');
const ORIGIN = 'https://yomureader.com';
const STARTUP_TIMEOUT_MS = 30_000;
const LOCAL_SECRETS = Object.freeze({
    ACADEMY_INVITE_HMAC_KEY: 'local-proof-invite-hmac-key',
    ACADEMY_RATE_HMAC_KEY: 'local-proof-rate-hmac-key',
    ACADEMY_ADMIN_TOKEN: 'local-proof-admin-token',
    PAYMENT_INGRESS_TOKEN: 'local-proof-payment-token',
    STRIPE_SECRET_KEY: 'sk_test_local_proof',
    STRIPE_WEBHOOK_SECRET: 'whsec_local_proof',
    GOOGLE_OIDC_CLIENT_ID: 'local-proof.apps.googleusercontent.com',
    GOOGLE_OIDC_CLIENT_SECRET: 'local-proof-google-secret',
});

function localOnlyEnvironment() {
    return {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? os.homedir(),
        TMPDIR: process.env.TMPDIR ?? os.tmpdir(),
        LANG: process.env.LANG ?? 'C',
        CI: 'true',
        CLOUDFLARE_ACCOUNT_ID: '',
        CLOUDFLARE_API_KEY: '',
        CLOUDFLARE_API_TOKEN: '',
        CLOUDFLARE_EMAIL: '',
        WRANGLER_SEND_METRICS: 'false',
        ...LOCAL_SECRETS,
    };
}

function wrangler(args) {
    return execFileSync(process.execPath, [WRANGLER_BIN, ...args], {
        cwd: ROOT,
        encoding: 'utf8',
        env: localOnlyEnvironment(),
        stdio: ['ignore', 'pipe', 'pipe'],
    });
}

function freePort() {
    return new Promise((resolvePort, reject) => {
        const server = net.createServer();
        server.unref();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
                server.close();
                reject(new Error('Could not reserve a local Miniflare port.'));
                return;
            }
            server.close(error => error ? reject(error) : resolvePort(address.port));
        });
    });
}

async function waitForWorker(child, healthUrl, logs) {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) throw new Error(`Miniflare exited during startup. ${logs()}`.trim());
        try {
            const response = await fetch(healthUrl, { cache: 'no-store' });
            if (response.ok) return;
        } catch {
            // The local socket is not ready yet.
        }
        await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
    }
    throw new Error(`Miniflare did not become ready. ${logs()}`.trim());
}

async function stopWorker(child) {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    await Promise.race([
        new Promise(resolveExit => child.once('exit', resolveExit)),
        new Promise(resolveDelay => setTimeout(resolveDelay, 5_000)),
    ]);
    if (child.exitCode === null) {
        child.kill('SIGKILL');
        await new Promise(resolveExit => child.once('exit', resolveExit));
    }
}

function parseD1Rows(output) {
    const batches = JSON.parse(output);
    const rows = Array.isArray(batches) ? batches[0]?.results : null;
    if (!Array.isArray(rows)) throw new Error('Wrangler returned an invalid local D1 result.');
    return rows;
}

function requireStatus(response, expected, step) {
    if (response.status !== expected) throw new Error(`${step} returned HTTP ${response.status}.`);
    return response;
}

async function main() {
    const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'yomu-plat001-miniflare-'));
    const persistence = resolve(temporaryRoot, 'state');
    const envFile = resolve(temporaryRoot, 'local.env');
    mkdirSync(persistence, { recursive: true });
    writeFileSync(envFile, `${Object.entries(LOCAL_SECRETS).map(([name, value]) => `${name}=${value}`).join('\n')}\n`, {
        mode: 0o600,
    });

    let child = null;
    try {
        wrangler([
            'd1', 'migrations', 'apply', 'ACADEMY_DB', '--local', '--config', CONFIG,
            '--persist-to', persistence,
        ]);
        wrangler([
            'd1', 'execute', 'ACADEMY_DB', '--local', '--config', CONFIG,
            '--persist-to', persistence, '--command',
            "INSERT INTO deletion_receipts "
            + "(id, scope, deleted_at, profile_count, device_count, synced_record_count, prune_after) "
            + "VALUES ('00000000-0000-4000-8000-000000000001', 'profile', 0, 1, 0, 0, 1);",
        ]);

        const port = await freePort();
        const inspectorPort = await freePort();
        let output = '';
        child = spawn(process.execPath, [
            WRANGLER_BIN, 'dev', '--local', '--config', CONFIG, '--persist-to', persistence,
            '--env-file', envFile, '--ip', '127.0.0.1', '--port', String(port),
            '--inspector-port', String(inspectorPort), '--log-level', 'error',
            '--test-scheduled',
            '--show-interactive-dev-session=false',
        ], {
            cwd: ROOT,
            env: localOnlyEnvironment(),
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const collect = chunk => { output = `${output}${String(chunk)}`.slice(-8_000); };
        child.stdout.on('data', collect);
        child.stderr.on('data', collect);

        const localOrigin = `http://127.0.0.1:${port}`;
        await waitForWorker(child, `${localOrigin}/academy/api/health`, () => output);

        const recovery = requireStatus(await fetch(`${localOrigin}/academy/api/auth/google/recovery`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                origin: ORIGIN,
                'sec-fetch-site': 'same-origin',
                'cf-connecting-ip': '192.0.2.10',
            },
            body: '{}',
        }), 201, 'Local recovery session');
        const recoveryBody = await recovery.json();
        const sessionCookie = (recovery.headers.get('set-cookie') ?? '').split(';', 1)[0];
        if (!sessionCookie.startsWith('__Host-academy_session=')
            || typeof recoveryBody.sessionId !== 'string') {
            throw new Error('Local recovery session did not return its secure cookie contract.');
        }

        const session = requireStatus(await fetch(`${localOrigin}/academy/api/session`, {
            headers: { cookie: sessionCookie, 'cf-connecting-ip': '192.0.2.10' },
        }), 200, 'Local session read');
        const sessionBody = await session.json();
        if (sessionBody.sessionId !== recoveryBody.sessionId) {
            throw new Error('Local D1 session did not resume through the Worker router.');
        }

        const googleStart = requireStatus(await fetch(`${localOrigin}/academy/api/auth/google/start`, {
            redirect: 'manual',
            headers: {
                cookie: sessionCookie,
                'sec-fetch-site': 'same-origin',
                'cf-connecting-ip': '192.0.2.10',
            },
        }), 302, 'Local Google start');
        const providerUrl = new URL(googleStart.headers.get('location') ?? '');
        if (providerUrl.origin !== 'https://accounts.google.com'
            || providerUrl.searchParams.get('code_challenge_method') !== 'S256'
            || !providerUrl.searchParams.get('state')
            || !providerUrl.searchParams.get('nonce')
            || providerUrl.searchParams.get('redirect_uri') !== `${ORIGIN}/academy/api/auth/google/callback`) {
            throw new Error('Local Google start did not preserve the PKCE/state/nonce redirect contract.');
        }

        requireStatus(await fetch(`${localOrigin}/__scheduled?cron=17+3+*+*+*`), 200, 'Local scheduled receipt prune');

        await stopWorker(child);
        child = null;

        const migrationCount = readdirSync(MIGRATIONS).filter(file => /^\d{4}_[a-z0-9_]+\.sql$/u.test(file)).length;
        const rows = parseD1Rows(wrangler([
            'd1', 'execute', 'ACADEMY_DB', '--local', '--json', '--config', CONFIG,
            '--persist-to', persistence, '--command',
            "SELECT "
            + '(SELECT COUNT(*) FROM d1_migrations) AS migration_count, '
            + '(SELECT COUNT(*) FROM sessions) AS session_count, '
            + '(SELECT COUNT(*) FROM oauth_flows) AS oauth_flow_count, '
            + '(SELECT COUNT(*) FROM deletion_receipts) AS receipt_count, '
            + "(SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'deletion_receipts') AS receipt_table_count, "
            + "(SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'account_lifecycle_proof_grants') AS proof_grant_table_count, "
            + "(SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name IN ('idx_sessions_token_family', 'idx_deletion_receipts_deleted_at')) AS lifecycle_index_count;",
        ]));
        const proof = rows[0];
        if (proof?.migration_count !== migrationCount
            || proof?.session_count !== 1
            || proof?.oauth_flow_count !== 1
            || proof?.receipt_count !== 0
            || proof?.receipt_table_count !== 1
            || proof?.proof_grant_table_count !== 1
            || proof?.lifecycle_index_count !== 2) {
            throw new Error('Local Miniflare D1 state did not match the lifecycle contract.');
        }

        const miniflareVersion = JSON.parse(readFileSync(resolve(ROOT, 'node_modules/miniflare/package.json'), 'utf8')).version;
        const wranglerVersion = JSON.parse(readFileSync(resolve(ROOT, 'node_modules/wrangler/package.json'), 'utf8')).version;
        mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
        writeFileSync(EVIDENCE_PATH, `${JSON.stringify({
            complete: true,
            runtime: { wrangler: wranglerVersion, miniflare: miniflareVersion },
            migrationsApplied: migrationCount,
            workerChecks: ['health', 'recovery-session', 'session-read', 'google-start-pkce', 'scheduled-receipt-prune'],
            d1Checks: {
                sessionCount: proof.session_count,
                oauthFlowCount: proof.oauth_flow_count,
                deletionReceiptTable: true,
                proofGrantTable: true,
                expiredDeletionReceipts: proof.receipt_count,
                lifecycleIndexes: proof.lifecycle_index_count,
            },
        }, null, 2)}\n`);
        console.log(`PASS local Miniflare/D1 lifecycle proof (${migrationCount} migrations, Wrangler ${wranglerVersion}).`);
        return 0;
    } catch (error) {
        console.error(error instanceof Error ? error.message.replaceAll(temporaryRoot, '<temporary>') : String(error));
        return 1;
    } finally {
        if (child) await stopWorker(child);
        rmSync(temporaryRoot, { recursive: true, force: true });
    }
}

process.exitCode = await main();
