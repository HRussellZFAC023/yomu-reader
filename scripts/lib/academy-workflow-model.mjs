import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const CANONICAL_GATES = new Set(['C', 'R', 'T', 'Q', 'S', 'O', 'D']);
const CANONICAL_REQUIREMENTS = new Set(['owner']);

export function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

export function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function pathIsInside(root, candidate) {
    const relative = path.relative(root, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function resolveConfinedFile(candidate, roots) {
    const lexical = path.resolve(candidate);
    const root = roots.map(value => path.resolve(value)).find(value => pathIsInside(value, lexical));
    if (!root) throw new Error(`Path is outside its allowed roots: ${candidate}`);
    if (!fs.existsSync(lexical) || !fs.statSync(lexical).isFile()) throw new Error(`File does not exist: ${candidate}`);
    if (fs.lstatSync(lexical).isSymbolicLink()) throw new Error(`File cannot be a symbolic link: ${candidate}`);
    const realRoot = fs.realpathSync.native(root);
    const absolute = fs.realpathSync.native(lexical);
    if (!pathIsInside(realRoot, absolute)) throw new Error(`Path resolves outside its allowed root: ${candidate}`);
    return { absolute, root, realRoot };
}

function expandRange(prefix, from, to) {
    const width = Math.max(from.length, to.length);
    const start = Number(from);
    const end = Number(to);
    if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) {
        throw new TypeError(`Invalid dependency range ${prefix}-${from} to ${prefix}-${to}`);
    }
    return Array.from({ length: end - start + 1 }, (_, index) => (
        `${prefix}-${String(start + index).padStart(width, '0')}`
    ));
}

function parseDependencies(value) {
    if (!value || /^none$/iu.test(value.trim())) return { ids: [], dynamic: null };

    const ids = new Set();
    const rangePattern = /`?([A-Z][A-Z0-9]*)-(\d+)`?\s+to\s+`?\1-(\d+)`?/gu;
    const withoutRanges = value.replace(rangePattern, (_, prefix, from, to) => {
        for (const id of expandRange(prefix, from, to)) ids.add(id);
        return ' ';
    });

    for (const match of withoutRanges.matchAll(/`?([A-Z][A-Z0-9]*-\d+)`?/gu)) ids.add(match[1]);
    const residue = withoutRanges
        .replace(/`?[A-Z][A-Z0-9]*-\d+`?/gu, ' ')
        .replace(/[,;&]/gu, ' ')
        .replace(/\band\b/giu, ' ')
        .replace(/\s+/gu, ' ')
        .trim();
    return { ids: [...ids], dynamic: residue || null };
}

function priorityFromHeading(heading, config = {}) {
    if (/^P0\b/iu.test(heading)) return 'P0';
    if (/^P1\b/iu.test(heading)) return 'P1';
    if (/verified delivered/iu.test(heading)) return 'P0';
    if (config.sectionPriorities?.[heading]) return config.sectionPriorities[heading];
    return 'P2';
}

export function parseBacklog(markdown, config = {}) {
    const lines = markdown.split(/\r?\n/u);
    const tasks = [];
    let section = 'Unsectioned';

    for (let index = 0; index < lines.length; index += 1) {
        const heading = /^##\s+(.+)$/u.exec(lines[index]);
        if (heading) section = heading[1].trim();

        const task = /^- \[([ xX])\] \*\*([A-Z][A-Z0-9]*-\d+)\*\*\s+(.+)$/u.exec(lines[index]);
        if (!task) {
            if (/^- \[[ xX]\]/u.test(lines[index])) {
                throw new TypeError(`Malformed canonical checkbox on line ${index + 1}`);
            }
            continue;
        }
        const [, mark, id, body] = task;
        const depsMatch = /\*\*Deps:\*\*\s*(.+?)\.\s*\*\*Proof:/u.exec(body);
        const proofMatch = /\*\*Proof:\*\*\s*(.+)$/u.exec(body);
        if (!depsMatch || !proofMatch) {
            throw new TypeError(`${id} must declare both **Deps:** and **Proof:** on line ${index + 1}`);
        }
        const dependencySpec = parseDependencies(depsMatch[1]);
        const declaration = /^\s*((?:`[^`]+`\s*,?\s*)+)/u.exec(proofMatch[1])?.[1] ?? '';
        const proofTokens = [...declaration.matchAll(/`([^`]+)`/gu)]
            .flatMap(match => match[1].split(/[\s,]+/u))
            .filter(Boolean);
        const gates = proofTokens.filter(token => CANONICAL_GATES.has(token));
        const requirements = proofTokens.filter(token => CANONICAL_REQUIREMENTS.has(token));
        const unknownProofTokens = proofTokens.filter(token => (
            !CANONICAL_GATES.has(token) && !CANONICAL_REQUIREMENTS.has(token)
        ));
        const description = body.slice(0, depsMatch.index).trim();
        tasks.push({
            id,
            complete: mark.toLowerCase() === 'x',
            description,
            deps: dependencySpec.ids,
            dynamicDependency: dependencySpec.dynamic,
            gates: [...new Set(gates)],
            requirements: [...new Set(requirements)],
            unknownProofTokens,
            section,
            priority: priorityFromHeading(section, config),
            line: index + 1,
        });
    }
    return tasks;
}

function taskPrefix(id) {
    return id.split('-')[0];
}

export function laneForTask(task, config) {
    const prefix = taskPrefix(task.id);
    return config.lanes.find(lane => lane.prefixes.includes(prefix)) ?? null;
}

function detectCycles(tasks) {
    const byId = new Map(tasks.map(task => [task.id, task]));
    const visiting = new Set();
    const visited = new Set();
    const cycles = [];

    const visit = (id, stack) => {
        if (visiting.has(id)) {
            cycles.push([...stack.slice(stack.indexOf(id)), id]);
            return;
        }
        if (visited.has(id)) return;
        visiting.add(id);
        const task = byId.get(id);
        for (const dep of task?.deps ?? []) visit(dep, [...stack, id]);
        visiting.delete(id);
        visited.add(id);
    };
    for (const task of tasks) visit(task.id, []);
    return cycles;
}

export function validateWorkflow(tasks, config) {
    const errors = [];
    const warnings = [];
    const byId = new Map();
    for (const task of tasks) {
        if (byId.has(task.id)) errors.push(`Duplicate task id ${task.id}`);
        byId.set(task.id, task);
        if (!task.gates.length) errors.push(`${task.id} has no canonical proof gates`);
        for (const token of task.unknownProofTokens ?? []) errors.push(`${task.id} uses unknown proof token ${token}`);
        for (const gate of task.gates) {
            if (!CANONICAL_GATES.has(gate)) errors.push(`${task.id} uses unknown proof gate ${gate}`);
        }
        if (!laneForTask(task, config)) errors.push(`${task.id} has no configured lane`);
        if (task.dynamicDependency && !config.dynamicDependencies?.[task.id]) {
            errors.push(`${task.id} has unresolved dependency text: ${task.dynamicDependency}`);
        }
    }
    for (const task of tasks) {
        for (const dep of task.deps) {
            if (!byId.has(dep)) errors.push(`${task.id} depends on missing task ${dep}`);
        }
    }
    for (const cycle of detectCycles(tasks)) errors.push(`Dependency cycle: ${cycle.join(' -> ')}`);

    const prefixes = new Map();
    const laneIds = new Set();
    for (const lane of config.lanes) {
        if (laneIds.has(lane.id)) errors.push(`Duplicate lane id ${lane.id}`);
        laneIds.add(lane.id);
        if (!Number.isInteger(lane.capacity) || lane.capacity < 1) errors.push(`Lane ${lane.id} has invalid capacity`);
        if (!Array.isArray(lane.ownership) || lane.ownership.length === 0) errors.push(`Lane ${lane.id} has no ownership patterns`);
        for (const pattern of lane.ownership ?? []) {
            if (path.isAbsolute(pattern) || pattern.split('/').includes('..')) errors.push(`Lane ${lane.id} has unsafe ownership pattern ${pattern}`);
        }
        for (const prefix of lane.prefixes) {
            if (prefixes.has(prefix)) errors.push(`Prefix ${prefix} belongs to both ${prefixes.get(prefix)} and ${lane.id}`);
            prefixes.set(prefix, lane.id);
        }
    }
    for (const id of config.currentFocus ?? []) {
        if (!byId.has(id)) errors.push(`Current-focus task ${id} does not exist`);
    }
    for (const [id, rule] of Object.entries(config.dynamicDependencies ?? {})) {
        if (!byId.has(id)) errors.push(`Dynamic-dependency task ${id} does not exist`);
        if (rule?.kind !== 'release-scope') errors.push(`Dynamic-dependency task ${id} has unsupported kind ${rule?.kind}`);
        for (const selected of rule?.releaseTargetedP1 ?? []) {
            if (!byId.has(selected)) errors.push(`Dynamic release scope ${id} selects missing task ${selected}`);
        }
    }
    for (const [section, priority] of Object.entries(config.sectionPriorities ?? {})) {
        if (!['P0', 'P1', 'P2'].includes(priority)) errors.push(`Section ${section} has invalid priority ${priority}`);
    }
    for (const gate of CANONICAL_GATES) {
        if (!config.proofGates?.[gate]) errors.push(`Proof gate ${gate} has no configured requirement`);
    }
    for (const [id, provider] of Object.entries(config.reviewProviders ?? {})) {
        if (!provider?.provider || !provider?.reviewerId || !provider?.model) errors.push(`Review provider ${id} has incomplete identity`);
        if (!provider?.executableEnv || !provider?.executableDefault) errors.push(`Review provider ${id} has no executable boundary`);
        if (!Array.isArray(provider?.args) || provider.args.length === 0) errors.push(`Review provider ${id} has no fixed invocation`);
        if (provider?.outputFormat !== 'claude-json') errors.push(`Review provider ${id} has unsupported output format ${provider?.outputFormat}`);
    }
    for (const kind of ['workflow', 'ci']) {
        if (!Array.isArray(config.trustedGateProducers?.[kind]) || config.trustedGateProducers[kind].length === 0) {
            errors.push(`Trusted gate producers for ${kind} are not configured`);
        }
    }
    const routeIds = new Set();
    for (const route of config.routeCensus ?? []) {
        if (!route?.id || routeIds.has(route.id)) errors.push(`Route census has a missing or duplicate id ${route?.id ?? ''}`);
        routeIds.add(route?.id);
        if (!['directory-files', 'typescript-object-ids'].includes(route?.kind)) errors.push(`Route census ${route?.id} has unsupported kind ${route?.kind}`);
        if (!route?.path || path.isAbsolute(route.path) || route.path.split('/').includes('..')) errors.push(`Route census ${route?.id} has unsafe path`);
        if (!route?.claim?.trim()) errors.push(`Route census ${route?.id} needs an honest claim`);
    }
    if (config.schema !== 'yomu-academy.production-workflow/v2') errors.push('Unsupported workflow config schema');
    if (config.maxParallel < 1) errors.push('maxParallel must be positive');
    if (!Number.isInteger(config.release?.integrationCapacity) || config.release.integrationCapacity !== 1) {
        errors.push('Release integrationCapacity must be exactly 1');
    }
    if (!Number.isInteger(config.release?.checkpointAfterPromotions) || config.release.checkpointAfterPromotions < 1) {
        errors.push('Release checkpointAfterPromotions must be positive');
    }
    if (config.exclusiveFileReservations !== true) {
        errors.push('exclusiveFileReservations must be enabled for parallel worktrees');
    }
    if (tasks.length < 1) errors.push('Canonical backlog contains no tasks');
    if (tasks.filter(task => task.complete).length === tasks.length) warnings.push('Every canonical task is already complete');
    return { errors, warnings };
}

export function activeClaims(state, now) {
    return (state.claims ?? []).filter(claim => (
        claim.status === 'active' && Date.parse(claim.expiresAt) > now.getTime()
    ));
}

export function taskDefinitionSha256(task) {
    return sha256(JSON.stringify({
        id: task.id,
        description: task.description,
        deps: [...task.deps].sort(),
        dynamicDependency: task.dynamicDependency,
        gates: [...task.gates].sort(),
        requirements: [...(task.requirements ?? [])].sort(),
        section: task.section,
        priority: task.priority,
    }));
}

export function reuseReportPinErrors(claim, reference) {
    if (!claim?.reuseReport?.path || !claim?.reuseReport?.sha256) {
        return ['Active claim does not pin a reuse report'];
    }
    if (claim.reuseReport.path !== reference?.path || claim.reuseReport.sha256 !== reference?.sha256) {
        return ['Reuse report does not match the report pinned by the active claim'];
    }
    return [];
}

export function resolveDynamicDependencies(task, tasks, config, state = {}) {
    if (!task.dynamicDependency) return [];
    const rule = config.dynamicDependencies?.[task.id];
    if (rule?.kind !== 'release-scope') return null;
    const excludedIds = new Set([task.id, ...(rule.excludeIds ?? [])]);
    const excludedPrefixes = new Set(rule.excludePrefixes ?? []);
    const selectedP1 = new Set(state.releaseScopes?.[task.id]?.taskIds ?? rule.releaseTargetedP1 ?? []);
    return tasks
        .filter(row => !excludedIds.has(row.id))
        .filter(row => !excludedPrefixes.has(taskPrefix(row.id)))
        .filter(row => row.priority === 'P0' || selectedP1.has(row.id))
        .map(row => row.id);
}

function descendantCounts(tasks) {
    const children = new Map(tasks.map(task => [task.id, []]));
    for (const task of tasks) {
        for (const dep of task.deps) children.get(dep)?.push(task.id);
    }
    const counts = new Map();
    const walk = (id, seen = new Set()) => {
        for (const child of children.get(id) ?? []) {
            if (seen.has(child)) continue;
            seen.add(child);
            walk(child, seen);
        }
        return seen.size;
    };
    for (const task of tasks) counts.set(task.id, walk(task.id));
    return counts;
}

function taskScore(task, config, descendants) {
    const priority = { P0: 30_000, P1: 20_000, P2: 10_000 }[task.priority] ?? 0;
    const focus = config.currentFocus.includes(task.id) ? 50_000 : 0;
    const unlocks = (descendants.get(task.id) ?? 0) * 100;
    const proofCost = task.gates.length * 3;
    return focus + priority + unlocks - proofCost;
}

export function buildPlan(tasks, config, state = {}, now = new Date()) {
    const byId = new Map(tasks.map(task => [task.id, task]));
    const claims = activeClaims(state, now);
    const claimedIds = new Set(claims.map(claim => claim.taskId));
    const laneUse = new Map();
    for (const claim of claims) laneUse.set(claim.lane, (laneUse.get(claim.lane) ?? 0) + 1);
    const descendants = descendantCounts(tasks);

    const ready = tasks
        .filter(task => !task.complete && !claimedIds.has(task.id))
        .filter(task => task.deps.every(dep => byId.get(dep)?.complete))
        .filter(task => {
            const resolved = resolveDynamicDependencies(task, tasks, config, state);
            return resolved !== null && resolved.every(dep => byId.get(dep)?.complete);
        })
        .map(task => ({
            ...task,
            resolvedDynamicDeps: resolveDynamicDependencies(task, tasks, config, state) ?? [],
            lane: laneForTask(task, config),
            score: taskScore(task, config, descendants),
            unlocks: descendants.get(task.id) ?? 0,
        }))
        .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id, 'en'));

    const selected = [];
    for (const task of ready) {
        if (selected.length + claims.length >= config.maxParallel) break;
        const used = laneUse.get(task.lane.id) ?? 0;
        if (used >= task.lane.capacity) continue;
        selected.push(task);
        laneUse.set(task.lane.id, used + 1);
    }

    return {
        generatedAt: now.toISOString(),
        activeClaims: claims,
        selected,
        readyCount: ready.length,
        blockedCount: tasks.filter(task => !task.complete).length - ready.length - claims.length,
    };
}

