import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { aggregateOfflineStarterReplacement } from '../../config/vite/offline-starter-provider';

const root = path.resolve(import.meta.dirname, '../..');
const dictionaries = path.join(root, 'src/reader/dictionaries');
const importer = path.join(dictionaries, 'offline-setup.ts');

describe('aggregate starter provider resolution', () => {
    it('identifies the canonical provider from different relative and absolute imports', () => {
        const projected = path.join(dictionaries, 'offline-starters-projection.ts');
        for (const source of ['./offline-starters', './offline-starters.ts', path.join(dictionaries, 'offline-starters.ts')]) {
            expect(aggregateOfflineStarterReplacement(source, importer)).toBe(projected);
        }
        expect(aggregateOfflineStarterReplacement('../dictionaries/offline-starters', path.join(root, 'src/reader/app/main.ts'))).toBe(projected);
    });

    it('does not capture another module with the same short name or explicit implementations', () => {
        expect(aggregateOfflineStarterReplacement('./offline-starters', path.join(root, 'src/reader/app/main.ts'))).toBeUndefined();
        expect(aggregateOfflineStarterReplacement('./offline-starters-projection', importer)).toBeUndefined();
        expect(aggregateOfflineStarterReplacement('./offline-starters-catalog', importer)).toBeUndefined();
        expect(aggregateOfflineStarterReplacement('offline-starters', importer)).toBeUndefined();
    });
});
