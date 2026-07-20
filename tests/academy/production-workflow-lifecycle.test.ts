import crypto from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    canonicalJson,
    canonicalizeReservationPath,
    ownerApprovalPayload,
    parseBacklog,
    proofTemplate,
    sha256,
    taskDefinitionSha256,
    updateBacklogCheckbox,
} from '../../scripts/lib/academy-workflow-model.mjs';

const sourceRoot = path.resolve(__dirname, '../..');
const sourceConfig = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'config/academy-production-workflow.json'), 'utf8'));

interface Fixture {
    root: string;
    stateRoot: string;
    originRoot: string;
    backlogPath: string;
    openBacklog: string;
    checkedBacklog: string;
    taskHead: string;
    config: Record<string, any>;
    ownerPrivateKey: crypto.KeyObject;
}

interface FixtureOptions {
    userVisible?: boolean;
    postPushChecks?: string[];
}

function git(cwd: string, ...args: string[]) {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function writeJson(target: string, value: unknown) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function createFixture(options: FixtureOptions = {}): Fixture {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yomu-workflow-lifecycle-'));
    const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yomu-workflow-state-'));
    const bareOrigin = fs.mkdtempSync(path.join(os.tmpdir(), 'yomu-workflow-origin-'));
    for (const relative of [
        'scripts/academy-production-workflow.mjs',
        'scripts/lib/academy-workflow-model.mjs',
        'scripts/lib/academy-workflow-salvage.mjs',
        'scripts/lib/academy-workflow-store.mjs',
    ]) {
        const target = path.join(root, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(sourceRoot, relative), target);
    }
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    const config = structuredClone(sourceConfig);
    config.currentFocus = [];
    config.dynamicDependencies = {};
    config.routeCensus = [];
    config.externalRoots = {};
    config.reuse = { ...config.reuse, evidenceFiles: [], transcriptRoots: {} };
    config.approvalPolicies.owner.publicKeys = [{
        keyId: 'fixture-owner-key',
        ownerId: 'heru',
        algorithm: 'Ed25519',
        publicKeyJwk: publicKey.export({ format: 'jwk' }),
    }];
    config.release = {
        ...config.release,
        pushEveryCheckpoint: true,
        publishUserVisibleSlices: options.userVisible ?? false,
        userVisiblePrefixes: options.userVisible ? ['GOV'] : [],
        preCommitCommands: [],
        preReleaseCommands: [],
        postPushChecks: options.postPushChecks ?? [],
    };
    writeJson(path.join(root, 'config/academy-production-workflow.json'), config);
    fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}\n');
    const openBacklog = '- [ ] **GOV-001** Harden governance. **Deps:** none. **Proof:** `C`,`owner`.\n';
    const checkedBacklog = updateBacklogCheckbox(openBacklog, 'GOV-001');
    const backlogPath = path.join(root, 'docs/academy/BACKLOG.md');
    fs.mkdirSync(path.dirname(backlogPath), { recursive: true });
    fs.writeFileSync(backlogPath, openBacklog);
    fs.writeFileSync(path.join(root, 'review-prompt.md'), 'Review the exact governance slice.\n');
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist/yomu.user.js'), '// release fixture\n');
    fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## [1.0.0]\n\n- Fixture release.\n');

    git(root, 'init', '--initial-branch=main');
    git(root, 'config', 'user.name', 'Workflow Test');
    git(root, 'config', 'user.email', 'workflow-test@example.invalid');
    git(root, 'config', 'commit.gpgsign', 'false');
    git(root, 'config', 'tag.gpgSign', 'false');
    git(root, 'add', '.');
    git(root, 'commit', '-m', 'fixture baseline');
    const taskHead = git(root, 'rev-parse', 'HEAD');
    git(bareOrigin, 'init', '--bare', '--initial-branch=main');
    git(root, 'remote', 'add', 'origin', bareOrigin);
    git(root, 'push', '-u', 'origin', 'main');
    return {
        root,
        stateRoot,
        originRoot: bareOrigin,
        backlogPath,
        openBacklog,
        checkedBacklog,
        taskHead,
        config,
        ownerPrivateKey: privateKey,
    };
}

function runWorkflow(fixture: Fixture, args: string[], extraEnv: NodeJS.ProcessEnv = {}) {
    return spawnSync(process.execPath, ['scripts/academy-production-workflow.mjs', ...args], {
        cwd: fixture.root,
        encoding: 'utf8',
        env: {
            ...process.env,
            YOMU_ACADEMY_WORKFLOW_STATE: fixture.stateRoot,
            ...extraEnv,
        },
    });
}

