import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { USER_SCRIPT_COMPILER_COMMIT } from '../../scripts/build-amo-source-package.mjs';
// @ts-expect-error plain .mjs script module without type declarations
import { GENERATED_ARTIFACT_PATHS } from '../../scripts/lib/generated-artifacts.mjs';

const buildUserscriptWorkflow = readFileSync(join(process.cwd(), '.github/workflows/build-userscript.yml'), 'utf8');
const buildExtensionWorkflow = readFileSync(join(process.cwd(), '.github/workflows/build-extension.yml'), 'utf8');
const ciWorkflow = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
const releaseWorkflow = readFileSync(join(process.cwd(), '.github/workflows/release.yml'), 'utf8');
const releaseGamingWorkflow = readFileSync(join(process.cwd(), '.github/workflows/release-gaming.yml'), 'utf8');
const deployPagesWorkflow = readFileSync(join(process.cwd(), '.github/workflows/deploy-pages.yml'), 'utf8');
const docsLocaleBrowserSmoke = readFileSync(join(process.cwd(), 'scripts/docs-localization-browser-smoke.mjs'), 'utf8');
const readerSyncScript = readFileSync(join(process.cwd(), 'scripts/sync-docs-userscript.cjs'), 'utf8');
const extensionBuildScript = readFileSync(join(process.cwd(), 'scripts/build-extension.mjs'), 'utf8');
const amoSourceBuildScript = readFileSync(join(process.cwd(), 'scripts/build-amo-source-package.mjs'), 'utf8');
const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
};
const amoSourceBuildTemplate = readFileSync(join(process.cwd(), 'scripts/amo/SOURCE_BUILD.template.md'), 'utf8');
const nodeVersion = readFileSync(join(process.cwd(), '.nvmrc'), 'utf8').trim();

/** Whether a manifest pathspec stages a given path: exact, inside a directory, or matched by git's wildcard. */
function covers(entry: string, path: string): boolean {
    if (entry === path || path.startsWith(`${entry}/`)) return true;
    if (!entry.includes('*')) return false;
    const pattern = entry.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*');
    return new RegExp(`^${pattern}$`).test(path);
}

