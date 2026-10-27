import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const sourceRoot = path.join(repoRoot, 'src');

function transpiledRelativeImports(file: string): string[] {
    // A JSON module (the shared menu icon shapes) has no imports, and
    // transpileModule cannot emit it.
    if (!/\.tsx?$/u.test(file)) return [];
    const output = ts.transpileModule(readFileSync(file, 'utf8'), {
        compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
        },
        fileName: file,
    }).outputText;
    return staticRelativeImports(output);
}

function staticRelativeImports(source: string): string[] {
    return Array.from(source.matchAll(/(?:\bfrom\s*|\bimport\s*)['"](\.[^'"]+)['"]/gu), match => match[1]!);
}

function resolveSourceImport(importer: string, specifier: string): string | undefined {
    const candidate = path.resolve(path.dirname(importer), specifier);
    for (const resolved of [candidate, `${candidate}.ts`, `${candidate}.tsx`, path.join(candidate, 'index.ts')]) {
        if (existsSync(resolved) && statSync(resolved).isFile()) return resolved;
    }
    return undefined;
}

describe('aggregate runtime Settings launcher boundary', () => {

    it('keeps the built aggregate runtime launcher-only while retaining its offline services', () => {
        const artifact = readFileSync(
            path.join(repoRoot, 'docs/public/greasyfork/yomu-runtime.user.js'),
            'utf8',
        );
        const settingsSurface = readFileSync(
            path.join(repoRoot, 'docs/public/greasyfork/yomu-settings-surface.user.js'),
            'utf8',
        );
        const packageVersion = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version as string;

        expect(artifact).not.toContain('class SettingsDialogController');
        expect(artifact).not.toContain('class SettingsRestoreCoordinator');
        expect(artifact).not.toContain('class SettingsCloudSyncCoordinator');
        expect(artifact).toContain('const NEW_TAB_PAGE_URL = `${DOCS_BASE_URL}study/`;');
        expect(settingsSurface).toContain(`const CURRENT_YOMU_VERSION = "${packageVersion}"`);
        expect(artifact).toContain('class LookupModalAccessibility');
        expect(artifact).toContain('function installAcademyReaderSrsSync');
    });
});