function reference(fixture: Fixture, relative: string) {
    const absolute = path.join(fixture.stateRoot, relative);
    return { path: `@workflow-state/${relative}`, sha256: sha256(fs.readFileSync(absolute)) };
}

function evidenceManifest(references: Array<{ path: string; sha256: string }>) {
    const entries = [...references]
        .sort((left, right) => left.path.localeCompare(right.path, 'en'))
        .map(row => ({ path: row.path, sha256: row.sha256 }));
    return sha256(`${JSON.stringify(entries)}\n`);
}

function createSignedApproval(
    fixture: Fixture,
    task: ReturnType<typeof parseBacklog>[number],
    claimToken: string,
    backlogSha256: string,
    relative = 'evidence/owner-approval.json',
) {
    fs.mkdirSync(path.join(fixture.stateRoot, 'evidence'), { recursive: true });
    fs.writeFileSync(path.join(fixture.stateRoot, 'evidence/owner-decision.txt'), 'Owner approved this exact promotion.\n');
    const issuedAt = new Date(Date.now() - 60_000).toISOString();
    const expiresAt = new Date(Date.now() + 20 * 60_000).toISOString();
    const approval = {
        schema: 'yomu-academy.owner-approval/v2',
        taskId: task.id,
        requirement: 'owner',
        purpose: 'academy-production-promotion',
        decision: 'approve',
        owner: { id: 'heru' },
        claimToken,
        headCommit: fixture.taskHead,
        backlogSha256,
        taskDefinitionSha256: taskDefinitionSha256(task),
        issuedAt,
        expiresAt,
        nonce: crypto.randomBytes(18).toString('base64url'),
        evidence: reference(fixture, 'evidence/owner-decision.txt'),
        summary: 'Approved this exact task revision and promotion purpose.',
        signature: { keyId: 'fixture-owner-key', algorithm: 'Ed25519', value: '' },
    };
    approval.signature.value = crypto.sign(
        null,
        Buffer.from(canonicalJson(ownerApprovalPayload(task, 'owner', approval))),
        fixture.ownerPrivateKey,
    ).toString('base64');
    writeJson(path.join(fixture.stateRoot, relative), approval);
    return { approval, reference: reference(fixture, relative) };
}

