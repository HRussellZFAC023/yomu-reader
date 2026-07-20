import crypto from 'node:crypto';

const SCHEMA = 'yomu-academy.salvage-audit/v2';
const DISPOSITIONS = new Set(['pending', 'reuse', 'reject']);
const CANDIDATE_LIMITS = Object.freeze({
    document: 100,
    branch: 100,
    worktree: 100,
    commit: 200,
    stash: 100,
    reflog: 100,
    'dangling-commit': 200,
    transcript: 100,
});
const STOP_WORDS = new Set([
    'academy', 'about', 'after', 'against', 'before', 'build', 'complete', 'every', 'from',
    'into', 'make', 'production', 'proof', 'ship', 'that', 'their', 'through', 'with',
    'without', 'workflow', 'yomu',
]);

export function salvageSha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
    }
    return value;
}

export function canonicalSalvageJson(value) {
    return JSON.stringify(canonicalize(value));
}

function hashObject(value) {
    return salvageSha256(canonicalSalvageJson(value));
}

function uniqueSorted(values = []) {
    return [...new Set(values.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))]
        .sort((left, right) => left.localeCompare(right, 'en'));
}

function lexicalTokens(value) {
    const normalized = String(value ?? '').normalize('NFKC').toLocaleLowerCase('en');
    const compounds = normalized.match(/[\p{L}\p{N}]+(?:[-_+][\p{L}\p{N}]+)*/gu) ?? [];
    const pieces = compounds.flatMap(token => token.split(/[-_+]+/u));
    return uniqueSorted([...compounds, ...pieces]);
}

export function tokenizeSalvageTask(task) {
    if (!task?.id || !task?.description) throw new TypeError('Task id and description are required');
    const id = String(task.id).normalize('NFKC').toLocaleLowerCase('en');
    const idTokens = lexicalTokens(id);
    const descriptionTokens = lexicalTokens(task.description)
        .filter(token => token.length >= 3 && !STOP_WORDS.has(token));
    const weighted = new Map();
    weighted.set(id, 12);
    for (const token of idTokens) weighted.set(token, Math.max(weighted.get(token) ?? 0, 8));
    for (const token of descriptionTokens) weighted.set(token, Math.max(weighted.get(token) ?? 0, 2));
    return {
        id,
        tokens: [...weighted.entries()]
            .map(([token, weight]) => ({ token, weight }))
            .sort((left, right) => right.weight - left.weight || left.token.localeCompare(right.token, 'en')),
        sha256: hashObject({ id, description: task.description, tokens: [...weighted.entries()].sort() }),
    };
}

function relevanceFor(value, query) {
    const haystack = new Set(lexicalTokens(value));
    const matches = query.tokens.filter(({ token }) => haystack.has(token));
    return {
        score: matches.reduce((total, match) => total + match.weight, 0),
        matchedTokens: matches.map(match => match.token),
    };
}

function isCandidateRelevant(relevance, query, kind = null) {
    const exactTaskId = query.id && relevance.matchedTokens.includes(query.id);
    if (exactTaskId) return true;
    if (kind === 'transcript') return relevance.score >= 10 && relevance.matchedTokens.length >= 5;
    return relevance.score >= 4 && relevance.matchedTokens.length >= 2;
}

function relevantLineExcerpts(text, query) {
    return String(text).split(/\r?\n/u)
        .map((lineText, index) => {
            const relevance = relevanceFor(lineText, query);
            return relevance.score > 0 ? {
                line: index + 1,
                text: lineText.trim(),
                matchedTokens: relevance.matchedTokens,
                sha256: salvageSha256(lineText),
            } : null;
        })
        .filter(Boolean);
}

export function indexRecoveryDocuments(documents = [], query) {
    if (!query?.tokens) throw new TypeError('A tokenized task query is required');
    return documents
        .map(document => {
            if (!document?.path || typeof document.text !== 'string') {
                throw new TypeError('Recovery documents require path and text');
            }
            const lines = document.text.split(/\r?\n/u);
            const row = {
                kind: 'document',
                path: document.path,
                configured: document.configured !== false,
                bytes: Buffer.byteLength(document.text),
                lineCount: lines.length,
                sha256: salvageSha256(document.text),
                excerpts: relevantLineExcerpts(document.text, query),
            };
            return { ...row, sourceId: stableSourceId(row) };
        })
        .sort((left, right) => left.path.localeCompare(right.path, 'en'));
}

