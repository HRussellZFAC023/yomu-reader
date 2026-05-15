import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function loadLocalEnv(root = path.resolve(import.meta.dirname, '..')) {
    const file = path.join(root, '.env');
    if (!existsSync(file)) return;

    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        const assignment = parseEnvAssignment(line);
        if (assignment && process.env[assignment.key] === undefined) process.env[assignment.key] = assignment.value;
    }
}

function parseEnvAssignment(line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return null;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) return null;
    const key = trimmed.slice(0, separator).trim();
    if (!key) return null;
    return {
        key,
        value: unquoteEnvValue(trimmed.slice(separator + 1).trim()),
    };
}

function unquoteEnvValue(value) {
    return isQuotedEnvValue(value) ? value.slice(1, -1) : value;
}

function isQuotedEnvValue(value) {
    return (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
}
