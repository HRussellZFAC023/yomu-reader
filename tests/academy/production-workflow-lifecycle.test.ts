import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseBacklog, proofTemplate, sha256, taskDefinitionSha256, updateBacklogCheckbox } from '../../scripts/lib/academy-workflow-model.mjs';

const sourceRoot = path.resolve(__dirname, '../..');
const sourceConfig = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'config/academy-production-workflow.json'), 'utf8'));

interface Fixture {
    root: string;
    stateRoot: string;
    originRoot: string;
    trustStorePath: string;
    config: Record<string, any>;
    openBacklog: string;
    checkedBacklog: string;
    backlogPath: string;
    taskHead: string;
}

function git(cwd: string, ...args: string[]) {
    const environment = { ...process.env };
    delete environment.GIT_WORK_TREE;
    delete environment.GIT_DIR;
    return execFileSync('git', args, { cwd, encoding: 'utf8', env: environment }).trim();
}

function writeJson(target: string, value: unknown) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function createFixture(options: { userVisible?: boolean } = {}): Fixture {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yomu-workflow-lifecycle-'));
    const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yomu-workflow-state-'));
    const originRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yomu-workflow-origin-'));
    for (const relative of [
        'scripts/academy-production-workflow.mjs',
        'scripts/lib/academy-workflow-model.mjs',
        'scripts/lib/academy-workflow-salvage.mjs',
        'scripts/lib/academy-workflow-store.mjs',
        'scripts/lib/academy-workflow-trust.mjs',
    ]) {
        const target = path.join(root, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(sourceRoot, relative), target);
    }

    const { publicKey } = crypto.generateKeyPairSync('ed25519');
    const config = structuredClone(sourceConfig);
    config.currentFocus = [];
    config.dynamicDependencies = {};
    config.routeCensus = [];
    config.externalRoots = {};
    config.maxParallel = 2;
    config.lanes.find((lane: { id: string }) => lane.id === 'governance').capacity = 2;
    config.reuse = { ...config.reuse, evidenceFiles: [], transcriptRoots: {}, transcriptIndexMaxAgeHours: 24 };
    config.approvalPolicies.owner.requiredKeyIds = ['fixture-owner-key'];
    config.release = {
        ...config.release,
        pushEveryCheckpoint: true,
        preCommitCommands: [],
        preReleaseCommands: [],
        userVisiblePrefixes: options.userVisible ? ['GOV'] : [],
    };
    writeJson(path.join(root, 'config/academy-production-workflow.json'), config);
    fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}\n');
    const openBacklog = [
        '- [ ] **GOV-001** Harden governance transactions. **Deps:** none. **Proof:** `C`,`owner`.',
        '- [ ] **OPS-001** Serialize governance records. **Deps:** none. **Proof:** `C`.',
        '',
    ].join('\n');
    const checkedBacklog = updateBacklogCheckbox(openBacklog, 'GOV-001');
    const backlogPath = path.join(root, config.canonicalBacklog);
    fs.mkdirSync(path.dirname(backlogPath), { recursive: true });
    fs.writeFileSync(backlogPath, openBacklog);
    fs.writeFileSync(path.join(root, 'review-prompt.md'), 'Review the exact governance slice.\n');
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist/yomu.user.js'), '// fixture\n');
    fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## [1.0.0]\n');

    git(root, 'init', '--initial-branch=main');
    git(root, 'config', 'user.name', 'Workflow Test');
    git(root, 'config', 'user.email', 'workflow@example.invalid');
    git(root, 'config', 'commit.gpgsign', 'false');
    git(root, 'add', '.');
    git(root, 'commit', '-m', 'fixture baseline');
    const taskHead = git(root, 'rev-parse', 'HEAD');
    git(originRoot, 'init', '--bare', '--initial-branch=main');
    git(root, 'remote', 'add', 'origin', originRoot);
    git(root, 'push', '-u', 'origin', 'main');

    const trustStorePath = path.join(stateRoot, 'governance-trust.json');
    writeJson(trustStorePath, {
        schema: 'yomu-academy.governance-trust/v1', revision: 3, issuedAt: '2026-07-20T00:00:00.000Z',
        ownerKeys: [{
            keyId: 'fixture-owner-key', ownerId: 'heru', algorithm: 'Ed25519', publicKeyJwk: publicKey.export({ format: 'jwk' }),
            activatedAt: '2026-07-01T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z', revokedAt: null, successorKeyId: null,
        }],
        approvalPolicies: [{
            id: 'academy-production-owner', purpose: 'academy-production-promotion', allowedOwnerIds: ['heru'],
            activeKeyIds: ['fixture-owner-key'], maxValidityMinutes: 30,
        }],
        tools: [{
            id: 'claude-code-fable', command: 'claude', versionArgs: ['--version'], versionPattern: '^(\\d+\\.\\d+\\.\\d+)',
            installations: [{ version: '0.0.0', sha256: '0'.repeat(64), realpathSuffixes: ['/unavailable/claude'] }],
        }, {
            id: 'github-cli', command: 'gh', versionArgs: ['--version'], versionPattern: '^gh version (\\d+\\.\\d+\\.\\d+)',
            installations: [{ version: '0.0.0', sha256: '0'.repeat(64), realpathSuffixes: ['/unavailable/gh'] }],
        }],
        reviewProviders: [{
            id: 'claude-fable', reviewerId: 'claude-fable', model: 'claude-fable-5', toolId: 'claude-code-fable',
            args: [
                '-p', '--model', 'claude-fable-5', '--permission-mode', 'plan', '--output-format', 'json',
                '--bare', '--safe-mode', '--disable-slash-commands', '--strict-mcp-config',
                '--mcp-config', '{"mcpServers":{}}', '--setting-sources', '', '--no-session-persistence',
                '--no-chrome', '--tools', 'Read,Grep,Glob',
            ], outputFormat: 'claude-json', serviceProvenance: 'unresolved',
            allowedEnvironment: ['ANTHROPIC_API_KEY'],
        }],
        githubPolicies: [{
            id: 'yomu-reader-production', repository: 'HRussellZFAC023/yomu-reader', apiBase: 'https://api.github.com',
            remoteUrl: 'https://github.com/HRussellZFAC023/yomu-reader.git', ghToolId: 'github-cli',
            deploymentWorkflowPath: '.github/workflows/deploy-pages.yml',
            checkpointWorkflowPaths: ['.github/workflows/ci.yml'], checkpointWorkflowEvents: ['push'],
            assetDownloadHosts: ['objects.githubusercontent.com', 'release-assets.githubusercontent.com'],
        }],
    });
    return { root, stateRoot, originRoot, trustStorePath, config, openBacklog, checkedBacklog, backlogPath, taskHead };
}