function normalizeAheadBehind(row) {
    const supplied = row.aheadBehind ?? {};
    const ahead = row.ahead ?? supplied.ahead;
    const behind = row.behind ?? supplied.behind;
    const normalizeCount = value => Number.isInteger(value) && value >= 0 ? value : null;
    return {
        base: row.compareBase ?? supplied.base ?? 'origin/main',
        ahead: normalizeCount(ahead),
        behind: normalizeCount(behind),
    };
}

function normalizedChangeState(row) {
    const changedTrackedPaths = uniqueSorted(row.changedTrackedPaths ?? row.trackedPaths);
    const untrackedPaths = uniqueSorted(row.untrackedPaths);
    const statusText = String(row.statusText ?? '');
    const diffText = String(row.diffText ?? '');
    const dirty = typeof row.dirty === 'boolean'
        ? row.dirty
        : Boolean(changedTrackedPaths.length || untrackedPaths.length || statusText.trim() || diffText.trim());
    return {
        changedTrackedPaths,
        untrackedPaths,
        dirty,
        statusSha256: statusText ? salvageSha256(statusText) : row.statusSha256 ?? salvageSha256(''),
        diffSha256: diffText ? salvageSha256(diffText) : row.diffSha256 ?? salvageSha256(''),
    };
}

function stableSourceId(row) {
    const identity = row.kind === 'document'
        ? { kind: row.kind, path: row.path }
        : row.kind === 'worktree'
            ? { kind: row.kind, path: row.path, branch: row.branch ?? null, head: row.head ?? null }
            : row.kind === 'branch'
                ? { kind: row.kind, name: row.name, head: row.head ?? null }
                : { kind: row.kind, ref: row.ref ?? null, hash: row.hash ?? null, id: row.id ?? null };
    return `source-${row.kind}-${hashObject(identity).slice(0, 24)}`;
}

function normalizeBranch(row) {
    if (!row?.name) throw new TypeError('Branch rows require a name');
    const normalized = {
        kind: 'branch',
        name: row.name,
        head: row.head ?? null,
        branch: row.branch ?? row.name,
        upstream: row.upstream ?? null,
        subject: row.subject ?? null,
        aheadBehind: normalizeAheadBehind(row),
        ...normalizedChangeState(row),
    };
    return { ...normalized, sourceId: stableSourceId(normalized) };
}

function normalizeWorktree(row) {
    if (!row?.path) throw new TypeError('Worktree rows require a path');
    const normalized = {
        kind: 'worktree',
        path: row.path,
        head: row.head ?? null,
        branch: row.branch ?? null,
        subject: row.subject ?? null,
        aheadBehind: normalizeAheadBehind(row),
        ...normalizedChangeState(row),
    };
    return { ...normalized, sourceId: stableSourceId(normalized) };
}

function normalizeHistoryRow(kind, row) {
    const hash = row.hash ?? (kind === 'stash' ? row.commit : null);
    const ref = row.ref ?? row.selector ?? null;
    if (!hash && !ref && !row.id) throw new TypeError(`${kind} rows require a hash, ref, or id`);
    const normalized = {
        kind,
        hash: hash ?? null,
        ref,
        id: row.id ?? null,
        subject: row.subject ?? row.title ?? null,
        body: row.body ?? row.summary ?? null,
        changedPaths: uniqueSorted(row.changedPaths),
        commitHashes: uniqueSorted(row.commitHashes),
        taskIds: uniqueSorted(row.taskIds),
        path: row.path ?? null,
        threadId: row.threadId ?? null,
        metadataSha256: hashObject(row.metadata ?? {}),
    };
    return { ...normalized, sourceId: stableSourceId(normalized) };
}

function sortBySourceId(rows) {
    return rows.sort((left, right) => left.sourceId.localeCompare(right.sourceId, 'en'));
}