function seedPreparedPromotion(fixture: Fixture, options: {
    backlogWritten?: boolean;
    expiresAt?: string;
    replacement?: boolean;
    userVisible?: boolean;
} = {}) {
    if (options.backlogWritten) fs.writeFileSync(fixture.backlogPath, fixture.checkedBacklog);
    const task = parseBacklog(options.backlogWritten ? fixture.checkedBacklog : fixture.openBacklog, fixture.config)[0];
    const evidenceRoot = path.join(fixture.stateRoot, 'evidence');
    fs.mkdirSync(evidenceRoot, { recursive: true });
    fs.writeFileSync(path.join(evidenceRoot, 'reuse.json'), '{"audit":"complete"}\n');
    fs.writeFileSync(path.join(evidenceRoot, 'implementation.txt'), 'canonical implementation\n');
    const implementation = reference(fixture, 'evidence/implementation.txt');
    writeJson(path.join(evidenceRoot, 'gate.json'), {
        schema: 'yomu-academy.gate-attestation/v1', taskId: task.id, gate: 'C', verdict: 'pass',
        assertions: [{ status: 'pass', claim: 'Canonical implementation exists.', artifacts: [implementation] }],
    });
    fs.writeFileSync(path.join(evidenceRoot, 'review.json'), '{"verdict":"ship"}\n');
    const reuse = reference(fixture, 'evidence/reuse.json');
    const gate = reference(fixture, 'evidence/gate.json');
    const review = reference(fixture, 'evidence/review.json');
    const { approval, reference: approvalReference } = createSignedApproval(
        fixture,
        task,
        'claim-original',
        sha256(fixture.openBacklog),
    );
    const ownerEvidence = reference(fixture, 'evidence/owner-decision.txt');
    const proof = proofTemplate(task, fixture.config, fixture.taskHead);
    Object.assign(proof, {
        backlogSha256: sha256(fixture.openBacklog),
        headCommit: fixture.taskHead,
        claimToken: 'claim-original',
        worktree: fixture.root,
        submittedAt: new Date().toISOString(),
        owner: 'codex-main',
        summary: 'Verified governance fixture.',
        changedFiles: [],
        reuseAudit: { status: 'pass', report: reuse },
        independentReview: { status: 'pass', reviewer: 'claude-fable', evidence: review, findingsResolved: [] },
    });
    proof.gates.C = { ...proof.gates.C, status: 'pass', evidence: [gate] };
    proof.approvals.owner = { status: 'pass', evidence: approvalReference };
    writeJson(path.join(fixture.stateRoot, 'proofs/GOV-001.json'), proof);
    const proofSha256 = sha256(fs.readFileSync(path.join(fixture.stateRoot, 'proofs/GOV-001.json')));
    const manifestSha256 = evidenceManifest([reuse, gate, review, implementation, ownerEvidence, approvalReference]);
    const claims = [{
        taskId: task.id,
        owner: 'codex-main',
        lane: 'governance',
        token: 'claim-original',
        claimedAt: '2026-07-20T06:00:00.000Z',
        expiresAt: options.expiresAt ?? '2099-01-01T00:00:00.000Z',
        status: 'active',
        baseCommit: fixture.taskHead,
        claimHead: fixture.taskHead,
        worktree: fixture.root,
        reservedFiles: ['docs/academy/BACKLOG.md'],
        reuseReport: reuse,
    }];
    if (options.replacement) claims.push({
        ...claims[0],
        token: 'claim-replacement',
        owner: 'codex-replacement',
        claimedAt: claims[0].claimedAt,
        expiresAt: '2099-01-01T00:00:00.000Z',
    });
    const promotion = {
        promotionId: 'promotion-1',
        taskId: task.id,
        claimToken: 'claim-original',
        promotedAt: '2026-07-20T06:30:00.000Z',
        baseCommit: fixture.taskHead,
        headCommit: fixture.taskHead,
        proofSha256,
        evidenceManifestSha256: manifestSha256,
        taskDefinitionSha256: taskDefinitionSha256(task),
        sourceBacklogSha256: sha256(fixture.openBacklog),
        expectedBacklogSha256: sha256(fixture.checkedBacklog),
        userVisible: options.userVisible ?? false,
        releaseNotes: options.userVisible ? 'Fixture release.' : null,
        status: 'prepared',
    };
    writeJson(path.join(fixture.stateRoot, 'state.json'), {
        schema: 'yomu-academy.production-workflow-state/v2',
        claims,
        promotions: [promotion],
        releases: [],
        approvalNonces: [{
            nonce: approval.nonce,
            taskId: task.id,
            requirement: 'owner',
            keyId: approval.signature.keyId,
            evidenceSha256: approval.evidence.sha256,
            path: approvalReference.path,
            sha256: approvalReference.sha256,
            registeredAt: new Date().toISOString(),
        }],
    });
    return { task, proof, promotion };
}

function readState(fixture: Fixture) {
    return JSON.parse(fs.readFileSync(path.join(fixture.stateRoot, 'state.json'), 'utf8'));
}

function readLedger(fixture: Fixture) {
    return JSON.parse(fs.readFileSync(path.join(fixture.stateRoot, 'production-ledger.json'), 'utf8'));
}

function cleanup(fixture: Fixture) {
    fs.rmSync(fixture.root, { recursive: true, force: true });
    fs.rmSync(fixture.stateRoot, { recursive: true, force: true });
    fs.rmSync(fixture.originRoot, { recursive: true, force: true });
}

function updateFixtureConfig(fixture: Fixture, mutate: (config: Record<string, any>) => void) {
    const target = path.join(fixture.root, 'config/academy-production-workflow.json');
    const config = JSON.parse(fs.readFileSync(target, 'utf8'));
    mutate(config);
    writeJson(target, config);
}

