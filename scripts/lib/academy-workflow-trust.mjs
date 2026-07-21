import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const GOVERNANCE_TRUST_SCHEMA = 'yomu-academy.governance-trust/v1';

function isInside(root, candidate) {
    const relative = path.relative(root, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function validDate(value) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function governanceTrustStorePath(repoRoot, environment = process.env, home = os.homedir()) {
    const configured = environment.YOMU_ACADEMY_GOVERNANCE_TRUST_STORE;
    const lexical = path.resolve(configured || path.join(home, '.config/yomu/academy-production-governance-trust.json'));
    if (isInside(fs.realpathSync.native(repoRoot), lexical)) {
        throw new Error('Governance trust store must live outside the candidate repository');
    }
    return lexical;
}

export function validateGovernanceTrustStore(store) {
    const errors = [];
    if (store?.schema !== GOVERNANCE_TRUST_SCHEMA) errors.push(`Trust store schema must be ${GOVERNANCE_TRUST_SCHEMA}`);
    if (!Number.isInteger(store?.revision) || store.revision < 1) errors.push('Trust store revision must be a positive integer');
    if (!validDate(store?.issuedAt)) errors.push('Trust store issuedAt must be an ISO date');

    const keys = new Map();
    for (const key of store?.ownerKeys ?? []) {
        if (!key?.keyId || keys.has(key.keyId)) errors.push(`Owner key id is missing or duplicated: ${key?.keyId ?? ''}`);
        keys.set(key?.keyId, key);
        if (!key?.ownerId || key?.algorithm !== 'Ed25519' || key?.publicKeyJwk?.kty !== 'OKP'
            || key?.publicKeyJwk?.crv !== 'Ed25519' || !key?.publicKeyJwk?.x) {
            errors.push(`Owner key ${key?.keyId ?? ''} is not a complete Ed25519 public key`);
        }
        if (key?.publicKeyJwk && Object.hasOwn(key.publicKeyJwk, 'd')) errors.push(`Owner key ${key?.keyId} contains private key material`);
        if (!validDate(key?.activatedAt)) errors.push(`Owner key ${key?.keyId} needs activatedAt`);
        if (!validDate(key?.expiresAt)) errors.push(`Owner key ${key?.keyId} needs expiresAt`);
        if (validDate(key?.activatedAt) && validDate(key?.expiresAt) && Date.parse(key.expiresAt) <= Date.parse(key.activatedAt)) {
            errors.push(`Owner key ${key?.keyId} expires before activation`);
        }
        if (key?.revokedAt !== null && key?.revokedAt !== undefined && !validDate(key.revokedAt)) {
            errors.push(`Owner key ${key?.keyId} revokedAt must be null or an ISO date`);
        }
        if (!Object.hasOwn(key ?? {}, 'revokedAt')) errors.push(`Owner key ${key?.keyId} needs explicit revokedAt`);
        if (validDate(key?.revokedAt) && validDate(key?.activatedAt) && Date.parse(key.revokedAt) < Date.parse(key.activatedAt)) {
            errors.push(`Owner key ${key?.keyId} is revoked before activation`);
        }
        if (key?.successorKeyId !== null && key?.successorKeyId !== undefined && !key.successorKeyId?.trim()) {
            errors.push(`Owner key ${key?.keyId} successorKeyId must be null or a key id`);
        }
        if (!Object.hasOwn(key ?? {}, 'successorKeyId')) errors.push(`Owner key ${key?.keyId} needs explicit successorKeyId`);
    }
    for (const key of keys.values()) {
        if (!key.successorKeyId) continue;
        const successor = keys.get(key.successorKeyId);
        if (!successor) errors.push(`Owner key ${key.keyId} names missing successor ${key.successorKeyId}`);
        else {
            if (successor.ownerId !== key.ownerId) errors.push(`Owner key ${key.keyId} successor belongs to another owner`);
            if (successor.keyId === key.keyId) errors.push(`Owner key ${key.keyId} cannot succeed itself`);
            if (validDate(successor.activatedAt) && validDate(key.activatedAt)
                && Date.parse(successor.activatedAt) <= Date.parse(key.activatedAt)) {
                errors.push(`Owner key ${key.keyId} successor must activate later`);
            }
        }
        const seen = new Set([key.keyId]);
        let cursor = successor;
        while (cursor?.successorKeyId) {
            if (seen.has(cursor.successorKeyId)) {
                errors.push(`Owner key rotation cycle includes ${cursor.successorKeyId}`);
                break;
            }
            seen.add(cursor.successorKeyId);
            cursor = keys.get(cursor.successorKeyId);
        }
    }

    const policyIds = new Set();
    for (const policy of store?.approvalPolicies ?? []) {
        if (!policy?.id || policyIds.has(policy.id)) errors.push(`Approval policy id is missing or duplicated: ${policy?.id ?? ''}`);
        policyIds.add(policy?.id);
        if (!policy?.purpose?.trim()) errors.push(`Approval policy ${policy?.id} needs a purpose`);
        if (!Array.isArray(policy?.allowedOwnerIds) || !policy.allowedOwnerIds.length) errors.push(`Approval policy ${policy?.id} needs owners`);
        if (!Array.isArray(policy?.activeKeyIds) || !policy.activeKeyIds.length) errors.push(`Approval policy ${policy?.id} needs active keys`);
        if (!Number.isInteger(policy?.maxValidityMinutes) || policy.maxValidityMinutes < 1) {
            errors.push(`Approval policy ${policy?.id} needs a positive maxValidityMinutes`);
        }
        for (const keyId of policy?.activeKeyIds ?? []) {
            const key = keys.get(keyId);
            if (!key) errors.push(`Approval policy ${policy?.id} references missing key ${keyId}`);
            else if (!policy.allowedOwnerIds.includes(key.ownerId)) errors.push(`Approval policy ${policy?.id} key ${keyId} belongs to another owner`);
        }
    }

    const toolIds = new Set();
    for (const tool of store?.tools ?? []) {
        if (!tool?.id || toolIds.has(tool.id)) errors.push(`Tool id is missing or duplicated: ${tool?.id ?? ''}`);
        toolIds.add(tool?.id);
        if (!/^[A-Za-z0-9._-]+$/u.test(tool?.command ?? '')) errors.push(`Tool ${tool?.id} has an unsafe command name`);
        if (!Array.isArray(tool?.installations) || !tool.installations.length) errors.push(`Tool ${tool?.id} has no trusted installations`);
        for (const installation of tool?.installations ?? []) {
            if (!installation?.version?.trim() || !/^[a-f0-9]{64}$/u.test(installation?.sha256 ?? '')) {
                errors.push(`Tool ${tool?.id} has an invalid version/hash pin`);
            }
            if (!Array.isArray(installation?.realpathSuffixes) || !installation.realpathSuffixes.length
                || installation.realpathSuffixes.some(value => !path.isAbsolute(value))) {
                errors.push(`Tool ${tool?.id} needs absolute realpath suffix policy entries`);
            }
        }
    }

    const providerIds = new Set();
    for (const provider of store?.reviewProviders ?? []) {
        if (!provider?.id || providerIds.has(provider.id)) errors.push(`Review provider id is missing or duplicated: ${provider?.id ?? ''}`);
        providerIds.add(provider?.id);
        if (!toolIds.has(provider?.toolId)) errors.push(`Review provider ${provider?.id} references an unknown tool`);
        if (!provider?.reviewerId || !provider?.model || !Array.isArray(provider?.args) || !provider.args.length) {
            errors.push(`Review provider ${provider?.id} has incomplete identity or invocation`);
        }
        if (!Array.isArray(provider?.allowedEnvironment)) errors.push(`Review provider ${provider?.id} needs an environment allowlist`);
        if (provider?.serviceProvenance !== 'unresolved') errors.push(`Review provider ${provider?.id} must keep service provenance unresolved`);
    }

    const githubIds = new Set();
    for (const policy of store?.githubPolicies ?? []) {
        if (!policy?.id || githubIds.has(policy.id)) errors.push(`GitHub policy id is missing or duplicated: ${policy?.id ?? ''}`);
        githubIds.add(policy?.id);
        if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(policy?.repository ?? '')) errors.push(`GitHub policy ${policy?.id} has an invalid repository`);
        if (policy?.apiBase !== 'https://api.github.com') errors.push(`GitHub policy ${policy?.id} must use https://api.github.com`);
        if (policy?.remoteUrl !== `https://github.com/${policy?.repository}.git`) errors.push(`GitHub policy ${policy?.id} remote URL does not match its repository`);
        if (!toolIds.has(policy?.ghToolId)) errors.push(`GitHub policy ${policy?.id} references an unknown gh tool`);
        if (!/^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/u.test(policy?.deploymentWorkflowPath ?? '')) {
            errors.push(`GitHub policy ${policy?.id} has an unsafe deployment workflow path`);
        }
        if (!Array.isArray(policy?.checkpointWorkflowPaths) || !policy.checkpointWorkflowPaths.length
            || policy.checkpointWorkflowPaths.some(value => !/^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/u.test(value))) {
            errors.push(`GitHub policy ${policy?.id} needs safe checkpoint workflow paths`);
        }
        if (!Array.isArray(policy?.checkpointWorkflowEvents) || !policy.checkpointWorkflowEvents.length
            || policy.checkpointWorkflowEvents.some(value => !/^[A-Za-z0-9_]+$/u.test(value))) {
            errors.push(`GitHub policy ${policy?.id} needs checkpoint workflow events`);
        }
        if (!Array.isArray(policy?.assetDownloadHosts) || !policy.assetDownloadHosts.length
            || policy.assetDownloadHosts.some(value => !/^[A-Za-z0-9.-]+$/u.test(value))) {
            errors.push(`GitHub policy ${policy?.id} needs asset download hosts`);
        }
    }
    return errors;
}

export function loadGovernanceTrustStore(repoRoot, options = {}) {
    const target = governanceTrustStorePath(repoRoot, options.environment, options.home);
    if (!fs.existsSync(target)) {
        if (options.required === false) return { path: target, store: null, errors: [`Governance trust store is unavailable: ${target}`] };
        throw new Error(`Governance trust store is unavailable: ${target}`);
    }
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Governance trust store must be a regular non-symlink file: ${target}`);
    if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
        throw new Error(`Governance trust store must be owned by the current user: ${target}`);
    }
    if ((stat.mode & 0o022) !== 0) throw new Error(`Governance trust store must not be group/world writable: ${target}`);
    const realpath = fs.realpathSync.native(target);
    if (isInside(fs.realpathSync.native(repoRoot), realpath)) throw new Error('Governance trust store resolves inside the candidate repository');
    const store = JSON.parse(fs.readFileSync(realpath, 'utf8'));
    const errors = validateGovernanceTrustStore(store);
    if (errors.length && options.required !== false) throw new Error(errors.join('\n'));
    return { path: realpath, sha256: sha256(fs.readFileSync(realpath)), store, errors };
}

export function trustBindings(config, store) {
    if (!store) throw new Error('Governance trust store is required for this operation');
    const approval = store.approvalPolicies?.length === 1 ? store.approvalPolicies[0] : null;
    const provider = store.reviewProviders?.length === 1 ? store.reviewProviders[0] : null;
    const github = store.githubPolicies?.length === 1 ? store.githubPolicies[0] : null;
    const errors = [];
    if (!approval) errors.push('External trust store must define exactly one Academy production approval policy');
    else {
        const configuredKeys = [...(config.approvalPolicies?.owner?.requiredKeyIds ?? [])].sort();
        const trustedKeys = [...(approval.activeKeyIds ?? [])].sort();
        if (JSON.stringify(configuredKeys) !== JSON.stringify(trustedKeys)) errors.push('Candidate owner key references do not match the externally active key set');
    }
    if (!provider) errors.push('External trust store must define exactly one required Fable provider');
    else {
        if (config.requiredReviewProvider !== provider.id) errors.push('Candidate required review provider differs from external policy');
        const candidate = config.reviewProviders?.[config.requiredReviewProvider];
        for (const key of ['reviewerId', 'model', 'toolId', 'serviceProvenance']) {
            if (candidate?.[key] !== provider[key]) errors.push(`Candidate review provider differs from external ${key}`);
        }
    }
    if (!github) errors.push('External trust store must define exactly one GitHub production policy');
    if (errors.length) throw new Error(errors.join('\n'));
    return {
        approval: {
            ...approval,
            keys: approval.activeKeyIds.map(keyId => store.ownerKeys.find(key => key.keyId === keyId)),
            trustStoreRevision: store.revision,
        },
        provider,
        github,
    };
}

export function findExecutable(command, pathValue = process.env.PATH ?? '') {
    if (!/^[A-Za-z0-9._-]+$/u.test(command)) throw new Error(`Unsafe executable name: ${command}`);
    for (const entry of pathValue.split(path.delimiter)) {
        if (!entry) continue;
        const candidate = path.join(entry, command);
        try {
            fs.accessSync(candidate, fs.constants.X_OK);
            if (fs.statSync(candidate).isFile()) return candidate;
        } catch {
            // Keep searching PATH in platform order.
        }
    }
    throw new Error(`Required executable is unavailable on PATH: ${command}`);
}

export function resolveTrustedTool(toolId, store, options = {}) {
    const tool = store?.tools?.find(row => row.id === toolId);
    if (!tool) throw new Error(`Trusted tool identity is unavailable: ${toolId}`);
    const selected = findExecutable(tool.command, options.pathValue);
    const realpath = fs.realpathSync.native(selected);
    const executableSha256 = sha256(fs.readFileSync(realpath));
    const matchingHash = tool.installations.find(installation => (
        installation.sha256 === executableSha256
        && installation.realpathSuffixes.some(suffix => realpath.endsWith(suffix))
    ));
    if (!matchingHash) throw new Error(`Executable is not an externally trusted ${toolId} installation: ${realpath}`);
    const versionOutput = execFileSync(realpath, tool.versionArgs ?? ['--version'], { encoding: 'utf8', env: options.environment ?? process.env });
    const match = new RegExp(tool.versionPattern, 'u').exec(versionOutput);
    if (!match?.[1] || match[1] !== matchingHash.version) throw new Error(`Trusted ${toolId} version identity does not match its executable hash`);
    return {
        command: tool.command,
        selected,
        realpath,
        sha256: executableSha256,
        version: match[1],
        trustId: toolId,
    };
}
