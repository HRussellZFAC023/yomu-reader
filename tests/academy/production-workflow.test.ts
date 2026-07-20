import fs from 'node:fs';
import path from 'node:path';
import {
    buildPlan,
    bindProofToClaim,
    changedFilesWithinOwnership,
    createWorkOrder,
    parseBacklog,
    progressSummary,
    proofTemplate,
    resolveDynamicDependencies,
    reuseReportPinErrors,
    sha256,
    taskDefinitionSha256,
    updateBacklogCheckbox,
    validateProof,
    validateWorkflow,
} from '../../scripts/lib/academy-workflow-model.mjs';

const repoRoot = path.resolve(__dirname, '../..');
const backlogPath = path.join(repoRoot, 'docs/academy/BACKLOG.md');
const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config/academy-production-workflow.json'), 'utf8'));

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

    it('reports literal canonical completion without converting it to an effort claim', () => {
        const tasks = parseBacklog(fs.readFileSync(backlogPath, 'utf8'), config);
        expect(progressSummary(tasks)).toMatchObject({ complete: 21, total: 126, percent: 16.7 });
    });

    it('selects only dependency-ready tasks while respecting lane and global capacity', () => {
        const markdown = `## P0 release truth\n\n- [x] **BASE-001** Base. **Deps:** none. **Proof:** \`C\`,\`T\`.\n- [ ] **GOV-001** Ledger. **Deps:** \`BASE-001\`. **Proof:** \`C\`,\`T\`,\`O\`.\n- [ ] **OPS-001** Cleanup. **Deps:** \`BASE-001\`. **Proof:** \`C\`,\`T\`.\n- [ ] **CUR-001** Lesson. **Deps:** \`GOV-001\`. **Proof:** \`C\`,\`R\`,\`T\`.\n`;
        const tasks = parseBacklog(markdown);
        const plan = buildPlan(tasks, { ...config, maxParallel: 2, currentFocus: ['GOV-001'] }, { claims: [] }, new Date('2026-07-19T12:00:00Z'));
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
        expect(buildPlan(tasks, { ...config, currentFocus: [] }, { claims: [] }).selected.map(row => row.id)).toEqual(['QA-001']);
        tasks[1].complete = true;
        expect(buildPlan(tasks, { ...config, currentFocus: [] }, { claims: [] }).selected.map(row => row.id)).toContain('REL-001');
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