export function buildSalvageSourceInventory(sources = {}, query) {
    const categories = {
        documents: indexRecoveryDocuments(sources.documents ?? [], query),
        branches: sortBySourceId((sources.branches ?? []).map(normalizeBranch)),
        worktrees: sortBySourceId((sources.worktrees ?? []).map(normalizeWorktree)),
        commits: sortBySourceId((sources.commits ?? []).map(row => normalizeHistoryRow('commit', row))),
        stashes: sortBySourceId((sources.stashes ?? []).map(row => normalizeHistoryRow('stash', row))),
        reflog: sortBySourceId((sources.reflog ?? []).map(row => normalizeHistoryRow('reflog', row))),
        danglingCommits: sortBySourceId((sources.danglingCommits ?? []).map(row => normalizeHistoryRow('dangling-commit', row))),
        transcripts: sortBySourceId((sources.transcripts ?? []).map(row => normalizeHistoryRow('transcript', row))),
    };
    const counts = Object.fromEntries(Object.entries(categories).map(([name, rows]) => [name, rows.length]));
    const hashes = Object.fromEntries(Object.entries(categories).map(([name, rows]) => [name, hashObject(rows)]));
    return {
        categories,
        counts: { ...counts, total: Object.values(counts).reduce((sum, count) => sum + count, 0) },
        hashes,
        sha256: hashObject({ counts, hashes }),
    };
}

function searchableText(row) {
    if (row.kind === 'document') return row.excerpts.map(excerpt => excerpt.text).join('\n');
    return [
        row.name, row.path, row.branch, row.head, row.ref, row.hash, row.id, row.subject, row.body,
        ...(row.changedTrackedPaths ?? []), ...(row.untrackedPaths ?? []), ...(row.changedPaths ?? []),
        ...(row.commitHashes ?? []), ...(row.taskIds ?? []), row.threadId,
    ].filter(Boolean).join('\n');
}

function referencesFor(row) {
    return {
        paths: uniqueSorted([
            row.kind === 'document' ? row.path : null,
            ...(row.changedTrackedPaths ?? []),
            ...(row.untrackedPaths ?? []),
            ...(row.changedPaths ?? []),
            row.kind === 'transcript' ? row.path : null,
        ]),
        commits: uniqueSorted([
            ...(['commit', 'dangling-commit'].includes(row.kind) && row.hash ? [row.hash] : []),
            ...(row.commitHashes ?? []),
        ]),
    };
}

function candidateFromRow(taskId, row, relevance) {
    const references = referencesFor(row);
    const evidenceSha256 = hashObject(row);
    const candidateId = `candidate-${row.kind}-${hashObject({ taskId, sourceId: row.sourceId, evidenceSha256 }).slice(0, 24)}`;
    return {
        candidateId,
        sourceId: row.sourceId,
        kind: row.kind,
        relevance,
        evidenceSha256,
        references,
        disposition: {
            status: 'pending',
            reason: null,
            reusablePaths: [],
            reusableCommits: [],
        },
    };
}

function selectCandidateRows(rows, query) {
    const eligible = rows
        .map(row => ({ row, relevance: relevanceFor(searchableText(row), query) }))
        .filter(({ row, relevance }) => isCandidateRelevant(relevance, query, row.kind)
            || (row.kind === 'document' && row.excerpts.length > 0));
    const selected = [];
    const omitted = [];
    for (const kind of Object.keys(CANDIDATE_LIMITS)) {
        const candidates = eligible
            .filter(candidate => candidate.row.kind === kind)
            .sort((left, right) => (
                right.relevance.score - left.relevance.score
                || right.relevance.matchedTokens.length - left.relevance.matchedTokens.length
                || left.row.sourceId.localeCompare(right.row.sourceId, 'en')
            ));
        const exact = candidates.filter(candidate => candidate.relevance.matchedTokens.includes(query.id));
        const exactIds = new Set(exact.map(candidate => candidate.row.sourceId));
        const remaining = candidates.filter(candidate => !exactIds.has(candidate.row.sourceId));
        const allowance = Math.max(0, CANDIDATE_LIMITS[kind] - exact.length);
        selected.push(...exact, ...remaining.slice(0, allowance));
        omitted.push(...remaining.slice(allowance));
    }
    const countsFor = values => Object.fromEntries(Object.keys(CANDIDATE_LIMITS).map(kind => [
        kind,
        values.filter(value => value.row.kind === kind).length,
    ]));
    return {
        selected,
        metadata: {
            rule: 'all exact task-id matches, then deterministic top relevance per source kind',
            limits: CANDIDATE_LIMITS,
            eligibleCounts: countsFor(eligible),
            selectedCounts: countsFor(selected),
            omittedCounts: countsFor(omitted),
            omittedSha256: hashObject(omitted.map(candidate => ({
                sourceId: candidate.row.sourceId,
                relevance: candidate.relevance,
            })).sort((left, right) => left.sourceId.localeCompare(right.sourceId, 'en'))),
        },
    };
}

