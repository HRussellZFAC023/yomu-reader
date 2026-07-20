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
    bindProofToClaim,
    activeClaims,
    changedFilesWithinOwnership,
    createWorkOrder,
    ensureInside,
    laneForTask,
    parseBacklog,
    progressSummary,
    proofTemplate,
    readJson,
    resolveDynamicDependencies,
    reuseReportPinErrors,
    sha256,
    taskDefinitionSha256,
    updateBacklogCheckbox,
    validateProof,
    validateWorkflow,
} from './lib/academy-workflow-model.mjs';
import {
    buildSalvageReport,
    validateSalvageReport,
} from './lib/academy-workflow-salvage.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
const stateRoot = process.env.YOMU_ACADEMY_WORKFLOW_STATE
    ? path.resolve(process.env.YOMU_ACADEMY_WORKFLOW_STATE)
    : path.join(gitCommonDir, 'yomu-academy-production-workflow');
const statePath = path.join(stateRoot, 'state.json');
const proofRoot = path.join(stateRoot, 'proofs');
const workOrderRoot = path.join(stateRoot, 'work-orders');
const stateLockPath = path.join(stateRoot, '.state.lock');
const integrationLockPath = path.join(stateRoot, '.integration.lock');
const unreachableCachePath = path.join(stateRoot, 'reuse-index', 'unreachable-commits.json');
const transcriptCachePath = path.join(stateRoot, 'reuse-index', 'transcripts.json');
const sourceSnapshotRoot = path.join(stateRoot, 'reuse-index', 'source-snapshots');

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

