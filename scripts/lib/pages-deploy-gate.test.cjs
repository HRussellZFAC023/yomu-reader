'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync, mkdirSync, mkdtempSync, writeFileSync, unlinkSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const { approvePagesSource, checkoutCommit, verifyJobs, EXPECTED_JOBS } = require('./pages-deploy-gate.cjs');

// Actual PR57/run41730452971 committed-state checkout evidence, reduced to the
// checkout boundaries and proof-bearing lines. API head_sha was SOURCE, not MERGE.
const SOURCE = 'ae693970a6f12db7db02aafeabeb1ce5f4e59a2f';
const MAIN = '05227e323de9b055da16dfab13dc138d612b5faf';
const MERGE = '2861fdf12e1bb9794a9e8f626ce98a482a8e65cc';
const TREE = '947a3d5d72232711652af2c48ceea89c042a7ae0';
const REPOSITORY = 'HRussellZFAC023/yomu-reader';
const LOG = `2026-11-03T22:24:02.9642863Z ##[group]Run actions/checkout@v6
2026-11-03T22:24:02.9644293Z   repository: ${REPOSITORY}
2026-11-03T22:24:03.4080561Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +${MERGE}:refs/remotes/pull/57/merge
2026-11-03T22:25:34.4759510Z [command]/usr/bin/git checkout --progress --force refs/remotes/pull/57/merge
2026-11-03T22:25:36.3061413Z HEAD is now at 2861fdf Merge ${SOURCE} into ${MAIN}
2026-11-03T22:25:36.3209858Z ##[endgroup]
2026-11-03T22:25:36.3353468Z [command]/usr/bin/git log -1 --format=%H
2026-11-03T22:25:36.3353968Z ${MERGE}
2026-11-03T22:25:36.3607046Z ##[group]Run actions/setup-node@v6
`;

function fixture() {
    const state = {
        workflow: { id: 272281433, path: '.github/workflows/ci.yml', state: 'active' },
        main: MAIN, branch: SOURCE, log: LOG, sleeps: 0, ciBlob: 'trusted-ci-blob',
        pull: { number: 57, state: 'open', base: { ref: 'main', sha: MAIN, repo: { full_name: REPOSITORY } },
            head: { ref: 'release/fixture', sha: SOURCE, repo: { full_name: REPOSITORY } } },
        run: { id: 41730452971, run_attempt: 1, workflow_id: 272281433, path: '.github/workflows/ci.yml',
            head_sha: SOURCE, head_branch: 'release/fixture', event: 'pull_request', status: 'completed', conclusion: 'success',
            repository: { full_name: REPOSITORY }, head_repository: { full_name: REPOSITORY } },
        tested: { sha: MERGE, tree: { sha: TREE }, parents: [{ sha: MAIN }, { sha: SOURCE }] },
        source: { sha: SOURCE, tree: { sha: TREE } }, mergeBase: MAIN,
    };
    state.jobs = EXPECTED_JOBS.map((name, index) => ({ name, id: 126246072264 + index,
        run_id: state.run.id, run_attempt: 1, head_sha: SOURCE, status: 'completed', conclusion: 'success' }));
    const data = value => ({ data: value });
    const github = {
        rest: {
            git: {
                getRef: async ({ ref }) => data({ object: { sha: ref === 'heads/main' ? state.main : state.branch } }),
                getCommit: async ({ commit_sha }) => data(commit_sha === SOURCE ? state.source : state.tested),
            },
            pulls: { get: async () => data(state.pull) },
            repos: {
                listPullRequestsAssociatedWithCommit: async () => [state.pull],
                compareCommitsWithBasehead: async () => data({ merge_base_commit: { sha: state.mergeBase } }),
                getContent: async ({ ref }) => data({ type: 'file', sha: ref === MAIN ? 'trusted-ci-blob' : state.ciBlob }),
            },
            actions: {
                getWorkflow: async () => data(state.workflow),
                listWorkflowRuns: async () => data({ workflow_runs: state.runs ?? [state.run] }),
                getWorkflowRun: async () => data(state.run),
                listJobsForWorkflowRunAttempt: async ({ run_id, attempt_number }) => {
                    assert.equal(run_id, 41730452971);
                    assert.equal(attempt_number, 1);
                    return state.jobs;
                },
                downloadJobLogsForWorkflowRun: async ({ job_id }) => {
                    assert.equal(job_id, 126246072264);
                    return data(state.log);
                },
            },
        },
        paginate: async (method, args) => method(args),
    };
    const args = { github, context: { eventName: 'workflow_dispatch', ref: 'refs/heads/main', sha: MAIN,
        repo: { owner: 'HRussellZFAC023', repo: 'yomu-reader' } }, workflowSha: MAIN,
        sourceCommit: SOURCE, sleep: async () => { state.sleeps += 1; } };
    return { state, args };
}