export function buildSalvageReport(task, sources = {}, options = {}) {
    const query = tokenizeSalvageTask(task);
    const inventory = buildSalvageSourceInventory(sources, query);
    const rows = Object.values(inventory.categories).flat();
    const selection = selectCandidateRows(rows, query);
    const candidates = selection.selected
        .map(({ row, relevance }) => candidateFromRow(task.id, row, relevance))
        .sort((left, right) => left.candidateId.localeCompare(right.candidateId, 'en'));
    const baseScan = canonicalize(options.baseScan ?? {});
    const reportInventory = options.compactInventory ? {
        counts: inventory.counts,
        hashes: inventory.hashes,
        sha256: inventory.sha256,
    } : inventory;
    return {
        schema: SCHEMA,
        task: { id: task.id, description: task.description, sha256: query.sha256 },
        generatedAt: options.generatedAt ?? new Date().toISOString(),
        baseScan,
        baseScanSha256: hashObject(baseScan),
        query,
        sourceSnapshot: options.sourceSnapshot ?? null,
        inventory: reportInventory,
        candidateSelection: selection.metadata,
        candidates,
        decision: {
            status: candidates.length ? 'pending' : 'complete',
            candidateCount: candidates.length,
            reuseCount: 0,
            rejectCount: 0,
        },
    };
}

function validateSha(label, value, errors) {
    if (!/^[a-f0-9]{64}$/u.test(value ?? '')) errors.push(`${label} must be a SHA-256 hash`);
}

function reportWithoutFileMetadata(report) {
    const clone = structuredClone(report);
    delete clone.reportFile;
    return clone;
}

