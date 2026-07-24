import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { USER_SCRIPT_COMPILER_COMMIT } from '../../scripts/build-amo-source-package.mjs';

const buildUserscriptWorkflow = readFileSync(join(process.cwd(), '.github/workflows/build-userscript.yml'), 'utf8');
const ciWorkflow = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
const releaseWorkflow = readFileSync(join(process.cwd(), '.github/workflows/release.yml'), 'utf8');
const releaseGamingWorkflow = readFileSync(join(process.cwd(), '.github/workflows/release-gaming.yml'), 'utf8');

describe('release workflow safety', () => {
    it('does not suppress Actions from the generated-assets commit', () => {
        const commitCommand = buildUserscriptWorkflow.split('\n').find((line) => line.includes('git commit -m'));

        expect(commitCommand).toBeDefined();
        expect(commitCommand).not.toMatch(/\[(?:skip ci|ci skip|no ci|skip actions|actions skip)\]/i);
    });

    it('keeps the manual Deploy Docs fallback so a skipped push can always be recovered', () => {
        // A push HEAD carrying [skip ci] suppresses ALL push workflows at the
        // GitHub level — nothing inside the YAML can override it. The
        // workflow_dispatch trigger is the recovery path the release flow
        // relies on (gh workflow run "Deploy Docs"); its absence bit 1.6.115
        // when the deploy silently never ran.
        const deployPagesWorkflow = readFileSync(join(process.cwd(), '.github/workflows/deploy-pages.yml'), 'utf8');
        expect(deployPagesWorkflow).toMatch(/^on:\n(?:.*\n)*?\s*workflow_dispatch:/m);
    });

    it('retries transient Pages metadata failures before a required final attempt', () => {
        const deployPagesWorkflow = readFileSync(join(process.cwd(), '.github/workflows/deploy-pages.yml'), 'utf8');
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

    it('rebuilds Academy after hosted Reader assets so its revision hashes deployed bytes', () => {
        const deployPagesWorkflow = readFileSync(join(process.cwd(), '.github/workflows/deploy-pages.yml'), 'utf8');
        const readerSync = deployPagesWorkflow.indexOf('node scripts/sync-docs-userscript.cjs');
        const academyBuild = deployPagesWorkflow.indexOf('npm run build:academy');
        const docsBuild = deployPagesWorkflow.indexOf('npm run docs:build');

        expect(readerSync).toBeGreaterThan(-1);
        expect(academyBuild).toBeGreaterThan(readerSync);
        expect(docsBuild).toBeGreaterThan(academyBuild);
        expect(deployPagesWorkflow).toContain('- academy/**');
        expect(deployPagesWorkflow).toContain('- public/academy/**');
    });

    it('runs the cross-browser layout release boundary before PRs can merge', () => {
        expect(ciWorkflow).toContain('npx playwright install --with-deps chromium webkit');
        expect(ciWorkflow).toContain('npm run smoke:layout-regressions');
        expect(ciWorkflow).toMatch(/needs: \[typecheck, test, test-jpdb, gaming-smoke, layout-smoke\]/);
    });

    it('uses bounded isolated test shards on the release runner', () => {
        expect(releaseWorkflow).toContain('YOMU_CI_SHARDED: 1');
        expect(releaseWorkflow).toContain('YOMU_CI_REGULAR_CONCURRENCY: 1');
        expect(releaseWorkflow).toContain('YOMU_CI_REGULAR_MAX_WORKERS: 1');
        expect(releaseWorkflow).toContain('YOMU_CI_JPDB_CONCURRENCY: 2');
        expect(releaseWorkflow).toContain('YOMU_VITEST_FORK_HEAP_MB: 1536');
        expect(releaseWorkflow).not.toContain('YOMU_CI_MAX_WORKERS: 3');
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
        expect(releaseWorkflow).toContain('node-version: 24.14.0');
        expect(releaseWorkflow).toContain('npm install --global npm@11.9.0');
        expect(releaseWorkflow).toContain('node scripts/build-amo-source-package.mjs');
        expect(releaseWorkflow).toContain('dist/extension/source/yomureader.com-firefox-source.zip');
        expect(releaseWorkflow).toContain('--pattern yomureader.com-firefox.xpi');
        expect(releaseWorkflow).toContain('--source-dir=browser-store-artifacts/firefox');
        expect(releaseWorkflow).toContain('--upload-source-code=browser-store-artifacts/yomureader.com-firefox-source.zip');
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