export function progressSummary(tasks) {
    const complete = tasks.filter(task => task.complete).length;
    const total = tasks.length;
    const byPriority = Object.fromEntries(['P0', 'P1', 'P2'].map(priority => {
        const rows = tasks.filter(task => task.priority === priority);
        return [priority, { complete: rows.filter(task => task.complete).length, total: rows.length }];
    }));
    return { complete, total, percent: total ? Number((complete / total * 100).toFixed(1)) : 0, byPriority };
}

function proofGateStatus(proof, gate) {
    return proof?.gates?.[gate]?.status === 'pass' ? 'pass' : 'unverified';
}

export function buildProductionLedger(tasks, config, state = {}, proofs = {}, routeCounts = [], metadata = {}) {
    const generatedAt = new Date(metadata.generatedAt ?? Date.now());
    const active = new Map(activeClaims(state, generatedAt)
        .map(claim => [claim.taskId, claim]));
    const latestPromotion = new Map();
    for (const promotion of state.promotions ?? []) latestPromotion.set(promotion.taskId, promotion);
    const rows = tasks.map(task => {
        const candidateProof = proofs[task.id] ?? null;
        const proofClaim = (state.claims ?? []).find(claim => (
            claim.taskId === task.id
            && claim.token === candidateProof?.claimToken
            && candidateProof?.taskId === task.id
        ));
        const liveActiveProof = proofClaim?.status === 'active'
            && Date.parse(proofClaim.expiresAt) > generatedAt.getTime();
        const proof = (liveActiveProof || proofClaim?.status === 'checkpointed') ? candidateProof : null;
        const promotion = latestPromotion.get(task.id) ?? null;
        const gates = Object.fromEntries(task.gates.map(gate => [gate, proofGateStatus(proof, gate)]));
        const qualityGates = task.gates.filter(gate => gate === 'T' || gate === 'Q');
        return {
            id: task.id,
            priority: task.priority,
            lane: laneForTask(task, config)?.id ?? null,
            dependencies: task.deps,
            canonicalComplete: task.complete,
            claim: active.has(task.id) ? 'active' : 'none',
            proof: proof?.submittedAt ? 'submitted' : 'none',
            audited: proof?.reuseAudit?.status === 'pass',
            implemented: gates.C === 'pass',
            learnerReachable: gates.R === 'pass',
            qaVerified: qualityGates.length > 0 && qualityGates.every(gate => gates[gate] === 'pass'),
            deployed: gates.D === 'pass' && ['checkpointed', 'awaiting-release', 'released'].includes(promotion?.status),
            gates,
            promotion: promotion?.status ?? 'none',
        };
    });
    const progress = progressSummary(tasks);
    const evidenceStates = Object.fromEntries([
        'audited', 'implemented', 'learnerReachable', 'qaVerified', 'deployed',
    ].map(key => [key, rows.filter(row => row[key]).length]));
    return {
        schema: 'yomu-academy.production-ledger/v1',
        generatedAt: metadata.generatedAt ?? new Date().toISOString(),
        headCommit: metadata.headCommit ?? null,
        backlog: {
            path: config.canonicalBacklog,
            sha256: metadata.backlogSha256 ?? null,
        },
        progress,
        evidenceStates,
        routeCounts,
        tasks: rows,
    };
}

