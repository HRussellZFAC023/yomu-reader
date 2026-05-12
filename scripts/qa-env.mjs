import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function loadLocalEnv(root = path.resolve(import.meta.dirname, '..')) {
    const file = path.join(root, '.env');
    if (!existsSync(file)) return;

    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const separator = trimmed.indexOf('=');
        if (separator <= 0) continue;
        const key = trimmed.slice(0, separator).trim();
        let value = trimmed.slice(separator + 1).trim();
        if (!key || process.env[key] !== undefined) continue;
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        process.env[key] = value;
    }
}
