import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
    buildPlan,
    buildProductionLedger,
    bindProofToClaim,
    canonicalJson,
    checkpointIntegrityErrors,
    changedFilesWithinOwnership,
    createWorkOrder,
    minimalReviewEnvironment,
    ownerApprovalPayload,
    parseBacklog,
    progressSummary,
    proofTemplate,
    resolveConfinedFile,
    resolveDynamicDependencies,
    reviewPayloadSha256,
    reuseReportPinErrors,
    sha256,
    taskDefinitionSha256,
    taskCompleteForWorkflow,
    updateBacklogCheckbox,
    validateGateAttestation,
    validateApprovalAttestation,
    validateProof,
    validateReviewAttestation,
    validateWorkflow,
} from '../../scripts/lib/academy-workflow-model.mjs';
import {
    trustBindings,
    validateGovernanceTrustStore,
} from '../../scripts/lib/academy-workflow-trust.mjs';

const repoRoot = path.resolve(__dirname, '../..');
const backlogPath = path.join(repoRoot, 'docs/academy/BACKLOG.md');
const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config/academy-production-workflow.json'), 'utf8'));
const trustedReviewTool = {
    id: 'claude-code-fable', command: 'claude', versionArgs: ['--version'], versionPattern: '^(\\d+\\.\\d+\\.\\d+)',
    installations: [{
        version: '2.1.216', sha256: 'd'.repeat(64),
        realpathSuffixes: ['/node_modules/@anthropic-ai/claude-code/bin/claude.exe'],
    }],
};
const requiredReviewPolicy = {
    id: config.requiredReviewProvider,
    ...config.reviewProviders[config.requiredReviewProvider],
    args: [
        '-p', '--model', 'claude-fable-5', '--permission-mode', 'plan', '--output-format', 'json',
        '--bare', '--safe-mode', '--disable-slash-commands', '--strict-mcp-config',
        '--mcp-config', '{"mcpServers":{}}', '--setting-sources', '', '--no-session-persistence',
        '--no-chrome', '--tools', 'Read,Grep,Glob',
    ],
    outputFormat: 'claude-json',
    allowedEnvironment: ['ANTHROPIC_API_KEY', 'LANG'],
    tool: trustedReviewTool,
};

function nativeFableSession(sessionId: string) {
    return {
        providerId: requiredReviewPolicy.id,
        executable: {
            command: trustedReviewTool.command,
            realpath: `/opt/node_modules/@anthropic-ai/claude-code/bin/claude.exe`,
            sha256: trustedReviewTool.installations[0].sha256,
            version: trustedReviewTool.installations[0].version,
            trustId: trustedReviewTool.id,
        },
        nativeResult: {
            type: 'result', subtype: 'success', isError: false, sessionId,
            uuid: `native-${sessionId}`, models: [requiredReviewPolicy.model],
            model: requiredReviewPolicy.model,
        },
        invocation: {
            args: requiredReviewPolicy.args,
            environmentKeys: ['ANTHROPIC_API_KEY'],
        },
        serviceProvenance: {
            status: 'unresolved',
            reason: 'CLI output has no cryptographic service-provider attestation.',
        },
    };
}

function signedApproval(task: ReturnType<typeof parseBacklog>[number], overrides: Record<string, any> = {}) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const evidence = { path: '@workflow-state/evidence/owner.txt', sha256: '9'.repeat(64) };
    const policy = {
        purpose: 'academy-production-promotion',
        allowedOwnerIds: ['heru'],
        maxValidityMinutes: 30,
        trustStoreRevision: 7,
        keys: [{
            ownerId: 'heru', keyId: 'test-owner-key', algorithm: 'Ed25519',
            publicKeyJwk: publicKey.export({ format: 'jwk' }),
            activatedAt: '2026-07-01T00:00:00.000Z', expiresAt: '2027-07-01T00:00:00.000Z',
            revokedAt: null, successorKeyId: null,
        }],
    };
    const approval = {
        schema: 'yomu-academy.owner-approval/v3', revision: 1, trustStoreRevision: 7,
        taskId: task.id, requirement: 'owner',
        purpose: policy.purpose, decision: 'approve', owner: { id: 'heru' },
        claimToken: 'claim-1', headCommit: 'a'.repeat(40),
        expiresAt: '2026-07-20T00:20:00.000Z', nonce: 'owner-nonce-1234567890', evidence,
        issuedAt: '2026-07-20T00:00:00.000Z',
        contentHashes: {
            taskDefinitionSha256: taskDefinitionSha256(task), backlogSha256: 'b'.repeat(64), evidenceSha256: evidence.sha256,
        },
        summary: 'Approved this exact production promotion.',
        signature: { algorithm: 'Ed25519', keyId: 'test-owner-key', value: '' },
        ...overrides,
    };
    approval.signature = {
        ...approval.signature,
        value: crypto.sign(null, Buffer.from(canonicalJson(ownerApprovalPayload(task, 'owner', approval))), privateKey).toString('base64'),
    };
    return { approval, policy, evidence, privateKey };
}