function validIssuedAt(value, errors, label) {
    if (!value || Number.isNaN(Date.parse(value))) errors.push(`${label} issuedAt must be an ISO date`);
}

function validArtifactReference(reference) {
    return Boolean(reference?.path && /^[a-f0-9]{64}$/u.test(reference.sha256 ?? ''));
}

export function validateGateAttestation(task, gate, attestation, context = {}) {
    const errors = [];
    if (attestation?.schema !== 'yomu-academy.gate-attestation/v1') errors.push(`Gate ${gate} attestation has the wrong schema`);
    if (attestation?.taskId !== task.id) errors.push(`Gate ${gate} attestation belongs to another task`);
    if (attestation?.gate !== gate) errors.push(`Gate ${gate} attestation names another gate`);
    if (attestation?.verdict !== 'pass') errors.push(`Gate ${gate} attestation verdict is not pass`);
    if (context.headCommit && attestation?.headCommit !== context.headCommit) errors.push(`Gate ${gate} attestation targets another HEAD`);
    validIssuedAt(attestation?.issuedAt, errors, `Gate ${gate} attestation`);
    if (!attestation?.producer?.id?.trim()) errors.push(`Gate ${gate} attestation needs a producer id`);
    if (!['agent', 'ci', 'human', 'workflow'].includes(attestation?.producer?.kind)) {
        errors.push(`Gate ${gate} attestation has an unsupported producer kind`);
    }
    const expectedProducer = context.expectedProducer;
    const trustedForKind = context.trustedGateProducers?.[attestation?.producer?.kind] ?? [];
    if (attestation?.producer?.kind === 'agent' || attestation?.producer?.kind === 'human') {
        if (!expectedProducer || attestation?.producer?.id !== expectedProducer) {
            errors.push(`Gate ${gate} attestation producer is not the task owner`);
        }
    } else if (!trustedForKind.includes(attestation?.producer?.id)) {
        errors.push(`Gate ${gate} attestation producer is not trusted for ${attestation?.producer?.kind}`);
    }
    if (!attestation?.summary?.trim()) errors.push(`Gate ${gate} attestation needs a summary`);
    if (!Array.isArray(attestation?.assertions) || attestation.assertions.length === 0) {
        errors.push(`Gate ${gate} attestation needs at least one assertion`);
    }
    for (const assertion of attestation?.assertions ?? []) {
        if (assertion?.status !== 'pass' || !assertion?.claim?.trim()) {
            errors.push(`Gate ${gate} attestation contains an unpassed or empty assertion`);
        }
        if (!Array.isArray(assertion?.artifacts) || assertion.artifacts.length === 0) {
            errors.push(`Gate ${gate} assertion needs at least one artifact`);
        }
        for (const artifact of assertion?.artifacts ?? []) {
            if (!validArtifactReference(artifact)) errors.push(`Gate ${gate} assertion has an invalid artifact reference`);
        }
    }
    return errors;
}