function installFakeGh(fixture: Fixture) {
    const target = path.join(fixture.stateRoot, 'fake-gh.mjs');
    fs.writeFileSync(target, `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const args = process.argv.slice(2);
if (args[0] === 'release' && args[1] === 'view') {
  console.log(JSON.stringify({ url: 'https://example.invalid/release/v1.0.0', isDraft: false, isLatest: true, tagName: args[2], targetCommitish: 'main', assets: [{ name: 'yomu.user.js' }] }));
} else if (args[0] === 'release' && args[1] === 'download') {
  const tag = args[2];
  const directory = args[args.indexOf('--dir') + 1];
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'yomu.user.js'), execFileSync('git', ['show', tag + ':dist/yomu.user.js']));
} else if (args[0] === 'run' && args[1] === 'list') {
  const headSha = execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim();
  console.log(JSON.stringify([{ url: 'https://example.invalid/actions/deploy', status: 'completed', conclusion: 'success', headSha }]));
} else {
  process.exit(2);
}
`);
    fs.chmodSync(target, 0o700);
    return target;
}

describe('Academy production workflow CLI lifecycle', () => {
    it('recovers both prepared-promotion orderings without counting unchecked work', () => {
        const before = createFixture();
        try {
            seedPreparedPromotion(before);
            expect(runWorkflow(before, ['ledger']).status).toBe(0);
            expect(readLedger(before).progress.complete).toBe(0);
            expect(fs.readFileSync(before.backlogPath, 'utf8')).toBe(before.openBacklog);
            expect(readState(before).promotions[0].status).toBe('interrupted-before-backlog');
        } finally {
            cleanup(before);
        }

        const after = createFixture();
        try {
            seedPreparedPromotion(after, { backlogWritten: true });
            const checkpoint = runWorkflow(after, ['checkpoint', '--token', 'claim-original', '--message', 'checkpoint fixture']);
            expect(checkpoint.status, checkpoint.stderr).toBe(0);
            expect(readState(after).promotions[0]).toMatchObject({ status: 'verified', claimToken: 'claim-original' });
            expect(readState(after).claims[0]).toMatchObject({ status: 'verified', token: 'claim-original' });
        } finally {
            cleanup(after);
        }
    });

    it('rejects expired and replaced promoted claims and never marks the replacement', () => {
        const fixture = createFixture();
        try {
            seedPreparedPromotion(fixture, {
                backlogWritten: true,
                expiresAt: '2000-01-01T00:00:00.000Z',
                replacement: true,
            });
            const replacement = runWorkflow(fixture, ['checkpoint', '--token', 'claim-replacement']);
            expect(replacement.status).toBe(1);
            expect(replacement.stderr).toContain('exact promoted claim token');
            const expired = runWorkflow(fixture, ['checkpoint', '--token', 'claim-original']);
            expect(expired.status).toBe(1);
            expect(expired.stderr).toContain('has expired');
            const statePath = path.join(fixture.stateRoot, 'state.json');
            const state = readState(fixture);
            state.claims.find((row: { token: string }) => row.token === 'claim-original').expiresAt = '2099-01-01T00:00:00.000Z';
            writeJson(statePath, state);
            const replaced = runWorkflow(fixture, ['checkpoint', '--token', 'claim-original']);
            expect(replaced.status).toBe(1);
            expect(replaced.stderr).toContain('was replaced by a newer claim');
            const finalState = readState(fixture);
            expect(finalState.claims.find((row: { token: string }) => row.token === 'claim-replacement').status).toBe('active');
            expect(finalState.claims.every((row: { status: string }) => row.status !== 'verified')).toBe(true);
        } finally {
            cleanup(fixture);
        }
    });

    it('invalidates ledger completion when nested evidence or the task definition becomes stale', () => {
        const fixture = createFixture();
        try {
            seedPreparedPromotion(fixture, { backlogWritten: true });
            expect(runWorkflow(fixture, ['checkpoint', '--token', 'claim-original']).status).toBe(0);
            expect(runWorkflow(fixture, ['ledger']).status).toBe(0);
            expect(readLedger(fixture).progress.complete).toBe(1);

            fs.writeFileSync(path.join(fixture.stateRoot, 'evidence/implementation.txt'), 'mutated nested evidence\n');
            expect(runWorkflow(fixture, ['ledger']).status).toBe(0);
            expect(readLedger(fixture).progress.complete).toBe(0);

            fs.writeFileSync(path.join(fixture.stateRoot, 'evidence/implementation.txt'), 'canonical implementation\n');
            fs.writeFileSync(fixture.backlogPath, fixture.checkedBacklog.replace('Harden governance.', 'Harden changed governance.'));
            expect(runWorkflow(fixture, ['ledger']).status).toBe(0);
            expect(readLedger(fixture).progress.complete).toBe(0);
        } finally {
            cleanup(fixture);
        }
    });

    it('keeps a failed post-push check open, preserves evidence, and supports a safe retry', () => {
        const fixture = createFixture({ postPushChecks: ['node -e "process.exit(7)"'] });
        try {
            seedPreparedPromotion(fixture, { backlogWritten: true });
            const failed = runWorkflow(fixture, ['checkpoint', '--token', 'claim-original']);
            expect(failed.status).toBe(1);
            expect(failed.stderr).toContain('evidence was preserved');
            let state = readState(fixture);
            expect(state.promotions[0].status).toBe('failed-verification');
            expect(state.claims[0].status).toBe('failed-verification');
            expect(state.promotions[0].verificationAttempts[0]).toMatchObject({ status: 'failed' });
            expect(fs.existsSync(path.join(fixture.stateRoot, 'checkpoint-verification'))).toBe(true);
            expect(runWorkflow(fixture, ['ledger']).status).toBe(0);
            expect(readLedger(fixture).progress.complete).toBe(0);

            const checkpointCommit = state.promotions[0].checkpointCommit;
            git(fixture.root, 'commit', '--allow-empty', '-m', 'later integration commit');
            git(fixture.root, 'push', 'origin', 'HEAD:main');
            const laterHead = git(fixture.root, 'rev-parse', 'HEAD');
            expect(laterHead).not.toBe(checkpointCommit);
            updateFixtureConfig(fixture, config => {
                config.release.postPushChecks = [
                    `node -e "process.exit(process.env.YOMU_CHECKPOINT_COMMIT === '${checkpointCommit}' ? 0 : 9)"`,
                ];
            });
            const retried = runWorkflow(fixture, ['verify-checkpoint', '--token', 'claim-original']);
            expect(retried.status, retried.stderr).toBe(0);
            state = readState(fixture);
            expect(state.promotions[0].status).toBe('verified');
            expect(state.promotions[0].verificationAttempts).toHaveLength(2);
            expect(state.promotions[0].verificationAttempts[0].checks[0].evidence.sha256).toMatch(/^[a-f0-9]{64}$/u);
            const retryEvidence = state.promotions[0].verificationAttempts[1].checks[0].evidence;
            const retryEvidencePath = path.join(fixture.stateRoot, retryEvidence.path.replace('@workflow-state/', ''));
            expect(JSON.parse(fs.readFileSync(retryEvidencePath, 'utf8'))).toMatchObject({
                headCommit: laterHead,
                checkpointCommit,
                exitCode: 0,
            });
        } finally {
            cleanup(fixture);
        }
    });

    it('counts user-visible work only after a verified release and deployment record', () => {
        const fixture = createFixture({ userVisible: true });
        try {
            seedPreparedPromotion(fixture, { backlogWritten: true, userVisible: true });
            const checkpoint = runWorkflow(fixture, ['checkpoint', '--token', 'claim-original']);
            expect(checkpoint.status, checkpoint.stderr).toBe(0);
            expect(readState(fixture).promotions[0].status).toBe('awaiting-release');
            expect(runWorkflow(fixture, ['ledger']).status).toBe(0);
            expect(readLedger(fixture).progress).toMatchObject({ complete: 0, percent: 0 });
            expect(readLedger(fixture).tasks[0]).toMatchObject({ canonicalComplete: false, deployed: false });

            git(fixture.root, '-c', 'tag.gpgSign=false', 'tag', 'v1.0.0');
            git(fixture.root, 'push', 'origin', 'v1.0.0');
            const released = runWorkflow(fixture, ['record-release', '--tag', 'v1.0.0'], {
                GH_BIN: installFakeGh(fixture),
            });
            expect(released.status, released.stderr).toBe(0);
            expect(runWorkflow(fixture, ['ledger']).status).toBe(0);
            expect(readLedger(fixture).progress).toMatchObject({ complete: 1, percent: 100 });
            expect(readLedger(fixture).tasks[0]).toMatchObject({ canonicalComplete: true, deployed: true });
            expect(readState(fixture).releases[0]).toMatchObject({ tag: 'v1.0.0' });
        } finally {
            cleanup(fixture);
        }
    });

    it('enforces the native Fable identity and pinned executable before launching review', () => {
        const fixture = createFixture();
        try {
            const task = parseBacklog(fixture.openBacklog, fixture.config)[0];
            const proof = proofTemplate(task, fixture.config, fixture.taskHead);
            proof.owner = 'codex-main';
            writeJson(path.join(fixture.stateRoot, 'proofs/GOV-001.json'), proof);
            const wrongProvider = runWorkflow(fixture, [
                'run-review', 'GOV-001', '--provider', 'openai', '--prompt', 'review-prompt.md',
            ]);
            expect(wrongProvider.status).toBe(1);
            expect(wrongProvider.stderr).toContain('required provider claude-fable');

            const stubbed = runWorkflow(fixture, [
                'run-review', 'GOV-001', '--provider', 'claude-fable', '--prompt', 'review-prompt.md',
            ], { YOMU_CLAUDE_BIN: '/bin/true' });
            expect(stubbed.status).toBe(1);
            expect(stubbed.stderr).toContain('YOMU_CLAUDE_BIN is forbidden');

            updateFixtureConfig(fixture, config => {
                config.reviewProviders['claude-fable'].model = 'gpt-5.6-sol';
            });
            const validation = runWorkflow(fixture, ['validate']);
            expect(validation.status).toBe(1);
            expect(validation.stderr).toContain('must use fixed model claude-fable-5');
        } finally {
            cleanup(fixture);
        }
    });

    it('accepts only a detached owner signature bound to the exact task and rejects replay', () => {
        const fixture = createFixture();
        try {
            const task = parseBacklog(fixture.openBacklog, fixture.config)[0];
            const proof = proofTemplate(task, fixture.config, fixture.taskHead);
            Object.assign(proof, {
                owner: 'codex-main', claimToken: 'approval-claim', headCommit: fixture.taskHead,
                backlogSha256: sha256(fixture.openBacklog), worktree: fixture.root,
            });
            writeJson(path.join(fixture.stateRoot, 'proofs/GOV-001.json'), proof);
            writeJson(path.join(fixture.stateRoot, 'state.json'), {
                schema: 'yomu-academy.production-workflow-state/v2',
                claims: [{
                    taskId: task.id, owner: 'codex-main', token: 'approval-claim', status: 'active',
                    claimedAt: '2026-07-20T06:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
                }],
                promotions: [], releases: [], approvalNonces: [],
            });
            writeJson(path.join(fixture.stateRoot, 'evidence/unrelated.json'), { note: 'hashable but not an approval' });
            const unrelated = runWorkflow(fixture, [
                'attest-approval', 'GOV-001', 'owner', '@workflow-state/evidence/unrelated.json',
            ]);
            expect(unrelated.status).toBe(1);
            expect(unrelated.stderr).toContain('approval has the wrong schema');

            const { approval } = createSignedApproval(
                fixture,
                task,
                'approval-claim',
                sha256(fixture.openBacklog),
                'evidence/bound-approval.json',
            );
            const bound = runWorkflow(fixture, [
                'attest-approval', 'GOV-001', 'owner', '@workflow-state/evidence/bound-approval.json',
            ]);
            expect(bound.status, bound.stderr).toBe(0);
            expect(readState(fixture).approvalNonces[0]).toMatchObject({ nonce: approval.nonce, taskId: 'GOV-001' });
            const replay = runWorkflow(fixture, [
                'attest-approval', 'GOV-001', 'owner', '@workflow-state/evidence/bound-approval.json',
            ]);
            expect(replay.status).toBe(1);
            expect(replay.stderr).toContain('nonce was already used');
        } finally {
            cleanup(fixture);
        }
    });

    it('canonicalizes existing and prospective symlink aliases and rejects physical escape', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yomu-reservation-alias-'));
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'yomu-reservation-outside-'));
        try {
            fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
            fs.writeFileSync(path.join(root, 'scripts/workflow.mjs'), 'export {};\n');
            fs.symlinkSync('scripts', path.join(root, 'scripts-alias'));
            fs.symlinkSync(outside, path.join(root, 'escape'));
            expect(canonicalizeReservationPath(root, 'scripts-alias/workflow.mjs')).toBe('scripts/workflow.mjs');
            expect(canonicalizeReservationPath(root, 'scripts-alias/prospective/new.mjs')).toBe('scripts/prospective/new.mjs');
            expect(() => canonicalizeReservationPath(root, 'escape/new.mjs')).toThrow('outside the repository');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(outside, { recursive: true, force: true });
        }
    });

    it('rejects lexical reservation aliases before salvage or collision checks', () => {
        const fixture = createFixture();
        try {
            for (const reservedPath of ['scripts//academy-production-workflow.mjs', 'scripts/./academy-production-workflow.mjs']) {
                const result = runWorkflow(fixture, [
                    'claim', 'GOV-001', '--owner', 'codex-main', '--paths', reservedPath,
                ]);
                expect(result.status).toBe(1);
                expect(result.stderr).toContain('must already be canonical');
            }
        } finally {
            cleanup(fixture);
        }
    });

    it('rejects real concurrent state-lock contention', async () => {
        const fixture = createFixture();
        const marker = path.join(fixture.stateRoot, 'lock-ready');
        const lock = path.join(fixture.stateRoot, '.state.lock');
        const holder = spawn(process.execPath, ['-e', `
          const fs = require('node:fs');
          const os = require('node:os');
          const fd = fs.openSync(process.argv[1], 'wx', 0o600);
          fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, hostname: os.hostname(), createdAt: new Date().toISOString() }) + '\\n');
          fs.closeSync(fd);
          fs.writeFileSync(process.argv[2], 'ready');
          setTimeout(() => {}, 30000);
        `, lock, marker], { stdio: 'ignore' });
        try {
            for (let attempt = 0; attempt < 200 && !fs.existsSync(marker); attempt += 1) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            expect(fs.existsSync(marker)).toBe(true);
            const result = runWorkflow(fixture, ['plan']);
            expect(result.status).toBe(1);
            expect(result.stderr).toContain('Workflow lock is already held');
        } finally {
            holder.kill('SIGTERM');
            cleanup(fixture);
        }
    });

    it('recovers deterministically from crashes around every reopen write', () => {
        const points = [
            'before-intent', 'after-intent', 'before-write-0', 'after-write-0',
            'before-write-1', 'after-write-1', 'before-complete', 'after-complete',
        ];
        for (const point of points) {
            const fixture = createFixture();
            try {
                seedPreparedPromotion(fixture, { backlogWritten: true });
                const crashed = runWorkflow(fixture, ['reopen', 'GOV-001', '--token', 'claim-original'], {
                    YOMU_ACADEMY_WORKFLOW_CRASH_AT: `reopen-promotion:${point}`,
                });
                expect(crashed.status, `${point}: ${crashed.stderr}`).toBe(86);
                expect(runWorkflow(fixture, ['recovery-status']).status).toBe(0);
                const recovered = runWorkflow(fixture, ['recover']);
                expect(recovered.status, `${point}: ${recovered.stderr}`).toBe(0);
                const state = readState(fixture);
                const backlog = fs.readFileSync(fixture.backlogPath, 'utf8');
                const rolledForward = ['after-write-0', 'before-write-1', 'after-write-1', 'before-complete', 'after-complete'].includes(point);
                expect(state.promotions[0].status).toBe(rolledForward ? 'reopened' : 'awaiting-checkpoint');
                expect(backlog).toBe(rolledForward ? fixture.openBacklog : fixture.checkedBacklog);
                expect(fs.existsSync(path.join(fixture.stateRoot, 'prepared-transition.json'))).toBe(false);
                if (point !== 'before-intent' && point !== 'after-complete') {
                    expect(fs.readdirSync(path.join(fixture.stateRoot, 'recovery-history'))).toHaveLength(1);
                }
            } finally {
                cleanup(fixture);
            }
        }
    });

    it('keeps recovery/status available for an ambiguous prepared transition', () => {
        const fixture = createFixture();
        try {
            const crashed = runWorkflow(fixture, ['ledger'], {
                YOMU_ACADEMY_WORKFLOW_CRASH_AT: 'production-ledger:after-intent',
            });
            expect(crashed.status).toBe(86);
            fs.writeFileSync(path.join(fixture.stateRoot, 'production-ledger.json'), '{"externally":"changed"}\n');
            const status = runWorkflow(fixture, ['status']);
            expect(status.status).toBe(2);
            expect(status.stderr).toContain('externally changed files');
            const inspection = runWorkflow(fixture, ['recovery-status']);
            expect(inspection.status).toBe(0);
            expect(inspection.stdout).toContain('ambiguous');
            const recovered = runWorkflow(fixture, ['recover', '--roll-forward']);
            expect(recovered.status, recovered.stderr).toBe(0);
            expect(runWorkflow(fixture, ['status']).status).toBe(0);
        } finally {
            cleanup(fixture);
        }
    });
});