export function validateSalvageReport(report, expected = {}) {
    const errors = [];
    if (report?.schema !== SCHEMA) errors.push(`Report schema must be ${SCHEMA}`);
    if (!report?.task?.id) errors.push('Report task id is required');
    validateSha('Task hash', report?.task?.sha256, errors);
    validateSha('Base scan hash', report?.baseScanSha256, errors);
    validateSha('Inventory hash', report?.inventory?.sha256, errors);

    if (report?.baseScanSha256 !== hashObject(report?.baseScan ?? {})) errors.push('Base scan hash does not match report inputs');
    const inventory = report?.inventory;
    const expectedInventory = expected.sources
        ? buildSalvageSourceInventory(expected.sources, tokenizeSalvageTask(expected.task ?? report.task))
        : null;
    const categories = inventory?.categories ?? expectedInventory?.categories;
    if (categories) {
        const counts = Object.fromEntries(Object.entries(categories).map(([name, rows]) => [name, rows.length]));
        const hashes = Object.fromEntries(Object.entries(categories).map(([name, rows]) => [name, hashObject(rows)]));
        const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
        if (canonicalSalvageJson(inventory.counts) !== canonicalSalvageJson({ ...counts, total })) {
            errors.push('Inventory counts do not match scanned source rows');
        }
        if (canonicalSalvageJson(inventory.hashes) !== canonicalSalvageJson(hashes)) {
            errors.push('Inventory category hashes do not match scanned source rows');
        }
        if (inventory.sha256 !== hashObject({ counts, hashes })) errors.push('Inventory hash does not match scanned source rows');

        if (report?.task?.id && report?.task?.description) {
            const query = tokenizeSalvageTask(report.task);
            const selection = selectCandidateRows(Object.values(categories).flat(), query);
            const expectedCandidates = selection.selected
                .map(({ row, relevance }) => candidateFromRow(report.task.id, row, relevance))
                .map(candidate => candidate.candidateId)
                .sort((left, right) => left.localeCompare(right, 'en'));
            const actualCandidates = (report.candidates ?? [])
                .map(candidate => candidate.candidateId)
                .sort((left, right) => left.localeCompare(right, 'en'));
            if (canonicalSalvageJson(actualCandidates) !== canonicalSalvageJson(expectedCandidates)) {
                errors.push('Candidate set does not match the deterministic ranked review queue');
            }
            if (canonicalSalvageJson(report.candidateSelection) !== canonicalSalvageJson(selection.metadata)) {
                errors.push('Candidate selection metadata does not account for the complete ranked source set');
            }
        }
    } else {
        errors.push('Inventory categories or the hashed source snapshot are required');
    }

    const candidateIds = new Set();
    let reuseCount = 0;
    let rejectCount = 0;
    for (const candidate of report?.candidates ?? []) {
        if (candidateIds.has(candidate.candidateId)) errors.push(`Duplicate candidate id ${candidate.candidateId}`);
        candidateIds.add(candidate.candidateId);
        const status = candidate.disposition?.status;
        if (!DISPOSITIONS.has(status)) errors.push(`${candidate.candidateId} has invalid disposition ${status}`);
        if (status === 'pending') errors.push(`${candidate.candidateId} is still pending`);
        if (!candidate.disposition?.reason?.trim()) errors.push(`${candidate.candidateId} needs a disposition reason`);
        if (status === 'reuse') {
            reuseCount += 1;
            const paths = uniqueSorted(candidate.disposition.reusablePaths);
            const commits = uniqueSorted(candidate.disposition.reusableCommits);
            if (!paths.length && !commits.length) errors.push(`${candidate.candidateId} reuse must name exact paths or commits`);
            for (const reusablePath of paths) {
                if (!candidate.references?.paths?.includes(reusablePath)) {
                    errors.push(`${candidate.candidateId} names unscanned reusable path ${reusablePath}`);
                }
            }
            for (const commit of commits) {
                if (!candidate.references?.commits?.includes(commit)) {
                    errors.push(`${candidate.candidateId} names unscanned reusable commit ${commit}`);
                }
            }
        }
        if (status === 'reject') rejectCount += 1;
    }
    const candidateCount = report?.candidates?.length ?? 0;
    if (report?.decision?.candidateCount !== candidateCount) errors.push('Decision candidate count is stale');
    if (report?.decision?.reuseCount !== reuseCount) errors.push('Decision reuse count is stale');
    if (report?.decision?.rejectCount !== rejectCount) errors.push('Decision reject count is stale');
    if (report?.decision?.status !== 'complete') errors.push('Salvage decision is not complete');
    if (reuseCount + rejectCount !== candidateCount) errors.push('Every salvage candidate must be reused or rejected');

    if (expected.task) {
        const query = tokenizeSalvageTask(expected.task);
        if (report.task?.id !== expected.task.id) errors.push(`Report belongs to ${report.task?.id}, not ${expected.task.id}`);
        if (report.task?.sha256 !== query.sha256) errors.push('Report task hash does not match expected task inputs');
    }
    if (expected.baseScan && report.baseScanSha256 !== hashObject(canonicalize(expected.baseScan))) {
        errors.push('Report base scan does not match expected scan inputs');
    }
    if (expected.sources && report.inventory?.categories
        && canonicalSalvageJson(report.inventory.categories) !== canonicalSalvageJson(expectedInventory.categories)) {
            errors.push('Report inventory does not match supplied source inputs');
    }
    if (expected.reportFile) {
        const { path, text, sha256 } = expected.reportFile;
        if (!path?.trim()) errors.push('Report file path is required');
        if (typeof text !== 'string') {
            errors.push('Report file text is required');
        } else {
            const actualHash = salvageSha256(text);
            if (sha256 && actualHash !== sha256) errors.push('Report file hash does not match file contents');
            try {
                const parsed = JSON.parse(text);
                if (canonicalSalvageJson(reportWithoutFileMetadata(parsed)) !== canonicalSalvageJson(reportWithoutFileMetadata(report))) {
                    errors.push('Report file contents do not match the report under validation');
                }
            } catch {
                errors.push('Report file is not valid JSON');
            }
        }
    }
    return errors;
}