test('actual checkout evidence identifies tested merge, rather than API source head', () => {
    assert.equal(checkoutCommit(LOG, REPOSITORY), MERGE);
    assert.notEqual(checkoutCommit(LOG, REPOSITORY), SOURCE);
});

test('job proof is tied to the complete exact run and attempt', () => {
    const { state } = fixture();
    verifyJobs(state.jobs, state.run, SOURCE);
    assert.throws(() => verifyJobs(state.jobs, { ...state.run, run_attempt: 2 }, SOURCE), /exact run/);
});

test('full 26-job successful candidate yields an exact immutable receipt', async () => {
    const { args } = fixture();
    const receipt = await approvePagesSource(args);
    assert.deepEqual(receipt, { repository: REPOSITORY, workflow_sha: MAIN, main_sha: MAIN,
        source_sha: SOURCE, source_tree: TREE, source_branch: 'release/fixture', pull_number: 57,
        tested_sha: MERGE, ci_run_id: 41730452971, ci_run_attempt: 1, ci_workflow_id: 272281433 });
});

const rejected = [
    ['missing job', ({ state }) => state.jobs.pop(), /all 26/],
    ['extra job', ({ state }) => state.jobs.push({ ...state.jobs[0], name: 'other' }), /all 26/],
    ['duplicate job', ({ state }) => { state.jobs[1].name = state.jobs[0].name; }, /job names/],
    ['wrong job SHA', ({ state }) => { state.jobs[0].head_sha = MAIN; }, /exact run/],
    ['failed job', ({ state }) => { state.jobs[0].conclusion = 'failure'; }, /exact run/],
    ['skipped job', ({ state }) => { state.jobs[0].conclusion = 'skipped'; }, /exact run/],
    ['other run job', ({ state }) => { state.jobs[0].run_id += 1; }, /exact run/],
    ['old attempt job', ({ state }) => { state.jobs[0].run_attempt = 2; }, /exact run/],
    ['failed run', ({ state }) => { state.run.conclusion = 'failure'; }, /concluded failure/],
    ['wrong run SHA', ({ state }) => { state.run.head_sha = MAIN; }, /provenance/],
    ['fork CI', ({ state }) => { state.run.head_repository.full_name = 'attacker/yomu-reader'; }, /provenance/],
    ['wrong workflow ID', ({ state }) => { state.run.workflow_id += 1; }, /provenance/],
    ['wrong workflow path', ({ state }) => { state.run.path = '.github/workflows/fake.yml'; }, /provenance/],
    ['wrong CI event', ({ state }) => { state.run.event = 'workflow_dispatch'; }, /provenance/],
    ['fork PR', ({ state }) => { state.pull.head.repo.full_name = 'attacker/yomu-reader'; }, /same-repository/],
    ['untrusted source ref', ({ state }) => { state.pull.head.ref = 'fix/fixture'; }, /release/],
    ['closed PR', ({ state }) => { state.pull.state = 'closed'; }, /open same-repository/],
    ['different PR base', ({ state }) => { state.pull.base.sha = SOURCE; }, /current main/],
    ['candidate omits main', ({ state }) => { state.mergeBase = SOURCE; }, /contain current main/],
    ['moving main', ({ state }) => { state.main = SOURCE; }, /main moved/],
    ['moving release branch', ({ state }) => { state.branch = MAIN; }, /branch moved/],
    ['wrong tree', ({ state }) => { state.tested.tree.sha = MAIN; }, /tree differs/],
    ['wrong merge base', ({ state }) => { state.tested.parents[0].sha = SOURCE; }, /merge parents/],
    ['wrong merge head', ({ state }) => { state.tested.parents[1].sha = MAIN; }, /merge parents/],
    ['changed CI workflow', ({ state }) => { state.ciBlob = 'untrusted'; }, /differs from protected main/],
    ['wrong dispatch ref', ({ args }) => { args.context.ref = 'refs/heads/release/fixture'; }, /from main/],
    ['wrong workflow revision', ({ args }) => { args.workflowSha = SOURCE; }, /workflow revision/],
    ['abbreviated source', ({ args }) => { args.sourceCommit = SOURCE.slice(0, 8); }, /exact 40/],
    ['expression source', ({ args }) => { args.sourceCommit = '$(echo unsafe)'; }, /exact 40/],
    ['missing checkout log', ({ state }) => { state.log = ''; }, /checkout step/],
    ['ambiguous checkout', ({ state }) => { state.log += LOG; }, /ambiguous checkout/],
    ['ambiguous checkout SHA', ({ state }) => { state.log = state.log.replace('##[group]Run actions/setup-node@v6', `[command]/usr/bin/git log -1 --format=%H\n${MERGE}\n##[group]Run actions/setup-node@v6`); }, /ambiguous checkout commit/],
    ['late injected proof', ({ state }) => { state.log = state.log.replace(`Z ${MERGE}\n`, 'Z no-proof\n') + `\n[command]/usr/bin/git log -1 --format=%H\n${MERGE}\n`; }, /exact 40/],
];
for (const [name, mutate, error] of rejected) {
    test(`fails closed: ${name}`, async () => {
        const control = fixture();
        mutate(control);
        await assert.rejects(approvePagesSource(control.args), error);
    });
}

