import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// @ts-expect-error The production path helper is an intentionally plain Node module.
import { createYomuPaths } from '../../scripts/lib/paths.mjs';

const ROOT_ENV_NAMES = [
    'YOMU_WORKSPACE_ROOT',
    'YOMU_ARTIFACTS_ROOT',
    'YOMU_QA_ARTIFACTS_ROOT',
    'YOMU_TEST_RESULTS_ROOT',
    'YOMU_DOCS_ROOT',
    'YOMU_DOCS_PUBLIC_ROOT',
    'YOMU_DOCS_DIST_ROOT',
    'YOMU_ENV_FILE',
] as const;
const originalRootEnv = new Map(ROOT_ENV_NAMES.map(name => [name, process.env[name]]));

beforeEach(() => {
    for (const name of ROOT_ENV_NAMES) delete process.env[name];
});

afterEach(() => {
    for (const name of ROOT_ENV_NAMES) {
        const value = originalRootEnv.get(name);
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
});

function makeAppRoot(root: string) {
    mkdirSync(path.join(root, 'scripts'), { recursive: true });
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'yomu-reader' }));
    return root;
}

describe('script path discovery', () => {
    it('keeps artifacts inside a standalone checkout by default', () => {
        const appRoot = makeAppRoot(mkdtempSync(path.join(tmpdir(), 'yomu-standalone-')));

        const paths = createYomuPaths(path.join(appRoot, 'scripts'));

        expect(paths.appRoot).toBe(appRoot);
        expect(paths.workspaceRoot).toBe(appRoot);
        expect(paths.qaArtifactsRoot).toBe(path.join(appRoot, 'qa-artifacts', 'yomu-reader'));
    });

    it('uses the workspace root for an apps/yomu-reader checkout', () => {
        const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'yomu-workspace-'));
        const appRoot = makeAppRoot(path.join(workspaceRoot, 'apps', 'yomu-reader'));

        const paths = createYomuPaths(path.join(appRoot, 'scripts'));

        expect(paths.appRoot).toBe(appRoot);
        expect(paths.workspaceRoot).toBe(workspaceRoot);
    });
});
