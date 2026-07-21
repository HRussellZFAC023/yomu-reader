#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { gzipSync, gunzipSync } from 'node:zlib';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
    buildPlan,
    buildProductionLedger,
    bindProofToClaim,
    activeClaims,
    checkpointIntegrityErrors,
    canonicalJson,
    canonicalizeReservationPath,
    changedFilesWithinOwnership,
    createWorkOrder,
    ensureInside,
    laneForTask,
    minimalReviewEnvironment,
    parseBacklog,
    proofTemplate,
    readJson,
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
} from './lib/academy-workflow-model.mjs';
import {
    buildSalvageReport,
    validateSalvageReport,
} from './lib/academy-workflow-salvage.mjs';
import {
    beginRollbackTransition,
    commitFileTransition,
    completeRollbackTransition,
    inspectFileTransition,
    recoverFileTransition,
} from './lib/academy-workflow-store.mjs';
import {
    loadGovernanceTrustStore,
    resolveTrustedTool,
    trustBindings,
} from './lib/academy-workflow-trust.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.env.GIT_WORK_TREE && fs.realpathSync.native(process.env.GIT_WORK_TREE) !== fs.realpathSync.native(repoRoot)) {
    throw new Error(`GIT_WORK_TREE points outside the workflow checkout: ${process.env.GIT_WORK_TREE}`);
}
process.env.GIT_WORK_TREE = repoRoot;
const configPath = path.join(repoRoot, 'config/academy-production-workflow.json');
const rawConfig = readJson(configPath);
const config = {
    ...rawConfig,
    externalRoots: Object.fromEntries(Object.entries(rawConfig.externalRoots).map(([name, spec]) => [
        name,
        process.env[spec.env] || spec.default,
    ])),
};
const backlogPath = ensureInside(repoRoot, path.join(repoRoot, config.canonicalBacklog));
const gitCommonDir = path.resolve(repoRoot, execFileSync('git', ['rev-parse', '--git-common-dir'], {
    cwd: repoRoot,
    encoding: 'utf8',
}).trim());
function canonicalPathWithMissingSuffix(candidate) {
    let existing = path.resolve(candidate);
    const suffix = [];
    while (!fs.existsSync(existing)) {
        const parent = path.dirname(existing);
        if (parent === existing) break;
        suffix.unshift(path.basename(existing));
        existing = parent;
    }
    return path.resolve(fs.realpathSync.native(existing), ...suffix);
}

const defaultStateKey = sha256(fs.realpathSync.native(gitCommonDir)).slice(0, 24);
const stateRoot = canonicalPathWithMissingSuffix(process.env.YOMU_ACADEMY_WORKFLOW_STATE
    ? process.env.YOMU_ACADEMY_WORKFLOW_STATE
    : path.join(os.homedir(), '.local/state/yomu/academy-production-workflow', defaultStateKey));
const statePath = path.join(stateRoot, 'state.json');
const proofRoot = path.join(stateRoot, 'proofs');
const workOrderRoot = path.join(stateRoot, 'work-orders');
const workflowLockPath = path.join(stateRoot, '.workflow.lock');
const unreachableCachePath = path.join(stateRoot, 'reuse-index', 'unreachable-commits.json');
const transcriptCachePath = path.join(stateRoot, 'reuse-index', 'transcripts.json');
const sourceSnapshotRoot = path.join(stateRoot, 'reuse-index', 'source-snapshots');
const productionLedgerPath = path.join(stateRoot, 'production-ledger.json');
const gitIndexPath = path.resolve(repoRoot, execFileSync('git', ['rev-parse', '--git-path', 'index'], {
    cwd: repoRoot,
    encoding: 'utf8',
}).trim());

function governanceBindings(required = true) {
    const loaded = loadGovernanceTrustStore(repoRoot, { required });
    if (!loaded.store || loaded.errors?.length) {
        if (required) throw new Error(loaded.errors?.join('\n') || 'Governance trust store is unavailable');
        return { loaded, bindings: null };
    }
    return { loaded, bindings: trustBindings(config, loaded.store) };
}

function load() {
    const markdown = fs.readFileSync(backlogPath, 'utf8');
    return { markdown, backlogSha: sha256(markdown), tasks: parseBacklog(markdown, config) };
}

function loadState() {
    if (!fs.existsSync(statePath)) return { schema: 'yomu-academy.production-workflow-state/v2', claims: [], promotions: [], releases: [] };
    const state = readJson(statePath);
    if (state.schema !== 'yomu-academy.production-workflow-state/v2') {
        state.schema = 'yomu-academy.production-workflow-state/v2';
        for (const claim of state.claims ?? []) {
            if (!claim.token || !claim.expiresAt) claim.status = 'legacy-expired';
        }
    }
    return state;
}

function stateBody(state) {
    return `${JSON.stringify(state, null, 2)}\n`;
}

function saveState(state, kind = 'state-update') {
    commitFileTransition(stateRoot, kind, [{ path: statePath, value: stateBody(state) }]);
}

function printRecoveryStatus() {
    const transition = inspectFileTransition(stateRoot);
    console.log(`File transition: ${transition.status}`);
    if (transition.journal) {
        console.log(`- ${transition.journal.kind} ${transition.journal.id}`);
        for (const file of transition.files ?? []) console.log(`  ${file.state}: ${file.path}`);
        if (transition.recommended) console.log(`  automatic action: ${transition.recommended}`);
    }
}

function recoverWorkflow(mode = 'auto') {
    const fileResult = recoverFileTransition(stateRoot, mode);
    console.log(`File recovery: ${fileResult.action}`);
}

function withLock(lockPath, callback) {
    fs.mkdirSync(stateRoot, { recursive: true });
    const owner = {
        token: crypto.randomUUID(),
        pid: process.pid,
        hostname: os.hostname(),
        createdAt: new Date().toISOString(),
    };
    let descriptor;
    const deadline = Date.now() + 30_000;
    for (let attempt = 0; Date.now() < deadline; attempt += 1) {
        try {
            descriptor = fs.openSync(lockPath, 'wx', 0o600);
            fs.writeFileSync(descriptor, `${JSON.stringify(owner)}\n`);
            break;
        } catch (error) {
            if (error?.code !== 'EEXIST') throw error;
            let existing = null;
            try {
                existing = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
            } catch {
                // A crashed writer may leave an empty lock; age decides recovery.
            }
            let lockStat;
            try {
                lockStat = fs.statSync(lockPath);
            } catch (statError) {
                if (statError?.code === 'ENOENT') continue;
                throw statError;
            }
            const ageMs = Date.now() - lockStat.mtimeMs;
            let alive = false;
            if (existing?.hostname === os.hostname() && Number.isInteger(existing.pid)) {
                try {
                    process.kill(existing.pid, 0);
                    alive = true;
                } catch (signalError) {
                    alive = signalError?.code === 'EPERM';
                }
            }
            const remotelyFresh = existing?.hostname && existing.hostname !== os.hostname() && ageMs < 60 * 60 * 1000;
            const unreadableFresh = !existing && ageMs < 30_000;
            if (alive || remotelyFresh || unreadableFresh) {
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(50 + attempt * 10, 250));
                continue;
            }
            let before;
            try {
                before = fs.lstatSync(lockPath);
            } catch (statError) {
                if (statError?.code === 'ENOENT') continue;
                throw statError;
            }
            const quarantined = `${lockPath}.stale.${crypto.randomUUID()}`;
            try {
                fs.renameSync(lockPath, quarantined);
            } catch (renameError) {
                if (renameError?.code === 'ENOENT') continue;
                throw renameError;
            }
            const moved = fs.lstatSync(quarantined);
            if (before.dev !== moved.dev || before.ino !== moved.ino) {
                if (!fs.existsSync(lockPath)) fs.renameSync(quarantined, lockPath);
                throw new Error(`Workflow lock changed during stale recovery: ${path.basename(lockPath)}`);
            }
            fs.unlinkSync(quarantined);
        }
    }
    if (descriptor === undefined) throw new Error(`Unable to acquire workflow lock: ${path.basename(lockPath)}`);
    const release = () => {
        fs.closeSync(descriptor);
        try {
            const current = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
            if (current.token === owner.token) fs.unlinkSync(lockPath);
        } catch {
            // Another process cannot legitimately replace a held lock; leave anomalies for stale recovery.
        }
    };
    let result;
    try {
        result = callback();
    } catch (error) {
        release();
        throw error;
    }
    if (result && typeof result.then === 'function') return result.finally(release);
    release();
    return result;
}

function taskById(tasks, id) {
    const task = tasks.find(row => row.id === id);
    if (!task) throw new Error(`Unknown canonical task ${id}`);
    return task;
}

function git(...args) {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function gitLines(...args) {
    const output = git(...args);
    return output ? output.split(/\r?\n/u) : [];
}

function gitSucceeds(...args) {
    return spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).status === 0;
}

function indexWithPathAtCommit(relativePath, commit) {
    fs.mkdirSync(stateRoot, { recursive: true });
    const temporary = path.join(stateRoot, `.index-${process.pid}-${crypto.randomUUID()}`);
    try {
        if (fs.existsSync(gitIndexPath)) fs.copyFileSync(gitIndexPath, temporary);
        else execFileSync('git', ['read-tree', 'HEAD'], { cwd: repoRoot, env: { ...process.env, GIT_INDEX_FILE: temporary } });
        execFileSync('git', ['restore', '--staged', `--source=${commit}`, '--', relativePath], {
            cwd: repoRoot,
            env: { ...process.env, GIT_INDEX_FILE: temporary },
        });
        return fs.readFileSync(temporary);
    } finally {
        fs.rmSync(temporary, { force: true });
    }
}

function injectWorkflowCrash(kind, point) {
    const requested = process.env.YOMU_ACADEMY_WORKFLOW_CRASH_AT;
    if (requested !== `${kind}:${point}` && requested !== point) return;
    process.stderr.write(`Injected workflow crash at ${kind}:${point}\n`);
    process.exit(86);
}

function cleanStatus() {
    const output = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
        cwd: repoRoot,
        encoding: 'utf8',
    }).trimEnd();
    return output ? output.split(/\r?\n/u) : [];
}

function routeCensusRows() {
    return (config.routeCensus ?? []).map(spec => {
        const absolute = ensureInside(repoRoot, path.join(repoRoot, spec.path));
        if (spec.kind === 'directory-files') {
            if (!fs.statSync(absolute).isDirectory()) throw new Error(`Route census source is not a directory: ${spec.path}`);
            const pattern = new RegExp(spec.include, 'u');
            const ids = fs.readdirSync(absolute, { withFileTypes: true })
                .filter(entry => entry.isFile() && pattern.test(entry.name))
                .map(entry => entry.name)
                .sort();
            return {
                id: spec.id,
                kind: spec.kind,
                count: ids.length,
                claim: spec.claim,
                source: { path: spec.path, sha256: sha256(JSON.stringify(ids)) },
            };
        }
        if (spec.kind === 'typescript-object-ids') {
            const source = fs.readFileSync(absolute, 'utf8');
            const start = source.indexOf(spec.start);
            const end = source.indexOf(spec.end, start + spec.start.length);
            if (start < 0 || end < 0 || end <= start) throw new Error(`Route census markers are missing for ${spec.id}`);
            const pattern = new RegExp(spec.idPattern, 'gmu');
            const ids = [...source.slice(start, end).matchAll(pattern)].map(match => match[1]).sort();
            if (!ids.length || new Set(ids).size !== ids.length) throw new Error(`Route census ${spec.id} has no unique ids`);
            return {
                id: spec.id,
                kind: spec.kind,
                count: ids.length,
                claim: spec.claim,
                source: { path: spec.path, sha256: sha256(source) },
            };
        }
        throw new Error(`Unsupported route census kind ${spec.kind}`);
    });
}

function checkpointRecordValid(promotion, canonicalRemoteFresh) {
    if (!canonicalRemoteFresh) return false;
    if (!promotion?.checkpointCommit || !promotion?.headCommit) return false;
    try {
        if (git('rev-parse', `${promotion.checkpointCommit}^`) !== promotion.headCommit) return false;
        if (!gitSucceeds('merge-base', '--is-ancestor', promotion.checkpointCommit, 'origin/main')) return false;
        const changed = gitLines('diff-tree', '--no-commit-id', '--name-only', '-r', promotion.checkpointCommit);
        return changed.length === 1
            && changed[0] === config.canonicalBacklog
            && backlogShaAtCommit(promotion.checkpointCommit) === promotion.expectedBacklogSha256;
    } catch {
        return false;
    }
}

function proofLedgerRows(tasks, state, canonicalRemoteFresh) {
    const latestPromotion = new Map();
    for (const promotion of state.promotions ?? []) latestPromotion.set(promotion.taskId, promotion);
    return Object.fromEntries(tasks.flatMap(task => {
        const candidate = proofFile(task.id);
        if (!fs.existsSync(candidate)) return [];
        try {
            const proof = readJson(candidate);
            return [[task.id, {
                proof,
                sha256: sha256(fs.readFileSync(candidate)),
                evidenceManifestSha256: evidenceManifestSha256(proof),
                checkpointValid: checkpointRecordValid(latestPromotion.get(task.id), canonicalRemoteFresh),
                valid: validateProof(task, proof, '', {
                    taskDefinitionSha256: taskDefinitionSha256(task),
                }).length === 0,
            }]];
        } catch {
            return [];
        }
    }));
}

