import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const CONTENT_TYPES = Object.freeze({
    '.js': 'application/javascript+module',
    '.mjs': 'application/javascript+module',
    '.wasm': 'application/wasm',
});

function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

export function parseWranglerConfig(text, filename = 'wrangler.academy.jsonc') {
    const parsed = ts.parseConfigFileTextToJson(filename, text);
    if (parsed.error || !parsed.config || typeof parsed.config !== 'object') {
        throw new Error(`Could not parse ${filename} as JSONC.`);
    }
    return parsed.config;
}

export function readLocalWorkerModules(outdir) {
    return readdirSync(outdir, { withFileTypes: true })
        .filter(entry => entry.isFile() && CONTENT_TYPES[path.extname(entry.name)])
        .map(entry => ({
            name: entry.name,
            contentType: CONTENT_TYPES[path.extname(entry.name)],
            content: readFileSync(path.join(outdir, entry.name)),
        }));
}

export function createReviewedWorkerArtifact({ reviewedCommit, modules, settings, configBytes, migrations }) {
    if (!/^[0-9a-f]{40}$/u.test(reviewedCommit)) throw new Error('Reviewed Worker artifact requires one full commit.');
    const normalizedModules = normalizeModules(modules);
    const normalizedSettings = normalizeSettings(settings);
    const normalizedMigrations = migrations
        .map(migration => ({ name: migration.name, sha256: sha256(migration.content) }))
        .sort((left, right) => left.name.localeCompare(right.name));
    const payload = {
        schemaVersion: 1,
        reviewedCommit,
        moduleSetSha256: sha256(canonicalJson(normalizedModules)),
        settingsSha256: sha256(canonicalJson(normalizedSettings)),
        configSha256: sha256(configBytes),
        migrations: normalizedMigrations,
        migrationSetSha256: sha256(canonicalJson(normalizedMigrations)),
    };
    return Object.freeze({
        ...payload,
        artifactSha256: sha256(canonicalJson(payload)),
        modules: normalizedModules,
        settings: normalizedSettings,
    });
}

export function localWorkerSettings(config, mainModule) {
    const bindings = [];
    for (const binding of config.d1_databases ?? []) {
        bindings.push({ type: 'd1', name: binding.binding, databaseId: binding.database_id });
    }
    for (const binding of config.r2_buckets ?? []) {
        bindings.push({ type: 'r2_bucket', name: binding.binding, bucketName: binding.bucket_name });
    }
    if (config.version_metadata?.binding) {
        bindings.push({ type: 'version_metadata', name: config.version_metadata.binding });
    }
    for (const [name, text] of Object.entries(config.vars ?? {})) {
        bindings.push({ type: 'plain_text', name, text });
    }
    for (const name of config.secrets?.required ?? []) {
        bindings.push({ type: 'secret_text', name });
    }
    return normalizeSettings({
        mainModule,
        compatibilityDate: config.compatibility_date,
        compatibilityFlags: config.compatibility_flags ?? [],
        bindings,
    });
}

export function parseCloudflareWorkerVersion(document, expectedVersionId) {
    const result = document?.result ?? document;
    if (!result || typeof result !== 'object' || result.id !== expectedVersionId) {
        throw new Error('Cloudflare returned the wrong immutable Worker version.');
    }
    if (!Array.isArray(result.modules) || result.modules.length === 0) {
        throw new Error('Cloudflare Worker version did not expose raw runtime modules.');
    }
    const modules = result.modules
        .filter(module => module?.content_type !== 'application/source-map' && !String(module?.name ?? '').endsWith('.map'))
        .map(module => {
            if (typeof module?.name !== 'string' || typeof module.content_type !== 'string'
                || typeof module.content_base64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/u.test(module.content_base64)) {
                throw new Error('Cloudflare Worker version contained a malformed module.');
            }
            return {
                name: module.name,
                contentType: module.content_type,
                content: Buffer.from(module.content_base64, 'base64'),
            };
        });
    const bindings = Array.isArray(result.bindings) ? result.bindings.map(normalizeCloudflareBinding) : [];
    return Object.freeze({
        versionId: result.id,
        modules: normalizeModules(modules),
        settings: normalizeSettings({
            mainModule: result.main_module,
            compatibilityDate: result.compatibility_date,
            compatibilityFlags: result.compatibility_flags ?? [],
            bindings,
        }),
    });
}