function workflowEnv(fixture: Fixture, extra: NodeJS.ProcessEnv = {}) {
    return {
        ...process.env,
        GIT_WORK_TREE: fixture.root,
        YOMU_ACADEMY_WORKFLOW_STATE: fixture.stateRoot,
        YOMU_ACADEMY_GOVERNANCE_TRUST_STORE: fixture.trustStorePath,
        ...extra,
    };
}

function runWorkflow(fixture: Fixture, args: string[], extra: NodeJS.ProcessEnv = {}) {
    return execFileSync(process.execPath, ['scripts/academy-production-workflow.mjs', ...args], {
        cwd: fixture.root,
        encoding: 'utf8',
        env: workflowEnv(fixture, extra),
    });
}

function runWorkflowResult(fixture: Fixture, args: string[], extra: NodeJS.ProcessEnv = {}) {
    try {
        return { status: 0, stdout: runWorkflow(fixture, args, extra), stderr: '' };
    } catch (error: any) {
        return { status: error.status ?? 1, stdout: String(error.stdout ?? ''), stderr: String(error.stderr ?? '') };
    }
}

function spawnWorkflow(fixture: Fixture, args: string[], extra: NodeJS.ProcessEnv = {}) {
    return new Promise<{ status: number | null; stdout: string; stderr: string }>(resolve => {
        const child = spawn(process.execPath, ['scripts/academy-production-workflow.mjs', ...args], {
            cwd: fixture.root,
            env: workflowEnv(fixture, extra),
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
        child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
        child.on('close', status => resolve({ status, stdout, stderr }));
    });
}

function readState(fixture: Fixture) {
    return JSON.parse(fs.readFileSync(path.join(fixture.stateRoot, 'state.json'), 'utf8'));
}

function seedCheckpoint(fixture: Fixture, options: { userVisible?: boolean } = {}) {
    fs.writeFileSync(fixture.backlogPath, fixture.checkedBacklog);
    const [task] = parseBacklog(fixture.checkedBacklog, fixture.config);
    const proof = proofTemplate(task, fixture.config, fixture.taskHead);
    Object.assign(proof, {
        backlogSha256: sha256(fixture.openBacklog), headCommit: fixture.taskHead, claimToken: 'claim-1',
        worktree: fixture.root, submittedAt: new Date().toISOString(), owner: 'codex', summary: 'fixture', changedFiles: [],
        release: { ...proof.release, userVisible: options.userVisible ?? false, releaseNotes: options.userVisible ? 'fixture' : null },
    });
    const proofPath = path.join(fixture.stateRoot, 'proofs/GOV-001.json');
    writeJson(proofPath, proof);
    const promotion = {
        promotionId: 'promotion-1', taskId: task.id, claimToken: 'claim-1', baseCommit: fixture.taskHead,
        headCommit: fixture.taskHead, proofSha256: sha256(fs.readFileSync(proofPath)),
        evidenceManifestSha256: sha256(`${JSON.stringify([])}\n`), taskDefinitionSha256: taskDefinitionSha256(task),
        sourceBacklogSha256: sha256(fixture.openBacklog), expectedBacklogSha256: sha256(fixture.checkedBacklog),
        userVisible: options.userVisible ?? false, status: 'awaiting-checkpoint',
    };
    writeJson(path.join(fixture.stateRoot, 'state.json'), {
        schema: 'yomu-academy.production-workflow-state/v2',
        claims: [{
            taskId: task.id, owner: 'codex', lane: 'governance', token: 'claim-1', status: 'active',
            claimedAt: new Date().toISOString(), expiresAt: '2099-01-01T00:00:00.000Z', baseCommit: fixture.taskHead,
            claimHead: fixture.taskHead, worktree: fixture.root, reservedFiles: [fixture.config.canonicalBacklog],
        }],
        promotions: [promotion], releases: [],
    });
}

function cleanup(fixture: Fixture) {
    fs.rmSync(fixture.root, { recursive: true, force: true });
    fs.rmSync(fixture.stateRoot, { recursive: true, force: true });
    fs.rmSync(fixture.originRoot, { recursive: true, force: true });
}

function completeSalvage(fixture: Fixture, taskId: string) {
    runWorkflow(fixture, ['salvage', taskId]);
    const target = path.join(fixture.stateRoot, 'reuse', `${taskId}.json`);
    const report = JSON.parse(fs.readFileSync(target, 'utf8'));
    for (const candidate of report.candidates) candidate.disposition = {
        status: 'reject', reason: 'Fixture candidate is not reusable.', reusablePaths: [], reusableCommits: [],
    };
    report.decision = { status: 'complete', candidateCount: report.candidates.length, reuseCount: 0, rejectCount: report.candidates.length };
    writeJson(target, report);
}

describe('Academy production workflow CLI lifecycle', () => {
    it('serializes simultaneous status and ledger writers through one physical lock', async () => {
        const fixture = createFixture();
        try {
            const alias = `${fixture.stateRoot}-alias`;
            fs.symlinkSync(fixture.stateRoot, alias, 'dir');
            const results = await Promise.all([
                spawnWorkflow(fixture, ['status']),
                spawnWorkflow(fixture, ['ledger'], { YOMU_ACADEMY_WORKFLOW_STATE: alias }),
                spawnWorkflow(fixture, ['status'], { YOMU_ACADEMY_WORKFLOW_STATE: alias }),
                spawnWorkflow(fixture, ['ledger']),
            ]);
            expect(results.map(row => row.status), results.map(row => row.stderr).join('\n')).toEqual([0, 0, 0, 0]);
            expect(() => JSON.parse(fs.readFileSync(path.join(fixture.stateRoot, 'production-ledger.json'), 'utf8'))).not.toThrow();
            expect(fs.existsSync(path.join(fixture.stateRoot, '.workflow.lock'))).toBe(false);
            fs.unlinkSync(alias);
        } finally {
            cleanup(fixture);
        }
    });

    it('serializes aliased claims, status, and ledger while rejecting one genuine collision', async () => {
        const fixture = createFixture();
        try {
            runWorkflow(fixture, ['index-unreachable']);
            runWorkflow(fixture, ['index-transcripts']);
            completeSalvage(fixture, 'GOV-001');
            completeSalvage(fixture, 'OPS-001');
            const stateAlias = `${fixture.stateRoot}-alias`;
            fs.symlinkSync(fixture.stateRoot, stateAlias, 'dir');
            const [left, right, status, ledger] = await Promise.all([
                spawnWorkflow(fixture, ['claim', 'GOV-001', '--owner', 'left', '--paths', fixture.config.canonicalBacklog]),
                spawnWorkflow(fixture, ['claim', 'OPS-001', '--owner', 'right', '--paths', fixture.config.canonicalBacklog], {
                    YOMU_ACADEMY_WORKFLOW_STATE: stateAlias,
                }),
                spawnWorkflow(fixture, ['status'], { YOMU_ACADEMY_WORKFLOW_STATE: stateAlias }),
                spawnWorkflow(fixture, ['ledger']),
            ]);
            expect([left.status, right.status].sort()).toEqual([0, 1]);
            expect([status.status, ledger.status], `${status.stderr}\n${ledger.stderr}`).toEqual([0, 0]);
            expect(`${left.stderr}\n${right.stderr}`).toMatch(/Reserved files collide|lane is at capacity/u);
            expect(readState(fixture).claims.filter((row: { status: string }) => row.status === 'active')).toHaveLength(1);
            fs.unlinkSync(stateAlias);
        } finally {
            cleanup(fixture);
        }
    }, 30_000);

    it('detects a middle-of-file transcript change despite identical size and timestamps', () => {
        const fixture = createFixture();
        const transcriptRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yomu-transcripts-'));
        try {
            const configPath = path.join(fixture.root, 'config/academy-production-workflow.json');
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            config.reuse.transcriptRoots = { fixture: { env: 'YOMU_TEST_TRANSCRIPTS', default: transcriptRoot } };
            writeJson(configPath, config);
            git(fixture.root, 'add', configPath);
            git(fixture.root, 'commit', '-m', 'configure transcript fixture');
            git(fixture.root, 'push', 'origin', 'main');

            const transcript = path.join(transcriptRoot, 'session.jsonl');
            const first = `${'a'.repeat(70 * 1024)} GOV-001 harden governance transactions ${'z'.repeat(70 * 1024)}`;
            fs.writeFileSync(transcript, first);
            const original = fs.statSync(transcript);
            const env = { YOMU_TEST_TRANSCRIPTS: transcriptRoot };
            runWorkflow(fixture, ['index-transcripts'], env);
            const cachePath = path.join(fixture.stateRoot, 'reuse-index/transcripts.json');
            const indexed = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            expect(indexed.rows[0].summary).toContain('gov-001');
            expect(indexed.rows[0].metadata).toMatchObject({ completeContentScan: true, contentSha256: sha256(first) });

            const second = first.replace('GOV-001 harden governance transactions', 'OPS-001 serial governance transactions');
            expect(Buffer.byteLength(second)).toBe(Buffer.byteLength(first));
            fs.writeFileSync(transcript, second);
            fs.utimesSync(transcript, original.atime, original.mtime);
            runWorkflow(fixture, ['salvage', 'GOV-001'], env);
            const report = JSON.parse(fs.readFileSync(path.join(fixture.stateRoot, 'reuse/GOV-001.json'), 'utf8'));
            expect(report.baseScan.transcriptCache.status).toBe('stale');
        } finally {
            fs.rmSync(transcriptRoot, { recursive: true, force: true });
            cleanup(fixture);
        }
    });

    it('rejects an unreachable-object cache after a new object appears', () => {
        const fixture = createFixture();
        try {
            runWorkflow(fixture, ['index-unreachable']);
            runWorkflow(fixture, ['index-transcripts']);
            const tree = git(fixture.root, 'write-tree');
            git(fixture.root, 'commit-tree', tree, '-m', 'unreachable after cache');
            completeSalvage(fixture, 'GOV-001');
            const result = runWorkflowResult(fixture, [
                'claim', 'GOV-001', '--owner', 'owner', '--paths', fixture.config.canonicalBacklog,
            ]);
            expect(result.status).toBe(1);
            expect(result.stderr).toContain('complete current unreachable-object scan');
            expect(fs.existsSync(path.join(fixture.stateRoot, 'state.json'))).toBe(false);
        } finally {
            cleanup(fixture);
        }
    }, 30_000);

    it('restores the Git index after an injected checkpoint crash and on reopen', () => {
        const fixture = createFixture();
        try {
            seedCheckpoint(fixture);
            expect(git(fixture.root, 'diff', '--cached', '--name-only')).toBe('');
            const crashed = runWorkflowResult(fixture, ['checkpoint', '--token', 'claim-1'], {
                YOMU_ACADEMY_WORKFLOW_CRASH_AT: 'checkpoint-git:after-stage',
            });
            expect(crashed.status).toBe(86);
            expect(git(fixture.root, 'diff', '--cached', '--name-only')).toBe(fixture.config.canonicalBacklog);
            expect(runWorkflowResult(fixture, ['status']).status).toBe(0);
            expect(git(fixture.root, 'diff', '--cached', '--name-only')).toBe('');
            expect(fs.readFileSync(fixture.backlogPath, 'utf8')).toBe(fixture.checkedBacklog);
            expect(runWorkflowResult(fixture, ['reopen', 'GOV-001', '--token', 'claim-1']).status).toBe(0);
            expect(git(fixture.root, 'diff', '--cached', '--name-only')).toBe('');
            expect(fs.readFileSync(fixture.backlogPath, 'utf8')).toBe(fixture.openBacklog);
        } finally {
            cleanup(fixture);
        }
    });

    it('marks checkpoint evidence failed and recoverable after verification failure', () => {
        const fixture = createFixture();
        try {
            seedCheckpoint(fixture);
            const result = runWorkflowResult(fixture, ['checkpoint', '--token', 'claim-1']);
            expect(result.status).toBe(1);
            const state = readState(fixture);
            expect(state.promotions[0].status).toBe('failed-verification');
            expect(state.claims[0].status).toBe('failed-verification');
            expect(state.checkpoints[0]).toMatchObject({ status: 'failed-verification', recoverable: true });
            expect(state.promotions[0].status).not.toBe('verified');
        } finally {
            cleanup(fixture);
        }
    });

    it('rejects legacy hand-seeded prepared state instead of pretending it is a production lifecycle', () => {
        const fixture = createFixture();
        try {
            seedCheckpoint(fixture);
            const state = readState(fixture);
            state.promotions[0].status = 'prepared';
            writeJson(path.join(fixture.stateRoot, 'state.json'), state);
            const result = runWorkflowResult(fixture, ['ledger']);
            expect(result.status).toBe(1);
            expect(result.stderr).toContain('Legacy prepared promotions are unsupported');
        } finally {
            cleanup(fixture);
        }
    });

    it('fails closed when Fable is unavailable or replaced', () => {
        const fixture = createFixture();
        try {
            const [task] = parseBacklog(fixture.openBacklog, fixture.config);
            const proof = proofTemplate(task, fixture.config, fixture.taskHead);
            proof.owner = 'codex';
            writeJson(path.join(fixture.stateRoot, 'proofs/GOV-001.json'), proof);
            const result = runWorkflowResult(fixture, ['run-review', 'GOV-001', '--provider', 'claude-fable', '--prompt', 'review-prompt.md']);
            expect(result.status).toBe(1);
            expect(result.stderr).toMatch(/externally trusted claude-code-fable installation|Required executable is unavailable/u);
        } finally {
            cleanup(fixture);
        }
    });

    it('rejects a fake gh executable and leaves awaiting-release work incomplete', () => {
        const fixture = createFixture({ userVisible: true });
        try {
            seedCheckpoint(fixture, { userVisible: true });
            const state = readState(fixture);
            state.promotions[0].status = 'awaiting-release';
            state.claims[0].status = 'awaiting-release';
            writeJson(path.join(fixture.stateRoot, 'state.json'), state);
            const fakeBin = path.join(fixture.stateRoot, 'fake-bin');
            fs.mkdirSync(fakeBin);
            const fakeGh = path.join(fakeBin, 'gh');
            fs.writeFileSync(fakeGh, '#!/bin/sh\nprintf "gh version 0.0.0\\n"\n');
            fs.chmodSync(fakeGh, 0o700);
            const result = runWorkflowResult(fixture, ['record-release', '--tag', 'v1.0.0'], {
                PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
                GH_BIN: fakeGh,
            });
            expect(result.status).toBe(1);
            expect(result.stderr).toContain('not an externally trusted github-cli installation');
            expect(readState(fixture).promotions[0].status).toBe('awaiting-release');
            expect(readState(fixture).releases).toEqual([]);
        } finally {
            cleanup(fixture);
        }
    });

    it('recovers journaled ledger writes at injected file boundaries', () => {
        const fixture = createFixture();
        try {
            const crashed = runWorkflowResult(fixture, ['ledger'], {
                YOMU_ACADEMY_WORKFLOW_CRASH_AT: 'production-ledger:after-intent',
            });
            expect(crashed.status).toBe(86);
            expect(fs.existsSync(path.join(fixture.stateRoot, 'prepared-transition.json'))).toBe(true);
            expect(runWorkflowResult(fixture, ['status']).status).toBe(0);
            expect(fs.existsSync(path.join(fixture.stateRoot, 'prepared-transition.json'))).toBe(false);
            expect(() => JSON.parse(fs.readFileSync(path.join(fixture.stateRoot, 'production-ledger.json'), 'utf8'))).not.toThrow();
        } finally {
            cleanup(fixture);
        }
    });
});