function writeProductionLedger(tasks, markdown, state) {
    const refresh = spawnSync('git', ['fetch', '--quiet', 'origin', 'main'], {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
    });
    const canonicalBranch = {
        ref: 'origin/main',
        fresh: refresh.status === 0,
        observedAt: new Date().toISOString(),
        error: refresh.status === 0 ? null : (refresh.stderr || refresh.stdout || `git fetch exited ${refresh.status}`).trim(),
    };
    if (!canonicalBranch.fresh) {
        console.warn(`warning: canonical origin/main could not be refreshed; checked tasks are downgraded: ${canonicalBranch.error}`);
    }
    const ledger = buildProductionLedger(tasks, config, state, proofLedgerRows(tasks, state, canonicalBranch.fresh), routeCensusRows(), {
        generatedAt: new Date().toISOString(),
        headCommit: safeHead(),
        backlogSha256: sha256(markdown),
        canonicalBranch,
    });
    commitFileTransition(stateRoot, 'production-ledger', [{
        path: productionLedgerPath,
        value: `${JSON.stringify(ledger, null, 2)}\n`,
    }], { backlogSha256: ledger.backlog.sha256, headCommit: ledger.headCommit });
    return ledger;
}

function parseCommitMetadata(output) {
    const rows = [];
    let current = null;
    for (const line of String(output).split(/\r?\n/u)) {
        if (line.startsWith('__YOMU_COMMIT__')) {
            const [hash, ...subject] = line.slice('__YOMU_COMMIT__'.length).split('\t');
            current = { hash, subject: subject.join('\t'), changedPaths: [] };
            rows.push(current);
        } else if (current && line.trim()) {
            current.changedPaths.push(line.trim());
        }
    }
    for (const row of rows) row.changedPaths = [...new Set(row.changedPaths)].sort((a, b) => a.localeCompare(b, 'en'));
    return rows;
}

function unreachableObjectManifest() {
    const result = spawnSync('git', ['fsck', '--unreachable', '--no-reflogs', '--full', '--no-progress'], {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });
    if (result.status !== 0) throw new Error(`git fsck failed: ${result.stderr || result.stdout}`);
    const objects = (result.stdout ?? '').split(/\r?\n/u)
        .map(line => /^(?:unreachable|dangling) (blob|commit|tag|tree) ([a-f0-9]{40,64})$/u.exec(line))
        .filter(Boolean)
        .map(match => ({ type: match[1], hash: match[2] }))
        .sort((left, right) => left.type.localeCompare(right.type, 'en') || left.hash.localeCompare(right.hash, 'en'));
    return { objects, sha256: sha256(JSON.stringify(objects)) };
}

function reachableCommitMetadata() {
    const result = spawnSync('git', [
        'log', '--all', '--format=__YOMU_COMMIT__%H%x09%s', '--name-only', '--no-renames',
    ], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`Unable to scan reachable commit paths: ${result.stderr}`);
    return parseCommitMetadata(result.stdout);
}

function transcriptRoots() {
    return Object.entries(rawConfig.reuse?.transcriptRoots ?? {}).map(([name, spec]) => ({
        name,
        path: process.env[spec.env] || spec.default,
    }));
}

function transcriptFiles(root) {
    if (!fs.existsSync(root)) return [];
    const files = [];
    const pending = [root];
    while (pending.length) {
        const current = pending.pop();
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const absolute = path.join(current, entry.name);
            if (entry.isDirectory()) pending.push(absolute);
            else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(absolute);
        }
    }
    return files.sort((left, right) => left.localeCompare(right, 'en'));
}

function transcriptManifest() {
    const roots = transcriptRoots();
    const files = roots.flatMap(root => transcriptFiles(root.path).map(absolute => {
        const stat = fs.statSync(absolute);
        return {
            root: root.name,
            path: fs.realpathSync.native(absolute),
            bytes: stat.size,
            mtimeMs: Math.trunc(stat.mtimeMs),
            sha256: sha256(fs.readFileSync(absolute)),
        };
    }));
    return {
        roots: roots.map(root => ({ ...root, fileCount: files.filter(file => file.root === root.name).length })),
        files,
        sha256: sha256(JSON.stringify(files.map(file => ({ root: file.root, path: file.path, bytes: file.bytes, sha256: file.sha256 })))),
    };
}

function transcriptLexicalSummary(text) {
    const words = text.normalize('NFKC').match(/[\p{L}\p{N}_-]{3,128}/gu) ?? [];
    return [...new Set(words.map(word => word.toLocaleLowerCase('en')))]
        .sort((left, right) => left.localeCompare(right, 'en'))
        .join(' ');
}

function indexTranscripts() {
    const manifest = transcriptManifest();
    const rows = [];
    for (const file of manifest.files) {
        const content = fs.readFileSync(file.path, 'utf8');
        const lexicalSummary = transcriptLexicalSummary(content);
        const threadId = path.basename(file.path, '.jsonl');
        rows.push({
            id: threadId,
            threadId,
            path: file.path,
            title: path.basename(path.dirname(file.path)),
            summary: lexicalSummary,
            metadata: { bytes: file.bytes, mtimeMs: file.mtimeMs, contentSha256: file.sha256, completeContentScan: true },
        });
    }
    commitFileTransition(stateRoot, 'transcript-index', [{ path: transcriptCachePath, value: `${JSON.stringify({
        schema: 'yomu-academy.transcript-index/v2',
        generatedAt: new Date().toISOString(),
        manifest: {
            roots: manifest.roots,
            sha256: manifest.sha256,
            fileCount: manifest.files.length,
            files: manifest.files,
        },
        rows,
    })}\n` }], { manifestSha256: manifest.sha256, fileCount: manifest.files.length });
    console.log(`Fully indexed ${rows.length} transcript(s) -> ${path.relative(repoRoot, transcriptCachePath)}`);
}

function transcriptIndexFresh(cache) {
    if (!cache || cache.schema !== 'yomu-academy.transcript-index/v2') return false;
    const generatedAt = Date.parse(cache.generatedAt);
    const maxAgeMs = (config.reuse.transcriptIndexMaxAgeHours ?? 24) * 60 * 60 * 1000;
    if (Number.isNaN(generatedAt) || Date.now() - generatedAt > maxAgeMs) return false;
    const cachedFiles = cache.manifest?.files;
    if (!Array.isArray(cachedFiles)) return false;
    const current = transcriptManifest();
    const identity = files => files.map(file => ({ root: file.root, path: file.path, bytes: file.bytes, sha256: file.sha256 }));
    return cache.manifest?.sha256 === current.sha256
        && JSON.stringify(identity(cachedFiles)) === JSON.stringify(identity(current.files));
}

function reuseSources() {
    const documents = config.reuse.evidenceFiles
        .map(relativePath => ({ path: relativePath, absolute: path.join(repoRoot, relativePath) }))
        .filter(row => fs.existsSync(row.absolute))
        .map(row => ({ path: row.path, text: fs.readFileSync(row.absolute, 'utf8') }));
    const commits = reachableCommitMetadata();
    const branches = gitLines('for-each-ref', '--format=%(refname:short)%09%(objectname)%09%(subject)', 'refs/heads', 'refs/remotes/origin')
        .map(line => {
            const [name, head, ...subject] = line.split('\t');
            const counts = spawnSync('git', ['rev-list', '--left-right', '--count', `origin/main...${name}`], {
                cwd: repoRoot,
                encoding: 'utf8',
            });
            const [behind, ahead] = (counts.stdout ?? '').trim().split(/\s+/u).map(Number);
            const changed = spawnSync('git', ['diff', '--name-only', `origin/main...${name}`], {
                cwd: repoRoot,
                encoding: 'utf8',
                maxBuffer: 64 * 1024 * 1024,
            });
            if (changed.status !== 0) throw new Error(`Unable to scan branch ${name}: ${changed.stderr}`);
            const changedTrackedPaths = changed.stdout?.trim().split(/\r?\n/u).filter(Boolean) ?? [];
            const cherry = spawnSync('git', ['cherry', 'origin/main', name], {
                cwd: repoRoot,
                encoding: 'utf8',
                maxBuffer: 8 * 1024 * 1024,
            });
            if (cherry.status !== 0) throw new Error(`Unable to classify branch patches for ${name}: ${cherry.stderr}`);
            const cherryRows = (cherry.stdout ?? '').trim().split(/\r?\n/u).filter(Boolean);
            const patchEquivalentCommits = cherryRows.filter(line => line.startsWith('- ')).map(line => line.slice(2));
            const uniqueCommits = cherryRows.filter(line => line.startsWith('+ ')).map(line => line.slice(2));
            return {
                name,
                head,
                subject: subject.join('\t'),
                ahead: Number.isInteger(ahead) ? ahead : null,
                behind: Number.isInteger(behind) ? behind : null,
                changedTrackedPaths,
                untrackedPaths: [],
                patchEquivalentCommits,
                uniqueCommits,
                patchEquivalentToOriginMain: patchEquivalentCommits.length > 0 && uniqueCommits.length === 0,
            };
        });
    const patchEquivalentCommits = new Set(branches.flatMap(row => row.patchEquivalentCommits));
    for (const row of commits) row.patchEquivalentToOriginMain = patchEquivalentCommits.has(row.hash);
    const worktrees = [];
    let current = null;
    for (const line of gitLines('worktree', 'list', '--porcelain')) {
        if (line.startsWith('worktree ')) {
            current = { path: line.slice('worktree '.length) };
            worktrees.push(current);
        } else if (current && line.startsWith('HEAD ')) current.head = line.slice('HEAD '.length);
        else if (current && line.startsWith('branch ')) current.branch = line.slice('branch '.length);
    }
    for (const row of worktrees) {
        if (!fs.existsSync(row.path)) continue;
        const status = spawnSync('git', ['-C', row.path, 'status', '--porcelain=v1', '--untracked-files=all'], { encoding: 'utf8' });
        const statusText = status.stdout ?? '';
        row.statusText = statusText;
        row.diffText = spawnSync('git', ['-C', row.path, 'diff', '--name-status', 'HEAD'], {
            encoding: 'utf8',
            maxBuffer: 8 * 1024 * 1024,
        }).stdout ?? '';
        row.changedTrackedPaths = statusText.split(/\r?\n/u)
            .filter(line => line && !line.startsWith('??'))
            .map(line => line.slice(3).trim());
        row.untrackedPaths = statusText.split(/\r?\n/u)
            .filter(line => line.startsWith('??'))
            .map(line => line.slice(3).trim());
        const counts = spawnSync('git', ['-C', row.path, 'rev-list', '--left-right', '--count', `origin/main...${row.head}`], { encoding: 'utf8' });
        const [behind, ahead] = (counts.stdout ?? '').trim().split(/\s+/u).map(Number);
        row.ahead = Number.isInteger(ahead) ? ahead : null;
        row.behind = Number.isInteger(behind) ? behind : null;
        row.statusSha256 = sha256(row.statusText);
        row.diffSha256 = sha256(row.diffText);
        delete row.statusText;
        delete row.diffText;
    }
    const stashes = gitLines('stash', 'list', '--format=%H%x09%gd%x09%gs').map(line => {
        const [hash, ref, ...subject] = line.split('\t');
        return { hash, ref, subject: subject.join('\t'), changedPaths: gitLines('stash', 'show', '--name-only', ref) };
    });
    const reflog = gitLines('reflog', '--all', '--format=%H%x09%gd%x09%gs').map(line => {
        const [hash, ref, ...subject] = line.split('\t');
        return { hash, ref, subject: subject.join('\t') };
    });
    const danglingCache = fs.existsSync(unreachableCachePath) ? readJson(unreachableCachePath) : null;
    const transcriptCache = fs.existsSync(transcriptCachePath) ? readJson(transcriptCachePath) : null;
    const sources = {
        documents,
        commits,
        branches,
        worktrees,
        stashes,
        reflog,
        danglingCommits: danglingCache?.rows ?? [],
        transcripts: transcriptCache?.rows ?? [],
    };
    return {
        sources,
        scanMeta: {
            danglingCache: danglingCache ? {
                status: danglingCache.schema === 'yomu-academy.unreachable-index/v2' ? 'cached' : 'stale',
                generatedAt: danglingCache.generatedAt,
                originMain: danglingCache.originMain,
                objectManifestSha256: danglingCache.objectManifest?.sha256,
                sha256: sha256(fs.readFileSync(unreachableCachePath)),
            } : { status: 'missing' },
            transcriptCache: transcriptCache ? {
                status: transcriptIndexFresh(transcriptCache) ? 'cached' : 'stale',
                generatedAt: transcriptCache.generatedAt,
                manifestSha256: transcriptCache.manifest?.sha256,
                sha256: sha256(fs.readFileSync(transcriptCachePath)),
            } : { status: 'missing' },
        },
    };
}

function persistSourceSnapshot(bundle) {
    const payload = {
        schema: 'yomu-academy.salvage-source-snapshot/v1',
        originMain: git('rev-parse', 'origin/main'),
        scanMeta: bundle.scanMeta,
        sources: bundle.sources,
    };
    const body = `${JSON.stringify(payload)}\n`;
    const compressed = gzipSync(Buffer.from(body), { level: 9, mtime: 0 });
    const digest = sha256(compressed);
    const outputPath = path.join(sourceSnapshotRoot, `${digest}.json.gz`);
    fs.mkdirSync(sourceSnapshotRoot, { recursive: true });
    if (fs.existsSync(outputPath)) {
        if (sha256(fs.readFileSync(outputPath)) !== digest) {
            throw new Error(`Source snapshot is corrupt: ${path.relative(repoRoot, outputPath)}`);
        }
    } else {
        commitFileTransition(stateRoot, 'source-snapshot', [{ path: outputPath, value: compressed }], { sha256: digest });
    }
    return {
        originMain: payload.originMain,
        reference: evidenceReference(outputPath),
        sources: bundle.sources,
    };
}