function saveState(state) {
    fs.mkdirSync(stateRoot, { recursive: true });
    const temporary = `${statePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
    fs.renameSync(temporary, statePath);
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
    for (let attempt = 0; attempt < 8; attempt += 1) {
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
            const ageMs = Date.now() - fs.statSync(lockPath).mtimeMs;
            let alive = false;
            if (existing?.hostname === os.hostname() && Number.isInteger(existing.pid)) {
                try {
                    process.kill(existing.pid, 0);
                    alive = true;
                } catch (signalError) {
                    alive = signalError?.code === 'EPERM';
                }
            }
            const remotelyFresh = existing?.hostname !== os.hostname() && ageMs < 60 * 60 * 1000;
            if (alive || remotelyFresh || ageMs < 30_000) {
                throw new Error(`Workflow lock is already held: ${path.basename(lockPath)}`);
            }
            const before = fs.lstatSync(lockPath);
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
    try {
        return callback();
    } finally {
        fs.closeSync(descriptor);
        try {
            const current = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
            if (current.token === owner.token) fs.unlinkSync(lockPath);
        } catch {
            // Another process cannot legitimately replace a held lock; leave anomalies for stale recovery.
        }
    }
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

function cleanStatus() {
    return gitLines('status', '--porcelain=v1', '--untracked-files=all');
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
        return { root: root.name, path: absolute, bytes: stat.size, mtimeMs: Math.trunc(stat.mtimeMs) };
    }));
    return {
        roots: roots.map(root => ({ ...root, fileCount: files.filter(file => file.root === root.name).length })),
        files,
        sha256: sha256(JSON.stringify(files)),
    };
}

function transcriptSample(absolute, bytes) {
    const width = 64 * 1024;
    const descriptor = fs.openSync(absolute, 'r');
    try {
        const first = Buffer.alloc(Math.min(width, bytes));
        fs.readSync(descriptor, first, 0, first.length, 0);
        const lastSize = Math.min(width, Math.max(0, bytes - first.length));
        const last = Buffer.alloc(lastSize);
        if (lastSize) fs.readSync(descriptor, last, 0, lastSize, Math.max(0, bytes - lastSize));
        return `${first.toString('utf8')}\n__YOMU_SAMPLE_BREAK__\n${last.toString('utf8')}`;
    } finally {
        fs.closeSync(descriptor);
    }
}

function transcriptLexicalSummary(sample) {
    const [first = '', last = ''] = sample.split('__YOMU_SAMPLE_BREAK__');
    const collect = (text, limit) => {
        const words = text.normalize('NFKC').match(/[\p{L}\p{N}_-]{3,48}/gu) ?? [];
        const seen = new Set();
        const result = [];
        for (const word of words) {
            const normalized = word.toLocaleLowerCase('en');
            if (seen.has(normalized)) continue;
            seen.add(normalized);
            result.push(normalized);
            if (result.length >= limit) break;
        }
        return result;
    };
    return [...new Set([...collect(first, 128), ...collect(last, 128)])].join(' ');
}

function indexTranscripts() {
    const manifest = transcriptManifest();
    const rows = [];
    for (const file of manifest.files) {
        const sample = transcriptSample(file.path, file.bytes);
        if (!/yomu|academy|よむ/iu.test(file.path) && !/yomu|academy|よむ/iu.test(sample)) continue;
        const compactSample = transcriptLexicalSummary(sample);
        const threadId = path.basename(file.path, '.jsonl');
        rows.push({
            id: threadId,
            threadId,
            path: file.path,
            title: path.basename(path.dirname(file.path)),
            summary: compactSample,
            metadata: { bytes: file.bytes, mtimeMs: file.mtimeMs, sampleSha256: sha256(sample) },
        });
    }
    fs.mkdirSync(path.dirname(transcriptCachePath), { recursive: true });
    fs.writeFileSync(transcriptCachePath, `${JSON.stringify({
        schema: 'yomu-academy.transcript-index/v1',
        generatedAt: new Date().toISOString(),
        manifest: {
            roots: manifest.roots,
            sha256: manifest.sha256,
            fileCount: manifest.files.length,
            files: manifest.files,
        },
        rows,
    })}\n`);
    console.log(`Indexed ${rows.length}/${manifest.files.length} Yomu transcript(s) -> ${path.relative(repoRoot, transcriptCachePath)}`);
}

function transcriptIndexFresh(cache) {
    if (!cache || cache.schema !== 'yomu-academy.transcript-index/v1') return false;
    const generatedAt = Date.parse(cache.generatedAt);
    const maxAgeMs = (config.reuse.transcriptIndexMaxAgeHours ?? 24) * 60 * 60 * 1000;
    if (Number.isNaN(generatedAt) || Date.now() - generatedAt > maxAgeMs) return false;
    const cachedFiles = cache.manifest?.files;
    if (!Array.isArray(cachedFiles)) return false;
    const current = transcriptManifest();
    const currentByPath = new Map(current.files.map(file => [file.path, file]));
    const cachedByPath = new Map(cachedFiles.map(file => [file.path, file]));
    const activeCutoff = Date.now() - (config.reuse.transcriptActiveGraceMinutes ?? 30) * 60 * 1000;
    for (const cached of cachedFiles) {
        const now = currentByPath.get(cached.path);
        if (!now || now.bytes < cached.bytes) return false;
        if ((now.bytes !== cached.bytes || now.mtimeMs !== cached.mtimeMs) && now.mtimeMs < activeCutoff) return false;
    }
    for (const file of current.files) {
        if (!cachedByPath.has(file.path) && file.mtimeMs < activeCutoff) return false;
    }
    return true;
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
            return {
                name,
                head,
                subject: subject.join('\t'),
                ahead: Number.isInteger(ahead) ? ahead : null,
                behind: Number.isInteger(behind) ? behind : null,
                changedTrackedPaths,
                untrackedPaths: [],
            };
        });
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
                status: 'cached',
                generatedAt: danglingCache.generatedAt,
                originMain: danglingCache.originMain,
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
        const temporary = `${outputPath}.${process.pid}.tmp`;
        fs.writeFileSync(temporary, compressed);
        fs.renameSync(temporary, outputPath);
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
    const snapshotPath = resolveEvidencePath(reference.path);
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
    fs.mkdirSync(outputRoot, { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`${task.id}: scanned ${report.inventory.counts.total} sources, found ${report.candidates.length} candidate(s) -> ${path.relative(repoRoot, outputPath)}`);
    return { report, outputPath };
}

function indexUnreachableCommits() {
    const result = spawnSync('git', ['fsck', '--unreachable', '--no-reflogs', '--full', '--no-progress'], {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });
    if (result.status !== 0) throw new Error(`git fsck failed: ${result.stderr || result.stdout}`);
    const hashes = (result.stdout ?? '').split(/\r?\n/u)
        .filter(line => /^unreachable commit /u.test(line))
        .map(line => line.split(/\s+/u).at(-1));
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
    fs.mkdirSync(path.dirname(unreachableCachePath), { recursive: true });
    fs.writeFileSync(unreachableCachePath, `${JSON.stringify({
        schema: 'yomu-academy.unreachable-index/v1',
        generatedAt: new Date().toISOString(),
        originMain: git('rev-parse', 'origin/main'),
        rows,
    }, null, 2)}\n`);
    console.log(`Indexed ${rows.length} unreachable commit(s) -> ${path.relative(repoRoot, unreachableCachePath)}`);
}

function ensureValid(tasks) {
    const result = validateWorkflow(tasks, config);
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

function printStatus(tasks, state) {
    const summary = progressSummary(tasks);
    const active = activeClaims(state, new Date());
    console.log(`Academy production: ${summary.complete}/${summary.total} (${summary.percent}%)`);
    for (const [priority, counts] of Object.entries(summary.byPriority)) {
        console.log(`${priority}: ${counts.complete}/${counts.total}`);
    }
    console.log(`Active claims: ${active.length}`);
    for (const claim of active) console.log(`- ${claim.taskId} -> ${claim.owner} [${claim.lane}]`);
}

function writePlan(tasks, markdown, state) {
    const backlogSha = sha256(markdown);
    const plan = buildPlan(tasks, config, state);
    fs.mkdirSync(workOrderRoot, { recursive: true });
    const sources = reuseSources();
    const sourceSnapshot = persistSourceSnapshot(sources);
    for (const task of plan.selected) {
        const salvage = writeSalvageReport(task, sources, sourceSnapshot);
        fs.writeFileSync(path.join(workOrderRoot, `${task.id}.md`), createWorkOrder(task, config, backlogSha));
        const proofPath = path.join(proofRoot, `${task.id}.json`);
        const existingProof = fs.existsSync(proofPath) ? readJson(proofPath) : null;
        if (!existingProof || existingProof.schema !== 'yomu-academy.production-proof/v2'
            || existingProof.taskDefinitionSha256 !== taskDefinitionSha256(task)) {
            fs.mkdirSync(proofRoot, { recursive: true });
            const proof = proofTemplate(task, config, safeHead());
            proof.backlogSha256 = backlogSha;
            proof.reuseAudit.report = evidenceReference(salvage.outputPath);
            fs.writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`);
        }
    }
    fs.writeFileSync(path.join(stateRoot, 'latest-plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
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
    for (const entry of fs.readdirSync(sourceSnapshotRoot, { withFileTypes: true })) {
        if (!entry.isFile() || keep.has(entry.name)) continue;
        const target = path.join(sourceSnapshotRoot, entry.name);
        const stat = fs.statSync(target);
        fs.unlinkSync(target);
        removed += 1;
        bytes += stat.size;
    }
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
    const files = [...new Set(values.flatMap(value => String(value).split(',')).map(value => value.trim()).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right, 'en'));
    if (!files.length) throw new Error('claim requires --paths FILE[,FILE...] with the exact planned write set');
    for (const file of files) {
        if (path.isAbsolute(file) || file.split('/').includes('..') || file.endsWith('/')) {
            throw new Error(`Unsafe reserved file path: ${file}`);
        }
    }
    const lane = laneForTask(task, config);
    const outside = changedFilesWithinOwnership(files, lane?.ownership ?? []);
    if (outside.length) throw new Error(`Reserved files escape ${lane?.id} ownership: ${outside.join(', ')}`);
    return files;
}

function reservationKey(file) {
    return file.normalize('NFC').toLocaleLowerCase('en-US');
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
    saveState(state);
    const orderPath = path.join(workOrderRoot, `${id}.md`);
    const order = createWorkOrder(task, config, sha256(fs.readFileSync(backlogPath, 'utf8')))
        .replace('Owner: unclaimed', `Owner: ${owner}\nClaim token: \`${token}\``);
    fs.mkdirSync(workOrderRoot, { recursive: true });
    fs.writeFileSync(orderPath, order);
    const proofPath = path.join(proofRoot, `${id}.json`);
    fs.mkdirSync(proofRoot, { recursive: true });
    const proof = bindProofToClaim(task, config, sha256(fs.readFileSync(backlogPath, 'utf8')), claimRow);
    fs.writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`);
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
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(proof, null, 2)}\n`);
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

function evidenceReference(candidate) {
    const absolute = path.isAbsolute(candidate) ? candidate : resolveEvidencePath(candidate);
    if (!isInside(repoRoot, absolute) && !isInside(stateRoot, absolute)) {
        throw new Error(`Evidence path is outside the repository and shared workflow state: ${candidate}`);
    }
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
        throw new Error(`Evidence file does not exist: ${candidate}`);
    }
    const evidencePath = isInside(stateRoot, absolute)
        ? `@workflow-state/${path.relative(stateRoot, absolute)}`
        : path.relative(repoRoot, absolute);
    return { path: evidencePath, sha256: sha256(fs.readFileSync(absolute)) };
}