describe('release workflow safety', () => {
    it('does not suppress Actions from the generated-assets commit', () => {
        const commitCommand = buildUserscriptWorkflow.split('\n').find((line) => line.includes('git commit -m'));

        expect(commitCommand).toBeDefined();
        expect(commitCommand).not.toMatch(/\[(?:skip ci|ci skip|no ci|skip actions|actions skip)\]/i);
    });

    it('stages generated assets from the shared manifest instead of a hand-kept list', () => {
        // The hand-kept list went stale: it still named docs/public/newtab long
        // after Study moved to docs/public/study, so the hosted Study app and
        // the published API specs stopped being committed and shipped a whole
        // release behind. Deriving the list is what stops that recurring.
        const stageCommand = buildUserscriptWorkflow.split('\n').find((line) => line.includes('git add'));

        expect(stageCommand).toBeDefined();
        expect(stageCommand).toContain('scripts/lib/generated-artifacts.mjs');
        expect(stageCommand).not.toMatch(/git add\s+(-f\s+)?(?:--\s+)?docs\//);
    });

    it('covers every published route in the generated-artifact manifest', () => {
        // scripts/run-check.mjs fails when a gate run rewrites anything listed
        // here, so a route missing from the list is a route whose drift nobody
        // sees.
        expect(GENERATED_ARTIFACT_PATHS).toContain('docs/public/study');
        expect(GENERATED_ARTIFACT_PATHS).toContain('docs/public/api');
        expect(GENERATED_ARTIFACT_PATHS).toContain('docs/public/greasyfork');
        expect(GENERATED_ARTIFACT_PATHS).toContain('docs/public/yomu.user.js');
        expect(GENERATED_ARTIFACT_PATHS).toContain('docs/public/og-image.png');
        expect(GENERATED_ARTIFACT_PATHS).toContain('docs/public/og-image.generated.json');
    });

    it('tracks every standalone hosted wrapper stamped by the Reader sync', () => {
        const surfaceRegistry = readerSyncScript.match(/const STANDALONE_HOSTED_SURFACES = \[([\s\S]*?)\n\];/u)?.[1] ?? '';
        const syncStampedWrappers = Array.from(
            surfaceRegistry.matchAll(/(?:page|serviceWorker): join\(root, 'docs', 'public', '([^']+)', '([^']+)'\)/gu),
            (match) => `docs/public/${match[1]}/${match[2]}`,
        );
        const expectedWrappers = [
            'docs/public/pdf-reader/index.html',
            'docs/public/pdf-reader/sw.js',
            'docs/public/video-player/index.html',
            'docs/public/video-player/sw.js',
        ];

        // The exact set assertion keeps this non-vacuous if the sync registry
        // or its extraction changes; the manifest assertion guards staging and
        // generated-artifact drift detection for every file the sync mutates.
        expect(syncStampedWrappers).toEqual(expectedWrappers);
        expect(syncStampedWrappers.filter((path) => !GENERATED_ARTIFACT_PATHS.includes(path))).toEqual([]);
    });

    it('covers every hosted file the userscript header pins by URL', () => {
        // A pinned URL is served straight out of docs/public, so an artifact the
        // manifest does not stage is a 404 plus an SRI failure for everyone
        // installing. docs/public/yomu.<hash>.css was exactly that: the
        // stylesheet is pinned as @resource under a name that changes with its
        // bytes, and no entry in the manifest could ever match the new one.
        //
        // Built from the same name builders the header is written with rather
        // than read out of dist/: the check pipeline rebuilds dist in a lane
        // that runs beside the tests, and a header read mid-build carries the
        // mutable URLs it has not been annotated over yet.
        const { GREASY_FORK_LIBRARIES, greasyForkLibraryDir, immutableLibraryFileName, immutableReaderCssFileName } =
            require('../../scripts/lib/greasyfork-libraries.cjs') as {
                GREASY_FORK_LIBRARIES: Array<{ fileName: string }>;
                greasyForkLibraryDir: string;
                immutableLibraryFileName: (fileName: string, content: string) => string;
                immutableReaderCssFileName: (content: string) => string;
            };
        const pinned = [
            `docs/public/${immutableReaderCssFileName('reader stylesheet bytes')}`,
            ...GREASY_FORK_LIBRARIES.map(
                (library) => `docs/public/${greasyForkLibraryDir}/${immutableLibraryFileName(library.fileName, 'companion bytes')}`,
            ),
        ];

        expect(pinned.length).toBeGreaterThan(1);
        expect(pinned.filter((path) => !GENERATED_ARTIFACT_PATHS.some((entry: string) => covers(entry, path)))).toEqual([]);
    });

    it('keeps the manual Deploy Docs fallback so a skipped push can always be recovered', () => {
        // A push HEAD carrying [skip ci] suppresses ALL push workflows at the
        // GitHub level — nothing inside the YAML can override it. The
        // workflow_dispatch trigger is the recovery path the release flow
        // relies on (gh workflow run "Deploy Docs"); its absence bit 1.6.115
        // when the deploy silently never ran.
        expect(deployPagesWorkflow).toMatch(/^on:\n(?:.*\n)*?\s*workflow_dispatch:/m);
    });

    it('retries transient Pages metadata failures before a required final attempt', () => {
        const step = (name: string) => {
            const marker = `      - name: ${name}\n`;
            const start = deployPagesWorkflow.indexOf(marker);
            if (start < 0) return '';
            const rest = deployPagesWorkflow.slice(start + marker.length);
            const next = rest.search(/\n      - (?:name|run|uses):/);
            return marker + (next < 0 ? rest : rest.slice(0, next));
        };
        const attempt1 = step('Setup Pages metadata (attempt 1)');
        const attempt2 = step('Setup Pages metadata (attempt 2)');
        const finalAttempt = step('Setup Pages metadata (required final attempt)');

        expect(deployPagesWorkflow.match(/uses: actions\/configure-pages@v6/g)).toHaveLength(3);
        expect(attempt1).toContain('id: configure_pages_1');
        expect(attempt1).toContain('continue-on-error: true');
        expect(attempt1).not.toContain('if:');
        expect(attempt2).toContain("if: steps.configure_pages_1.outcome == 'failure'");
        expect(attempt2).toContain('id: configure_pages_2');
        expect(attempt2).toContain('continue-on-error: true');
        expect(finalAttempt).toContain("if: steps.configure_pages_1.outcome == 'failure' && steps.configure_pages_2.outcome == 'failure'");
        expect(finalAttempt).toContain('uses: actions/configure-pages@v6');
        expect(finalAttempt).not.toContain('continue-on-error:');
    });

    it('rebuilds Academy after hosted Reader assets in every generated-asset workflow', () => {
        for (const workflow of [buildUserscriptWorkflow, deployPagesWorkflow]) {
            const readerSync = workflow.indexOf('node scripts/sync-docs-userscript.cjs');
            const academyBuild = workflow.indexOf('npm run build:academy');
            const docsBuild = workflow.indexOf('npm run docs:build');

            expect(readerSync).toBeGreaterThan(-1);
            expect(academyBuild).toBeGreaterThan(readerSync);
            expect(docsBuild).toBeGreaterThan(academyBuild);
        }
        expect(deployPagesWorkflow).toContain('- academy/**');
        expect(deployPagesWorkflow).toContain('- public/academy/**');
    });

    it('browser-checks the rendered locale routes before Pages can upload them', () => {
        const docsBuild = deployPagesWorkflow.indexOf('npm run docs:build');
        const browserSmoke = deployPagesWorkflow.indexOf('name: Verify rendered docs localization in browser');
        const artifactVerification = deployPagesWorkflow.indexOf('name: Verify published artifacts');
        const artifactUpload = deployPagesWorkflow.indexOf('name: Upload Pages artifact');
        const smokeStep = deployPagesWorkflow.slice(browserSmoke, artifactVerification);

        expect(packageJson.scripts['docs:locales:browser'])
            .toBe('node scripts/docs-localization-browser-smoke.mjs');
        expect(deployPagesWorkflow).toContain('- scripts/docs-localization-browser-smoke.mjs');
        expect(deployPagesWorkflow).not.toContain('playwright install');
        expect(deployPagesWorkflow).toContain("PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1'");
        expect(deployPagesWorkflow).toContain('YOMU_PLAYWRIGHT_CHANNEL: chrome');
        expect(browserSmoke).toBeGreaterThan(docsBuild);
        expect(artifactVerification).toBeGreaterThan(browserSmoke);
        expect(artifactUpload).toBeGreaterThan(artifactVerification);
        expect(smokeStep).toContain('timeout-minutes: 3');
        expect(smokeStep).toContain('npx --no-install vitepress preview docs');
        expect(smokeStep).toContain('curl --fail --silent "${YOMU_DOCS_PREVIEW_URL}/ja/"');
        expect(smokeStep).toContain('npm run docs:locales:browser');
        expect(smokeStep).not.toContain('continue-on-error:');
        expect(docsLocaleBrowserSmoke).toContain("page.waitForNavigation({ waitUntil: 'domcontentloaded' })");
        expect(docsLocaleBrowserSmoke).toContain('did not load its server-rendered document');
    });

    it('runs the cross-browser layout release boundary before PRs can merge', () => {
        expect(ciWorkflow).toContain('npx playwright install --with-deps chromium firefox webkit');
        expect(ciWorkflow).toContain('npm run smoke:layout-regressions');
        expect(ciWorkflow).toMatch(/needs: \[[^\]\n]*layout-smoke[^\]\n]*\]/);
    });

    it('uses bounded isolated test shards on the release runner', () => {
        expect(releaseWorkflow).toContain('YOMU_CI_SHARDED: 1');
        expect(releaseWorkflow).toContain('YOMU_CI_REGULAR_SHARDS: 8');
        expect(releaseWorkflow).toContain('YOMU_CI_REGULAR_CONCURRENCY: 1');
        expect(releaseWorkflow).toContain('YOMU_CI_REGULAR_MAX_WORKERS: 1');
        expect(releaseWorkflow).toContain('YOMU_CI_JPDB_CONCURRENCY: 2');
        expect(releaseWorkflow).toContain('VITEST_MAX_FORKS: 1');
        expect(releaseWorkflow).toContain('YOMU_VITEST_FORK_HEAP_MB: 2304');
        expect(releaseWorkflow).not.toContain('YOMU_CI_MAX_WORKERS: 3');
    });

    it('bounds Playwright installation on the proven bootstrap Node, then restores the audited runtime', () => {
        const bootstrap = releaseWorkflow.indexOf("node-version: '24.18.0'");
        const browserInstall = releaseWorkflow.indexOf('npx playwright install --with-deps chromium firefox webkit');
        const restore = releaseWorkflow.indexOf('name: Restore audited release Node');
        const releaseGate = releaseWorkflow.indexOf('npm run check:release');

        expect(bootstrap).toBeGreaterThan(-1);
        expect(browserInstall).toBeGreaterThan(bootstrap);
        expect(releaseWorkflow.slice(bootstrap, browserInstall)).toContain('name: Install layout smoke browsers');
        expect(releaseWorkflow.slice(bootstrap, restore)).toContain('timeout-minutes: 15');
        expect(restore).toBeGreaterThan(browserInstall);
        expect(releaseWorkflow.slice(restore, releaseGate)).toContain("node-version-file: '.nvmrc'");
        expect(releaseWorkflow.slice(restore, releaseGate)).toContain('npm install --global npm@11.9.0');
        expect(releaseGate).toBeGreaterThan(restore);
    });

    it('gives desktop gaming artifacts one release owner', () => {
        expect(releaseWorkflow).not.toContain('Build Yomu Gaming release packages');
        expect(releaseWorkflow).not.toContain('npm run release:gaming:');
        expect(releaseWorkflow).not.toContain('linux_assets=');
        expect(releaseWorkflow).not.toContain('assets+=(dist-gaming');

        expect(releaseGamingWorkflow).toContain('- name: Build Yomu Gaming');
        expect(releaseGamingWorkflow).toContain('- name: Write SHA256SUMS');
        expect(releaseGamingWorkflow).toContain('upload_release_assets "$TAG" release-assets/*');
    });

    it('builds every Gaming artifact with the audited Node and npm toolchain', () => {
        const setupNode = releaseGamingWorkflow.indexOf("node-version-file: '.nvmrc'");
        const pinNpm = releaseGamingWorkflow.indexOf('npm install --global npm@11.9.0');
        const install = releaseGamingWorkflow.indexOf('- run: npm ci');
        const build = releaseGamingWorkflow.indexOf('npm run build:gaming');

        expect(nodeVersion).toBe('24.16.0');
        expect(setupNode).toBeGreaterThan(-1);
        expect(pinNpm).toBeGreaterThan(setupNode);
        expect(install).toBeGreaterThan(pinNpm);
        expect(build).toBeGreaterThan(install);
        expect(releaseGamingWorkflow).not.toContain('node-version: 24\n');
    });

    // v1.8.21, v1.8.22 and v1.8.23 each attached their desktop assets by hand: the
    // gaming build finishes ~15 minutes into a tag push and then waited only 10 for
    // the main Release — which gates on check:release + smoke:release and publishes
    // at ~25-30 — so the push run always timed out and only a workflow_dispatch
    // re-run succeeded. The wait has to outlast a slow main Release.
    it('waits out the main Release before attaching desktop assets', () => {
        const waitSeconds = Number(releaseGamingWorkflow.match(/publish_wait_seconds=(\d+)/)?.[1]);
        const pollSeconds = Number(releaseGamingWorkflow.match(/poll_seconds=(\d+)/)?.[1]);
        expect(waitSeconds).toBeGreaterThanOrEqual(2400);
        expect(pollSeconds).toBeGreaterThan(0);

        // The wait must stay inside the job's own budget, or the runner is killed
        // mid-wait and the timeout diagnostics below never print.
        const jobTimeoutMinutes = Number(releaseGamingWorkflow.match(/timeout-minutes: (\d+)\n {4}steps:/)?.[1]);
        expect(jobTimeoutMinutes * 60).toBeGreaterThan(waitSeconds);

        expect(releaseGamingWorkflow).toContain('exists but is still a draft');
        expect(releaseGamingWorkflow).toContain('never created ${TAG}');
    });

    it('retries release uploads per asset while failing closed on hard errors', () => {
        for (const workflow of [releaseWorkflow, releaseGamingWorkflow]) {
            expect(workflow).toContain('upload_release_assets()');
            expect(workflow).toContain('for asset in "$@"; do');
            expect(workflow).toContain('for attempt in 1 2 3 4 5; do');
            expect(workflow).toContain('gh release upload "$tag" "$asset" --clobber');
            expect(workflow).toContain("if ! grep -Eiq 'HTTP (408|429|5[0-9][0-9])");
            expect(workflow).toContain('Non-retryable release upload failure for ${asset}.');
            expect(workflow).toContain('Failed to upload ${asset} after ${attempt} attempts.');
        }

        expect(releaseWorkflow).toContain('upload_release_assets "$TAG" "${assets[@]}"');
        expect(releaseGamingWorkflow).toContain('upload_release_assets "$TAG" release-assets/*');
    });

    it('pins and submits the exact Firefox reviewer source bundle', () => {
        expect(releaseWorkflow).toContain(`ref: ${USER_SCRIPT_COMPILER_COMMIT}`);
        expect(nodeVersion).toBe('24.16.0');
        expect(releaseWorkflow).toContain("node-version-file: '.nvmrc'");
        expect(releaseWorkflow).toContain("node-version: '24.18.0'");
        expect(amoSourceBuildTemplate).toContain(`- Node.js ${nodeVersion}`);
        expect(releaseWorkflow).toContain('npm install --global npm@11.9.0');
        expect(releaseWorkflow).toContain('node scripts/build-amo-source-package.mjs');
        expect(releaseWorkflow).toContain('dist/extension/source/yomureader.com-firefox-source.zip');
        expect(releaseWorkflow).toContain('--pattern yomureader.com-firefox.xpi');
        expect(releaseWorkflow).toContain('--source-dir=browser-store-artifacts/firefox');
        expect(releaseWorkflow).toContain('--upload-source-code=browser-store-artifacts/yomureader.com-firefox-source.zip');
    });

    it('uses the audited Node, npm, and compiler revisions in every artifact-producing workflow', () => {
        for (const workflow of [buildUserscriptWorkflow, deployPagesWorkflow]) {
            expect(workflow).toContain("node-version-file: '.nvmrc'");
            expect(workflow).toContain('npm install --global npm@11.9.0');
            expect(workflow).not.toContain('node-version: 24\n');
        }
        expect(buildExtensionWorkflow).toContain("node-version-file: 'yomu-reader/.nvmrc'");
        expect(buildExtensionWorkflow).toContain('npm install --global npm@11.9.0');
        expect(buildExtensionWorkflow).toContain(`ref: ${USER_SCRIPT_COMPILER_COMMIT}`);
    });

    it('packages every Study web-manifest image in store builds and the AMO source archive', () => {
        for (const path of [
            'public/pwa-icon-192.png',
            'public/pwa-icon-512.png',
            'public/pwa-icon-maskable-512.png',
            'docs/public/screenshots/study-pwa-narrow.png',
            'docs/public/screenshots/study-pwa-wide.png',
        ]) {
            expect(extensionBuildScript).toContain(path);
            expect(amoSourceBuildScript).toContain(path);
        }
        expect(extensionBuildScript).toContain('verifyPackagedStudyManifest(entries, target, decode)');
    });

    it('fails closed on Firefox lint warnings before publishing the GitHub release', () => {
        const extensionBuild = releaseWorkflow.indexOf('name: Build extension release packages');
        const firefoxLint = releaseWorkflow.indexOf('name: Lint the reviewed Firefox package');
        const publish = releaseWorkflow.indexOf('name: Publish GitHub release');

        expect(firefoxLint).toBeGreaterThan(extensionBuild);
        expect(releaseWorkflow.slice(firefoxLint, publish)).toContain('web-ext@10.5.0 lint');
        expect(releaseWorkflow.slice(firefoxLint, publish)).toContain('--warnings-as-errors');
        expect(publish).toBeGreaterThan(firefoxLint);
    });

    it('publishes feature releases through isolated, fail-closed store jobs', () => {
        expect(releaseWorkflow).toContain('environment: browser-store-production');
        expect(releaseWorkflow.match(/environment: browser-store-production/g)).toHaveLength(2);
        expect(releaseWorkflow).toContain('GH_REPO: ${{ github.repository }}');
        expect(releaseWorkflow).toContain('group: release-${{ github.ref }}');
        expect(releaseWorkflow).toContain('TZ: UTC');
        expect(releaseWorkflow).toContain('^v[0-9]+\\.[0-9]+\\.0$');
        expect(releaseWorkflow).toContain('CHROME_WEB_STORE_SERVICE_ACCOUNT_JSON');
        expect(releaseWorkflow).toContain("createSign('RSA-SHA256')");
        expect(releaseWorkflow).toContain('urn:ietf:params:oauth:grant-type:jwt-bearer');
        expect(releaseWorkflow).not.toContain('google-github-actions/auth');
        expect(releaseWorkflow).toContain('web-ext@10.5.0 lint');
        expect(releaseWorkflow).toContain('--warnings-as-errors');
        expect(releaseWorkflow).toContain('"blockOnWarnings":true');
    });
});