export function validateReviewAttestation(task, attestation, context = {}) {
    const errors = [];
    if (attestation?.schema !== 'yomu-academy.review-attestation/v1') errors.push('Independent review attestation has the wrong schema');
    if (attestation?.taskId !== task.id) errors.push('Independent review attestation belongs to another task');
    if (attestation?.verdict !== 'ship') errors.push('Independent review verdict is not ship');
    if (context.headCommit && attestation?.headCommit !== context.headCommit) errors.push('Independent review targets another HEAD');
    if (attestation?.taskDefinitionSha256 !== taskDefinitionSha256(task)) errors.push('Independent review targets another task definition');
    validIssuedAt(attestation?.issuedAt, errors, 'Independent review attestation');
    const reviewer = attestation?.reviewer;
    if (!reviewer?.id?.trim() || reviewer.id !== context.reviewer) errors.push('Independent review identity does not match the attested reviewer');
    if (reviewer?.id === context.owner || reviewer?.independentFrom !== context.owner) errors.push('Independent review is not independent from the task owner');
    if (!reviewer?.provider?.trim() || !reviewer?.model?.trim() || !reviewer?.sessionId?.trim()) {
        errors.push('Independent review needs provider, model, and session identity');
    }
    const sessionReference = reviewer?.sessionEvidence;
    if (!validArtifactReference(sessionReference)) {
        errors.push('Independent review needs a hash-bound external session record');
    }
    const session = sessionReference?.path ? context.reviewSessions?.get(sessionReference.path) : null;
    if (!session) {
        errors.push('Independent review external session record is missing or unreadable');
    } else {
        if (session.schema !== 'yomu-academy.external-review-session/v1') errors.push('External review session has the wrong schema');
        if (session.recordedBy !== 'academy-production-workflow') errors.push('External review session was not captured by the workflow');
        if (session.taskId !== task.id || session.headCommit !== attestation?.headCommit) errors.push('External review session targets another task or HEAD');
        if (session.taskDefinitionSha256 !== taskDefinitionSha256(task)) errors.push('External review session targets another task definition');
        if (session.owner !== context.owner || session.reviewerId !== reviewer?.id) errors.push('External review session identities do not match the claim');
        if (session.provider !== reviewer?.provider || session.model !== reviewer?.model || session.sessionId !== reviewer?.sessionId) {
            errors.push('External review session provider identity does not match the attestation');
        }
        if (session.exitCode !== 0 || session.verdict !== 'ship') errors.push('External review session does not prove a successful SHIP review');
        if (!validArtifactReference(session.prompt) || !validArtifactReference(session.response)) {
            errors.push('External review session needs hash-bound prompt and response artifacts');
        }
        if (context.strict) {
            const actualSessionHash = context.evidenceHashes?.get(sessionReference.path);
            if (actualSessionHash !== sessionReference.sha256) errors.push('External review session record hash mismatch');
            for (const [label, reference] of [['prompt', session.prompt], ['response', session.response]]) {
                const actual = context.evidenceHashes?.get(reference?.path);
                if (!actual || actual !== reference?.sha256) errors.push(`External review ${label} artifact hash mismatch`);
            }
        }
    }
    if (!attestation?.summary?.trim()) errors.push('Independent review needs a summary');
    if (!Array.isArray(attestation?.scope) || attestation.scope.length === 0) errors.push('Independent review needs an explicit scope');
    if (!Array.isArray(attestation?.findings)) errors.push('Independent review findings must be an array');
    for (const finding of attestation?.findings ?? []) {
        if (!['P0', 'P1', 'P2'].includes(finding?.severity) || !finding?.summary?.trim()) {
            errors.push('Independent review contains a malformed finding');
            continue;
        }
        if (finding.status !== 'resolved' && finding.status !== 'accepted-risk') {
            errors.push(`Independent review has an open ${finding.severity} finding`);
        }
        if ((finding.severity === 'P0' || finding.severity === 'P1') && finding.status !== 'resolved') {
            errors.push(`Independent review cannot accept an unresolved ${finding.severity} finding`);
        }
    }
    return errors;
}