describe('Academy production workflow', () => {
    it('parses and validates the canonical backlog as one acyclic task graph', () => {
        const tasks = parseBacklog(fs.readFileSync(backlogPath, 'utf8'), config);
        const result = validateWorkflow(tasks, config);
        expect(result.errors).toEqual([]);
        expect(tasks.length).toBeGreaterThanOrEqual(120);
        expect(new Set(tasks.map(task => task.id)).size).toBe(tasks.length);
        expect(tasks.find(task => task.id === 'AUD-002')).toMatchObject({
            complete: false,
            deps: ['CUR-014', 'STO-001', 'PED-001', 'AUD-001'],
            gates: ['C', 'T', 'S', 'O'],
        });
        expect(tasks.find(task => task.id === 'AUD-005')?.deps).toEqual(expect.arrayContaining([
            'AUD-004', 'CUR-005', 'STO-005', 'CAST-002', 'WORLD-002', 'GAM-001', 'GAM-012',
        ]));
        expect(tasks.find(task => task.id === 'GAM-001')?.priority).toBe('P1');
        expect(tasks.find(task => task.id === 'PLAT-001')?.priority).toBe('P0');
        expect(tasks.find(task => task.id === 'PLAT-003')?.requirements).toEqual(['owner']);
    });

    it('keeps executable versions and digests out of candidate configuration', () => {
        const tasks = parseBacklog(fs.readFileSync(backlogPath, 'utf8'), config);
        const weakened = structuredClone(config);
        weakened.reviewProviders['claude-fable'].packageVersion = '99.0.0';
        weakened.reviewProviders['claude-fable'].executableSha256 = '0'.repeat(64);

        expect(validateWorkflow(tasks, weakened).errors).toEqual(expect.arrayContaining([
            'Review provider claude-fable cannot define candidate-controlled packageVersion',
            'Review provider claude-fable cannot define candidate-controlled executableSha256',
        ]));
        expect(config.reviewProviders['claude-fable']).not.toHaveProperty('packageVersion');
        expect(config.reviewProviders['claude-fable']).not.toHaveProperty('executableSha256');
    });

    it('reports literal canonical completion without converting it to an effort claim', () => {
        const tasks = parseBacklog(fs.readFileSync(backlogPath, 'utf8'), config);
        expect(progressSummary(tasks)).toMatchObject({ complete: 19, total: 126, percent: 15.1 });
    });

    it('derives task states, percentages, and route counts from one production ledger', () => {
        const markdown = '- [x] **GOV-001** Ledger. **Deps:** none. **Proof:** `C`,`R`,`T`,`O`,`D`.\n- [ ] **QA-001** QA. **Deps:** `GOV-001`. **Proof:** `T`,`Q`.\n';
        const tasks = parseBacklog(markdown, config);
        const proof = proofTemplate(tasks[0], config, 'base');
        proof.claimToken = 'claim-1';
        proof.submittedAt = new Date().toISOString();
        proof.reuseAudit.status = 'pass';
        for (const gate of tasks[0].gates) proof.gates[gate].status = 'pass';
        const ledger = buildProductionLedger(tasks, config, { claims: [{
            taskId: 'GOV-001', token: 'claim-1', status: 'verified', expiresAt: '2099-01-01T00:00:00.000Z',
        }], promotions: [{
            taskId: 'GOV-001', claimToken: 'claim-1', status: 'verified', userVisible: false, proofSha256: 'f'.repeat(64),
            taskDefinitionSha256: taskDefinitionSha256(tasks[0]), evidenceManifestSha256: 'e'.repeat(64),
        }] }, { 'GOV-001': {
            proof, sha256: 'f'.repeat(64), evidenceManifestSha256: 'e'.repeat(64), checkpointValid: true, valid: true,
        } }, [{ id: 'story-chapter-sources', count: 48 }], {
            generatedAt: '2026-07-20T00:00:00.000Z', headCommit: 'a'.repeat(40), backlogSha256: sha256(markdown),
        });

        expect(ledger.progress).toMatchObject({ complete: 1, total: 2, percent: 50 });
        expect(ledger.evidenceStates).toMatchObject({ audited: 1, implemented: 1, learnerReachable: 1, qaVerified: 1, deployed: 1 });
        expect(ledger.routeCounts).toEqual([{ id: 'story-chapter-sources', count: 48 }]);
        expect(ledger.tasks[0]).toMatchObject({ canonicalComplete: true, promotion: 'verified', deployed: true });
    });

    it('never converts a checked backlog box into canonical progress by itself', () => {
        const tasks = parseBacklog('- [x] **GOV-001** Checked only. **Deps:** none. **Proof:** `C`.\n', config);
        const ledger = buildProductionLedger(tasks, config, {}, {}, [], { generatedAt: '2026-07-20T00:00:00.000Z' });
        expect(ledger.progress).toMatchObject({ complete: 0, total: 1, percent: 0 });
        expect(ledger.tasks[0]).toMatchObject({ backlogChecked: true, canonicalComplete: false, implemented: false });
    });

    it('rejects checked work whose implementation exists only on another Git ref', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yomu-branch-only-proof-'));
        const runGit = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
        try {
            runGit('init', '--initial-branch=main');
            runGit('config', 'user.name', 'Workflow Test');
            runGit('config', 'user.email', 'workflow@example.invalid');
            fs.writeFileSync(path.join(root, 'README.md'), 'canonical\n');
            runGit('add', '.');
            runGit('commit', '-m', 'canonical main');
            runGit('switch', '-c', 'recovered-implementation');
            fs.mkdirSync(path.join(root, 'src/academy'), { recursive: true });
            fs.writeFileSync(path.join(root, 'src/academy/recovered.ts'), 'export const recovered = true;\n');
            runGit('add', '.');
            runGit('commit', '-m', 'branch-only implementation');
            const branchOnlyCommit = runGit('rev-parse', 'HEAD');
            runGit('switch', 'main');
            expect(fs.existsSync(path.join(root, 'src/academy/recovered.ts'))).toBe(false);
            expect(runGit('cat-file', '-e', 'recovered-implementation:src/academy/recovered.ts')).toBe('');

            const markdown = '- [x] **BASE-999** Branch-only result. **Deps:** none. **Proof:** `C`,`R`,`D`.\n';
            const [task] = parseBacklog(markdown, config);
            const proof = proofTemplate(task, config, runGit('rev-parse', 'main'));
            Object.assign(proof, {
                claimToken: 'branch-only-claim', headCommit: branchOnlyCommit,
                submittedAt: '2026-07-20T00:00:00.000Z', summary: 'Referenced branch-only implementation.',
            });
            proof.reuseAudit.status = 'pass';
            for (const gate of task.gates) proof.gates[gate].status = 'pass';
            let checkpointReachable = true;
            try {
                runGit('merge-base', '--is-ancestor', branchOnlyCommit, 'main');
            } catch {
                checkpointReachable = false;
            }
            const proofSha256 = 'f'.repeat(64);
            const evidenceManifestSha256 = 'e'.repeat(64);
            const state = {
                claims: [{ taskId: task.id, token: proof.claimToken, status: 'verified', expiresAt: '2099-01-01T00:00:00.000Z' }],
                promotions: [{
                    taskId: task.id, claimToken: proof.claimToken, status: 'verified', userVisible: false,
                    headCommit: branchOnlyCommit, checkpointCommit: branchOnlyCommit,
                    proofSha256, evidenceManifestSha256, taskDefinitionSha256: taskDefinitionSha256(task),
                }],
            };
            const ledger = buildProductionLedger([task], config, state, { [task.id]: {
                proof, sha256: proofSha256, evidenceManifestSha256, checkpointValid: checkpointReachable, valid: true,
            } }, [], {
                generatedAt: '2026-07-20T00:00:00.000Z', backlogSha256: sha256(markdown),
            });
            expect(checkpointReachable).toBe(false);
            expect(taskCompleteForWorkflow(task, {})).toBe(false);
            expect(ledger.progress).toMatchObject({ complete: 0, total: 1, percent: 0 });
            expect(ledger.tasks[0]).toMatchObject({ backlogChecked: true, canonicalComplete: false, learnerReachable: false, deployed: false });
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('keeps awaiting-release user-visible work open, incomplete, and not deployed', () => {
        const markdown = '- [x] **PLAT-001** Release feature. **Deps:** none. **Proof:** `C`,`D`.\n';
        const [task] = parseBacklog(markdown, config);
        const proof = proofTemplate(task, config, 'base');
        proof.claimToken = 'claim-release';
        proof.submittedAt = '2026-07-20T00:00:00.000Z';
        proof.reuseAudit.status = 'pass';
        proof.gates.C.status = 'pass';
        proof.gates.D.status = 'pass';
        const proofEntry = {
            proof, sha256: 'a'.repeat(64), evidenceManifestSha256: 'b'.repeat(64),
            checkpointValid: true, valid: true,
        };
        const promotion = {
            taskId: task.id, claimToken: 'claim-release', status: 'awaiting-release', userVisible: true,
            proofSha256: proofEntry.sha256, evidenceManifestSha256: proofEntry.evidenceManifestSha256,
            taskDefinitionSha256: taskDefinitionSha256(task),
        };
        const claim = { taskId: task.id, token: 'claim-release', status: 'awaiting-release' };
        const awaitingState = { claims: [claim], promotions: [promotion] };
        const awaiting = buildProductionLedger([task], config, awaitingState,
            { [task.id]: proofEntry }, [], { generatedAt: '2026-07-20T00:01:00.000Z' });
        expect(awaiting.progress).toMatchObject({ complete: 0, total: 1, percent: 0 });
        expect(awaiting.tasks[0]).toMatchObject({ canonicalComplete: false, deployed: false, promotion: 'awaiting-release' });
        expect(taskCompleteForWorkflow(task, awaitingState)).toBe(false);

        promotion.status = 'released';
        claim.status = 'released';
        const releasedState = { claims: [claim], promotions: [promotion] };
        const released = buildProductionLedger([task], config, releasedState,
            { [task.id]: proofEntry }, [], { generatedAt: '2026-07-20T00:02:00.000Z' });
        expect(released.progress).toMatchObject({ complete: 1, total: 1, percent: 100 });
        expect(released.tasks[0]).toMatchObject({ canonicalComplete: true, deployed: true, promotion: 'released' });
        expect(taskCompleteForWorkflow(task, releasedState)).toBe(true);
    });

    it('blocks dependents while a checked task awaits release without scheduling the promoted task again', () => {
        const tasks = parseBacklog(`- [x] **GOV-001** Release governance. **Deps:** none. **Proof:** \`C\`.\n- [ ] **OPS-001** Depend on release. **Deps:** \`GOV-001\`. **Proof:** \`C\`.\n`);
        const state = {
            claims: [],
            promotions: [{ taskId: 'GOV-001', userVisible: true, status: 'awaiting-release' }],
        };

        expect(buildPlan(tasks, config, state).selected).toEqual([]);
        state.promotions[0].status = 'released';
        expect(buildPlan(tasks, config, state).selected.map(row => row.id)).toContain('OPS-001');
    });

    it('does not let expired or cross-task claims inflate production evidence', () => {
        const markdown = '- [ ] **GOV-001** Ledger. **Deps:** none. **Proof:** `C`,`R`,`T`,`O`,`D`.\n- [ ] **QA-001** QA. **Deps:** none. **Proof:** `C`,`R`,`T`,`O`,`D`.\n';
        const tasks = parseBacklog(markdown, config);
        const proof = proofTemplate(tasks[0], config, 'base');
        proof.claimToken = 'shared-token';
        proof.submittedAt = '2026-07-19T23:00:00.000Z';
        proof.reuseAudit.status = 'pass';
        for (const gate of tasks[0].gates) proof.gates[gate].status = 'pass';
        const metadata = { generatedAt: '2026-07-20T00:00:00.000Z' };

        const expired = buildProductionLedger(tasks, config, { claims: [{
            taskId: 'GOV-001', token: 'shared-token', status: 'active', expiresAt: '2026-07-19T23:59:59.000Z',
        }] }, { 'GOV-001': proof }, [], metadata);
        expect(expired.tasks[0]).toMatchObject({ audited: false, implemented: false, learnerReachable: false });

        const crossTask = buildProductionLedger(tasks, config, { claims: [{
            taskId: 'QA-001', token: 'shared-token', status: 'checkpointed', expiresAt: '2099-01-01T00:00:00.000Z',
        }] }, { 'GOV-001': proof }, [], metadata);
        expect(crossTask.tasks[0]).toMatchObject({ audited: false, implemented: false, learnerReachable: false });
    });

    it('requires typed passing gate and independent-review attestations', () => {
        const task = parseBacklog('- [ ] **GOV-001** Ledger. **Deps:** none. **Proof:** `C`,`T`.')[0];
        const gate = {
            schema: 'yomu-academy.gate-attestation/v1', taskId: task.id, gate: 'C', verdict: 'pass',
            headCommit: 'a'.repeat(40), issuedAt: '2026-07-20T00:00:00.000Z',
            producer: { id: 'codex-main', kind: 'agent' }, summary: 'Canonical implementation inspected.',
            assertions: [{ status: 'pass', claim: 'The canonical implementation exists.', artifacts: [{
                path: 'scripts/academy-production-workflow.mjs', sha256: 'b'.repeat(64),
            }] }],
        };
        const gateContext = { headCommit: 'a'.repeat(40), expectedProducer: 'codex-main', trustedGateProducers: config.trustedGateProducers };
        expect(validateGateAttestation(task, 'C', gate, gateContext)).toEqual([]);
        expect(validateGateAttestation(task, 'C', { ...gate, verdict: 'block' }, gateContext))
            .toContain('Gate C attestation verdict is not pass');

        const prompt = { path: '@workflow-state/review/prompt.txt', sha256: 'c'.repeat(64) };
        const response = { path: '@workflow-state/review/response.json', sha256: 'd'.repeat(64) };
        const sessionEvidence = { path: '@workflow-state/review/session.json', sha256: 'e'.repeat(64) };
        const session = {
            schema: 'yomu-academy.external-review-session/v1', recordedBy: 'academy-production-workflow',
            taskId: task.id, taskDefinitionSha256: taskDefinitionSha256(task), headCommit: 'a'.repeat(40),
            owner: 'codex-main', reviewerId: 'claude-fable', model: requiredReviewPolicy.model,
            sessionId: 'agent-1', exitCode: 0, verdict: 'ship', captureToken: 'capture-1', prompt, response,
            reviewPayloadSha256: '',
            ...nativeFableSession('agent-1'),
        };
        const registration = {
            taskId: task.id, headCommit: 'a'.repeat(40), sessionId: 'agent-1', captureToken: 'capture-1',
            path: sessionEvidence.path, sha256: sessionEvidence.sha256,
            providerId: requiredReviewPolicy.id,
            executableSha256: trustedReviewTool.installations[0].sha256,
            nativeResultUuid: 'native-agent-1',
            nativeModel: requiredReviewPolicy.model,
        };
        const review = {
            schema: 'yomu-academy.review-attestation/v1', taskId: task.id, verdict: 'ship',
            headCommit: 'a'.repeat(40), taskDefinitionSha256: taskDefinitionSha256(task),
            issuedAt: '2026-07-20T00:00:00.000Z', summary: 'No release blockers remain.',
            reviewer: { id: 'claude-fable', model: requiredReviewPolicy.model, sessionId: 'agent-1', independentFrom: 'codex-main', sessionEvidence, serviceProvenance: 'unresolved' },
            scope: ['scripts/academy-production-workflow.mjs'], findings: [],
        };
        session.reviewPayloadSha256 = reviewPayloadSha256(review);
        const reviewContext = {
            headCommit: 'a'.repeat(40), owner: 'codex-main', reviewer: 'claude-fable', strict: true,
            requiredReviewPolicy,
            reviewSessions: new Map([[sessionEvidence.path, session]]),
            trustedReviewSessions: new Map([[sessionEvidence.path, registration]]),
            evidenceHashes: new Map([[sessionEvidence.path, sessionEvidence.sha256], [prompt.path, prompt.sha256], [response.path, response.sha256]]),
        };
        expect(validateReviewAttestation(task, review, reviewContext)).toEqual([]);
        const substitutedSession = structuredClone(session);
        substitutedSession.nativeResult.models = ['claude-opus-4-8'];
        substitutedSession.nativeResult.model = 'claude-opus-4-8';
        expect(validateReviewAttestation(task, review, {
            ...reviewContext,
            reviewSessions: new Map([[sessionEvidence.path, substitutedSession]]),
        })).toContain('External review session lacks verifiable native Fable result identity');
        expect(validateReviewAttestation(task, {
            ...review,
            reviewer: { ...review.reviewer, model: 'gpt-5.6-sol' },
        }, reviewContext)).toContain('Independent review must be produced by required provider claude-fable');
        expect(validateReviewAttestation(task, { ...review, verdict: 'block' }, reviewContext))
            .toContain('Independent review verdict is not ship');
        expect(validateReviewAttestation(task, review, { ...reviewContext, trustedReviewSessions: new Map() }))
            .toContain('External review session is not registered by a trusted workflow capture');
        expect(validateReviewAttestation(task, { ...review, summary: 'Owner-authored replacement.' }, reviewContext))
            .toContain('Independent review attestation differs from the captured provider payload');
        expect(validateReviewAttestation(task, {
            ...review,
            reviewer: { ...review.reviewer, sessionEvidence: undefined, sessionId: 'invented-session' },
        }, reviewContext)).toEqual(expect.arrayContaining([
            'Independent review needs a hash-bound external session record',
            'Independent review external session record is missing or unreadable',
        ]));
    });

    it('rejects symlinked evidence that resolves outside an allowed root', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yomu-workflow-root-'));
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'yomu-workflow-outside-'));
        const outsideFile = path.join(outside, 'evidence.json');
        fs.writeFileSync(outsideFile, '{}');
        const link = path.join(root, 'evidence.json');
        fs.symlinkSync(outsideFile, link);
        expect(() => resolveConfinedFile(link, [root])).toThrow(/symbolic link|outside/u);
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(outside, { recursive: true, force: true });
    });

    it('accepts a strict proof only when its external review session is workflow-registered', () => {
        const markdown = '- [ ] **GOV-001** Ledger. **Deps:** none. **Proof:** `C`.';
        const task = parseBacklog(markdown)[0];
        const headCommit = 'a'.repeat(40);
        const owner = 'codex-main';
        const reviewer = 'claude-fable';
        const reuse = { path: '@workflow-state/reuse.json', sha256: '1'.repeat(64) };
        const implementation = { path: 'scripts/academy-production-workflow.mjs', sha256: '2'.repeat(64) };
        const gateEvidence = { path: '@workflow-state/gate.json', sha256: '3'.repeat(64) };
        const prompt = { path: '@workflow-state/review/prompt.txt', sha256: '4'.repeat(64) };
        const response = { path: '@workflow-state/review/response.json', sha256: '5'.repeat(64) };
        const sessionEvidence = { path: '@workflow-state/review/session.json', sha256: '6'.repeat(64) };
        const reviewEvidence = { path: '@workflow-state/review/attestation.json', sha256: '7'.repeat(64) };
        const gate = {
            schema: 'yomu-academy.gate-attestation/v1', taskId: task.id, gate: 'C', verdict: 'pass',
            headCommit, issuedAt: '2026-07-20T00:00:00.000Z',
            producer: { id: owner, kind: 'agent' }, summary: 'Implementation inspected.',
            assertions: [{ status: 'pass', claim: 'The implementation exists.', artifacts: [implementation] }],
        };
        const review = {
            schema: 'yomu-academy.review-attestation/v1', taskId: task.id, verdict: 'ship',
            headCommit, taskDefinitionSha256: taskDefinitionSha256(task),
            issuedAt: '2026-07-20T00:00:00.000Z', summary: 'No release blockers remain.',
            reviewer: {
                id: reviewer, model: requiredReviewPolicy.model, sessionId: 'session-1',
                independentFrom: owner, sessionEvidence, serviceProvenance: 'unresolved',
            },
            scope: ['scripts/academy-production-workflow.mjs'], findings: [],
        };
        const session = {
            schema: 'yomu-academy.external-review-session/v1', recordedBy: 'academy-production-workflow',
            taskId: task.id, taskDefinitionSha256: taskDefinitionSha256(task), headCommit,
            owner, reviewerId: reviewer, model: requiredReviewPolicy.model,
            sessionId: 'session-1', exitCode: 0, verdict: 'ship', captureToken: 'capture-1', prompt, response,
            reviewPayloadSha256: reviewPayloadSha256(review),
            ...nativeFableSession('session-1'),
        };
        const registration = {
            taskId: task.id, headCommit, sessionId: 'session-1', captureToken: 'capture-1',
            path: sessionEvidence.path, sha256: sessionEvidence.sha256,
            providerId: requiredReviewPolicy.id,
            executableSha256: trustedReviewTool.installations[0].sha256,
            nativeResultUuid: 'native-session-1',
            nativeModel: requiredReviewPolicy.model,
        };
        const proof = proofTemplate(task, config, 'base');
        Object.assign(proof, {
            backlogSha256: sha256(markdown), submittedAt: '2026-07-20T00:00:00.000Z',
            summary: 'Verified governance slice.', owner, headCommit, claimToken: 'token', worktree: repoRoot,
            changedFiles: [], reuseAudit: { status: 'pass', report: reuse },
            independentReview: { status: 'pass', reviewer, evidence: reviewEvidence, findingsResolved: [] },
        });
        proof.gates.C = { status: 'pass', evidence: [gateEvidence], commands: [] };
        const evidenceHashes = new Map([
            [reuse.path, reuse.sha256], [implementation.path, implementation.sha256],
            [gateEvidence.path, gateEvidence.sha256], [prompt.path, prompt.sha256],
            [response.path, response.sha256], [sessionEvidence.path, sessionEvidence.sha256],
            [reviewEvidence.path, reviewEvidence.sha256],
        ]);
        const context = {
            strict: true, nowMs: Date.parse('2026-07-20T00:01:00.000Z'), repoRoot, repoClean: true,
            currentHead: headCommit, changedFiles: [],
            claim: { token: 'token', baseCommit: 'base', worktree: repoRoot, owner },
            ownership: ['scripts/**'], reservedFiles: [], originMainIsAncestor: true,
            evidenceHashes, commandTranscripts: new Map(), gateAttestations: new Map([[gateEvidence.path, gate]]),
            reviewAttestations: new Map([[reviewEvidence.path, review]]),
            reviewSessions: new Map([[sessionEvidence.path, session]]),
            trustedReviewSessions: new Map([[sessionEvidence.path, registration]]),
            trustedGateProducers: config.trustedGateProducers, reuseReportErrors: [], userVisible: false,
            taskDefinitionSha256: taskDefinitionSha256(task),
            requiredReviewPolicy,
        };
        expect(validateProof(task, proof, sha256(markdown), context)).toEqual([]);
        expect(validateProof(task, proof, sha256(markdown), {
            ...context, trustedReviewSessions: new Map(),
        })).toContain('External review session is not registered by a trusted workflow capture');
    });

    it('pins the exact promoted backlog and proof through checkpoint retries', () => {
        const promotion = {
            proofSha256: 'a'.repeat(64), expectedBacklogSha256: 'b'.repeat(64),
            evidenceManifestSha256: 'c'.repeat(64), taskDefinitionSha256: 'd'.repeat(64),
        };
        expect(checkpointIntegrityErrors(promotion, {
            proofSha256: 'a'.repeat(64), backlogSha256: 'b'.repeat(64), preparedBacklogSha256: 'b'.repeat(64),
            evidenceManifestSha256: 'c'.repeat(64), taskDefinitionSha256: 'd'.repeat(64),
        })).toEqual([]);
        expect(checkpointIntegrityErrors(promotion, {
            proofSha256: 'c'.repeat(64), backlogSha256: 'd'.repeat(64), preparedBacklogSha256: 'e'.repeat(64),
            evidenceManifestSha256: 'f'.repeat(64), taskDefinitionSha256: 'e'.repeat(64),
        })).toEqual(expect.arrayContaining([
            'Promotion proof changed after verification',
            'Canonical backlog differs from the exact promoted checkbox result',
            'Prepared checkpoint commit contains an unexpected backlog',
            'Promotion evidence changed after verification',
            'Promotion targets a stale task definition',
        ]));
    });

    it('requires a detached owner signature bound to task, purpose, expiry, nonce, and evidence', () => {
        const task = parseBacklog('- [ ] **PLAT-003** Deploy. **Deps:** none. **Proof:** `C`,`owner`.')[0];
        const { approval, policy, evidence } = signedApproval(task);
        const approvalReference = { path: '@workflow-state/evidence/approval.json', sha256: '8'.repeat(64) };
        const registration = {
            nonce: approval.nonce, taskId: task.id, requirement: 'owner', keyId: approval.signature.keyId,
            algorithm: approval.signature.algorithm, revision: approval.revision, trustStoreRevision: approval.trustStoreRevision,
            claimToken: approval.claimToken, headCommit: approval.headCommit,
            contentHashesSha256: sha256(canonicalJson(approval.contentHashes)),
            evidenceSha256: evidence.sha256, path: approvalReference.path, sha256: approvalReference.sha256,
        };
        const context = {
            policy,
            claimToken: 'claim-1',
            headCommit: 'a'.repeat(40),
            backlogSha256: 'b'.repeat(64),
            nowMs: Date.parse('2026-07-20T00:10:00.000Z'),
            evidenceHashes: new Map([[evidence.path, evidence.sha256]]),
        };
        expect(validateApprovalAttestation(task, 'owner', approval, context)).toEqual([]);
        expect(validateApprovalAttestation(task, 'owner', { ...approval, summary: 'forged', decision: 'note' }, context))
            .toContain('Requirement owner approval signature is invalid');
        expect(validateApprovalAttestation(task, 'owner', { ...approval, taskId: 'OTHER-001' }, context))
            .toContain('Requirement owner approval belongs to another task');
        expect(validateApprovalAttestation(task, 'owner', { ...approval, purpose: 'other' }, context))
            .toContain('Requirement owner approval has the wrong purpose');
        expect(validateApprovalAttestation(task, 'owner', { ...approval, revision: 2 }, context))
            .toContain('Requirement owner approval signature is invalid');
        expect(validateApprovalAttestation(task, 'owner', { ...approval, evidence: { ...evidence, sha256: '0'.repeat(64) } }, context))
            .toContain('Requirement owner approval content hashes do not bind its evidence');
        const signedWrongEvidence = signedApproval(task, { evidence: { ...evidence, sha256: '0'.repeat(64) } }).approval;
        expect(validateApprovalAttestation(task, 'owner', signedWrongEvidence, context))
            .toContain('Requirement owner approval evidence hash mismatch');
        expect(validateApprovalAttestation(task, 'owner', approval, { ...context, nowMs: Date.parse('2026-07-20T00:21:00.000Z') }))
            .toContain('Requirement owner approval has expired');
        const future = signedApproval(task, {
            issuedAt: '2026-07-20T01:00:00.000Z', expiresAt: '2026-07-20T01:20:00.000Z',
        }).approval;
        expect(validateApprovalAttestation(task, 'owner', future, context))
            .toContain('Requirement owner approval was issued in the future');
        expect(validateApprovalAttestation(task, 'owner', approval, {
            ...context, strict: true, approvalReference, approvalNonces: new Map(),
        })).toContain('Requirement owner approval nonce is not registered to this exact attestation');
        expect(validateApprovalAttestation(task, 'owner', approval, {
            ...context, strict: true, approvalReference, approvalNonces: new Map([[approval.nonce, registration]]),
        })).toEqual([]);
        const otherKeyPolicy = { ...policy, keys: [{ ...policy.keys[0], keyId: 'other-key' }] };
        expect(validateApprovalAttestation(task, 'owner', approval, { ...context, policy: otherKeyPolicy }))
            .toContain('Requirement owner approval does not use an authorized owner key');
        const revokedPolicy = { ...policy, keys: [{ ...policy.keys[0], revokedAt: '2026-07-20T00:05:00.000Z', successorKeyId: 'next-key' }] };
        expect(validateApprovalAttestation(task, 'owner', approval, { ...context, policy: revokedPolicy }))
            .toContain('Requirement owner approval key is revoked');
        const notActivePolicy = { ...policy, keys: [{ ...policy.keys[0], activatedAt: '2026-07-20T00:05:00.000Z' }] };
        expect(validateApprovalAttestation(task, 'owner', approval, { ...context, policy: notActivePolicy }))
            .toContain('Requirement owner approval key was not active when issued');
        const expiredKeyPolicy = { ...policy, keys: [{ ...policy.keys[0], expiresAt: '2026-07-20T00:09:00.000Z' }] };
        expect(validateApprovalAttestation(task, 'owner', approval, { ...context, policy: expiredKeyPolicy }))
            .toContain('Requirement owner approval key has expired');
    });

    it('strips ambient providers, base URLs, plugins, hooks, MCP, and user settings from review env', () => {
        expect(minimalReviewEnvironment(requiredReviewPolicy, {
            ANTHROPIC_API_KEY: 'explicit', LANG: 'en_GB.UTF-8', HOME: '/host-home',
            ANTHROPIC_BASE_URL: 'https://evil.invalid', CLAUDE_CONFIG_DIR: '/tmp/settings',
            CLAUDE_CODE_USE_BEDROCK: '1', AWS_ACCESS_KEY_ID: 'ambient', MCP_CONFIG: 'ambient',
            PLUGIN_PATH: 'ambient', HOOKS: 'ambient', PATH: '/ambient/bin',
        })).toEqual({ ANTHROPIC_API_KEY: 'explicit', LANG: 'en_GB.UTF-8' });
        expect(requiredReviewPolicy.args).toEqual(expect.arrayContaining([
            '--bare', '--safe-mode', '--strict-mcp-config', '--setting-sources', '', '--no-session-persistence',
        ]));
    });

    it('rejects owner private key material in the external trust store', () => {
        const weakened = structuredClone(config);
        weakened.approvalPolicies.owner.publicKeys = [{ keyId: 'candidate-key' }];
        const tasks = parseBacklog(fs.readFileSync(backlogPath, 'utf8'), weakened);
        expect(validateWorkflow(tasks, weakened).errors).toContain('Owner approval cannot define candidate-controlled publicKeys');

        const { publicKey } = crypto.generateKeyPairSync('ed25519');
        const trustStore = {
            schema: 'yomu-academy.governance-trust/v1', revision: 1, issuedAt: '2026-07-20T00:00:00.000Z',
            ownerKeys: [{
                keyId: 'candidate-key', ownerId: 'heru', algorithm: 'Ed25519',
                publicKeyJwk: { ...publicKey.export({ format: 'jwk' }), d: 'private-material-is-forbidden' },
                activatedAt: '2026-07-01T00:00:00.000Z', expiresAt: '2027-07-01T00:00:00.000Z', revokedAt: null, successorKeyId: null,
            }],
            approvalPolicies: [{ id: 'owner', purpose: 'academy-production-promotion', allowedOwnerIds: ['heru'], activeKeyIds: ['candidate-key'] }],
            tools: [], reviewProviders: [], githubPolicies: [],
        };
        expect(validateGovernanceTrustStore(trustStore)).toContain('Owner key candidate-key contains private key material');
    });

    it('rejects candidate key substitution and ambiguous external authority policies', () => {
        const substituted = structuredClone(config);
        substituted.approvalPolicies.owner.requiredKeyIds = ['attacker-key'];
        const trustStore = {
            revision: 1,
            ownerKeys: [],
            approvalPolicies: [{
                id: 'academy-production-owner', purpose: 'academy-production-promotion', allowedOwnerIds: ['heru'],
                activeKeyIds: ['heru-github-ed25519-2026-07'], maxValidityMinutes: 30,
            }],
            reviewProviders: [{
                id: 'claude-fable', reviewerId: 'claude-fable', model: 'claude-fable-5',
                toolId: 'claude-code-fable', serviceProvenance: 'unresolved',
            }],
            githubPolicies: [{ id: 'yomu-reader-production' }],
        };
        expect(() => trustBindings(substituted, trustStore)).toThrow('Candidate owner key references do not match the externally active key set');
        trustStore.approvalPolicies.push({ ...trustStore.approvalPolicies[0], id: 'weaker-policy' });
        expect(() => trustBindings(config, trustStore)).toThrow('exactly one Academy production approval policy');
    });

    it('requires explicit, acyclic owner-key successor rotation', () => {
        const key = (keyId: string, activatedAt: string, successorKeyId: string | null) => {
            const { publicKey } = crypto.generateKeyPairSync('ed25519');
            return {
                keyId, ownerId: 'heru', algorithm: 'Ed25519', publicKeyJwk: publicKey.export({ format: 'jwk' }),
                activatedAt, expiresAt: '2029-01-01T00:00:00.000Z', revokedAt: null, successorKeyId,
            };
        };
        const oldKey = key('owner-2026', '2026-01-01T00:00:00.000Z', 'owner-2027');
        const newKey = key('owner-2027', '2027-01-01T00:00:00.000Z', null);
        const store = {
            schema: 'yomu-academy.governance-trust/v1', revision: 2, issuedAt: '2026-12-01T00:00:00.000Z',
            ownerKeys: [oldKey, newKey],
            approvalPolicies: [{
                id: 'academy-production-owner', purpose: 'academy-production-promotion', allowedOwnerIds: ['heru'],
                activeKeyIds: ['owner-2027'], maxValidityMinutes: 30,
            }],
            tools: [], reviewProviders: [], githubPolicies: [],
        };
        expect(validateGovernanceTrustStore(store)).toEqual([]);
        const cyclic = structuredClone(store);
        cyclic.ownerKeys[1].successorKeyId = 'owner-2026';
        expect(validateGovernanceTrustStore(cyclic)).toEqual(expect.arrayContaining([
            expect.stringContaining('successor must activate later'),
            expect.stringContaining('rotation cycle'),
        ]));
        const missing = structuredClone(store);
        missing.ownerKeys[0].successorKeyId = 'missing-key';
        expect(validateGovernanceTrustStore(missing)).toContain('Owner key owner-2026 names missing successor missing-key');
    });

    it('gives governance, platform, and visual lanes their real production ownership', () => {
        const lane = (id: string) => config.lanes.find((candidate: { id: string }) => candidate.id === id).ownership;
        expect(changedFilesWithinOwnership([
            'config/academy-production-workflow.json', 'scripts/lib/academy-workflow-model.mjs', 'package.json',
        ], lane('governance'))).toEqual([]);
        expect(changedFilesWithinOwnership([
            'workers/yomu-academy/src/index.ts', 'src/academy/access/gateway.ts', 'src/academy/access/donation-checkout.ts',
            'src/academy/access/donation-claim.ts', 'src/academy/access/local-qa.ts', 'src/academy/ui/access-screen.ts', 'src/academy/app.ts',
        ], lane('platform'))).toEqual([]);
        expect(changedFilesWithinOwnership([
            'src/academy/assets.ts', 'src/academy/styles/world.css', 'scripts/academy-asset-census.mjs', 'docs/academy/art-review/verdict.json',
        ], lane('visual'))).toEqual([]);
    });

    it('selects only dependency-ready tasks while respecting lane and global capacity', () => {
        const markdown = `## P0 release truth\n\n- [x] **BASE-001** Base. **Deps:** none. **Proof:** \`C\`,\`T\`.\n- [ ] **GOV-001** Ledger. **Deps:** \`BASE-001\`. **Proof:** \`C\`,\`T\`,\`O\`.\n- [ ] **OPS-001** Cleanup. **Deps:** \`BASE-001\`. **Proof:** \`C\`,\`T\`.\n- [ ] **CUR-001** Lesson. **Deps:** \`GOV-001\`. **Proof:** \`C\`,\`R\`,\`T\`.\n`;
        const tasks = parseBacklog(markdown);
        const plan = buildPlan(tasks, { ...config, maxParallel: 2, currentFocus: ['GOV-001'] }, {
            claims: [], promotions: [{ taskId: 'BASE-001', status: 'verified', userVisible: false }],
        }, new Date('2026-07-19T12:00:00Z'));
        expect(plan.selected.map(task => task.id)).toEqual(['GOV-001']);
        expect(plan.readyCount).toBe(2);
        expect(plan.blockedCount).toBe(1);
    });

    it('returns expired claims to the scheduler while keeping live claims exclusive', () => {
        const tasks = parseBacklog('- [ ] **GOV-001** Ledger. **Deps:** none. **Proof:** `C`,`T`.');
        const expired = buildPlan(tasks, config, {
            claims: [{
                taskId: 'GOV-001', lane: 'governance', status: 'active',
                expiresAt: '2026-07-19T11:59:59.000Z',
            }],
        }, new Date('2026-07-19T12:00:00.000Z'));
        expect(expired.selected.map(row => row.id)).toEqual(['GOV-001']);

        const live = buildPlan(tasks, config, {
            claims: [{
                taskId: 'GOV-001', lane: 'governance', status: 'active',
                expiresAt: '2026-07-19T12:30:00.000Z',
            }],
        }, new Date('2026-07-19T12:00:00.000Z'));
        expect(live.selected).toEqual([]);
        expect(live.activeClaims).toHaveLength(1);
    });

    it('writes self-contained work orders with ownership, gates, and external roots', () => {
        const task = parseBacklog('- [ ] **CUR-013** Census. **Deps:** none. **Proof:** `C`,`T`,`S`,`O`.')[0];
        const order = createWorkOrder(task, config, 'abc123');
        expect(order).toContain('/Users/heru/Documents/Japanese');
        expect(order).toContain('/Users/heru/Documents/Projects/yomu/references/soya-research');
        expect(order).toContain('Never mark the backlog checkbox directly');
        expect(order).toContain('Lane: curriculum');
    });

    it('refuses promotion until every required gate and independent review pass', () => {
        const markdown = '- [ ] **AUD-003** Produce voice. **Deps:** none. **Proof:** `C`,`R`,`T`,`Q`,`S`,`O`.';
        const task = parseBacklog(markdown)[0];
        const proof = proofTemplate(task, config, 'deadbeef');
        proof.backlogSha256 = sha256(markdown);
        expect(validateProof(task, proof, sha256(markdown))).toContain('Gate C is not passed');

        proof.submittedAt = '2026-07-19T12:00:00.000Z';
        proof.summary = 'Rendered and bound one verified tranche.';
        proof.owner = 'Codex';
        proof.changedFiles = ['src/academy/audio/example.ts'];
        proof.reuseAudit = {
            status: 'pass',
            report: { path: 'artifacts/reuse.json', sha256: 'a'.repeat(64) },
        };
        for (const gate of task.gates) {
            proof.gates[gate].status = 'pass';
            proof.gates[gate].evidence = [{ path: `evidence/${gate}.json`, sha256: 'b'.repeat(64) }];
            if (gate === 'T') proof.gates[gate].commands = [{
                command: ['vitest', 'run'],
                exitCode: 0,
                headCommit: 'deadbeef',
                recordedBy: 'academy-production-workflow',
                transcript: { path: 'evidence/test-command.json', sha256: 'c'.repeat(64) },
            }];
        }
        proof.independentReview = {
            status: 'pass',
            reviewer: 'cross-model-review',
            evidence: { path: 'evidence/review.json', sha256: 'd'.repeat(64) },
            findingsResolved: [],
        };
        expect(validateProof(task, proof, sha256(markdown))).toEqual([]);
        expect(validateProof(task, proof, sha256(`${markdown}\n- [x] **GOV-999** Other. **Deps:** none. **Proof:** \`C\`.`))).toEqual([]);
        const editedTask = { ...task, description: 'Changed definition' };
        expect(validateProof(editedTask, proof, sha256(markdown), {
            taskDefinitionSha256: taskDefinitionSha256(editedTask),
        })).toContain('Proof was produced against a stale task definition');
    });

    it('rejects malformed tasks and unknown proof tokens instead of silently dropping them', () => {
        expect(() => parseBacklog('- [ ] not-a-canonical-task')).toThrow('Malformed canonical checkbox');
        const task = parseBacklog('- [ ] **GOV-001** Ledger. **Deps:** none. **Proof:** `C`,`BOGUS`.')[0];
        expect(validateWorkflow([task], { ...config, currentFocus: [] }).errors).toContain(
            'GOV-001 uses unknown proof token BOGUS',
        );
    });

    it('rejects any reuse report that differs from the report pinned by the active claim', () => {
        const claim = {
            reuseReport: { path: '@workflow-state/reuse/GOV-001.json', sha256: 'a'.repeat(64) },
        };
        expect(reuseReportPinErrors(claim, claim.reuseReport)).toEqual([]);
        expect(reuseReportPinErrors(claim, {
            path: '@workflow-state/reuse/forged.json',
            sha256: 'b'.repeat(64),
        })).toEqual(['Reuse report does not match the report pinned by the active claim']);
    });

    it('issues a fresh proof envelope when a task is claimed again on a new base', () => {
        const markdown = '- [ ] **GOV-001** Ledger. **Deps:** none. **Proof:** `C`,`T`.';
        const task = parseBacklog(markdown, config)[0];
        const stale = proofTemplate(task, config, 'old-base');
        stale.gates.T.status = 'pass';
        stale.gates.T.commands = [{ headCommit: 'old-head' }];
        stale.independentReview.status = 'pass';
        const claim = {
            baseCommit: 'new-base',
            token: 'new-token',
            worktree: repoRoot,
            owner: 'new-owner',
            reuseReport: { path: '@workflow-state/reuse/GOV-001.json', sha256: 'a'.repeat(64) },
        };
        const rebound = bindProofToClaim(task, config, sha256(markdown), claim);

        expect(rebound).toMatchObject({
            baseCommit: 'new-base',
            claimToken: 'new-token',
            owner: 'new-owner',
            headCommit: null,
            submittedAt: null,
        });
        expect(rebound.gates.T).toMatchObject({ status: 'pending', evidence: [], commands: [] });
        expect(rebound.independentReview.status).toBe('pending');
        expect(rebound.reuseAudit).toMatchObject({ status: 'pending', report: claim.reuseReport });
    });

    it('resolves release scope instead of permanently filtering a dynamic task', () => {
        const tasks = parseBacklog(`## P0 release truth
- [x] **BASE-001** Base. **Deps:** none. **Proof:** \`C\`.
- [ ] **QA-001** QA. **Deps:** \`BASE-001\`. **Proof:** \`T\`.
- [ ] **REL-001** Release. **Deps:** all P0 items and release-targeted P1 items. **Proof:** \`T\`.
`, config);
        expect(resolveDynamicDependencies(tasks[2], tasks, config, {})).toContain('QA-001');
        const state = { claims: [], promotions: [{ taskId: 'BASE-001', status: 'verified', userVisible: false }] };
        expect(buildPlan(tasks, { ...config, currentFocus: [] }, state).selected.map(row => row.id)).toEqual(['QA-001']);
        tasks[1].complete = true;
        state.promotions.push({ taskId: 'QA-001', status: 'verified', userVisible: false });
        expect(buildPlan(tasks, { ...config, currentFocus: [] }, state).selected.map(row => row.id)).toContain('REL-001');
    });

    it('blocks forged strict proof and files outside lane ownership', () => {
        const markdown = '- [ ] **AUD-003** Produce voice. **Deps:** none. **Proof:** `C`,`T`.';
        const task = parseBacklog(markdown)[0];
        const proof = proofTemplate(task, config, 'base');
        proof.backlogSha256 = sha256(markdown);
        proof.submittedAt = new Date().toISOString();
        proof.summary = 'Forged';
        proof.owner = 'same-person';
        proof.changedFiles = ['src/reader/app/main.ts'];
        proof.reuseAudit = { status: 'pass', report: { path: 'missing.json', sha256: 'a'.repeat(64) } };
        for (const gate of task.gates) {
            proof.gates[gate].status = 'pass';
            proof.gates[gate].evidence = [{ path: `missing-${gate}.json`, sha256: 'b'.repeat(64) }];
            if (gate === 'T') proof.gates[gate].commands = [{
                command: ['false'], exitCode: 0, recordedBy: 'author', headCommit: 'wrong',
                transcript: { path: 'missing-command.json', sha256: 'c'.repeat(64) },
            }];
        }
        proof.independentReview = {
            status: 'pass', reviewer: 'same-person', findingsResolved: [],
            evidence: { path: 'missing-review.json', sha256: 'd'.repeat(64) },
        };
        const errors = validateProof(task, proof, sha256(markdown), {
            strict: true,
            repoRoot,
            repoClean: true,
            currentHead: 'head',
            changedFiles: ['src/reader/app/main.ts'],
            claim: { token: 'token', baseCommit: 'base', worktree: repoRoot, owner: 'same-person' },
            ownership: config.lanes.find((lane: { id: string }) => lane.id === 'audio').ownership,
            reservedFiles: ['src/reader/app/main.ts'],
            originMainIsAncestor: true,
            evidenceHashes: new Map(),
            commandTranscripts: new Map(),
            reuseReportErrors: [],
        });
        expect(errors).toContain('Changed files escape lane ownership: src/reader/app/main.ts');
        expect(errors).toContain('Independent reviewer must differ from owner');
        expect(errors.some(error => error.includes('evidence does not exist'))).toBe(true);
        expect(changedFilesWithinOwnership(['src/academy/audio/a.ts'], ['src/academy/audio/**'])).toEqual([]);
    });

    it('rejects future proof, claim-owner self review, unreserved files, and forged command transcripts', () => {
        const markdown = '- [ ] **AUD-003** Produce voice. **Deps:** none. **Proof:** `C`,`T`.';
        const task = parseBacklog(markdown)[0];
        const proof = proofTemplate(task, config, 'base');
        proof.backlogSha256 = sha256(markdown);
        proof.submittedAt = '2099-01-01T00:00:00.000Z';
        proof.summary = 'Attempted forged proof';
        proof.owner = 'editable-owner';
        proof.headCommit = 'head';
        proof.claimToken = 'token';
        proof.worktree = repoRoot;
        proof.changedFiles = ['src/academy/audio/a.ts'];
        proof.reuseAudit = { status: 'pass', report: { path: 'reuse.json', sha256: 'a'.repeat(64) } };
        for (const gate of task.gates) {
            proof.gates[gate].status = 'pass';
            proof.gates[gate].evidence = [{ path: `${gate}.json`, sha256: 'b'.repeat(64) }];
        }
        proof.gates.T.commands = [{
            command: ['vitest', 'run'], exitCode: 0, headCommit: 'head', recordedBy: 'academy-production-workflow',
            transcript: { path: 'command.json', sha256: 'c'.repeat(64) },
        }];
        proof.independentReview = {
            status: 'pass', reviewer: 'real-owner', findingsResolved: [],
            evidence: { path: 'review.json', sha256: 'd'.repeat(64) },
        };
        const evidenceHashes = new Map([
            ['reuse.json', 'a'.repeat(64)], ['C.json', 'b'.repeat(64)], ['T.json', 'b'.repeat(64)],
            ['command.json', 'c'.repeat(64)], ['review.json', 'd'.repeat(64)],
        ]);
        const errors = validateProof(task, proof, sha256(markdown), {
            strict: true,
            nowMs: Date.parse('2026-07-20T00:00:00.000Z'),
            repoRoot,
            repoClean: true,
            currentHead: 'head',
            changedFiles: ['src/academy/audio/a.ts'],
            claim: { token: 'token', baseCommit: 'base', worktree: repoRoot, owner: 'real-owner' },
            ownership: ['src/academy/audio/**'],
            reservedFiles: [],
            originMainIsAncestor: true,
            evidenceHashes,
            commandTranscripts: new Map([['command.json', {
                schema: 'invented', taskId: 'OTHER', gate: 'C', command: ['true'], exitCode: 0,
                headCommit: 'wrong', startedAt: 'bad', finishedAt: 'bad',
            }]]),
            reuseReportErrors: [],
            userVisible: false,
        });
        expect(errors).toEqual(expect.arrayContaining([
            'Proof timestamp is in the future',
            'Proof owner does not match claim owner',
            'Changed files were not exclusively reserved by this claim: src/academy/audio/a.ts',
            'Independent reviewer must differ from owner',
        ]));
        expect(errors.some(error => error.includes('command transcript'))).toBe(true);
    });

    it('promotes exactly one open canonical checkbox', () => {
        const markdown = '- [ ] **GOV-001** Ledger. **Deps:** none. **Proof:** `C`,`T`,`O`.\n- [ ] **GOV-002** Cleanup. **Deps:** `GOV-001`. **Proof:** `C`,`T`.\n';
        const updated = updateBacklogCheckbox(markdown, 'GOV-001');
        expect(updated).toContain('- [x] **GOV-001**');
        expect(updated).toContain('- [ ] **GOV-002**');
        expect(updateBacklogCheckbox(updated, 'GOV-001', false)).toBe(markdown);
    });
});