test('missing CI exhausts the bounded wait without a fallback', async () => {
    const { args, state } = fixture();
    state.runs = [];
    await assert.rejects(approvePagesSource(args), /within 50 minutes/);
    assert.equal(state.sleeps, 99);
});

test('pending CI waits and never accepts an older successful run', async () => {
    const { args, state } = fixture();
    state.run.status = 'in_progress';
    state.runs = [{ ...state.run, id: state.run.id - 1, status: 'completed' }, state.run];
    await assert.rejects(approvePagesSource(args), /within 50 minutes/);
    assert.equal(state.sleeps, 99);
});

test('default manual main dispatch also requires full exact-commit CI', async () => {
    const { args, state } = fixture();
    args.sourceCommit = '';
    state.run.head_sha = MAIN;
    state.run.head_branch = 'main';
    state.run.event = 'push';
    state.jobs.forEach(job => { job.head_sha = MAIN; });
    state.log = LOG.replaceAll(MERGE, MAIN);
    state.tested.sha = MAIN;
    const receipt = await approvePagesSource(args);
    assert.equal(receipt.source_sha, MAIN);
    assert.equal(receipt.tested_sha, MAIN);
    assert.equal(receipt.pull_number, null);
});

test('workflow runs input only through env, checks exact checkout, and gates upload after verification', () => {
    const workflow = readFileSync(join(__dirname, '../../.github/workflows/deploy-pages.yml'), 'utf8');
    assert.match(workflow, /SOURCE_COMMIT: \$\{\{ inputs.source_commit \}\}/);
    assert.doesNotMatch(workflow, /run: [^\n]*\$\{\{ inputs.source_commit/);
    assert.match(workflow, /ref: \$\{\{ steps.source_gate.outputs.source_commit \}\}/);
    const sourceCheckout = workflow.split('      - name: Check out validated manual source')[1]
        .split('      - name: Verify selected source checkout')[0];
    assert.match(sourceCheckout, /fetch-depth: 0/);
    assert.match(sourceCheckout, /fetch-tags: true/);
    assert.match(sourceCheckout, /filter: blob:none/);
    assert.match(workflow, /git rev-parse 'HEAD\^\{tree\}'/);
    assert.ok(workflow.indexOf('name: Verify published artifacts') < workflow.indexOf('name: Recheck manual deployment provenance before upload'));
    assert.ok(workflow.indexOf('PAGES_SOURCE_VERIFIED') < workflow.indexOf('name: Upload Pages artifact'));
    assert.ok(workflow.indexOf("require('./scripts/lib/generated-artifacts.mjs')") < workflow.indexOf('name: Check out validated manual source'));
    assert.ok(workflow.indexOf('PAGES_ARTIFACT_BYTES_VERIFIED') > workflow.indexOf('name: Verify published artifacts'));
    assert.ok(workflow.indexOf('PAGES_ARTIFACT_BYTES_VERIFIED') < workflow.indexOf('name: Upload Pages artifact'));
});

async function runUploadRecheck(control, receipt, deploy = false) {
    const workflow = readFileSync(join(__dirname, '../../.github/workflows/deploy-pages.yml'), 'utf8').replaceAll('\r\n', '\n');
    const name = deploy ? 'Recheck manual source immediately before deployment' : 'Recheck manual deployment provenance before upload';
    const block = workflow.split(`      - name: ${name}\n`)[1].split('      - name: ')[0];
    const script = block.split('          script: |\n')[1].split('\n')
        .filter(line => line.startsWith('            ')).map(line => line.slice(12)).join('\n');
    assert.ok(script.includes(deploy ? 'PAGES_SOURCE_DEPLOY_VERIFIED' : 'PAGES_SOURCE_VERIFIED'));
    const execute = new (Object.getPrototypeOf(async function () {}).constructor)('github', 'context', 'core', script);
    const previous = process.env.SOURCE_RECEIPT;
    process.env.SOURCE_RECEIPT = JSON.stringify(receipt);
    const messages = [];
    try {
        await execute(control.args.github, control.args.context, { info: message => messages.push(message) });
    } finally {
        if (previous === undefined) delete process.env.SOURCE_RECEIPT;
        else process.env.SOURCE_RECEIPT = previous;
    }
    return messages;
}

test('actual workflow pre-upload script preserves the approved immutable receipt', async () => {
    const control = fixture();
    const receipt = await approvePagesSource(control.args);
    assert.deepEqual(await runUploadRecheck(control, receipt), [`PAGES_SOURCE_VERIFIED ${JSON.stringify(receipt)}`]);
});

test('actual deploy-job recheck preserves the receipt immediately before deploy-pages', async () => {
    const control = fixture();
    const receipt = await approvePagesSource(control.args);
    assert.deepEqual(await runUploadRecheck(control, receipt, true), [`PAGES_SOURCE_DEPLOY_VERIFIED ${JSON.stringify(receipt)}`]);
    const workflow = readFileSync(join(__dirname, '../../.github/workflows/deploy-pages.yml'), 'utf8');
    assert.match(workflow, /SOURCE_RECEIPT: \$\{\{ needs.build.outputs.source_receipt \}\}/);
    assert.ok(workflow.indexOf('PAGES_SOURCE_DEPLOY_VERIFIED') < workflow.indexOf('uses: actions/deploy-pages@v5'));
});

for (const [name, mutate] of [
    ['main moved', state => { state.main = SOURCE; }],
    ['PR closed', state => { state.pull.state = 'closed'; }],
    ['PR forked', state => { state.pull.head.repo.full_name = 'attacker/yomu-reader'; }],
    ['PR base moved', state => { state.pull.base.sha = SOURCE; }],
    ['PR head moved', state => { state.pull.head.sha = MAIN; }],
    ['branch moved', state => { state.branch = MAIN; }],
    ['CI rerun', state => { state.run.run_attempt += 1; }],
    ['CI failed', state => { state.run.conclusion = 'failure'; }],
    ['CI pending', state => { state.run.status = 'in_progress'; }],
]) {
    test(`actual workflow rejects build-time provenance change: ${name}`, async () => {
        const control = fixture();
        const receipt = await approvePagesSource(control.args);
        mutate(control.state);
        await assert.rejects(runUploadRecheck(control, receipt), /during build/);
        await assert.rejects(runUploadRecheck(control, receipt, true), /during build/);
    });
}

function byteFixture() {
    const root = mkdtempSync(join(tmpdir(), 'pages-byte-guard-'));
    const env = { ...process.env, GITHUB_WORKSPACE: root,
        GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'safe.directory', GIT_CONFIG_VALUE_0: root };
    const git = args => execFileSync('git', args, { cwd: root, env, encoding: 'utf8' });
    git(['init', '--quiet']);
    const files = ['yomu.user.js', 'study/app.js', 'study/version.json', 'greasyfork/current.js', 'greasyfork/historical.js', 'yomu.hash.css'];
    for (const file of files) {
        for (const dir of ['docs/public', 'docs/.vitepress/dist']) {
            const path = join(root, dir, file);
            mkdirSync(join(path, '..'), { recursive: true });
            writeFileSync(path, Buffer.from([0, 255, ...Buffer.from(file)]));
        }
    }
    writeFileSync(join(root, '.gitattributes'), '* -text\n');
    writeFileSync(join(root, '.gitignore'), 'docs/.vitepress/dist/\n');
    git(['add', '--', '.gitattributes', '.gitignore', 'docs/public']);
    git(['-c', 'user.name=Pages Fixture', '-c', 'user.email=pages-fixture@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
    env.SOURCE_SHA = git(['rev-parse', 'HEAD']).trim();
    env.ARTIFACT_PATHS = JSON.stringify(['docs/public/yomu.user.js', 'docs/public/study', 'docs/public/greasyfork', 'docs/public/yomu.*.css']);
    const workflow = readFileSync(join(__dirname, '../../.github/workflows/deploy-pages.yml'), 'utf8').replaceAll('\r\n', '\n');
    const block = workflow.split('      - name: Require exact committed manual artifact bytes\n')[1].split('      - name: ')[0];
    const script = block.split('          script: |\n')[1].split('\n')
        .filter(line => line.startsWith('            ')).map(line => line.slice(12)).join('\n');
    const execute = new (Object.getPrototypeOf(async function () {}).constructor)('require', 'process', 'core', script);
    const messages = [];
    return { root, env, messages, run: () => execute(require, { env }, { info: message => messages.push(message) }) };
}

test('actual manual byte guard compares binary bootstrap, Study/version, and current/historical wildcard pins', async () => {
    const fixture = byteFixture();
    await fixture.run();
    assert.deepEqual(fixture.messages, [`PAGES_ARTIFACT_BYTES_VERIFIED ${JSON.stringify({ source_sha: fixture.env.SOURCE_SHA, files: 6 })}`]);
});

for (const [name, mutate, error] of [
    ['bootstrap regenerated', fixture => writeFileSync(join(fixture.root, 'docs/public/yomu.user.js'), 'drift'), /artifact bytes differ/],
    ['Study version regenerated', fixture => writeFileSync(join(fixture.root, 'docs/public/study/version.json'), 'wrong version'), /artifact bytes differ/],
    ['new current pin', fixture => writeFileSync(join(fixture.root, 'docs/public/greasyfork/new.js'), 'new pin'), /artifact bytes differ/],
    ['new ignored pin', fixture => {
        writeFileSync(join(fixture.root, '.gitignore'), 'docs/.vitepress/dist/\ndocs/public/greasyfork/ignored.js\n');
        writeFileSync(join(fixture.root, 'docs/public/greasyfork/ignored.js'), 'ignored pin');
    }, /artifact bytes differ/],
    ['uploaded Study body drift', fixture => writeFileSync(join(fixture.root, 'docs/.vitepress/dist/study/app.js'), 'drift'), /upload body differs/],
    ['uploaded historical pin drift', fixture => writeFileSync(join(fixture.root, 'docs/.vitepress/dist/greasyfork/historical.js'), 'drift'), /upload body differs/],
    ['missing uploaded CSS pin', fixture => unlinkSync(join(fixture.root, 'docs/.vitepress/dist/yomu.hash.css')), /ENOENT/],
    ['changed source HEAD', fixture => { fixture.env.SOURCE_SHA = MAIN; }, /HEAD changed/],
]) {
    test(`actual manual byte guard rejects ${name}`, async () => {
        const fixture = byteFixture();
        mutate(fixture);
        await assert.rejects(fixture.run(), error);
    });
}