export function parseCloudflareWorkerVersionDetail(document, expectedVersionId) {
    const result = document?.result ?? document;
    const scriptEtag = result?.resources?.script?.etag;
    if (!result || typeof result !== 'object' || result.id !== expectedVersionId
        || typeof scriptEtag !== 'string' || !/^[0-9a-f]{64}$/u.test(scriptEtag)) {
        throw new Error('Cloudflare returned no immutable script digest for the active Worker version.');
    }
    return Object.freeze({ versionId: result.id, scriptEtag });
}

export function assertCloudflareArtifactMatches(reviewedArtifact, remoteVersion) {
    const remoteModuleSetSha256 = sha256(canonicalJson(remoteVersion.modules));
    if (remoteModuleSetSha256 !== reviewedArtifact.moduleSetSha256) {
        throw new Error('Active Cloudflare Worker modules do not match the locally reproduced reviewed bundle.');
    }
    const remoteSettingsSha256 = sha256(canonicalJson(remoteVersion.settings));
    if (remoteSettingsSha256 !== reviewedArtifact.settingsSha256) {
        throw new Error('Active Cloudflare Worker settings do not match the reviewed deployment settings.');
    }
    return Object.freeze({
        workerVersionId: remoteVersion.versionId,
        moduleSetSha256: remoteModuleSetSha256,
        settingsSha256: remoteSettingsSha256,
        reviewedArtifactSha256: reviewedArtifact.artifactSha256,
    });
}

function normalizeModules(modules) {
    const normalized = modules.map(module => {
        if (typeof module?.name !== 'string' || !module.name || typeof module.contentType !== 'string') {
            throw new Error('Worker artifact module was malformed.');
        }
        const content = Buffer.from(module.content);
        return {
            name: module.name.replaceAll(path.sep, '/'),
            contentType: module.contentType,
            bytes: content.byteLength,
            sha256: sha256(content),
        };
    }).sort((left, right) => left.name.localeCompare(right.name));
    if (new Set(normalized.map(module => module.name)).size !== normalized.length) {
        throw new Error('Worker artifact contained duplicate module names.');
    }
    return normalized;
}

function normalizeSettings(settings) {
    if (typeof settings?.mainModule !== 'string' || !settings.mainModule
        || typeof settings.compatibilityDate !== 'string') {
        throw new Error('Worker artifact settings were malformed.');
    }
    return {
        mainModule: settings.mainModule,
        compatibilityDate: settings.compatibilityDate,
        compatibilityFlags: [...settings.compatibilityFlags].sort(),
        bindings: settings.bindings
            .map(binding => Object.fromEntries(Object.entries(binding).filter(([, value]) => value !== undefined)))
            .sort((left, right) => `${left.type}:${left.name}`.localeCompare(`${right.type}:${right.name}`)),
    };
}

function normalizeCloudflareBinding(binding) {
    if (!binding || typeof binding !== 'object' || typeof binding.type !== 'string' || typeof binding.name !== 'string') {
        throw new Error('Cloudflare Worker version contained a malformed binding.');
    }
    switch (binding.type) {
        case 'd1':
            return { type: binding.type, name: binding.name, databaseId: binding.database_id ?? binding.id };
        case 'r2_bucket':
            return { type: binding.type, name: binding.name, bucketName: binding.bucket_name };
        case 'plain_text':
            return { type: binding.type, name: binding.name, text: binding.text };
        default:
            return { type: binding.type, name: binding.name };
    }
}
