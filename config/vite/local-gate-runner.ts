import { relative, resolve } from 'node:path';
import { VitestTestRunner } from 'vitest/runners';

// One transform graph, with the original per-file setup boundaries. This public
// runner hook executes after environment setup and before setup-file collection.
export default class LocalGateRunner extends VitestTestRunner {
    onBeforeCollect(files: string[]): void {
        if (files.length !== 1) throw new Error('Local gate requires isolated single-file tasks');
        const reader = relative(this.config.root, files[0]).replaceAll('\\', '/').startsWith('tests/reader/');
        this.config.setupFiles = reader && typeof document !== 'undefined'
            ? [resolve(this.config.root, 'tests/reader/setup.ts')] : [];
    }
}
