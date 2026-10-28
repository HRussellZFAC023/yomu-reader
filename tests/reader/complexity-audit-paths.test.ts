import { describe, expect, it } from 'vitest';
import { isComplexityAuditedTypeScriptFile } from '../../scripts/lib/complexity-audit-paths.mjs';

describe('complexity audit source discovery', () => {
    it.each([
        'src/reader.ts',
        'vite.config.mts',
        'scripts/check.mjs',
    ])('keeps authored TypeScript source %s', filename => {
        expect(isComplexityAuditedTypeScriptFile(filename)).toBe(true);
    });

    it.each([
        'types.d.ts',
        'types.d.mts',
        'greasyfork-library.config.ts.timestamp-1785503595004-dde71f2444c67.mjs',
        'reader.js',
        'notes.md',
    ])('ignores generated or non-TypeScript input %s', filename => {
        expect(isComplexityAuditedTypeScriptFile(filename)).toBe(false);
    });
});
