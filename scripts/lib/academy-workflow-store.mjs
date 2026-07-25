import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const JOURNAL_SCHEMA = 'yomu-academy.workflow-transition/v1';

function digest(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function snapshot(target) {
    if (!fs.existsSync(target)) return { exists: false, sha256: null, base64: null };
    const value = fs.readFileSync(target);
    return { exists: true, sha256: digest(value), base64: value.toString('base64') };
}

function matchesSnapshot(actual, expected) {
    return actual.exists === expected.exists && actual.sha256 === expected.sha256;
}

function fsyncDirectory(directoryPath) {
    let descriptor;
    try {
        descriptor = fs.openSync(directoryPath, 'r');
        fs.fsyncSync(descriptor);
    } catch (error) {
        if (!['EINVAL', 'ENOTSUP', 'EOPNOTSUPP', 'EBADF', 'EISDIR', 'EPERM'].includes(error?.code)) throw error;
    } finally {
        if (descriptor !== undefined) fs.closeSync(descriptor);
    }
}

function writeFileDurably(target, value) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    const mode = fs.existsSync(target) ? fs.statSync(target).mode & 0o777 : 0o600;
    const descriptor = fs.openSync(temporary, 'wx', mode);
    try {
        fs.writeFileSync(descriptor, value);
        fs.fsyncSync(descriptor);
    } finally {
        fs.closeSync(descriptor);
    }
    fs.renameSync(temporary, target);
    fsyncDirectory(path.dirname(target));
}

function removeFileDurably(target) {
    if (!fs.existsSync(target)) return;
    fs.unlinkSync(target);
    fsyncDirectory(path.dirname(target));
}

function injectCrash(kind, point) {
    const requested = process.env.YOMU_ACADEMY_WORKFLOW_CRASH_AT;
    if (requested !== `${kind}:${point}` && requested !== point) return;
    process.stderr.write(`Injected workflow crash at ${kind}:${point}\n`);
    process.exit(86);
}

function journalPath(stateRoot) {
    return path.join(stateRoot, 'prepared-transition.json');
}

function writeSnapshot(target, value) {
    if (!value.exists) {
        removeFileDurably(target);
        return;
    }
    writeFileDurably(target, Buffer.from(value.base64, 'base64'));
}

export function inspectFileTransition(stateRoot) {
    const target = journalPath(stateRoot);
    if (!fs.existsSync(target)) return { status: 'clean', journalPath: target };
    let journal;
    try {
        journal = JSON.parse(fs.readFileSync(target, 'utf8'));
    } catch (error) {
        return {
            status: 'invalid-journal',
            journalPath: target,
            error: error instanceof Error ? error.message : String(error),
        };
    }
    if (journal?.schema !== JOURNAL_SCHEMA || !Array.isArray(journal.files) || !journal.files.length) {
        return { status: 'invalid-journal', journalPath: target, journal, error: 'Unsupported or empty transition journal' };
    }
    const files = journal.files.map(file => {
        const actual = snapshot(file.path);
        const state = matchesSnapshot(actual, file.before)
            ? 'before'
            : file.after && matchesSnapshot(actual, file.after) ? 'after' : 'unknown';
        return { path: file.path, state, actual, before: file.before, after: file.after };
    });
    const unknown = files.filter(file => file.state === 'unknown');
    const rollbackOnly = journal.mode === 'rollback-only';
    return {
        status: rollbackOnly ? 'recoverable' : (unknown.length ? 'ambiguous' : 'recoverable'),
        journalPath: target,
        journal,
        files,
        recommended: rollbackOnly ? 'rollback' : (unknown.length ? null : (files.some(file => file.state === 'after') ? 'roll-forward' : 'rollback')),
    };
}