function readSourceSnapshot(report) {
    const reference = report?.sourceSnapshot;
    if (!reference?.path || !reference?.sha256) throw new Error('Reuse report lacks a hashed source snapshot');
    const actual = evidenceReference(reference.path);
    if (actual.sha256 !== reference.sha256) throw new Error('Reuse source snapshot hash does not match its contents');
    const snapshotPath = secureEvidencePath(reference.path).absolute;
    const snapshot = reference.path.endsWith('.gz')
        ? JSON.parse(gunzipSync(fs.readFileSync(snapshotPath)).toString('utf8'))
        : readJson(snapshotPath);
    if (snapshot.schema !== 'yomu-academy.salvage-source-snapshot/v1') {
        throw new Error('Reuse source snapshot has an unsupported schema');
    }
    if (!snapshot.sources || typeof snapshot.sources !== 'object') {
        throw new Error('Reuse source snapshot has no source inventory');
    }
    return snapshot;
}

function writeSalvageReport(task, bundle = reuseSources(), snapshot = persistSourceSnapshot(bundle)) {
    const { sources, scanMeta } = bundle;
    const outputRoot = path.join(stateRoot, 'reuse');
    const outputPath = path.join(outputRoot, `${task.id}.json`);
    const previous = fs.existsSync(outputPath) ? readJson(outputPath) : null;
    const previousById = new Map((previous?.candidates ?? []).map(candidate => [candidate.candidateId, candidate]));
    const report = buildSalvageReport(task, sources, {
        baseScan: {
            repository: repoRoot,
            originMain: snapshot.originMain,
            sourceCounts: Object.fromEntries(Object.entries(sources).map(([name, rows]) => [name, rows.length])),
            ...scanMeta,
        },
        compactInventory: true,
        sourceSnapshot: snapshot.reference,
    });
    for (const candidate of report.candidates) {
        const earlier = previousById.get(candidate.candidateId);
        if (earlier?.evidenceSha256 === candidate.evidenceSha256
            && ['reuse', 'reject'].includes(earlier.disposition?.status)) {
            candidate.disposition = structuredClone(earlier.disposition);
        }
    }
    const decided = report.candidates.filter(candidate => ['reuse', 'reject'].includes(candidate.disposition.status));
    report.decision = {
        status: decided.length === report.candidates.length ? 'complete' : 'pending',
        candidateCount: report.candidates.length,
        reuseCount: decided.filter(candidate => candidate.disposition.status === 'reuse').length,
        rejectCount: decided.filter(candidate => candidate.disposition.status === 'reject').length,
    };
    commitFileTransition(stateRoot, 'salvage-report', [{
        path: outputPath,
        value: `${JSON.stringify(report, null, 2)}\n`,
    }], { taskId: task.id, sourceSnapshotSha256: report.sourceSnapshot.sha256 });
    console.log(`${task.id}: scanned ${report.inventory.counts.total} sources, found ${report.candidates.length} candidate(s) -> ${path.relative(repoRoot, outputPath)}`);
    return { report, outputPath };
}

function indexUnreachableCommits() {
    const objectManifest = unreachableObjectManifest();
    const hashes = objectManifest.objects.filter(row => row.type === 'commit').map(row => row.hash);
    const rows = [];
    for (let index = 0; index < hashes.length; index += 200) {
        const batch = hashes.slice(index, index + 200);
        const output = spawnSync('git', [
            'show', '--format=__YOMU_COMMIT__%H%x09%s', '--name-only', '--no-renames', ...batch,
        ], {
            cwd: repoRoot,
            encoding: 'utf8',
            maxBuffer: 64 * 1024 * 1024,
        });
        if (output.status !== 0) throw new Error(`Unable to index unreachable commit metadata: ${output.stderr}`);
        rows.push(...parseCommitMetadata(output.stdout));
    }
    commitFileTransition(stateRoot, 'unreachable-index', [{ path: unreachableCachePath, value: `${JSON.stringify({
        schema: 'yomu-academy.unreachable-index/v2',
        generatedAt: new Date().toISOString(),
        originMain: git('rev-parse', 'origin/main'),
        objectManifest,
        rows,
    }, null, 2)}\n` }], { objectManifestSha256: objectManifest.sha256, commitCount: rows.length });
    console.log(`Indexed ${rows.length} unreachable commit(s) -> ${path.relative(repoRoot, unreachableCachePath)}`);
}

