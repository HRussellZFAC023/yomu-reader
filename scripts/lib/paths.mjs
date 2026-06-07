import path from 'node:path';
import { readFileSync } from 'node:fs';

export function createYomuPaths(scriptDir = import.meta.dirname) {
    const appRoot = findAppRoot(scriptDir);
    const workspaceRoot = envPath('YOMU_WORKSPACE_ROOT', path.resolve(appRoot, '..', '..'));
    const artifactsRoot = envPath('YOMU_ARTIFACTS_ROOT', path.join(workspaceRoot, 'artifacts', 'yomu-reader'));
    const qaArtifactsRoot = envPath('YOMU_QA_ARTIFACTS_ROOT', path.join(workspaceRoot, 'qa-artifacts', 'yomu-reader'));
    const testResultsRoot = envPath('YOMU_TEST_RESULTS_ROOT', path.join(workspaceRoot, 'test-results', 'yomu-reader'));
    const docsRoot = envPath('YOMU_DOCS_ROOT', path.join(appRoot, 'docs'));
    const docsPublicRoot = envPath('YOMU_DOCS_PUBLIC_ROOT', path.join(docsRoot, 'public'));
    const docsDistRoot = envPath('YOMU_DOCS_DIST_ROOT', path.join(docsRoot, '.vitepress', 'dist'));
    const legacyEnvFile = path.join(appRoot, '.env');
    const envFile = envPath('YOMU_ENV_FILE', path.join(workspaceRoot, 'resources', 'yomu-reader', '.env'));

    return {
        appRoot,
        workspaceRoot,
        artifactsRoot,
        qaArtifactsRoot,
        testResultsRoot,
        docsRoot,
        docsPublicRoot,
        docsDistRoot,
        envFile,
        legacyEnvFile,
        moduleSizesPath: path.join(artifactsRoot, 'module-sizes.json'),
        moduleSizesBaselinePath: path.join(artifactsRoot, 'module-sizes-baseline.json'),
        sizeReportDir: path.join(artifactsRoot, 'size-report'),
    };
}

function envPath(name, fallback) {
    const value = process.env[name]?.trim();
    return value ? path.resolve(value) : fallback;
}

function findAppRoot(startDir) {
    return appRootCandidates(startDir).find(isYomuReaderRoot) ?? path.resolve(startDir, '..', '..');
}

function appRootCandidates(startDir) {
    let current = path.resolve(startDir);
    return Array.from({ length: 6 }, () => {
        const candidate = current;
        current = path.dirname(current);
        return candidate;
    });
}

function isYomuReaderRoot(directory) {
    return isYomuReaderPackage(path.join(directory, 'package.json'));
}

function isYomuReaderPackage(packageJsonPath) {
    try {
        return JSON.parse(readFileSync(packageJsonPath, 'utf8')).name === 'yomu-reader';
    } catch {
        return false;
    }
}