export function recoverFileTransition(stateRoot, mode = 'auto') {
    const inspection = inspectFileTransition(stateRoot);
    if (inspection.status === 'clean') return { ...inspection, action: 'none' };
    if (inspection.status === 'invalid-journal') {
        throw new Error(`Workflow recovery journal is unreadable: ${inspection.error}. Restore a valid journal backup, then run recovery-status and recover; normal workflow commands remain blocked.`);
    }
    const action = inspection.journal.mode === 'rollback-only' ? 'rollback' : (mode === 'auto' ? inspection.recommended : mode);
    if (!['rollback', 'roll-forward'].includes(action)) {
        const unknown = inspection.files.filter(file => file.state === 'unknown').map(file => file.path);
        throw new Error(`Workflow transition ${inspection.journal.id} has externally changed files: ${unknown.join(', ')}. Run recover --rollback or recover --roll-forward after inspecting recovery-status.`);
    }
    const key = action === 'rollback' ? 'before' : 'after';
    for (const file of inspection.journal.files) writeSnapshot(file.path, file[key]);
    const recoveryRecord = {
        schema: 'yomu-academy.workflow-recovery/v1',
        recoveredAt: new Date().toISOString(),
        action,
        journal: inspection.journal,
        observedFiles: inspection.files.map(file => ({
            path: file.path,
            state: file.state,
            actual: file.actual,
        })),
    };
    writeFileDurably(
        path.join(stateRoot, 'recovery-history', `${inspection.journal.id}.json`),
        `${JSON.stringify(recoveryRecord, null, 2)}\n`,
    );
    removeFileDurably(inspection.journalPath);
    return { ...inspection, status: 'recovered', action };
}

export function commitFileTransition(stateRoot, kind, writes, metadata = {}) {
    if (!kind?.trim()) throw new TypeError('Workflow transitions require a kind');
    if (!Array.isArray(writes) || !writes.length) throw new TypeError('Workflow transitions require at least one write');
    const existing = inspectFileTransition(stateRoot);
    if (existing.status !== 'clean') {
        throw new Error(`Workflow recovery is required before ${kind}; run recovery-status, then recover.`);
    }
    const seen = new Set();
    const files = writes.map(write => {
        const target = path.resolve(write.path);
        if (seen.has(target)) throw new Error(`Workflow transition writes ${target} more than once`);
        seen.add(target);
        const before = snapshot(target);
        const after = write.remove === true
            ? { exists: false, sha256: null, base64: null }
            : (() => {
                const value = Buffer.isBuffer(write.value) ? write.value : Buffer.from(String(write.value));
                return { exists: true, sha256: digest(value), base64: value.toString('base64') };
            })();
        return { path: target, before, after };
    });
    const journal = {
        schema: JOURNAL_SCHEMA,
        id: crypto.randomUUID(),
        kind,
        createdAt: new Date().toISOString(),
        metadata,
        files,
    };
    fs.mkdirSync(stateRoot, { recursive: true });
    injectCrash(kind, 'before-intent');
    writeFileDurably(journalPath(stateRoot), `${JSON.stringify(journal, null, 2)}\n`);
    injectCrash(kind, 'after-intent');
    files.forEach((file, index) => {
        injectCrash(kind, `before-write-${index}`);
        writeSnapshot(file.path, file.after);
        injectCrash(kind, `after-write-${index}`);
    });
    injectCrash(kind, 'before-complete');
    removeFileDurably(journalPath(stateRoot));
    injectCrash(kind, 'after-complete');
    return journal;
}

export function beginRollbackTransition(stateRoot, kind, targets, metadata = {}) {
    if (!kind?.trim()) throw new TypeError('Workflow transitions require a kind');
    if (!Array.isArray(targets) || !targets.length) throw new TypeError('Rollback transitions require at least one target');
    const existing = inspectFileTransition(stateRoot);
    if (existing.status !== 'clean') throw new Error(`Workflow recovery is required before ${kind}; run recovery-status, then recover.`);
    const paths = [...new Set(targets.map(target => path.resolve(target)))];
    const journal = {
        schema: JOURNAL_SCHEMA,
        id: crypto.randomUUID(),
        kind,
        mode: 'rollback-only',
        createdAt: new Date().toISOString(),
        metadata,
        files: paths.map(target => ({ path: target, before: snapshot(target), after: null })),
    };
    fs.mkdirSync(stateRoot, { recursive: true });
    writeFileDurably(journalPath(stateRoot), `${JSON.stringify(journal, null, 2)}\n`);
    injectCrash(kind, 'after-intent');
    return journal;
}

export function completeRollbackTransition(stateRoot, journal) {
    const inspection = inspectFileTransition(stateRoot);
    if (inspection.status === 'clean') throw new Error(`Rollback transition ${journal?.id ?? ''} is not active`);
    if (inspection.journal?.id !== journal?.id || inspection.journal?.mode !== 'rollback-only') {
        throw new Error('A different workflow transition replaced the active rollback journal');
    }
    removeFileDurably(inspection.journalPath);
}