export function checkpointIntegrityErrors(promotion, actual) {
    const errors = [];
    if (!/^[a-f0-9]{64}$/u.test(promotion?.proofSha256 ?? '')) errors.push('Promotion has no pinned proof hash');
    else if (promotion.proofSha256 !== actual.proofSha256) errors.push('Promotion proof changed after verification');
    if (!/^[a-f0-9]{64}$/u.test(promotion?.expectedBacklogSha256 ?? '')) errors.push('Promotion has no expected backlog hash');
    else if (promotion.expectedBacklogSha256 !== actual.backlogSha256) errors.push('Canonical backlog differs from the exact promoted checkbox result');
    if (actual.preparedBacklogSha256 && promotion.expectedBacklogSha256 !== actual.preparedBacklogSha256) {
        errors.push('Prepared checkpoint commit contains an unexpected backlog');
    }
    if (!/^[a-f0-9]{64}$/u.test(promotion?.evidenceManifestSha256 ?? '')) errors.push('Promotion has no pinned evidence manifest hash');
    else if (promotion.evidenceManifestSha256 !== actual.evidenceManifestSha256) errors.push('Promotion evidence changed after verification');
    return errors;
}

export function proofTemplate(task, config, baseCommit = null) {
    return {
        schema: 'yomu-academy.production-proof/v2',
        taskId: task.id,
        backlogSha256: null,
        taskDefinitionSha256: taskDefinitionSha256(task),
        baseCommit,
        headCommit: null,
        claimToken: null,
        worktree: null,
        submittedAt: null,
        owner: null,
        summary: null,
        changedFiles: [],
        reuseAudit: {
            status: 'pending',
            report: { path: null, sha256: null },
        },
        gates: Object.fromEntries(task.gates.map(gate => [gate, {
            status: 'pending',
            requirement: config.proofGates[gate],
            evidence: [],
            commands: [],
        }])),
        independentReview: {
            status: 'pending',
            reviewer: null,
            evidence: { path: null, sha256: null },
            findingsResolved: [],
        },
        approvals: Object.fromEntries((task.requirements ?? []).map(requirement => [requirement, {
            status: 'pending',
            evidence: { path: null, sha256: null },
        }])),
        release: {
            userVisible: false,
            changelogUpdated: false,
            docsUpdated: false,
            releaseNotes: null,
        },
    };
}