function attachGateEvidence(tasks, id, gate, candidate) {
    const task = taskById(tasks, id);
    if (!task.gates.includes(gate)) throw new Error(`${id} does not require gate ${gate}`);
    const { target, proof } = readProof(id);
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
    fs.mkdirSync(transcriptRoot, { recursive: true });
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
    fs.writeFileSync(transcriptPath, `${JSON.stringify(transcript, null, 2)}\n`);
    const record = {
        command: commandArgs,
        exitCode: transcript.exitCode,
        headCommit,
        recordedBy: 'academy-production-workflow',
        transcript: evidenceReference(transcriptPath),
    };
    proof.gates[gate].commands.push(record);
    writeProof(target, proof);
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
    const absolute = resolveEvidencePath(reference.path);
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

function attestReview(tasks, id, reviewer, candidate) {
    taskById(tasks, id);
    if (!reviewer) throw new Error('attest-review requires --reviewer NAME');
    const { target, proof } = readProof(id);
    if (reviewer === proof.owner) throw new Error('Independent reviewer must differ from task owner');
    proof.independentReview = {
        status: 'pass',
        reviewer,
        evidence: evidenceReference(candidate),
        findingsResolved: proof.independentReview?.findingsResolved ?? [],
    };
    writeProof(target, proof);
    console.log(`Attested independent review for ${id}`);
}

function attestApproval(tasks, id, requirement, candidate) {
    const task = taskById(tasks, id);
    if (!(task.requirements ?? []).includes(requirement)) throw new Error(`${id} does not require ${requirement}`);
    const { target, proof } = readProof(id);
    proof.approvals[requirement] = { status: 'pass', evidence: evidenceReference(candidate) };
    writeProof(target, proof);
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
            commandTranscripts.set(reference.path, readJson(resolveEvidencePath(reference.path)));
        } catch {
            // Validation reports unreadable transcript evidence.
        }
    }
    return { hashes, commandTranscripts };
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
            const absolute = resolveEvidencePath(reportPath);
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
    const { proof } = validateTaskProof(tasks, markdown, id);
    if (!apply) {
        console.log(`Dry run only. Re-run with --apply to check ${id}.`);
        return;
    }
    const task = taskById(tasks, id);
    for (const dep of task.deps) {
        if (!taskById(tasks, dep).complete) throw new Error(`${id} still depends on open task ${dep}`);
    }
    const dynamicDeps = resolveDynamicDependencies(task, tasks, config, state);
    if (dynamicDeps === null) throw new Error(`${id} has an unresolved dynamic dependency`);
    for (const dep of dynamicDeps) {
        if (!taskById(tasks, dep).complete) throw new Error(`${id} release scope still depends on open task ${dep}`);
    }
    fs.writeFileSync(backlogPath, updateBacklogCheckbox(markdown, id));
    const promotion = {
        taskId: id,
        promotedAt: new Date().toISOString(),
        baseCommit: proof.baseCommit,
        headCommit: proof.headCommit,
        proofSha256: sha256(fs.readFileSync(proofFile(id))),
        userVisible: proof.release.userVisible,
        releaseNotes: proof.release.releaseNotes,
        status: 'awaiting-checkpoint',
    };
    const existing = (state.promotions ?? []).find(row => row.taskId === id && row.status === 'awaiting-checkpoint');
    if (existing) Object.assign(existing, promotion);
    else state.promotions.push(promotion);
    saveState(state);
    console.log(`Promoted ${id}. Commit and push this verified slice now.`);
    if (proof.release.userVisible) console.log('This slice is user-visible: run the release preflight and publish it after push.');
}

