import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const sourceRoot = path.join(repoRoot, 'src');

function productionImportGraph(entry: string): Set<string> {
    const pending = [path.join(repoRoot, entry)];
    const visited = new Set<string>();
    while (pending.length) visitImportedSource(pending, visited);
    return visited;
}

function visitImportedSource(pending: string[], visited: Set<string>): void {
    const file = pending.pop()!;
    const relative = path.relative(repoRoot, file);
    if (visited.has(relative)) return;
    visited.add(relative);
    for (const specifier of transpiledRelativeImports(file)) {
        const resolved = resolveSourceImport(file, specifier);
        if (resolved?.startsWith(sourceRoot)) pending.push(resolved);
    }
}

function transpiledRelativeImports(file: string): string[] {
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
    it('retains shared offline services without reaching the writable dialog or restore stack', () => {
        const graph = productionImportGraph('src/reader/companions/runtime.ts');

        for (const required of [
            'src/reader/companions/settings-services.ts',
            'src/reader/app/onboarding.ts',
            'src/reader/dictionaries/offline-setup.ts',
            'src/reader/dictionaries/yomitan/index.ts',
            'src/reader/lookup/nested-text-parse.ts',
            'src/reader/lookup/settings-parse-render.ts',
            'src/reader/popup/modal-accessibility-impl.ts',
            'src/reader/sources/definition-translation.ts',
            'src/reader/srs/account-sync.ts',
        ]) expect(graph, `${required} must remain in yomu-runtime`).toContain(required);

        for (const forbidden of [
            'src/reader/settings/dialog-controller.ts',
            'src/reader/settings/reader-settings-restore-adapter.ts',
            'src/reader/settings/settings-action-router.ts',
            'src/reader/settings/settings-cloud-sync-coordinator.ts',
            'src/reader/settings/settings-restore-coordinator.ts',
            'src/reader/settings/settings-restore-transaction.ts',
        ]) expect(graph, `${forbidden} must stay out of yomu-runtime`).not.toContain(forbidden);
    });

    it('keeps full registration and NewTabRuntime on the writable controller and cloud-resume path', () => {
        const fullBuild = productionImportGraph('src/reader/companions/register-build-companions.ts');
        const newTab = productionImportGraph('src/reader/newtab/runtime.ts');
        const newTabSource = readFileSync(path.join(repoRoot, 'src/reader/newtab/runtime.ts'), 'utf8');
        const readerSource = readFileSync(path.join(repoRoot, 'src/reader/app/main.ts'), 'utf8');

        expect(fullBuild).toContain('src/reader/settings/dialog-controller.ts');
        expect(newTab).toContain('src/reader/settings/dialog-controller.ts');
        expect(newTab).toContain('src/reader/settings/settings-cloud-sync-coordinator.ts');
        expect(newTabSource).toContain('void this.settingsDialog.resumePendingCloudSettingsSync();');
        expect(readerSource).not.toContain('resumePendingCloudSettingsSync');
    });

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
        expect(artifact).toContain('class OnboardingController');
        expect(artifact).toContain('function installOfflineParsingDictionaries');
        expect(artifact).toContain('function installDefinitionTranslationBehaviors');
        expect(artifact).toContain('function installAcademyReaderSrsSync');
    });
});