export function bindProofToClaim(task, config, backlogSha, claim) {
    const proof = proofTemplate(task, config, claim.baseCommit);
    proof.backlogSha256 = backlogSha;
    proof.claimToken = claim.token;
    proof.worktree = claim.worktree;
    proof.owner = claim.owner;
    proof.reuseAudit.report = structuredClone(claim.reuseReport);
    return proof;
}

function validateEvidenceReference(reference, label, context, errors) {
    if (!reference?.path || !/^[a-f0-9]{64}$/u.test(reference.sha256 ?? '')) {
        errors.push(`${label} needs a path and SHA-256`);
        return;
    }
    if (context.strict) {
        const actual = context.evidenceHashes?.get(reference.path);
        if (!actual) errors.push(`${label} evidence does not exist: ${reference.path}`);
        else if (actual !== reference.sha256) errors.push(`${label} evidence hash mismatch: ${reference.path}`);
    }
}

function globToRegExp(glob) {
    const escaped = glob.replace(/[.+^${}()|[\]\\]/gu, '\\$&')
        .replace(/\*\*/gu, '\u0000')
        .replace(/\*/gu, '[^/]*')
        .replace(/\u0000/gu, '.*');
    return new RegExp(`^${escaped}$`, 'u');
}

export function changedFilesWithinOwnership(changedFiles, ownership) {
    const patterns = ownership.map(globToRegExp);
    return changedFiles.filter(file => !patterns.some(pattern => pattern.test(file)));
}