function releaseChecklist(state) {
    const pending = (state.promotions ?? []).filter(row => (
        row.status === 'awaiting-checkpoint' || row.status === 'awaiting-release'
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
    for (const command of config.release.postPushChecks) console.log(`  ${command}`);
}

function runConfiguredCommand(command) {
    const result = spawnSync(command, {
        cwd: repoRoot,
        shell: true,
        stdio: 'inherit',
    });
    if (result.status !== 0) throw new Error(`Release command failed (${result.status}): ${command}`);
}

function isPreparedCheckpointCommit(taskHead) {
    const current = safeHead();
    if (current === taskHead || !gitSucceeds('rev-parse', 'HEAD^')) return false;
    if (git('rev-parse', 'HEAD^') !== taskHead) return false;
    const changed = gitLines('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD');
    return changed.length === 1 && changed[0] === config.canonicalBacklog;
}

function checkpoint(state, message) {
    const pending = (state.promotions ?? []).filter(row => row.status === 'awaiting-checkpoint');
    if (pending.length !== 1) {
        throw new Error(`Checkpoint requires exactly one promoted slice; found ${pending.length}`);
    }
    const status = cleanStatus();
    const allowed = new Set([` M ${config.canonicalBacklog}`, `M  ${config.canonicalBacklog}`]);
    const outside = status.filter(line => !allowed.has(line));
    if (outside.length) throw new Error(`Integration checkout contains unrelated changes:\n${outside.join('\n')}`);
    git('fetch', 'origin', 'main');
    const originMainBefore = git('rev-parse', 'origin/main');
    const expectedBase = pending[0].baseCommit;
    let prepared = isPreparedCheckpointCommit(pending[0].headCommit);
    if (prepared && (
        pending[0].checkpointGateHead !== pending[0].headCommit
        || !pending[0].checkpointGatesPassedAt
    )) {
        throw new Error('Prepared checkpoint commit has no recorded gate pass; reopen and regenerate it through the workflow');
    }
    const alreadyPushed = prepared && gitSucceeds('merge-base', '--is-ancestor', safeHead(), 'origin/main');
    if (originMainBefore !== expectedBase && !alreadyPushed) {
        throw new Error(`origin/main advanced after proof. Run reopen ${pending[0].taskId} with its claim token, then rebase, refresh salvage, claim again, rerun gates/review, reseal, and promote.`);
    }
    if (!prepared) {
        if (safeHead() !== pending[0].headCommit) throw new Error('Checkpoint checkout is not at the certified task HEAD or a retryable prepared checkpoint commit');
        for (const command of config.release.preCommitCommands) runConfiguredCommand(command);
        const statusAfterGates = cleanStatus();
        const outsideAfterGates = statusAfterGates.filter(line => !allowed.has(line));
        if (outsideAfterGates.length) {
            throw new Error(`Checkpoint gates changed files outside the backlog:\n${outsideAfterGates.join('\n')}`);
        }
        pending[0].checkpointGateHead = pending[0].headCommit;
        pending[0].checkpointGatesPassedAt = new Date().toISOString();
        saveState(state);
        git('add', '--', config.canonicalBacklog);
        git('commit', '-m', message || `chore(academy): promote ${pending[0].taskId}`);
        if (cleanStatus().length) throw new Error('Checkpoint commit left a dirty checkout; refusing to push');
        prepared = true;
    }
    if (config.release.pushEveryCheckpoint && !alreadyPushed) git('push', 'origin', 'HEAD:main');
    git('fetch', 'origin', 'main');
    const headCommit = safeHead();
    if (!gitSucceeds('merge-base', '--is-ancestor', headCommit, 'origin/main')) {
        throw new Error('Checkpoint commit is not present on origin/main');
    }
    for (const row of pending) {
        row.status = row.userVisible ? 'awaiting-release' : 'checkpointed';
        row.checkpointCommit = headCommit;
    }
    const claim = (state.claims ?? []).find(row => (
        row.taskId === pending[0].taskId && row.status === 'active'
    ));
    if (claim) {
        claim.status = 'checkpointed';
        claim.checkpointedAt = new Date().toISOString();
    }
    state.checkpoints ??= [];
    state.checkpoints.push({
        taskIds: pending.map(row => row.taskId),
        committedAt: new Date().toISOString(),
        commit: headCommit,
        pushed: config.release.pushEveryCheckpoint,
    });
    saveState(state);
    for (const command of config.release.postPushChecks) runConfiguredCommand(command);
    console.log(`Checkpoint pushed at ${headCommit}`);
    if (pending.some(row => row.userVisible)) {
        console.log('User-visible slices are awaiting a verified versioned release.');
    }
}

function reopenPromotion(markdown, state, id, token) {
    const claim = (state.claims ?? []).find(row => (
        row.taskId === id && row.token === token && row.status === 'active'
    ));
    if (!claim) throw new Error(`No active matching claim for ${id}`);
    if (Date.parse(claim.expiresAt) <= Date.now()) throw new Error(`Claim ${id} has expired; cancel the stale promotion and claim again`);
    const promotion = [...(state.promotions ?? [])].reverse().find(row => (
        row.taskId === id && row.status === 'awaiting-checkpoint'
    ));
    if (!promotion) throw new Error(`No pending promotion for ${id}`);
    const status = cleanStatus();
    const allowed = new Set([` M ${config.canonicalBacklog}`, `M  ${config.canonicalBacklog}`]);
    const outside = status.filter(line => !allowed.has(line));
    if (outside.length) throw new Error(`Cannot reopen with unrelated changes:\n${outside.join('\n')}`);
    fs.writeFileSync(backlogPath, updateBacklogCheckbox(markdown, id, false));
    promotion.status = 'reopened';
    promotion.reopenedAt = new Date().toISOString();
    claim.status = 'cancelled';
    claim.cancelledAt = new Date().toISOString();
    claim.cancelReason = 'promotion-reopened-for-new-base';
    saveState(state);
    console.log(`Reopened ${id} and cancelled its stale-base claim; rebase, refresh salvage, claim again, rerun gates/review, reseal, and promote.`);
}

function recordRelease(state, tag) {
    if (!tag) throw new Error('record-release requires --tag vX.Y.Z');
    const pending = (state.promotions ?? []).filter(row => row.status === 'awaiting-release');
    if (!pending.length) throw new Error('No user-visible checkpoint is awaiting release');
    for (const command of config.release.preReleaseCommands) runConfiguredCommand(command);
    git('fetch', 'origin', '--tags');
    const gh = process.env.GH_BIN || 'gh';
    const release = JSON.parse(execFileSync(gh, [
        'release', 'view', tag, '--json', 'url,isDraft,isLatest,tagName,targetCommitish,assets',
    ], { cwd: repoRoot, encoding: 'utf8' }));
    if (release.isDraft) throw new Error(`${tag} is still a draft`);
    if (!release.isLatest) throw new Error(`${tag} is not marked as the latest release`);
    if (!release.assets?.some(asset => asset.name === 'yomu.user.js')) {
        throw new Error(`${tag} does not contain yomu.user.js`);
    }
    const originMain = git('rev-parse', 'origin/main');
    const tagCommit = git('rev-list', '-n', '1', tag);
    if (tagCommit !== originMain) throw new Error('Latest release tag must point at current origin/main');
    const releasable = pending.filter(row => gitSucceeds('merge-base', '--is-ancestor', row.checkpointCommit, tagCommit));
    if (!releasable.length) throw new Error('Release tag does not contain any pending checkpoint');
    const downloadRoot = path.join(stateRoot, 'release-checks', tag);
    fs.mkdirSync(downloadRoot, { recursive: true });
    execFileSync(gh, ['release', 'download', tag, '--pattern', 'yomu.user.js', '--dir', downloadRoot, '--clobber'], {
        cwd: repoRoot,
        stdio: 'ignore',
    });
    const downloadedAsset = path.join(downloadRoot, 'yomu.user.js');
    const releasedAssetSha256 = sha256(fs.readFileSync(downloadedAsset));
    const taggedAssetSha256 = sha256(execFileSync('git', ['show', `${tag}:dist/yomu.user.js`], { cwd: repoRoot }));
    if (releasedAssetSha256 !== taggedAssetSha256) throw new Error('Release asset bytes do not match dist/yomu.user.js at the release tag');
    const releaseVersion = tag.replace(/^v/u, '');
    const taggedChangelog = execFileSync('git', ['show', `${tag}:CHANGELOG.md`], { cwd: repoRoot, encoding: 'utf8' });
    if (!taggedChangelog.includes(`## [${releaseVersion}]`)) {
        throw new Error(`CHANGELOG.md at ${tag} has no ${releaseVersion} release entry`);
    }
    const deployment = execFileSync(gh, [
        'run', 'list', '--workflow', 'Deploy Docs', '--commit', tagCommit, '--limit', '1',
        '--json', 'url,status,conclusion,headSha',
    ], { cwd: repoRoot, encoding: 'utf8' });
    const runs = JSON.parse(deployment);
    if (!runs[0] || runs[0].headSha !== originMain || runs[0].conclusion !== 'success') {
        throw new Error('Deploy Docs has not succeeded for current origin/main');
    }
    for (const row of releasable) row.status = 'released';
    state.releases ??= [];
    state.releases.push({
        tag,
        url: release.url,
        taskIds: releasable.map(row => row.taskId),
        commit: originMain,
        tagCommit,
        deploymentUrl: runs[0].url,
        assetSha256: releasedAssetSha256,
        recordedAt: new Date().toISOString(),
    });
    saveState(state);
    console.log(`Recorded verified release ${tag}: ${release.url}`);
}

function usage() {
    console.log(`Usage:
  node scripts/academy-production-workflow.mjs validate
  node scripts/academy-production-workflow.mjs status
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
  node scripts/academy-production-workflow.mjs attest-review TASK --reviewer NAME FILE
  node scripts/academy-production-workflow.mjs attest-approval TASK REQUIREMENT FILE
  node scripts/academy-production-workflow.mjs seal-proof TASK --summary TEXT
  node scripts/academy-production-workflow.mjs verify-proof TASK
  node scripts/academy-production-workflow.mjs promote TASK [--apply]
  node scripts/academy-production-workflow.mjs reopen TASK --token TOKEN
  node scripts/academy-production-workflow.mjs checkpoint --message TEXT
  node scripts/academy-production-workflow.mjs record-release --tag vX.Y.Z
  node scripts/academy-production-workflow.mjs release-checklist`);
}

const [command = 'status', id, ...flags] = process.argv.slice(2);
const { markdown, tasks } = load();
const state = loadState();

try {
    if (command === 'validate') {
        ensureValid(tasks);
        console.log(`Workflow valid: ${tasks.length} canonical tasks, ${config.lanes.length} lanes`);
    } else if (command === 'status') {
        ensureValid(tasks);
        printStatus(tasks, state);
    } else if (command === 'plan') {
        ensureValid(tasks);
        withLock(stateLockPath, () => writePlan(tasks, markdown, loadState()));
    } else if (command === 'index-unreachable') {
        ensureValid(tasks);
        withLock(stateLockPath, indexUnreachableCommits);
    } else if (command === 'index-transcripts') {
        ensureValid(tasks);
        withLock(stateLockPath, indexTranscripts);
    } else if (command === 'prune-state') {
        ensureValid(tasks);
        withLock(stateLockPath, () => {
            const latestPlanPath = path.join(stateRoot, 'latest-plan.json');
            const selected = fs.existsSync(latestPlanPath)
                ? (readJson(latestPlanPath).selected ?? []).map(task => task.id)
                : [];
            pruneSourceSnapshots(loadState(), selected);
        });
    } else if (command === 'salvage') {
        ensureValid(tasks);
        withLock(stateLockPath, () => {
            if (activeClaims(loadState(), new Date()).some(claim => claim.taskId === id)) {
                throw new Error(`Cannot regenerate salvage for ${id} while its claim is active; cancel or reopen and claim again`);
            }
            writeSalvageReport(taskById(tasks, id));
        });
    } else if (command === 'claim') {
        ensureValid(tasks);
        const ownerIndex = flags.indexOf('--owner');
        const pathsIndex = flags.indexOf('--paths');
        const requestedPaths = pathsIndex >= 0 ? [flags[pathsIndex + 1]] : [];
        withLock(stateLockPath, () => claim(
            tasks,
            loadState(),
            id,
            ownerIndex >= 0 ? flags[ownerIndex + 1] : null,
            requestedPaths,
        ));
    } else if (command === 'renew') {
        const tokenIndex = flags.indexOf('--token');
        withLock(stateLockPath, () => renewClaim(loadState(), id, tokenIndex >= 0 ? flags[tokenIndex + 1] : null));
    } else if (command === 'cancel') {
        const tokenIndex = flags.indexOf('--token');
        withLock(stateLockPath, () => cancelClaim(loadState(), id, tokenIndex >= 0 ? flags[tokenIndex + 1] : null));
    } else if (command === 'attach-evidence') {
        ensureValid(tasks);
        withLock(stateLockPath, () => attachGateEvidence(tasks, id, flags[0], flags[1]));
    } else if (command === 'run-proof') {
        ensureValid(tasks);
        const separator = flags.indexOf('--');
        const commandArgs = separator >= 0 ? flags.slice(separator + 1) : flags.slice(1);
        withLock(stateLockPath, () => runProofCommand(tasks, id, flags[0], commandArgs));
    } else if (command === 'attest-reuse') {
        ensureValid(tasks);
        withLock(stateLockPath, () => attestReuse(tasks, loadState(), id, flags[0]));
    } else if (command === 'attest-review') {
        ensureValid(tasks);
        const reviewerIndex = flags.indexOf('--reviewer');
        const evidence = flags.find((value, index) => index !== reviewerIndex && index !== reviewerIndex + 1 && !value.startsWith('--'));
        withLock(stateLockPath, () => attestReview(tasks, id, reviewerIndex >= 0 ? flags[reviewerIndex + 1] : null, evidence));
    } else if (command === 'attest-approval') {
        ensureValid(tasks);
        withLock(stateLockPath, () => attestApproval(tasks, id, flags[0], flags[1]));
    } else if (command === 'seal-proof') {
        ensureValid(tasks);
        const summaryIndex = flags.indexOf('--summary');
        withLock(stateLockPath, () => sealProof(tasks, loadState(), id, summaryIndex >= 0 ? flags[summaryIndex + 1] : null));
    } else if (command === 'verify-proof') {
        ensureValid(tasks);
        validateTaskProof(tasks, markdown, id);
    } else if (command === 'promote') {
        ensureValid(tasks);
        withLock(integrationLockPath, () => withLock(stateLockPath, () => (
            promote(tasks, markdown, loadState(), id, flags.includes('--apply'))
        )));
    } else if (command === 'reopen') {
        ensureValid(tasks);
        const tokenIndex = flags.indexOf('--token');
        withLock(integrationLockPath, () => withLock(stateLockPath, () => (
            reopenPromotion(markdown, loadState(), id, tokenIndex >= 0 ? flags[tokenIndex + 1] : null)
        )));
    } else if (command === 'checkpoint') {
        const commandFlags = [id, ...flags].filter(value => value !== undefined);
        const messageIndex = commandFlags.indexOf('--message');
        withLock(integrationLockPath, () => withLock(stateLockPath, () => (
            checkpoint(loadState(), messageIndex >= 0 ? commandFlags[messageIndex + 1] : null)
        )));
    } else if (command === 'record-release') {
        const commandFlags = [id, ...flags].filter(value => value !== undefined);
        const tagIndex = commandFlags.indexOf('--tag');
        withLock(integrationLockPath, () => withLock(stateLockPath, () => (
            recordRelease(loadState(), tagIndex >= 0 ? commandFlags[tagIndex + 1] : null)
        )));
    } else if (command === 'release-checklist') {
        ensureValid(tasks);
        releaseChecklist(state);
    } else {
        usage();
        process.exitCode = 2;
    }
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
