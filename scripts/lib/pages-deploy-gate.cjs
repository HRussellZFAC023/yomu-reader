'use strict';

const CI_PATH = '.github/workflows/ci.yml';
const EXPECTED_JOBS = [
    'committed-state', 'fallow', 'typecheck', 'test-workflow-coverage',
    'test-academy', 'test-workers', 'video-typecheck',
    ...Array.from({ length: 8 }, (_, index) => `test (${index + 1})`),
    ...Array.from({ length: 8 }, (_, index) => `test-jpdb (${index + 1})`),
    'gaming-smoke', 'layout-smoke', 'build',
];

function requireProof(condition, message) {
    if (!condition) throw new Error(`Pages CI gate: ${message}`);
}

function exactSha(value) {
    requireProof(typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value), 'expected an exact 40-character commit SHA');
    return value.toLowerCase();
}

// Only checkout's own output counts. Later npm/test output cannot supply proof.
function checkoutCommit(log, repository) {
    requireProof(typeof log === 'string', 'checkout log is unavailable');
    const lines = log.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/)
        .map(line => line.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z /, ''));
    const starts = lines.flatMap((line, index) => line === '##[group]Run actions/checkout@v6' ? [index] : []);
    requireProof(starts.length === 1, 'missing or ambiguous checkout step');
    const end = lines.findIndex((line, index) => index > starts[0] && line.startsWith('##[group]Run '));
    requireProof(end > starts[0], 'checkout step has no boundary');
    const checkout = lines.slice(starts[0], end);
    requireProof(checkout.includes(`  repository: ${repository}`), 'checkout used another repository');
    const commands = checkout.flatMap((line, index) => /^\[command\]\/\S+\/git log -1 --format=%H$/.test(line) ? [index] : []);
    requireProof(commands.length === 1, 'missing or ambiguous checkout commit');
    return exactSha(checkout[commands[0] + 1]);
}

function verifyJobs(jobs, run, sourceSha) {
    requireProof(jobs.length === EXPECTED_JOBS.length, `expected all ${EXPECTED_JOBS.length} CI jobs`);
    const names = new Set(jobs.map(job => job.name));
    requireProof(names.size === EXPECTED_JOBS.length && EXPECTED_JOBS.every(name => names.has(name)), 'CI job names differ from the full required suite');
    requireProof(jobs.every(job => job.run_id === run.id && job.run_attempt === run.run_attempt
        && job.head_sha === sourceSha && job.status === 'completed' && job.conclusion === 'success'), 'CI jobs did not all pass for this exact run, attempt, and source');
}

async function verifyRefs({ github, repo, receipt }) {
    const main = (await github.rest.git.getRef({ ...repo, ref: 'heads/main' })).data;
    requireProof(main.object.sha === receipt.main_sha, 'main moved; start a new deployment');
    if (receipt.pull_number) {
        const pull = (await github.rest.pulls.get({ ...repo, pull_number: receipt.pull_number })).data;
        requireProof(pull.state === 'open' && pull.base.ref === 'main'
            && pull.base.repo.full_name === receipt.repository && pull.base.sha === receipt.main_sha
            && pull.head.repo?.full_name === receipt.repository && pull.head.ref === receipt.source_branch
            && pull.head.sha === receipt.source_sha, 'release PR head, base, or repository changed');
        const branch = (await github.rest.git.getRef({ ...repo, ref: `heads/${receipt.source_branch}` })).data;
        requireProof(branch.object.sha === receipt.source_sha, 'release branch moved');
    }
    const run = (await github.rest.actions.getWorkflowRun({ ...repo, run_id: receipt.ci_run_id })).data;
    requireProof(run.run_attempt === receipt.ci_run_attempt && run.status === 'completed' && run.conclusion === 'success', 'CI was rerun or no longer has a successful current attempt');
}

async function waitForSuccessfulCi({ github, repo, workflow, sourceSha, sourceBranch, event, repository, sleep }) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const runs = (await github.rest.actions.listWorkflowRuns({ ...repo, workflow_id: workflow.id, head_sha: sourceSha,
            branch: sourceBranch, event, per_page: 100 })).data.workflow_runs;
        const latest = [...runs].sort((left, right) => right.id - left.id)[0];
        if (latest) {
            const run = (await github.rest.actions.getWorkflowRun({ ...repo, run_id: latest.id })).data;
            requireProof(run.workflow_id === workflow.id && run.path === CI_PATH && run.head_sha === sourceSha
                && run.head_branch === sourceBranch && run.event === event
                && run.repository.full_name === repository && run.head_repository.full_name === repository, 'CI run provenance does not match the source');
            if (run.status === 'completed') {
                requireProof(run.conclusion === 'success', `CI run ${run.id} concluded ${run.conclusion}`);
                return run;
            }
        }
        requireProof(attempt < 99, 'full CI did not pass within 50 minutes; no missing-CI fallback for manual deploys');
        await sleep(30000);
    }
}