function ensureValid(tasks) {
    const result = validateWorkflow(tasks, config);
    try {
        const trust = governanceBindings(false);
        if (!trust.loaded.store) result.warnings.push(...trust.loaded.errors);
    } catch (error) {
        result.errors.push(`External governance trust policy is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
    for (const [name, spec] of Object.entries(rawConfig.externalRoots ?? {})) {
        if (!spec?.env || !spec?.default) result.errors.push(`External root ${name} needs env and default`);
        if (!fs.existsSync(config.externalRoots[name])) result.warnings.push(`External root ${name} is unavailable: ${config.externalRoots[name]}`);
    }
    for (const relativePath of config.reuse?.evidenceFiles ?? []) {
        try {
            ensureInside(repoRoot, path.join(repoRoot, relativePath));
        } catch (error) {
            result.errors.push(error instanceof Error ? error.message : String(error));
        }
    }
    if (result.warnings.length) for (const warning of result.warnings) console.warn(`warning: ${warning}`);
    if (result.errors.length) throw new Error(result.errors.join('\n'));
}

function printStatus(tasks, markdown, state) {
    const ledger = writeProductionLedger(tasks, markdown, state);
    const summary = ledger.progress;
    const active = activeClaims(state, new Date());
    console.log(`Academy production: ${summary.complete}/${summary.total} (${summary.percent}%)`);
    for (const [priority, counts] of Object.entries(summary.byPriority)) {
        console.log(`${priority}: ${counts.complete}/${counts.total}`);
    }
    console.log(`Active claims: ${active.length}`);
    for (const claim of active) console.log(`- ${claim.taskId} -> ${claim.owner} [${claim.lane}]`);
    console.log('Route census:');
    for (const route of ledger.routeCounts) console.log(`- ${route.id}: ${route.count} (${route.claim})`);
    console.log(`Ledger: @workflow-state/${path.relative(stateRoot, productionLedgerPath)}`);
}

function writePlan(tasks, markdown, state) {
    const backlogSha = sha256(markdown);
    const plan = buildPlan(tasks, config, state);
    fs.mkdirSync(workOrderRoot, { recursive: true });
    const sources = reuseSources();
    const sourceSnapshot = persistSourceSnapshot(sources);
    const writes = [];
    for (const task of plan.selected) {
        const salvage = writeSalvageReport(task, sources, sourceSnapshot);
        writes.push({ path: path.join(workOrderRoot, `${task.id}.md`), value: createWorkOrder(task, config, backlogSha) });
        const proofPath = path.join(proofRoot, `${task.id}.json`);
        const existingProof = fs.existsSync(proofPath) ? readJson(proofPath) : null;
        if (!existingProof || existingProof.schema !== 'yomu-academy.production-proof/v2'
            || existingProof.taskDefinitionSha256 !== taskDefinitionSha256(task)) {
            const proof = proofTemplate(task, config, safeHead());
            proof.backlogSha256 = backlogSha;
            proof.reuseAudit.report = evidenceReference(salvage.outputPath);
            writes.push({ path: proofPath, value: `${JSON.stringify(proof, null, 2)}\n` });
        }
    }
    writes.push({ path: path.join(stateRoot, 'latest-plan.json'), value: `${JSON.stringify(plan, null, 2)}\n` });
    commitFileTransition(stateRoot, 'plan-materialization', writes, { selectedTaskIds: plan.selected.map(task => task.id) });
    pruneSourceSnapshots(state, plan.selected.map(task => task.id));
    console.log(`Selected ${plan.selected.length}/${plan.readyCount} ready tasks (${plan.activeClaims.length} active claims):`);
    for (const task of plan.selected) {
        console.log(`- ${task.id} [${task.lane.id}] score=${task.score} unlocks=${task.unlocks}`);
    }
    console.log(`Work orders: ${path.relative(repoRoot, workOrderRoot)}`);
}

function pruneSourceSnapshots(state = loadState(), selectedTaskIds = []) {
    if (!fs.existsSync(sourceSnapshotRoot)) return;
    const keepTasks = new Set([
        ...selectedTaskIds,
        ...activeClaims(state, new Date()).map(claim => claim.taskId),
    ]);
    const keep = new Set();
    for (const taskId of keepTasks) {
        const reportPath = path.join(stateRoot, 'reuse', `${taskId}.json`);
        if (!fs.existsSync(reportPath)) continue;
        try {
            const report = readJson(reportPath);
            const reference = report.sourceSnapshot?.path;
            if (reference?.startsWith('@workflow-state/')) {
                keep.add(path.basename(reference));
            }
        } catch {
            // A malformed report cannot keep a large snapshot alive.
        }
    }
    let removed = 0;
    let bytes = 0;
    const removals = [];
    for (const entry of fs.readdirSync(sourceSnapshotRoot, { withFileTypes: true })) {
        if (!entry.isFile() || keep.has(entry.name)) continue;
        const target = path.join(sourceSnapshotRoot, entry.name);
        const stat = fs.statSync(target);
        removals.push({ path: target, remove: true });
        removed += 1;
        bytes += stat.size;
    }
    if (removals.length) commitFileTransition(stateRoot, 'source-snapshot-prune', removals, { removed, bytes });
    if (removed) console.log(`Pruned ${removed} unreferenced source snapshot(s), ${bytes} byte(s)`);
}

function safeHead() {
    try {
        return git('rev-parse', 'HEAD');
    } catch {
        return null;
    }
}

function normalizedReservations(task, values) {
    const rawFiles = values.flatMap(value => String(value).split(',')).map(value => value.trim()).filter(Boolean);
    const files = [];
    const keys = new Set();
    for (const file of rawFiles) {
        const unicodeNormalized = file.normalize('NFC');
        const normalized = path.posix.normalize(unicodeNormalized);
        if (file !== unicodeNormalized || file !== normalized || file.includes('\\') || file.includes('//')) {
            throw new Error(`Reserved file path must already be canonical: ${file}`);
        }
        if (path.posix.isAbsolute(normalized) || normalized === '.' || normalized.startsWith('../') || normalized.endsWith('/')) {
            throw new Error(`Unsafe reserved file path: ${file}`);
        }
        const physical = canonicalizeReservationPath(repoRoot, normalized);
        const key = reservationKey(physical);
        if (!keys.has(key)) files.push(physical);
        keys.add(key);
    }
    files.sort((left, right) => left.localeCompare(right, 'en'));
    if (!files.length) throw new Error('claim requires --paths FILE[,FILE...] with the exact planned write set');
    const lane = laneForTask(task, config);
    const outside = changedFilesWithinOwnership(files, lane?.ownership ?? []);
    if (outside.length) throw new Error(`Reserved files escape ${lane?.id} ownership: ${outside.join(', ')}`);
    return files;
}

function reservationKey(file) {
    return canonicalizeReservationPath(
        repoRoot,
        path.posix.normalize(file.normalize('NFC')),
    ).toLocaleLowerCase('en-US');
}

function assertReuseReady(task) {
    const reportPath = path.join(stateRoot, 'reuse', `${task.id}.json`);
    if (!fs.existsSync(reportPath)) throw new Error(`Run salvage ${task.id} and disposition every candidate before claiming`);
    const text = fs.readFileSync(reportPath, 'utf8');
    const report = JSON.parse(text);
    const snapshot = readSourceSnapshot(report);
    const reference = evidenceReference(reportPath);
    const errors = validateSalvageReport(report, {
        task,
        sources: snapshot.sources,
        reportFile: { path: reference.path, text, sha256: reference.sha256 },
    });
    const originMain = git('rev-parse', 'origin/main');
    if (snapshot.originMain !== originMain || report.baseScan?.originMain !== originMain) {
        errors.push('Reuse audit must be regenerated against current origin/main');
    }
    if (report.baseScan?.danglingCache?.status !== 'cached') errors.push('Run index-unreachable before claiming work');
    if (report.baseScan?.transcriptCache?.status !== 'cached') errors.push('Run index-transcripts before claiming work');
    if (!fs.existsSync(unreachableCachePath)
        || report.baseScan?.danglingCache?.sha256 !== sha256(fs.readFileSync(unreachableCachePath))) {
        errors.push('Reuse audit does not match the current unreachable-commit index');
    } else {
        const unreachableCache = readJson(unreachableCachePath);
        const currentObjects = unreachableObjectManifest();
        if (unreachableCache.schema !== 'yomu-academy.unreachable-index/v2'
            || unreachableCache.objectManifest?.sha256 !== currentObjects.sha256
            || report.baseScan?.danglingCache?.objectManifestSha256 !== currentObjects.sha256) {
            errors.push('Reuse audit does not match a complete current unreachable-object scan');
        }
    }
    const transcriptCache = fs.existsSync(transcriptCachePath) ? readJson(transcriptCachePath) : null;
    if (!transcriptIndexFresh(transcriptCache)
        || report.baseScan?.transcriptCache?.sha256 !== (transcriptCache ? sha256(fs.readFileSync(transcriptCachePath)) : null)) {
        errors.push('Reuse audit does not match a current transcript index');
    }
    if (errors.length) throw new Error(errors.join('\n'));
    return reference;
}

function reservationsOverlap(left, right) {
    const rightKeys = new Set(right.map(reservationKey));
    return left.some(file => rightKeys.has(reservationKey(file)));
}

function claim(tasks, state, id, owner, requestedPaths) {
    if (!owner) throw new Error('claim requires --owner <name>');
    execFileSync('git', ['fetch', '--quiet', 'origin', 'main'], { cwd: repoRoot, stdio: 'ignore' });
    if (cleanStatus().length) throw new Error('Claims must start in a clean dedicated worktree');
    if (safeHead() !== git('rev-parse', 'origin/main')) throw new Error('Claim checkout must start exactly at current origin/main');
    const task = taskById(tasks, id);
    const reservedFiles = normalizedReservations(task, requestedPaths);
    const reuseReport = assertReuseReady(task);
    if (task.complete) throw new Error(`${id} is already complete`);
    const plan = buildPlan(tasks, config, state);
    const selectable = plan.selected.find(row => row.id === id);
    if (!selectable) throw new Error(`${id} is not dependency-ready or its lane is at capacity`);
    const conflicting = activeClaims(state, new Date()).find(row => reservationsOverlap(reservedFiles, row.reservedFiles ?? []));
    if (conflicting) throw new Error(`Reserved files collide with active claim ${conflicting.taskId}`);
    const claimedAt = new Date();
    const token = crypto.randomUUID();
    const claimRow = {
        taskId: id,
        owner,
        lane: selectable.lane.id,
        token,
        claimedAt: claimedAt.toISOString(),
        expiresAt: new Date(claimedAt.getTime() + config.claimTtlHours * 60 * 60 * 1000).toISOString(),
        status: 'active',
        baseCommit: git('rev-parse', 'origin/main'),
        claimHead: safeHead(),
        worktree: repoRoot,
        reservedFiles,
        reuseReport,
    };
    state.claims.push(claimRow);
    const orderPath = path.join(workOrderRoot, `${id}.md`);
    const order = createWorkOrder(task, config, sha256(fs.readFileSync(backlogPath, 'utf8')))
        .replace('Owner: unclaimed', `Owner: ${owner}\nClaim token: \`${token}\``);
    const proofPath = path.join(proofRoot, `${id}.json`);
    const proof = bindProofToClaim(task, config, sha256(fs.readFileSync(backlogPath, 'utf8')), claimRow);
    commitFileTransition(stateRoot, 'claim', [
        { path: statePath, value: stateBody(state) },
        { path: orderPath, value: order },
        { path: proofPath, value: `${JSON.stringify(proof, null, 2)}\n` },
    ], { taskId: id, token, reservedFiles });
    console.log(`Claimed ${id} for ${owner} in ${selectable.lane.id}; token=${token}`);
}

function renewClaim(state, id, token) {
    const row = (state.claims ?? []).find(claim => claim.taskId === id && claim.token === token && claim.status === 'active');
    if (!row || row.token !== token) throw new Error(`No active matching claim for ${id}`);
    if (Date.parse(row.expiresAt) <= Date.now()) throw new Error(`Claim ${id} has expired and cannot be renewed`);
    const conflicting = activeClaims(state, new Date()).find(claim => (
        claim.token !== token
        && (claim.taskId === id || reservationsOverlap(row.reservedFiles ?? [], claim.reservedFiles ?? []))
    ));
    if (conflicting) throw new Error(`Claim ${id} now conflicts with active claim ${conflicting.taskId}`);
    row.expiresAt = new Date(Date.now() + config.claimTtlHours * 60 * 60 * 1000).toISOString();
    row.renewedAt = new Date().toISOString();
    saveState(state);
    console.log(`Renewed ${id} until ${row.expiresAt}`);
}

function cancelClaim(state, id, token) {
    const row = (state.claims ?? []).find(claim => claim.taskId === id && claim.token === token && claim.status === 'active');
    if (!row || row.token !== token) throw new Error(`No active matching claim for ${id}`);
    row.status = 'cancelled';
    row.cancelledAt = new Date().toISOString();
    saveState(state);
    console.log(`Cancelled ${id}`);
}

function proofFile(id) {
    return ensureInside(proofRoot, path.join(proofRoot, `${id}.json`));
}

function readProof(id) {
    const target = proofFile(id);
    if (!fs.existsSync(target)) throw new Error(`Missing proof file ${path.relative(repoRoot, target)}`);
    return { target, proof: readJson(target) };
}

function writeProof(target, proof) {
    commitFileTransition(stateRoot, 'proof-update', [{
        path: target,
        value: `${JSON.stringify(proof, null, 2)}\n`,
    }], { taskId: proof.taskId });
}

function isInside(root, candidate) {
    const relative = path.relative(root, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveEvidencePath(candidate) {
    if (candidate?.startsWith('@workflow-state/')) {
        return ensureInside(stateRoot, path.join(stateRoot, candidate.slice('@workflow-state/'.length)));
    }
    const absolute = path.resolve(repoRoot, candidate);
    if (!isInside(repoRoot, absolute)) throw new Error(`Evidence path escapes the repository: ${candidate}`);
    return absolute;
}

function secureEvidencePath(candidate) {
    const lexical = path.isAbsolute(candidate) ? path.resolve(candidate) : resolveEvidencePath(candidate);
    const confined = resolveConfinedFile(lexical, [stateRoot, repoRoot]);
    return { ...confined, stateEvidence: confined.root === path.resolve(stateRoot) };
}

function evidenceReference(candidate) {
    const { absolute, realRoot, stateEvidence } = secureEvidencePath(candidate);
    const evidencePath = stateEvidence
        ? `@workflow-state/${path.relative(realRoot, absolute)}`
        : path.relative(realRoot, absolute);
    return { path: evidencePath, sha256: sha256(fs.readFileSync(absolute)) };
}

function stateValueReference(target, value) {
    const absolute = ensureInside(stateRoot, path.resolve(target));
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
    return { path: `@workflow-state/${path.relative(stateRoot, absolute)}`, sha256: sha256(bytes) };
}

function attachGateEvidence(tasks, id, gate, candidate) {
    const task = taskById(tasks, id);
    if (!task.gates.includes(gate)) throw new Error(`${id} does not require gate ${gate}`);
    const { target, proof } = readProof(id);
    const attestation = readJson(secureEvidencePath(candidate).absolute);
    const errors = validateGateAttestation(task, gate, attestation, {
        headCommit: safeHead(),
        expectedProducer: proof.owner,
        trustedGateProducers: config.trustedGateProducers,
    });
    for (const assertion of attestation.assertions ?? []) {
        for (const artifact of assertion.artifacts ?? []) {
            const actual = evidenceReference(artifact.path);
            if (actual.sha256 !== artifact.sha256) errors.push(`Gate ${gate} artifact hash mismatch: ${artifact.path}`);
        }
    }
    if (errors.length) throw new Error(errors.join('\n'));
    proof.gates[gate].evidence.push(evidenceReference(candidate));
    writeProof(target, proof);
    console.log(`Attached ${candidate} to ${id}/${gate}`);
}

function runProofCommand(tasks, id, gate, commandArgs) {
    const task = taskById(tasks, id);
    if (!task.gates.includes(gate)) throw new Error(`${id} does not require gate ${gate}`);
    if (!commandArgs.length) throw new Error('run-proof requires a command after --');
    const { target, proof } = readProof(id);
    const headCommit = safeHead();
    const startedAt = new Date().toISOString();
    const result = spawnSync(commandArgs[0], commandArgs.slice(1), {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: config.proofCommandMaxOutputBytes ?? 4 * 1024 * 1024,
    });
    const transcriptRoot = path.join(stateRoot, 'command-transcripts', id);
    const transcriptPath = path.join(transcriptRoot, `${gate}-${Date.now()}.json`);
    const transcript = {
        schema: 'yomu-academy.command-transcript/v1',
        taskId: id,
        gate,
        command: commandArgs,
        startedAt,
        finishedAt: new Date().toISOString(),
        headCommit,
        exitCode: result.status ?? 1,
        signal: result.signal ?? null,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
    };
    const transcriptBody = `${JSON.stringify(transcript, null, 2)}\n`;
    const record = {
        command: commandArgs,
        exitCode: transcript.exitCode,
        headCommit,
        recordedBy: 'academy-production-workflow',
        transcript: stateValueReference(transcriptPath, transcriptBody),
    };
    proof.gates[gate].commands.push(record);
    commitFileTransition(stateRoot, 'proof-command', [
        { path: transcriptPath, value: transcriptBody },
        { path: target, value: `${JSON.stringify(proof, null, 2)}\n` },
    ], { taskId: id, gate, exitCode: transcript.exitCode });
    if (transcript.exitCode !== 0) throw new Error(`Proof command failed with exit ${transcript.exitCode}`);
    console.log(`Recorded successful ${id}/${gate} command: ${commandArgs.join(' ')}`);
}

function attestReuse(tasks, state, id, candidate) {
    const task = taskById(tasks, id);
    const reference = evidenceReference(candidate);
    const claim = activeClaims(state, new Date()).find(row => row.taskId === id);
    if (!claim) throw new Error(`No active claim for ${id}`);
    if (reference.path !== claim.reuseReport?.path || reference.sha256 !== claim.reuseReport?.sha256) {
        throw new Error('Reuse attestation must use the exact report pinned by the active claim');
    }
    const absolute = secureEvidencePath(reference.path).absolute;
    const text = fs.readFileSync(absolute, 'utf8');
    const report = JSON.parse(text);
    const snapshot = readSourceSnapshot(report);
    const errors = validateSalvageReport(report, {
        task,
        sources: snapshot.sources,
        reportFile: { path: candidate, text, sha256: reference.sha256 },
    });
    if (report.baseScan?.danglingCache?.status !== 'cached') {
        errors.push('Run index-unreachable before attesting reuse');
    }
    if (report.baseScan?.transcriptCache?.status !== 'cached') {
        errors.push('Run index-transcripts before attesting reuse');
    }
    if (snapshot.originMain !== report.baseScan?.originMain) {
        errors.push('Reuse source snapshot and report were scanned against different origin/main commits');
    }
    if (errors.length) throw new Error(errors.join('\n'));
    const { target, proof } = readProof(id);
    proof.reuseAudit = { status: 'pass', report: reference };
    writeProof(target, proof);
    console.log(`Attested exhaustive prior-work audit for ${id}`);
}

function parseReviewPayload(value) {
    const text = String(value ?? '').trim()
        .replace(/^```(?:json)?\s*/u, '')
        .replace(/\s*```$/u, '');
    const payload = JSON.parse(text);
    if (!['ship', 'block'].includes(payload?.verdict)) throw new Error('External reviewer returned no ship/block verdict');
    if (!payload?.summary?.trim()) throw new Error('External reviewer returned no summary');
    if (!Array.isArray(payload?.scope) || payload.scope.length === 0) throw new Error('External reviewer returned no review scope');
    if (!Array.isArray(payload?.findings)) throw new Error('External reviewer findings must be an array');
    return payload;
}

function reviewEnvironment(provider) {
    const env = minimalReviewEnvironment(provider, process.env);
    if (!env.ANTHROPIC_API_KEY) {
        throw new Error('Pinned bare Claude review requires an explicit ANTHROPIC_API_KEY; ambient OAuth, keychain, and third-party provider credentials are forbidden');
    }
    return env;
}

function runExternalReview(tasks, state, id, providerId, promptCandidate) {
    const task = taskById(tasks, id);
    if (providerId !== config.requiredReviewProvider) {
        throw new Error(`Independent review must use required provider ${config.requiredReviewProvider}`);
    }
    const { loaded, bindings } = governanceBindings(true);
    const provider = bindings.provider;
    if (provider.id !== providerId) throw new Error(`Unknown trusted review provider: ${providerId}`);
    const { target, proof } = readProof(id);
    if (!proof.owner) throw new Error('Claim the task before running its independent review');
    if (provider.reviewerId === proof.owner) throw new Error('Trusted reviewer identity must differ from the task owner');
    if (cleanStatus().length) throw new Error('Commit the focused slice and return to a clean checkout before external review');
    const sourcePrompt = fs.readFileSync(secureEvidencePath(promptCandidate).absolute, 'utf8');
    const headCommit = safeHead();
    const reviewRoot = path.join(stateRoot, 'review-sessions', id, `${Date.now()}-${crypto.randomUUID()}`);
    const promptPath = path.join(reviewRoot, 'prompt.txt');
    const responsePath = path.join(reviewRoot, 'provider-response.json');
    const sessionPath = path.join(reviewRoot, 'session.json');
    const attestationPath = path.join(reviewRoot, 'attestation.json');
    const outputContract = `\n\nReturn only one JSON object with this exact shape (no prose or fences):\n{\n  "verdict": "ship" | "block",\n  "summary": "concise evidence-based verdict",\n  "scope": ["reviewed file or behavior"],\n  "findings": [{"severity":"P0"|"P1"|"P2","summary":"finding","status":"resolved"|"accepted-risk"}]\n}\nUse verdict "block" whenever any P0/P1 finding is unresolved. Task: ${task.id}. HEAD: ${headCommit}. Task definition SHA-256: ${taskDefinitionSha256(task)}.`;
    const promptBody = `${sourcePrompt.trim()}${outputContract}\n`;
    const executable = resolveTrustedTool(provider.toolId, loaded.store);
    const invocationEnvironment = reviewEnvironment(provider);
    const result = spawnSync(executable.realpath, provider.args ?? [], {
        cwd: repoRoot,
        input: promptBody,
        encoding: 'utf8',
        maxBuffer: config.proofCommandMaxOutputBytes ?? 4 * 1024 * 1024,
        env: invocationEnvironment,
    });
    const responseBody = result.stdout ?? '';
    commitFileTransition(stateRoot, 'review-provider-capture', [
        { path: promptPath, value: promptBody },
        { path: responsePath, value: responseBody },
    ], { taskId: id, providerId, exitCode: result.status ?? 1 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`External reviewer exited ${result.status}: ${result.stderr ?? ''}`);
    const envelope = JSON.parse(responseBody);
    if (provider.outputFormat !== 'claude-json') throw new Error(`Unsupported review output format: ${provider.outputFormat}`);
    if (envelope.type !== 'result' || envelope.subtype !== 'success' || envelope.is_error || !envelope.session_id) {
        throw new Error(`External reviewer did not return a successful session: ${envelope.result ?? 'unknown error'}`);
    }
    const nativeModels = Object.keys(envelope.modelUsage ?? {});
    if (nativeModels.length !== 1
        || nativeModels[0] !== provider.model
        || !envelope.uuid?.trim()) {
        throw new Error(`External reviewer response does not carry the exact native model identity ${provider.model}`);
    }
    const [nativeModel] = nativeModels;
    const payload = parseReviewPayload(envelope.result);
    const promptReference = stateValueReference(promptPath, promptBody);
    const responseReference = stateValueReference(responsePath, responseBody);
    const captureToken = crypto.randomUUID();
    const session = {
        schema: 'yomu-academy.external-review-session/v1',
        recordedBy: 'academy-production-workflow',
        taskId: id,
        taskDefinitionSha256: taskDefinitionSha256(task),
        headCommit,
        owner: proof.owner,
        providerId,
        reviewerId: provider.reviewerId,
        model: nativeModel,
        sessionId: envelope.session_id,
        executable,
        invocation: {
            args: [...provider.args],
            environmentKeys: Object.keys(invocationEnvironment).sort(),
        },
        serviceProvenance: {
            status: 'unresolved',
            reason: 'Claude Code native output does not cryptographically attest the remote service provider.',
        },
        nativeResult: {
            type: envelope.type,
            subtype: envelope.subtype,
            isError: envelope.is_error,
            sessionId: envelope.session_id,
            uuid: envelope.uuid,
            models: nativeModels,
            model: nativeModel,
        },
        exitCode: result.status,
        verdict: payload.verdict,
        reviewPayloadSha256: reviewPayloadSha256(payload),
        captureToken,
        issuedAt: new Date().toISOString(),
        prompt: promptReference,
        response: responseReference,
    };
    const sessionBody = `${JSON.stringify(session, null, 2)}\n`;
    const sessionReference = stateValueReference(sessionPath, sessionBody);
    const attestation = {
        schema: 'yomu-academy.review-attestation/v1',
        taskId: id,
        verdict: payload.verdict,
        headCommit,
        taskDefinitionSha256: taskDefinitionSha256(task),
        issuedAt: session.issuedAt,
        summary: payload.summary,
        reviewer: {
            id: provider.reviewerId,
            model: nativeModel,
            sessionId: envelope.session_id,
            independentFrom: proof.owner,
            sessionEvidence: sessionReference,
            serviceProvenance: 'unresolved',
        },
        scope: payload.scope,
        findings: payload.findings,
    };
    const attestationBody = `${JSON.stringify(attestation, null, 2)}\n`;
    const attestationReference = stateValueReference(attestationPath, attestationBody);
    const registration = {
        taskId: id,
        headCommit,
        sessionId: envelope.session_id,
        captureToken,
        providerId,
        executableSha256: executable.sha256,
        nativeResultUuid: envelope.uuid,
        nativeModel,
        path: sessionReference.path,
        sha256: sessionReference.sha256,
        capturedAt: session.issuedAt,
    };
    const errors = validateReviewAttestation(task, attestation, {
        headCommit,
        owner: proof.owner,
        reviewer: provider.reviewerId,
        strict: true,
        reviewSessions: new Map([[sessionReference.path, session]]),
        trustedReviewSessions: new Map([[sessionReference.path, registration]]),
        requiredReviewPolicy: {
            ...provider,
            tool: loaded.store.tools.find(tool => tool.id === provider.toolId),
        },
        evidenceHashes: new Map([
            [sessionReference.path, sessionReference.sha256],
            [promptReference.path, promptReference.sha256],
            [responseReference.path, responseReference.sha256],
        ]),
    });
    if (errors.length) throw new Error(errors.join('\n'));
    state.reviewSessions ??= [];
    state.reviewSessions.push(registration);
    proof.independentReview = {
        status: 'pass',
        reviewer: provider.reviewerId,
        evidence: attestationReference,
        findingsResolved: payload.findings.filter(finding => finding.status === 'resolved').map(finding => finding.summary),
    };
    commitFileTransition(stateRoot, 'review-registration', [
        { path: sessionPath, value: sessionBody },
        { path: attestationPath, value: attestationBody },
        { path: statePath, value: stateBody(state) },
        { path: target, value: `${JSON.stringify(proof, null, 2)}\n` },
    ], { taskId: id, sessionId: envelope.session_id, nativeModel });
    console.log(`Captured trusted ${providerId} review session ${envelope.session_id} for ${id}`);
}

function attestReview(tasks, state, id, reviewer, candidate) {
    const task = taskById(tasks, id);
    if (!reviewer) throw new Error('attest-review requires --reviewer NAME');
    const { target, proof } = readProof(id);
    if (reviewer === proof.owner) throw new Error('Independent reviewer must differ from task owner');
    const attestation = readJson(secureEvidencePath(candidate).absolute);
    const sessionReference = attestation?.reviewer?.sessionEvidence;
    const session = sessionReference?.path ? readJson(secureEvidencePath(sessionReference.path).absolute) : null;
    const evidenceHashes = new Map();
    for (const reference of [sessionReference, session?.prompt, session?.response].filter(Boolean)) {
        const actual = evidenceReference(reference.path);
        evidenceHashes.set(reference.path, actual.sha256);
    }
    const registration = (state.reviewSessions ?? []).find(row => (
        row.path === sessionReference?.path && row.sha256 === sessionReference?.sha256
    ));
    const { loaded, bindings } = governanceBindings(true);
    const errors = validateReviewAttestation(task, attestation, {
        headCommit: safeHead(),
        owner: proof.owner,
        reviewer,
        strict: true,
        reviewSessions: new Map(sessionReference?.path ? [[sessionReference.path, session]] : []),
        trustedReviewSessions: new Map(registration ? [[registration.path, registration]] : []),
        requiredReviewPolicy: {
            ...bindings.provider,
            tool: loaded.store.tools.find(tool => tool.id === bindings.provider.toolId),
        },
        evidenceHashes,
    });
    if (errors.length) throw new Error(errors.join('\n'));
    proof.independentReview = {
        status: 'pass',
        reviewer,
        evidence: evidenceReference(candidate),
        findingsResolved: proof.independentReview?.findingsResolved ?? [],
    };
    writeProof(target, proof);
    console.log(`Attested independent review for ${id}`);
}

function attestApproval(tasks, state, id, requirement, candidate) {
    const task = taskById(tasks, id);
    if (!(task.requirements ?? []).includes(requirement)) throw new Error(`${id} does not require ${requirement}`);
    const { target, proof } = readProof(id);
    const claim = activeClaims(state, new Date()).find(row => row.taskId === id && row.token === proof.claimToken);
    if (!claim) throw new Error(`No active claim matches the proof for ${id}`);
    const approvalReference = evidenceReference(candidate);
    const attestation = readJson(secureEvidencePath(candidate).absolute);
    const ownerEvidence = attestation?.evidence?.path ? evidenceReference(attestation.evidence.path) : null;
    const reusedNonce = (state.approvalNonces ?? []).find(row => row.nonce === attestation?.nonce);
    if (reusedNonce) throw new Error(`Owner approval nonce was already used by ${reusedNonce.taskId}`);
    const { bindings } = governanceBindings(true);
    const errors = validateApprovalAttestation(task, requirement, attestation, {
        policy: bindings.approval,
        claimToken: proof.claimToken,
        headCommit: safeHead(),
        backlogSha256: proof.backlogSha256,
        strict: false,
        evidenceHashes: new Map(ownerEvidence ? [[ownerEvidence.path, ownerEvidence.sha256]] : []),
    });
    if (errors.length) throw new Error(errors.join('\n'));
    proof.approvals[requirement] = { status: 'pass', evidence: approvalReference };
    state.approvalNonces ??= [];
    state.approvalNonces.push({
        nonce: attestation.nonce,
        taskId: id,
        requirement,
        keyId: attestation.signature.keyId,
        algorithm: attestation.signature.algorithm,
        revision: attestation.revision,
        trustStoreRevision: attestation.trustStoreRevision,
        claimToken: attestation.claimToken,
        headCommit: attestation.headCommit,
        contentHashesSha256: sha256(canonicalJson(attestation.contentHashes)),
        evidenceSha256: attestation.evidence.sha256,
        path: approvalReference.path,
        sha256: approvalReference.sha256,
        registeredAt: new Date().toISOString(),
    });
    commitFileTransition(stateRoot, 'owner-approval', [
        { path: statePath, value: stateBody(state) },
        { path: target, value: `${JSON.stringify(proof, null, 2)}\n` },
    ], { taskId: id, requirement, nonce: attestation.nonce });
    console.log(`Attested ${requirement} approval for ${id}`);
}

function sealProof(tasks, state, id, summary) {
    if (!summary?.trim()) throw new Error('seal-proof requires --summary TEXT');
    const task = taskById(tasks, id);
    const { target, proof } = readProof(id);
    const claim = activeClaims(state, new Date()).find(row => row.taskId === id && row.token === proof.claimToken);
    if (!claim) throw new Error(`No active claim matches the proof for ${id}`);
    if (cleanStatus().length) throw new Error('Commit the focused slice and return to a clean checkout before sealing proof');
    proof.baseCommit = claim.baseCommit;
    proof.backlogSha256 = sha256(fs.readFileSync(backlogPath, 'utf8'));
    proof.taskDefinitionSha256 = taskDefinitionSha256(task);
    proof.headCommit = safeHead();
    proof.worktree = repoRoot;
    proof.owner = claim.owner;
    proof.summary = summary.trim();
    proof.changedFiles = gitLines('diff', '--name-only', `${claim.baseCommit}...${proof.headCommit}`);
    proof.release.userVisible = config.release.userVisiblePrefixes.includes(id.split('-')[0]);
    proof.release.changelogUpdated = proof.changedFiles.includes('CHANGELOG.md');
    proof.release.releaseNotes = proof.release.userVisible ? summary.trim() : null;
    proof.submittedAt = new Date().toISOString();
    for (const gate of task.gates) {
        const row = proof.gates[gate];
        if (!row.evidence?.length) throw new Error(`Gate ${gate} has no attached evidence`);
        if (gate === 'T' && !row.commands?.length) throw new Error('Gate T has no workflow-recorded command');
        row.status = 'pass';
    }
    writeProof(target, proof);
    console.log(`Sealed proof for ${id} at ${proof.headCommit}`);
}

function collectEvidence(proof) {
    const references = [
        proof.reuseAudit?.report,
        proof.independentReview?.evidence,
        ...Object.values(proof.approvals ?? {}).map(row => row.evidence),
        ...Object.values(proof.gates ?? {}).flatMap(row => [
            ...(row.evidence ?? []),
            ...(row.commands ?? []).map(command => command.transcript),
        ]),
    ].filter(Boolean);
    const gateAttestations = new Map();
    for (const row of Object.values(proof.gates ?? {})) {
        for (const reference of row.evidence ?? []) {
            try {
                const attestation = readJson(secureEvidencePath(reference.path).absolute);
                gateAttestations.set(reference.path, attestation);
                for (const assertion of attestation.assertions ?? []) {
                    references.push(...(assertion.artifacts ?? []));
                }
            } catch {
                // Strict validation reports unreadable gate attestations.
            }
        }
    }
    const reviewAttestations = new Map();
    const reviewSessions = new Map();
    const approvalAttestations = new Map();
    for (const approval of Object.values(proof.approvals ?? {})) {
        const reference = approval?.evidence;
        if (!reference?.path) continue;
        try {
            const attestation = readJson(secureEvidencePath(reference.path).absolute);
            approvalAttestations.set(reference.path, attestation);
            if (attestation.evidence) references.push(attestation.evidence);
        } catch {
            // Strict validation reports unreadable typed approval evidence.
        }
    }
    const reviewReference = proof.independentReview?.evidence;
    if (reviewReference?.path) {
        try {
            const attestation = readJson(secureEvidencePath(reviewReference.path).absolute);
            reviewAttestations.set(reviewReference.path, attestation);
            const sessionReference = attestation?.reviewer?.sessionEvidence;
            if (sessionReference?.path) {
                references.push(sessionReference);
                try {
                    const session = readJson(secureEvidencePath(sessionReference.path).absolute);
                    reviewSessions.set(sessionReference.path, session);
                    if (session.prompt) references.push(session.prompt);
                    if (session.response) references.push(session.response);
                } catch {
                    // Strict validation reports unreadable external review sessions.
                }
            }
        } catch {
            // Strict validation reports unreadable review attestations.
        }
    }
    const hashes = new Map();
    for (const reference of references) {
        try {
            const actual = evidenceReference(reference.path);
            hashes.set(reference.path, actual.sha256);
        } catch {
            // Validation reports the missing evidence using the declared path.
        }
    }
    const commandTranscripts = new Map();
    for (const command of Object.values(proof.gates ?? {}).flatMap(row => row.commands ?? [])) {
        const reference = command.transcript;
        if (!reference?.path) continue;
        try {
            commandTranscripts.set(reference.path, readJson(secureEvidencePath(reference.path).absolute));
        } catch {
            // Validation reports unreadable transcript evidence.
        }
    }
    return { hashes, commandTranscripts, gateAttestations, reviewAttestations, reviewSessions, approvalAttestations };
}

function evidenceManifestSha256(proof) {
    const entries = [...collectEvidence(proof).hashes.entries()]
        .sort(([left], [right]) => left.localeCompare(right, 'en'))
        .map(([pathName, digest]) => ({ path: pathName, sha256: digest }));
    return sha256(`${JSON.stringify(entries)}\n`);
}

function strictProofContext(tasks, task, proof, state) {
    execFileSync('git', ['fetch', '--quiet', 'origin', 'main'], { cwd: repoRoot, stdio: 'ignore' });
    const claim = activeClaims(state, new Date()).find(row => row.taskId === task.id && row.token === proof.claimToken);
    const currentHead = safeHead();
    const changedFiles = claim?.baseCommit
        ? gitLines('diff', '--name-only', `${claim.baseCommit}...${currentHead}`)
        : [];
    const reportPath = proof.reuseAudit?.report?.path;
    const evidence = collectEvidence(proof);
    let reuseReportErrors = [];
    if (reportPath) {
        try {
            reuseReportErrors.push(...reuseReportPinErrors(claim, proof.reuseAudit.report));
            const absolute = secureEvidencePath(reportPath).absolute;
            const text = fs.readFileSync(absolute, 'utf8');
            const report = JSON.parse(text);
            const snapshot = readSourceSnapshot(report);
            reuseReportErrors.push(...validateSalvageReport(report, {
                task,
                sources: snapshot.sources,
                reportFile: { path: reportPath, text, sha256: proof.reuseAudit.report.sha256 },
            }));
            if (report.baseScan?.danglingCache?.status !== 'cached') {
                reuseReportErrors.push('Reuse report lacks the cached unreachable-commit scan');
            }
            if (report.baseScan?.transcriptCache?.status !== 'cached') {
                reuseReportErrors.push('Reuse report lacks a current transcript scan');
            }
            if (claim?.baseCommit && report.baseScan?.originMain !== claim.baseCommit) {
                reuseReportErrors.push('Reuse report was scanned against a different origin/main');
            }
            if (snapshot.originMain !== report.baseScan?.originMain) {
                reuseReportErrors.push('Reuse source snapshot and report disagree on origin/main');
            }
        } catch (error) {
            reuseReportErrors = [`Reuse report cannot be read: ${error instanceof Error ? error.message : String(error)}`];
        }
    }
    const { loaded, bindings } = governanceBindings(true);
    return {
        strict: true,
        repoRoot,
        repoClean: cleanStatus().length === 0,
        currentHead,
        changedFiles,
        claim,
        ownership: laneForTask(task, config)?.ownership ?? [],
        reservedFiles: claim?.reservedFiles ?? [],
        originMainIsAncestor: gitSucceeds('merge-base', '--is-ancestor', 'origin/main', currentHead),
        evidenceHashes: evidence.hashes,
        commandTranscripts: evidence.commandTranscripts,
        gateAttestations: evidence.gateAttestations,
        reviewAttestations: evidence.reviewAttestations,
        reviewSessions: evidence.reviewSessions,
        approvalAttestations: evidence.approvalAttestations,
        approvalNonces: new Map((state.approvalNonces ?? []).map(row => [row.nonce, row])),
        trustedReviewSessions: new Map((state.reviewSessions ?? []).map(row => [row.path, row])),
        requiredReviewPolicy: {
            ...bindings.provider,
            tool: loaded.store.tools.find(tool => tool.id === bindings.provider.toolId),
        },
        approvalPolicies: { owner: bindings.approval },
        trustedGateProducers: config.trustedGateProducers,
        reuseReportErrors,
        maxProofAgeMs: config.proofMaxAgeMinutes * 60 * 1000,
        maxFutureSkewMs: 5 * 60 * 1000,
        nowMs: Date.now(),
        userVisible: config.release.userVisiblePrefixes.includes(task.id.split('-')[0]),
        taskDefinitionSha256: taskDefinitionSha256(task),
    };
}

function validateTaskProof(tasks, markdown, id) {
    const task = taskById(tasks, id);
    const proofPath = ensureInside(proofRoot, path.join(proofRoot, `${id}.json`));
    if (!fs.existsSync(proofPath)) throw new Error(`Missing proof file ${path.relative(repoRoot, proofPath)}`);
    const proof = readJson(proofPath);
    const state = loadState();
    const errors = validateProof(task, proof, sha256(markdown), strictProofContext(tasks, task, proof, state));
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(`${id} proof is promotion-ready`);
    return { task, proof, proofPath };
}

function promote(tasks, markdown, state, id, apply) {
    const pendingPromotion = (state.promotions ?? []).find(row => (
        row.taskId === id && [
            'awaiting-checkpoint', 'awaiting-verification', 'failed-verification', 'awaiting-release',
        ].includes(row.status)
    ));
    if (pendingPromotion) {
        throw new Error(`${id} already has promotion ${pendingPromotion.promotionId ?? 'without-id'} awaiting checkpoint`);
    }
    const { proof } = validateTaskProof(tasks, markdown, id);
    if (!apply) {
        console.log(`Dry run only. Re-run with --apply to check ${id}.`);
        return;
    }
    const task = taskById(tasks, id);
    for (const dep of task.deps) {
        if (!taskCompleteForWorkflow(taskById(tasks, dep), state)) throw new Error(`${id} still depends on open task ${dep}`);
    }
    const dynamicDeps = resolveDynamicDependencies(task, tasks, config, state);
    if (dynamicDeps === null) throw new Error(`${id} has an unresolved dynamic dependency`);
    for (const dep of dynamicDeps) {
        if (!taskCompleteForWorkflow(taskById(tasks, dep), state)) throw new Error(`${id} release scope still depends on open task ${dep}`);
    }
    const claim = (state.claims ?? []).find(row => row.taskId === id && row.token === proof.claimToken);
    if (!claim || claim.status !== 'active' || Date.parse(claim.expiresAt) <= Date.now()) {
        throw new Error(`Promotion requires the live claim token bound to ${id}'s proof`);
    }
    const promotedBacklog = updateBacklogCheckbox(markdown, id);
    const promotion = {
        promotionId: crypto.randomUUID(),
        taskId: id,
        claimToken: proof.claimToken,
        promotedAt: new Date().toISOString(),
        baseCommit: proof.baseCommit,
        headCommit: proof.headCommit,
        proofSha256: sha256(fs.readFileSync(proofFile(id))),
        evidenceManifestSha256: evidenceManifestSha256(proof),
        taskDefinitionSha256: taskDefinitionSha256(task),
        sourceBacklogSha256: sha256(markdown),
        expectedBacklogSha256: sha256(promotedBacklog),
        userVisible: proof.release.userVisible,
        releaseNotes: proof.release.releaseNotes,
        status: 'awaiting-checkpoint',
        backlogWrittenAt: new Date().toISOString(),
    };
    state.promotions.push(promotion);
    commitFileTransition(stateRoot, 'promotion', [
        { path: statePath, value: stateBody(state) },
        { path: backlogPath, value: promotedBacklog },
    ], {
        promotionId: promotion.promotionId,
        taskId: id,
        sourceBacklogSha256: promotion.sourceBacklogSha256,
        expectedBacklogSha256: promotion.expectedBacklogSha256,
    });
    console.log(`Promoted ${id}. Commit and push this verified slice now.`);
    if (proof.release.userVisible) console.log('This slice is user-visible: run the release preflight and publish it after push.');
}

function releaseChecklist(state) {
    const pending = (state.promotions ?? []).filter(row => (
        ['awaiting-checkpoint', 'awaiting-verification', 'failed-verification', 'awaiting-release'].includes(row.status)
    ));
    if (!pending.length) {
        console.log('No promoted slices are waiting for a release.');
        return;
    }
    console.log(`Release checkpoint: ${pending.length} promoted slice(s)`);
    console.log(`Tasks: ${pending.map(row => row.taskId).join(', ')}`);
    console.log('\nPre-commit:');
    for (const command of config.release.preCommitCommands) console.log(`  ${command}`);
    console.log('  git add <only the promoted slice files>');
    console.log('  git commit -m "<focused slice message>"');
    console.log('  git pull --rebase origin main');
    console.log('  git push origin HEAD:main');
    if (pending.some(row => row.userVisible) && config.release.publishUserVisibleSlices) {
        console.log('\nUser-visible release:');
        for (const command of config.release.preReleaseCommands) console.log(`  ${command}`);
        console.log('  run the Release workflow or create/push the next v* tag');
    }
    console.log('\nPost-push:');
    console.log('  verify the exact commit and required workflow runs through the external GitHub production policy');
}

function runConfiguredCommand(command, options = {}) {
    const startedAt = new Date().toISOString();
    const result = spawnSync(command, {
        cwd: repoRoot,
        shell: true,
        encoding: 'utf8',
        maxBuffer: config.proofCommandMaxOutputBytes ?? 4 * 1024 * 1024,
        env: options.environment ? { ...process.env, ...options.environment } : process.env,
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    const record = {
        schema: 'yomu-academy.release-check-transcript/v1',
        command,
        startedAt,
        finishedAt: new Date().toISOString(),
        exitCode: result.status,
        signal: result.signal ?? null,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        headCommit: safeHead(),
        checkpointCommit: options.checkpointCommit ?? null,
    };
    let reference = null;
    if (options.outputPath) {
        commitFileTransition(stateRoot, 'release-check-transcript', [{
            path: options.outputPath,
            value: `${JSON.stringify(record, null, 2)}\n`,
        }], { command, checkpointCommit: options.checkpointCommit ?? null });
        reference = evidenceReference(options.outputPath);
    }
    if (result.error || result.status !== 0) {
        const error = result.error ?? new Error(`Release command failed (${result.status}): ${command}`);
        error.releaseCheck = { record, reference };
        throw error;
    }
    return { record, reference };
}

async function verifyCheckpoint(state, token) {
    if (!token) throw new Error('verify-checkpoint requires --token CLAIM_TOKEN');
    const matches = (state.promotions ?? []).filter(row => (
        row.claimToken === token && ['awaiting-verification', 'failed-verification'].includes(row.status)
    ));
    if (matches.length !== 1) throw new Error(`Verification requires one exact awaiting/failed checkpoint; found ${matches.length}`);
    const [promotion] = matches;
    const claim = (state.claims ?? []).find(row => row.taskId === promotion.taskId && row.token === token);
    if (!claim) throw new Error(`Checkpoint claim ${promotion.taskId} is missing`);
    const attempt = {
        attemptId: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        status: 'running',
        checks: [],
    };
    promotion.status = 'awaiting-verification';
    claim.status = 'awaiting-verification';
    promotion.verificationAttempts ??= [];
    promotion.verificationAttempts.push(attempt);
    saveState(state, 'verification-started');
    try {
        git('fetch', 'origin', 'main');
        if (!promotion.checkpointCommit
            || !gitSucceeds('merge-base', '--is-ancestor', promotion.checkpointCommit, 'origin/main')) {
            throw new Error('Checkpoint commit is not present on origin/main; post-push verification cannot run');
        }
        const { loaded, bindings } = governanceBindings(true);
        const policy = bindings.github;
        const remoteRefs = authoritativeRemoteRefs(policy);
        const originMain = git('rev-parse', 'origin/main');
        if (remoteRefs.main !== originMain || originMain !== promotion.checkpointCommit) {
            throw new Error('HTTPS GitHub main does not match the exact pushed checkpoint commit');
        }
        const repositoryPath = `/repos/${policy.repository}`;
        const commit = await githubRequest(policy, `${repositoryPath}/commits/${promotion.checkpointCommit}`);
        if (commit.sha !== promotion.checkpointCommit) throw new Error('GitHub API did not resolve the exact checkpoint commit');
        attempt.checks.push({
            authority: 'github-api-and-https-refs',
            status: 'pass',
            commit: promotion.checkpointCommit,
            apiUrl: commit.html_url,
        });
        for (const workflowPath of policy.checkpointWorkflowPaths) {
            const workflow = encodeURIComponent(workflowPath);
            const runs = await githubRequest(policy, `${repositoryPath}/actions/workflows/${workflow}/runs?head_sha=${promotion.checkpointCommit}&status=completed&per_page=20`);
            const run = runs.workflow_runs?.find(candidate => (
                candidate.head_sha === promotion.checkpointCommit
                && candidate.head_branch === 'main'
                && candidate.status === 'completed'
                && candidate.conclusion === 'success'
                && policy.checkpointWorkflowEvents.includes(candidate.event)
            ));
            if (!run) throw new Error(`${workflowPath} has no externally verified successful main-branch run for the checkpoint commit`);
            attempt.checks.push({
                authority: 'github-api-workflow-run',
                workflowPath,
                event: run.event,
                status: 'pass',
                runId: run.id,
                url: run.html_url,
            });
            saveState(state, 'verification-check-passed');
        }
        attempt.governanceTrust = { path: loaded.path, sha256: loaded.sha256, revision: loaded.store.revision };
    } catch (error) {
        attempt.checks.push({ authority: 'github', status: 'fail', error: error instanceof Error ? error.message : String(error) });
        attempt.status = 'failed';
        attempt.finishedAt = new Date().toISOString();
        promotion.status = 'failed-verification';
        promotion.verificationFailure = error instanceof Error ? error.message : String(error);
        claim.status = 'failed-verification';
        const checkpointRow = [...(state.checkpoints ?? [])].reverse().find(row => row.promotionId === promotion.promotionId);
        if (checkpointRow) {
            checkpointRow.status = 'failed-verification';
            checkpointRow.recoverable = true;
            checkpointRow.verificationFailure = promotion.verificationFailure;
            checkpointRow.failedAt = attempt.finishedAt;
        }
        saveState(state, 'verification-failed');
        throw new Error(`Post-push verification failed for ${promotion.taskId}; evidence was preserved and verify-checkpoint can retry. ${promotion.verificationFailure}`);
    }
    attempt.status = 'passed';
    attempt.finishedAt = new Date().toISOString();
    delete promotion.verificationFailure;
    promotion.verifiedAt = new Date().toISOString();
    promotion.status = promotion.userVisible ? 'awaiting-release' : 'verified';
    claim.status = promotion.userVisible ? 'awaiting-release' : 'verified';
    const checkpointRow = [...(state.checkpoints ?? [])].reverse().find(row => row.promotionId === promotion.promotionId);
    if (checkpointRow) {
        checkpointRow.status = 'verified';
        checkpointRow.verifiedAt = promotion.verifiedAt;
        delete checkpointRow.recoverable;
        delete checkpointRow.verificationFailure;
    }
    saveState(state, 'verification-passed');
    console.log(`Post-push verification passed for ${promotion.taskId}`);
    if (promotion.userVisible) console.log('User-visible work remains open until record-release verifies the release and deployment.');
}

function isPreparedCheckpointCommit(taskHead) {
    const current = safeHead();
    if (current === taskHead || !gitSucceeds('rev-parse', 'HEAD^')) return false;
    if (git('rev-parse', 'HEAD^') !== taskHead) return false;
    const changed = gitLines('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD');
    return changed.length === 1 && changed[0] === config.canonicalBacklog;
}

function backlogShaAtCommit(commit) {
    return sha256(execFileSync('git', ['show', `${commit}:${config.canonicalBacklog}`], { cwd: repoRoot }));
}

function assertCheckpointIntegrity(task, promotion, prepared = false) {
    const proofPath = proofFile(promotion.taskId);
    const proof = readJson(secureEvidencePath(proofPath).absolute);
    const actual = {
        proofSha256: sha256(fs.readFileSync(secureEvidencePath(proofPath).absolute)),
        evidenceManifestSha256: evidenceManifestSha256(proof),
        backlogSha256: sha256(fs.readFileSync(backlogPath)),
        taskDefinitionSha256: taskDefinitionSha256(task),
        ...(prepared ? { preparedBacklogSha256: backlogShaAtCommit('HEAD') } : {}),
    };
    const errors = checkpointIntegrityErrors(promotion, actual);
    if (errors.length) throw new Error(errors.join('\n'));
}

async function checkpoint(tasks, state, token, message) {
    if (!token) throw new Error('checkpoint requires --token CLAIM_TOKEN');
    const pending = (state.promotions ?? []).filter(row => row.status === 'awaiting-checkpoint');
    const matchingPromotions = pending.filter(row => row.claimToken === token);
    if (matchingPromotions.length !== 1) {
        throw new Error(`Checkpoint requires one exact promoted claim token; found ${matchingPromotions.length} matching promotion(s)`);
    }
    const [promotion] = matchingPromotions;
    const task = taskById(tasks, promotion.taskId);
    const claims = state.claims ?? [];
    const claimIndex = claims.findIndex(row => row.taskId === promotion.taskId && row.token === token);
    const claim = claimIndex >= 0 ? claims[claimIndex] : null;
    if (!claim || claim.status !== 'active') throw new Error(`Promoted claim ${promotion.taskId} is no longer active`);
    if (Date.parse(claim.expiresAt) <= Date.now()) throw new Error(`Promoted claim ${promotion.taskId} has expired`);
    const replacement = claims.slice(claimIndex + 1).find(row => (
        row.taskId === promotion.taskId
        && row.token !== token
        && ['active', 'checkpointed'].includes(row.status)
    ));
    if (replacement) throw new Error(`Promoted claim ${promotion.taskId} was replaced by a newer claim`);
    const status = cleanStatus();
    const allowed = new Set([` M ${config.canonicalBacklog}`, `M  ${config.canonicalBacklog}`]);
    const outside = status.filter(line => !allowed.has(line));
    if (outside.length) throw new Error(`Integration checkout contains unrelated changes:\n${outside.join('\n')}`);
    git('fetch', 'origin', 'main');
    const originMainBefore = git('rev-parse', 'origin/main');
    const expectedBase = promotion.baseCommit;
    let prepared = isPreparedCheckpointCommit(promotion.headCommit);
    assertCheckpointIntegrity(task, promotion, prepared);
    if (prepared && (
        promotion.checkpointGateHead !== promotion.headCommit
        || !promotion.checkpointGatesPassedAt
    )) {
        throw new Error('Prepared checkpoint commit has no recorded gate pass; reopen and regenerate it through the workflow');
    }
    const alreadyPushed = prepared && gitSucceeds('merge-base', '--is-ancestor', safeHead(), 'origin/main');
    if (originMainBefore !== expectedBase && !alreadyPushed) {
        throw new Error(`origin/main advanced after proof. Run reopen ${promotion.taskId} with its claim token, then rebase, refresh salvage, claim again, rerun gates/review, reseal, and promote.`);
    }
    if (!prepared) {
        if (safeHead() !== promotion.headCommit) throw new Error('Checkpoint checkout is not at the certified task HEAD or a retryable prepared checkpoint commit');
        for (const command of config.release.preCommitCommands) runConfiguredCommand(command);
        const statusAfterGates = cleanStatus();
        const outsideAfterGates = statusAfterGates.filter(line => !allowed.has(line));
        if (outsideAfterGates.length) {
            throw new Error(`Checkpoint gates changed files outside the backlog:\n${outsideAfterGates.join('\n')}`);
        }
        assertCheckpointIntegrity(task, promotion, false);
        promotion.checkpointGateHead = promotion.headCommit;
        promotion.checkpointGatesPassedAt = new Date().toISOString();
        saveState(state);
        const gitJournal = beginRollbackTransition(stateRoot, 'checkpoint-git', [backlogPath, gitIndexPath], {
            taskId: promotion.taskId,
            taskHead: promotion.headCommit,
        });
        try {
            git('add', '--', config.canonicalBacklog);
            injectWorkflowCrash('checkpoint-git', 'after-stage');
            git('commit', '-m', message || `chore(academy): promote ${promotion.taskId}`);
            completeRollbackTransition(stateRoot, gitJournal);
        } catch (error) {
            recoverFileTransition(stateRoot, 'rollback');
            throw error;
        }
        if (cleanStatus().length) throw new Error('Checkpoint commit left a dirty checkout; refusing to push');
        prepared = true;
    }
    assertCheckpointIntegrity(task, promotion, true);
    if (config.release.pushEveryCheckpoint && !alreadyPushed) git('push', 'origin', 'HEAD:main');
    git('fetch', 'origin', 'main');
    const headCommit = safeHead();
    if (!gitSucceeds('merge-base', '--is-ancestor', headCommit, 'origin/main')) {
        throw new Error('Checkpoint commit is not present on origin/main');
    }
    promotion.status = 'awaiting-verification';
    promotion.checkpointCommit = headCommit;
    claim.status = 'awaiting-verification';
    claim.checkpointedAt = new Date().toISOString();
    state.checkpoints ??= [];
    state.checkpoints.push({
        taskIds: [promotion.taskId],
        promotionId: promotion.promotionId,
        claimToken: token,
        committedAt: new Date().toISOString(),
        commit: headCommit,
        pushed: config.release.pushEveryCheckpoint,
        status: 'awaiting-verification',
    });
    saveState(state, 'checkpoint-awaiting-verification');
    console.log(`Checkpoint pushed at ${headCommit}`);
    await verifyCheckpoint(state, token);
}

function reopenPromotion(markdown, state, id, token) {
    const claim = (state.claims ?? []).find(row => (
        row.taskId === id && row.token === token && row.status === 'active'
    ));
    if (!claim) throw new Error(`No active matching claim for ${id}`);
    if (Date.parse(claim.expiresAt) <= Date.now()) throw new Error(`Claim ${id} has expired; cancel the stale promotion and claim again`);
    const promotion = [...(state.promotions ?? [])].reverse().find(row => (
        row.taskId === id && row.claimToken === token && row.status === 'awaiting-checkpoint'
    ));
    if (!promotion) throw new Error(`No pending promotion for ${id}`);
    const status = cleanStatus();
    const allowed = new Set([` M ${config.canonicalBacklog}`, `M  ${config.canonicalBacklog}`]);
    const outside = status.filter(line => !allowed.has(line));
    if (outside.length) throw new Error(`Cannot reopen with unrelated changes:\n${outside.join('\n')}`);
    const reopenedBacklog = updateBacklogCheckbox(markdown, id, false);
    promotion.status = 'reopened';
    promotion.reopenedAt = new Date().toISOString();
    claim.status = 'cancelled';
    claim.cancelledAt = new Date().toISOString();
    claim.cancelReason = 'promotion-reopened-for-new-base';
    const restoredIndex = indexWithPathAtCommit(config.canonicalBacklog, promotion.headCommit);
    commitFileTransition(stateRoot, 'reopen-promotion', [
        { path: statePath, value: stateBody(state) },
        { path: backlogPath, value: reopenedBacklog },
        { path: gitIndexPath, value: restoredIndex },
    ], { promotionId: promotion.promotionId, taskId: id, claimToken: token });
    console.log(`Reopened ${id} and cancelled its stale-base claim; rebase, refresh salvage, claim again, rerun gates/review, reseal, and promote.`);
}

async function githubRequest(policy, pathname, options = {}) {
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    if (!token) throw new Error('Authoritative GitHub verification requires GH_TOKEN or GITHUB_TOKEN');
    const url = new URL(pathname, `${policy.apiBase}/`);
    if (url.origin !== new URL(policy.apiBase).origin) throw new Error(`GitHub API request escaped the trusted API origin: ${url}`);
    const response = await fetch(url, {
        redirect: options.binary ? 'manual' : 'error',
        headers: {
            accept: options.binary ? 'application/octet-stream' : 'application/vnd.github+json',
            authorization: `Bearer ${token}`,
            'user-agent': 'yomu-academy-production-workflow',
            'x-github-api-version': '2022-11-28',
        },
    });
    if (options.binary && [301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new Error('GitHub release asset redirect omitted its destination');
        const downloadUrl = new URL(location);
        if (downloadUrl.protocol !== 'https:' || !policy.assetDownloadHosts.includes(downloadUrl.hostname)) {
            throw new Error(`GitHub release asset escaped the externally trusted download hosts: ${downloadUrl.hostname}`);
        }
        const downloaded = await fetch(downloadUrl, { redirect: 'error', headers: { 'user-agent': 'yomu-academy-production-workflow' } });
        if (!downloaded.ok) throw new Error(`GitHub release asset download failed: ${downloaded.status}`);
        return Buffer.from(await downloaded.arrayBuffer());
    }
    if (!response.ok) throw new Error(`GitHub API ${url.pathname} failed: ${response.status}`);
    return options.binary ? Buffer.from(await response.arrayBuffer()) : response.json();
}

function authoritativeRemoteRefs(policy, tag) {
    const configuredRemote = git('remote', 'get-url', 'origin');
    if (configuredRemote !== policy.remoteUrl) throw new Error('origin URL does not match the externally trusted GitHub repository');
    const requestedRefs = ['refs/heads/main'];
    if (tag) requestedRefs.push(`refs/tags/${tag}`, `refs/tags/${tag}^{}`);
    const output = execFileSync('git', ['ls-remote', policy.remoteUrl, ...requestedRefs], {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
    });
    const refs = new Map(output.trim().split(/\r?\n/u).filter(Boolean).map(line => {
        const [hash, ref] = line.split(/\s+/u);
        return [ref, hash];
    }));
    return {
        main: refs.get('refs/heads/main'),
        tag: tag ? refs.get(`refs/tags/${tag}^{}`) ?? refs.get(`refs/tags/${tag}`) : undefined,
    };
}

async function recordRelease(state, tag) {
    if (!tag) throw new Error('record-release requires --tag vX.Y.Z');
    const pending = (state.promotions ?? []).filter(row => row.status === 'awaiting-release');
    if (!pending.length) throw new Error('No user-visible checkpoint is awaiting release');
    const { loaded, bindings } = governanceBindings(true);
    const githubPolicy = bindings.github;
    const ghTool = resolveTrustedTool(githubPolicy.ghToolId, loaded.store);
    if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
        throw new Error('Authoritative GitHub verification requires GH_TOKEN or GITHUB_TOKEN');
    }
    for (const command of config.release.preReleaseCommands) runConfiguredCommand(command);
    git('fetch', 'origin', '--tags');
    const repositoryPath = `/repos/${githubPolicy.repository}`;
    const [release, latest] = await Promise.all([
        githubRequest(githubPolicy, `${repositoryPath}/releases/tags/${encodeURIComponent(tag)}`),
        githubRequest(githubPolicy, `${repositoryPath}/releases/latest`),
    ]);
    if (release.draft) throw new Error(`${tag} is still a draft`);
    if (release.prerelease) throw new Error(`${tag} is still a prerelease`);
    if (latest.id !== release.id || latest.tag_name !== tag) throw new Error(`${tag} is not the authoritative latest release`);
    if (release.tag_name !== tag) throw new Error('GitHub release resolved another tag');
    const asset = release.assets?.find(candidate => candidate.name === 'yomu.user.js');
    if (!asset?.url || asset.state !== 'uploaded') {
        throw new Error(`${tag} does not contain yomu.user.js`);
    }
    const originMain = git('rev-parse', 'origin/main');
    const tagCommit = git('rev-list', '-n', '1', tag);
    if (tagCommit !== originMain) throw new Error('Latest release tag must point at current origin/main');
    const remoteRefs = authoritativeRemoteRefs(githubPolicy, tag);
    if (remoteRefs.main !== originMain || remoteRefs.tag !== tagCommit) {
        throw new Error('HTTPS GitHub refs do not match the locally fetched main and release tag');
    }
    const releasable = pending.filter(row => gitSucceeds('merge-base', '--is-ancestor', row.checkpointCommit, tagCommit));
    if (!releasable.length) throw new Error('Release tag does not contain any pending checkpoint');
    const releasedAsset = await githubRequest(githubPolicy, asset.url, { binary: true });
    const releasedAssetSha256 = sha256(releasedAsset);
    const taggedAssetSha256 = sha256(execFileSync('git', ['show', `${tag}:dist/yomu.user.js`], { cwd: repoRoot }));
    if (releasedAssetSha256 !== taggedAssetSha256) throw new Error('Release asset bytes do not match dist/yomu.user.js at the release tag');
    const releaseVersion = tag.replace(/^v/u, '');
    const taggedChangelog = execFileSync('git', ['show', `${tag}:CHANGELOG.md`], { cwd: repoRoot, encoding: 'utf8' });
    if (!taggedChangelog.includes(`## [${releaseVersion}]`)) {
        throw new Error(`CHANGELOG.md at ${tag} has no ${releaseVersion} release entry`);
    }
    const workflow = encodeURIComponent(githubPolicy.deploymentWorkflowPath);
    const runsResponse = await githubRequest(githubPolicy, `${repositoryPath}/actions/workflows/${workflow}/runs?head_sha=${tagCommit}&status=completed&per_page=20`);
    const deployment = runsResponse.workflow_runs?.find(run => (
        run.head_sha === tagCommit && run.status === 'completed' && run.conclusion === 'success'
    ));
    if (!deployment) {
        throw new Error(`${githubPolicy.deploymentWorkflowPath} has not authoritatively succeeded for current origin/main`);
    }
    for (const row of releasable) {
        row.status = 'released';
        row.releasedAt = new Date().toISOString();
        const claim = (state.claims ?? []).find(candidate => (
            candidate.taskId === row.taskId && candidate.token === row.claimToken
        ));
        if (claim) {
            claim.status = 'released';
            claim.releasedAt = row.releasedAt;
        }
    }
    state.releases ??= [];
    state.releases.push({
        tag,
        url: release.html_url,
        taskIds: releasable.map(row => row.taskId),
        commit: originMain,
        tagCommit,
        deploymentUrl: deployment.html_url,
        releaseId: release.id,
        assetId: asset.id,
        deploymentRunId: deployment.id,
        governanceTrust: { path: loaded.path, sha256: loaded.sha256, revision: loaded.store.revision },
        ghTool,
        assetSha256: releasedAssetSha256,
        recordedAt: new Date().toISOString(),
    });
    saveState(state, 'record-release');
    console.log(`Recorded verified release ${tag}: ${release.html_url}`);
}

function usage() {
    console.log(`Usage:
  node scripts/academy-production-workflow.mjs validate
  node scripts/academy-production-workflow.mjs status
  node scripts/academy-production-workflow.mjs ledger
  node scripts/academy-production-workflow.mjs plan
  node scripts/academy-production-workflow.mjs index-unreachable
  node scripts/academy-production-workflow.mjs index-transcripts
  node scripts/academy-production-workflow.mjs prune-state
  node scripts/academy-production-workflow.mjs salvage TASK
  node scripts/academy-production-workflow.mjs claim TASK --owner NAME --paths FILE[,FILE...]
  node scripts/academy-production-workflow.mjs renew TASK --token TOKEN
  node scripts/academy-production-workflow.mjs cancel TASK --token TOKEN
  node scripts/academy-production-workflow.mjs attach-evidence TASK GATE FILE
  node scripts/academy-production-workflow.mjs run-proof TASK GATE -- COMMAND [ARGS...]
  node scripts/academy-production-workflow.mjs attest-reuse TASK FILE
  node scripts/academy-production-workflow.mjs run-review TASK --provider claude-fable --prompt FILE
  node scripts/academy-production-workflow.mjs attest-review TASK --reviewer NAME FILE
  node scripts/academy-production-workflow.mjs attest-approval TASK REQUIREMENT FILE
  node scripts/academy-production-workflow.mjs seal-proof TASK --summary TEXT
  node scripts/academy-production-workflow.mjs verify-proof TASK
  node scripts/academy-production-workflow.mjs promote TASK [--apply]
  node scripts/academy-production-workflow.mjs reopen TASK --token TOKEN
  node scripts/academy-production-workflow.mjs checkpoint --token CLAIM_TOKEN --message TEXT
  node scripts/academy-production-workflow.mjs verify-checkpoint --token CLAIM_TOKEN
  node scripts/academy-production-workflow.mjs record-release --tag vX.Y.Z
  node scripts/academy-production-workflow.mjs recovery-status
  node scripts/academy-production-workflow.mjs recover [--rollback|--roll-forward]
  node scripts/academy-production-workflow.mjs release-checklist`);
}

const [command = 'status', id, ...flags] = process.argv.slice(2);

try {
    await withLock(workflowLockPath, async () => {
        if (command === 'recovery-status') {
            printRecoveryStatus();
            return;
        }
        if (command === 'recover') {
            const commandFlags = [id, ...flags].filter(Boolean);
            const mode = commandFlags.includes('--rollback')
                ? 'rollback'
                : commandFlags.includes('--roll-forward') ? 'roll-forward' : 'auto';
            recoverWorkflow(mode);
            return;
        }
        const transition = inspectFileTransition(stateRoot);
        if (transition.status !== 'clean') {
            try {
                recoverFileTransition(stateRoot, 'auto');
            } catch (error) {
                if (command === 'status') {
                    printRecoveryStatus();
                    console.error(error instanceof Error ? error.message : String(error));
                    process.exitCode = 2;
                    return;
                }
                throw error;
            }
        }
        const { markdown, tasks } = load();
        const state = loadState();
        if ((state.promotions ?? []).some(row => row.status === 'prepared')) {
            throw new Error('Legacy prepared promotions are unsupported; recover the file journal or reopen from a canonical awaiting-checkpoint state');
        }
        if (command === 'validate') {
            ensureValid(tasks);
            console.log(`Workflow valid: ${tasks.length} canonical tasks, ${config.lanes.length} lanes`);
        } else if (command === 'status') {
            ensureValid(tasks);
            printStatus(tasks, markdown, state);
        } else if (command === 'ledger') {
            ensureValid(tasks);
            const ledger = writeProductionLedger(tasks, markdown, state);
            console.log(`Wrote ${ledger.tasks.length} task rows and ${ledger.routeCounts.length} route counters -> @workflow-state/${path.relative(stateRoot, productionLedgerPath)}`);
        } else if (command === 'plan') {
            ensureValid(tasks);
            writePlan(tasks, markdown, state);
        } else if (command === 'index-unreachable') {
            ensureValid(tasks);
            indexUnreachableCommits();
        } else if (command === 'index-transcripts') {
            ensureValid(tasks);
            indexTranscripts();
        } else if (command === 'prune-state') {
            ensureValid(tasks);
            const latestPlanPath = path.join(stateRoot, 'latest-plan.json');
            const selected = fs.existsSync(latestPlanPath)
                ? (readJson(latestPlanPath).selected ?? []).map(task => task.id)
                : [];
            pruneSourceSnapshots(state, selected);
        } else if (command === 'salvage') {
            ensureValid(tasks);
            if (activeClaims(state, new Date()).some(claim => claim.taskId === id)) {
                throw new Error(`Cannot regenerate salvage for ${id} while its claim is active; cancel or reopen and claim again`);
            }
            writeSalvageReport(taskById(tasks, id));
        } else if (command === 'claim') {
            ensureValid(tasks);
            const ownerIndex = flags.indexOf('--owner');
            const pathsIndex = flags.indexOf('--paths');
            claim(tasks, state, id, ownerIndex >= 0 ? flags[ownerIndex + 1] : null, pathsIndex >= 0 ? [flags[pathsIndex + 1]] : []);
        } else if (command === 'renew') {
            const tokenIndex = flags.indexOf('--token');
            renewClaim(state, id, tokenIndex >= 0 ? flags[tokenIndex + 1] : null);
        } else if (command === 'cancel') {
            const tokenIndex = flags.indexOf('--token');
            cancelClaim(state, id, tokenIndex >= 0 ? flags[tokenIndex + 1] : null);
        } else if (command === 'attach-evidence') {
            ensureValid(tasks);
            attachGateEvidence(tasks, id, flags[0], flags[1]);
        } else if (command === 'run-proof') {
            ensureValid(tasks);
            const separator = flags.indexOf('--');
            runProofCommand(tasks, id, flags[0], separator >= 0 ? flags.slice(separator + 1) : flags.slice(1));
        } else if (command === 'attest-reuse') {
            ensureValid(tasks);
            attestReuse(tasks, state, id, flags[0]);
        } else if (command === 'attest-review') {
            ensureValid(tasks);
            const reviewerIndex = flags.indexOf('--reviewer');
            const evidence = flags.find((value, index) => index !== reviewerIndex && index !== reviewerIndex + 1 && !value.startsWith('--'));
            attestReview(tasks, state, id, reviewerIndex >= 0 ? flags[reviewerIndex + 1] : null, evidence);
        } else if (command === 'run-review') {
            ensureValid(tasks);
            const providerIndex = flags.indexOf('--provider');
            const promptIndex = flags.indexOf('--prompt');
            runExternalReview(tasks, state, id, providerIndex >= 0 ? flags[providerIndex + 1] : null, promptIndex >= 0 ? flags[promptIndex + 1] : null);
        } else if (command === 'attest-approval') {
            ensureValid(tasks);
            attestApproval(tasks, state, id, flags[0], flags[1]);
        } else if (command === 'seal-proof') {
            ensureValid(tasks);
            const summaryIndex = flags.indexOf('--summary');
            sealProof(tasks, state, id, summaryIndex >= 0 ? flags[summaryIndex + 1] : null);
        } else if (command === 'verify-proof') {
            ensureValid(tasks);
            validateTaskProof(tasks, markdown, id);
        } else if (command === 'promote') {
            ensureValid(tasks);
            promote(tasks, markdown, state, id, flags.includes('--apply'));
        } else if (command === 'reopen') {
            ensureValid(tasks);
            const tokenIndex = flags.indexOf('--token');
            reopenPromotion(markdown, state, id, tokenIndex >= 0 ? flags[tokenIndex + 1] : null);
        } else if (command === 'checkpoint') {
            ensureValid(tasks);
            const commandFlags = [id, ...flags].filter(value => value !== undefined);
            const tokenIndex = commandFlags.indexOf('--token');
            const messageIndex = commandFlags.indexOf('--message');
            await checkpoint(tasks, state, tokenIndex >= 0 ? commandFlags[tokenIndex + 1] : null, messageIndex >= 0 ? commandFlags[messageIndex + 1] : null);
        } else if (command === 'verify-checkpoint') {
            const commandFlags = [id, ...flags].filter(value => value !== undefined);
            const tokenIndex = commandFlags.indexOf('--token');
            await verifyCheckpoint(state, tokenIndex >= 0 ? commandFlags[tokenIndex + 1] : null);
        } else if (command === 'record-release') {
            const commandFlags = [id, ...flags].filter(value => value !== undefined);
            const tagIndex = commandFlags.indexOf('--tag');
            await recordRelease(state, tagIndex >= 0 ? commandFlags[tagIndex + 1] : null);
        } else if (command === 'release-checklist') {
            ensureValid(tasks);
            releaseChecklist(state);
        } else {
            usage();
            process.exitCode = 2;
        }
    });
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