export function validateProof(task, proof, _backlogSha, context = {}) {
    const errors = [];
    if (proof.schema !== 'yomu-academy.production-proof/v2') errors.push('Wrong proof schema');
    if (proof.taskId !== task.id) errors.push(`Proof belongs to ${proof.taskId}, not ${task.id}`);
    if (!/^[a-f0-9]{64}$/u.test(proof.backlogSha256 ?? '')) errors.push('Proof needs a backlog SHA-256');
    const expectedTaskDefinition = context.taskDefinitionSha256 ?? taskDefinitionSha256(task);
    if (proof.taskDefinitionSha256 !== expectedTaskDefinition) {
        errors.push('Proof was produced against a stale task definition');
    }
    if (!proof.submittedAt || Number.isNaN(Date.parse(proof.submittedAt))) errors.push('submittedAt must be an ISO date');
    if (context.strict && proof.submittedAt) {
        const age = (context.nowMs ?? Date.now()) - Date.parse(proof.submittedAt);
        if (age > (context.maxProofAgeMs ?? 2 * 60 * 60 * 1000)) errors.push('Proof is too old for promotion');
        if (age < -(context.maxFutureSkewMs ?? 5 * 60 * 1000)) errors.push('Proof timestamp is in the future');
    }
    if (!proof.summary?.trim()) errors.push('Proof summary is required');
    if (!Array.isArray(proof.changedFiles)) errors.push('changedFiles must be an array');
    if (context.strict) {
        if (!context.repoClean) errors.push('Promotion requires a clean integration checkout');
        if (proof.headCommit !== context.currentHead) errors.push('Proof HEAD does not match current HEAD');
        if (proof.baseCommit !== context.claim?.baseCommit) errors.push('Proof base commit does not match claim');
        if (proof.claimToken !== context.claim?.token) errors.push('Proof claim token is invalid');
        if (proof.worktree !== context.claim?.worktree || proof.worktree !== context.repoRoot) errors.push('Proof worktree does not match claim checkout');
        if (proof.owner !== context.claim?.owner) errors.push('Proof owner does not match claim owner');
        const expected = [...(context.changedFiles ?? [])].sort();
        const declared = [...(proof.changedFiles ?? [])].sort();
        if (JSON.stringify(expected) !== JSON.stringify(declared)) errors.push('changedFiles do not match the committed slice diff');
        const outside = changedFilesWithinOwnership(expected, context.ownership ?? []);
        if (outside.length) errors.push(`Changed files escape lane ownership: ${outside.join(', ')}`);
        const unreserved = expected.filter(file => !(context.reservedFiles ?? []).includes(file));
        if (unreserved.length) errors.push(`Changed files were not exclusively reserved by this claim: ${unreserved.join(', ')}`);
        if (!context.originMainIsAncestor) errors.push('Current HEAD is not based on current origin/main');
    }
    const ownerIdentity = context.strict ? context.claim?.owner : proof.owner;
    if (proof.reuseAudit?.status !== 'pass') errors.push('Prior-work reuse audit has not passed');
    validateEvidenceReference(proof.reuseAudit?.report, 'Prior-work reuse report', context, errors);
    if (context.strict && context.reuseReportErrors?.length) errors.push(...context.reuseReportErrors);
    for (const gate of task.gates) {
        const row = proof.gates?.[gate];
        if (row?.status !== 'pass') errors.push(`Gate ${gate} is not passed`);
        if (!Array.isArray(row?.evidence) || row.evidence.length === 0) errors.push(`Gate ${gate} needs evidence`);
        for (const reference of row?.evidence ?? []) {
            validateEvidenceReference(reference, `Gate ${gate}`, context, errors);
            if (context.strict) {
                const attestation = context.gateAttestations?.get(reference.path);
                if (!attestation) {
                    errors.push(`Gate ${gate} evidence is not a readable gate attestation`);
                } else {
                    errors.push(...validateGateAttestation(task, gate, attestation, {
                        headCommit: proof.headCommit,
                        expectedProducer: ownerIdentity ?? proof.owner,
                        trustedGateProducers: context.trustedGateProducers,
                    }));
                    for (const assertion of attestation.assertions ?? []) {
                        for (const artifact of assertion.artifacts ?? []) {
                            validateEvidenceReference(artifact, `Gate ${gate} assertion artifact`, context, errors);
                        }
                    }
                }
            }
        }
        if (gate === 'T' && (!Array.isArray(row?.commands) || row.commands.length === 0)) {
            errors.push('Gate T needs at least one successful command record');
        }
        for (const command of row?.commands ?? []) {
            if (command.exitCode !== 0) errors.push(`Gate ${gate} command failed: ${command.command}`);
            if (context.strict && command.recordedBy !== 'academy-production-workflow') errors.push(`Gate ${gate} command was not executed by the workflow`);
            if (context.strict && command.headCommit !== context.currentHead) errors.push(`Gate ${gate} command ran against a different HEAD`);
            validateEvidenceReference(command.transcript, `Gate ${gate} command transcript`, context, errors);
            if (context.strict) {
                const transcript = context.commandTranscripts?.get(command.transcript?.path);
                if (!transcript) {
                    errors.push(`Gate ${gate} command transcript is unreadable`);
                } else {
                    if (transcript.schema !== 'yomu-academy.command-transcript/v1') errors.push(`Gate ${gate} command transcript has the wrong schema`);
                    if (transcript.taskId !== task.id || transcript.gate !== gate) errors.push(`Gate ${gate} command transcript belongs to another task or gate`);
                    if (JSON.stringify(transcript.command) !== JSON.stringify(command.command)) errors.push(`Gate ${gate} command transcript does not match the declared command`);
                    if (transcript.exitCode !== command.exitCode || transcript.exitCode !== 0) errors.push(`Gate ${gate} command transcript does not prove success`);
                    if (transcript.headCommit !== command.headCommit || transcript.headCommit !== context.currentHead) errors.push(`Gate ${gate} command transcript ran against another HEAD`);
                    const started = Date.parse(transcript.startedAt);
                    const finished = Date.parse(transcript.finishedAt);
                    if (Number.isNaN(started) || Number.isNaN(finished) || finished < started) errors.push(`Gate ${gate} command transcript has invalid timing`);
                }
            }
        }
    }
    if (proof.independentReview?.status !== 'pass') errors.push('Independent review has not passed');
    if (!proof.independentReview?.reviewer) errors.push('Independent reviewer is required');
    if (proof.independentReview?.reviewer && proof.independentReview.reviewer === ownerIdentity) errors.push('Independent reviewer must differ from owner');
    validateEvidenceReference(proof.independentReview?.evidence, 'Independent review', context, errors);
    if (context.strict) {
        const attestation = context.reviewAttestations?.get(proof.independentReview?.evidence?.path);
        if (!attestation) {
            errors.push('Independent review evidence is not a readable review attestation');
        } else {
            errors.push(...validateReviewAttestation(task, attestation, {
                headCommit: proof.headCommit,
                owner: ownerIdentity,
                reviewer: proof.independentReview?.reviewer,
                strict: true,
                evidenceHashes: context.evidenceHashes,
                reviewSessions: context.reviewSessions,
            }));
        }
    }
    for (const requirement of task.requirements ?? []) {
        const approval = proof.approvals?.[requirement];
        if (approval?.status !== 'pass') errors.push(`Requirement ${requirement} is not passed`);
        validateEvidenceReference(approval?.evidence, `Requirement ${requirement}`, context, errors);
    }
    if (proof.release?.userVisible && !proof.release?.releaseNotes?.trim()) errors.push('User-visible work requires release notes');
    if (context.strict && proof.release?.userVisible !== context.userVisible) errors.push('Proof misclassifies user-visible work');
    if (context.strict && context.userVisible && !proof.release?.releaseNotes?.trim()) {
        errors.push('User-visible slice needs release notes for the release integrator');
    }
    return errors;
}

