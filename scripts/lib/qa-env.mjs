import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createYomuPaths } from './paths.mjs';

export function loadLocalEnv(root = path.resolve(import.meta.dirname, '..')) {
    const { envFile, legacyEnvFile } = createYomuPaths(path.join(root, 'scripts'));
    for (const file of envFilePaths(envFile, legacyEnvFile)) {
        loadEnvFile(file);
    }
}

function loadEnvFile(file) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        loadEnvLine(line);
    }
}

function envFilePaths(envFile, legacyEnvFile) {
    return [...new Set([envFile, legacyEnvFile])].filter(existsSync);
}

function loadEnvLine(line) {
    const assignment = parseEnvAssignment(line);
    if (!assignment) return;
    if (process.env[assignment.key] !== undefined) return;
    process.env[assignment.key] = assignment.value;
}

function parseEnvAssignment(line) {
    const trimmed = line.trim();
    if (isIgnoredEnvLine(trimmed)) return null;
    const separator = trimmed.indexOf('=');
    if (!hasEnvSeparator(separator)) return null;
    const key = trimmed.slice(0, separator).trim();
    if (!key) return null;
    return {
        key,
        value: unquoteEnvValue(trimmed.slice(separator + 1).trim()),
    };
}

function isIgnoredEnvLine(trimmed) {
    if (!trimmed) return true;
    return trimmed.startsWith('#');
}

function hasEnvSeparator(separator) {
    return separator > 0;
}

function unquoteEnvValue(value) {
    return isQuotedEnvValue(value) ? value.slice(1, -1) : value;
}

function isQuotedEnvValue(value) {
    return (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
}
