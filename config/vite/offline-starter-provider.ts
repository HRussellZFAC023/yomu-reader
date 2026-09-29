import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const dictionaries = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/reader/dictionaries');
const provider = path.join(dictionaries, 'offline-starters.ts');

/** Match a resolved source location, never a short import name shared by other modules. */
export function aggregateOfflineStarterReplacement(source: string, importer?: string): string | undefined {
    if (!importer || (!source.startsWith('.') && !path.isAbsolute(source))) return undefined;
    const candidate = path.resolve(path.dirname(importer), source);
    if (candidate !== provider && `${candidate}.ts` !== provider) return undefined;
    return path.join(dictionaries, 'offline-starters-projection.ts');
}

export function aggregateOfflineStarterProvider(): Plugin {
    return {
        name: 'yomu-aggregate-offline-starters',
        enforce: 'pre',
        resolveId: aggregateOfflineStarterReplacement,
    };
}