export function createWorkOrder(task, config, backlogSha) {
    const lane = laneForTask(task, config);
    const roots = Object.entries(config.externalRoots)
        .map(([name, spec]) => {
            const root = typeof spec === 'string' ? spec : (process.env[spec.env] || spec.default);
            return `- ${name}: \`${root}\``;
        })
        .join('\n');
    return `# ${task.id} work order

Owner: unclaimed
Backlog revision: \`${backlogSha}\`
Priority: ${task.priority}
Lane: ${lane.id} (${lane.agentClass})
Checkout: ${lane.checkout}

## Objective

${task.description}

## Dependencies

${task.deps.length ? task.deps.map(dep => `- ${dep}`).join('\n') : '- none'}

${task.dynamicDependency ? `Dynamic release scope: ${task.dynamicDependency}` : ''}

## Required proof

${task.gates.map(gate => `- ${gate}: ${config.proofGates[gate]}`).join('\n')}

## File ownership

${lane.ownership.map(pattern => `- \`${pattern}\``).join('\n')}

Do not edit outside this ownership set. If a required file is dirty from another lane, stop and report the collision. Work in a dedicated worktree for code changes. Never mark the backlog checkbox directly; submit a proof file for promotion.

## External roots

These paths are not inside the repository. Use them only when the task requires them, and preserve privacy/source boundaries.

${roots}

## Delivery loop

1. Run \`node scripts/academy-production-workflow.mjs salvage ${task.id}\` and inspect every candidate from git history, branches, worktrees, Claude recovery, and salvage ledgers.
2. Record which prior work is resumed/reused and why each other candidate is rejected. Re-authoring without this audit cannot be promoted.
3. Read the canonical backlog item and its dependencies.
4. Inspect current production code and live behavior before editing.
5. Implement one coherent vertical slice in the owned files.
6. Run focused tests and the applicable real-app proof.
7. Obtain an independent adversarial review and resolve findings.
8. Fill the generated production-proof JSON. Agent prose alone is not evidence.
9. Hand the slice to the single integration lane for promotion, commit, push, and release.
`;
}

export function updateBacklogCheckbox(markdown, taskId, complete = true) {
    const mark = complete ? ' ' : '[xX]';
    const pattern = new RegExp(`^- \\[${mark}\\] (\\*\\*${taskId}\\*\\*)`, 'mu');
    if (!pattern.test(markdown)) {
        throw new Error(`${taskId} is not a ${complete ? 'open' : 'completed'} canonical backlog item`);
    }
    return markdown.replace(pattern, `- [${complete ? 'x' : ' '}] $1`);
}

export function ensureInside(root, candidate) {
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(candidate);
    if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
        throw new Error(`Path escapes workflow root: ${candidate}`);
    }
    return resolved;
}