async function approvePagesSource({ github, context, workflowSha, sourceCommit = '', sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) }) {
    requireProof(context.eventName === 'workflow_dispatch' && context.ref === 'refs/heads/main', 'manual deployment must run from main');
    const mainSha = exactSha(context.sha);
    requireProof(exactSha(workflowSha) === mainSha, 'workflow revision differs from protected main snapshot');
    const sourceSha = sourceCommit === '' ? mainSha : exactSha(sourceCommit);
    const candidate = sourceCommit !== '';
    const repo = context.repo;
    const repository = `${repo.owner}/${repo.repo}`;
    const workflow = (await github.rest.actions.getWorkflow({ ...repo, workflow_id: 'ci.yml' })).data;
    requireProof(workflow.path === CI_PATH && workflow.state === 'active' && Number.isSafeInteger(workflow.id), 'authoritative CI workflow is unavailable');
    const main = (await github.rest.git.getRef({ ...repo, ref: 'heads/main' })).data;
    requireProof(main.object.sha === mainSha, 'main moved since this dispatch');

    let pull;
    if (candidate) {
        const pulls = await github.paginate(github.rest.repos.listPullRequestsAssociatedWithCommit, { ...repo, commit_sha: sourceSha, per_page: 100 });
        const trusted = pulls.filter(item => item.state === 'open' && item.base.ref === 'main'
            && item.base.repo.full_name === repository && item.base.sha === mainSha
            && item.head.repo?.full_name === repository && item.head.sha === sourceSha
            && /^release\/.+/.test(item.head.ref));
        requireProof(trusted.length === 1, 'source must be the exact head of one open same-repository release/* PR into current main');
        [pull] = trusted;
        const comparison = (await github.rest.repos.compareCommitsWithBasehead({ ...repo, basehead: `${mainSha}...${sourceSha}` })).data;
        requireProof(comparison.merge_base_commit.sha === mainSha, 'candidate must contain current main');
    }

    const sourceBranch = pull?.head.ref ?? 'main';
    const event = candidate ? 'pull_request' : 'push';
    const run = await waitForSuccessfulCi({ github, repo, workflow, sourceSha, sourceBranch, event, repository, sleep });

    const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRunAttempt, {
        ...repo, run_id: run.id, attempt_number: run.run_attempt, per_page: 100,
    });
    verifyJobs(jobs, run, sourceSha);
    const committedState = jobs.find(job => job.name === 'committed-state');
    const log = (await github.rest.actions.downloadJobLogsForWorkflowRun({ ...repo, job_id: committedState.id })).data;
    const testedSha = checkoutCommit(typeof log === 'string' ? log : Buffer.from(log).toString('utf8'), repository);
    const source = (await github.rest.git.getCommit({ ...repo, commit_sha: sourceSha })).data;
    const tested = (await github.rest.git.getCommit({ ...repo, commit_sha: testedSha })).data;
    requireProof(source.sha === sourceSha && tested.sha === testedSha && source.tree.sha === tested.tree.sha, 'tested checkout tree differs from source tree');
    if (candidate) {
        requireProof(tested.parents.length === 2 && tested.parents[0].sha === mainSha && tested.parents[1].sha === sourceSha, 'tested PR merge parents differ from current main and candidate');
    } else {
        requireProof(testedSha === sourceSha, 'main CI tested another commit');
    }
    const trustedCi = (await github.rest.repos.getContent({ ...repo, path: CI_PATH, ref: mainSha })).data;
    for (const ref of new Set([sourceSha, testedSha])) {
        const ci = (await github.rest.repos.getContent({ ...repo, path: CI_PATH, ref })).data;
        requireProof(ci.type === 'file' && trustedCi.type === 'file' && ci.sha === trustedCi.sha, 'source/tested CI workflow differs from protected main');
    }

    const receipt = { repository, workflow_sha: mainSha, main_sha: mainSha, source_sha: sourceSha, source_tree: source.tree.sha,
        source_branch: sourceBranch, pull_number: pull?.number ?? null,
        tested_sha: testedSha, ci_run_id: run.id, ci_run_attempt: run.run_attempt, ci_workflow_id: workflow.id };
    await verifyRefs({ github, repo, receipt });
    return receipt;
}

module.exports = { approvePagesSource, checkoutCommit, verifyJobs, EXPECTED_JOBS };
