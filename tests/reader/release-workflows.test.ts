import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const buildUserscriptWorkflow = readFileSync(
    join(process.cwd(), '.github/workflows/build-userscript.yml'),
    'utf8',
);
const ciWorkflow = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8');

describe('release workflow safety', () => {
    it('does not suppress Actions from the generated-assets commit', () => {
        const commitCommand = buildUserscriptWorkflow
            .split('\n')
            .find(line => line.includes('git commit -m'));

        expect(commitCommand).toBeDefined();
        expect(commitCommand).not.toMatch(/\[(?:skip ci|ci skip|no ci|skip actions|actions skip)\]/i);
    });

    it('keeps the manual Deploy Docs fallback so a skipped push can always be recovered', () => {
        // A push HEAD carrying [skip ci] suppresses ALL push workflows at the
        // GitHub level — nothing inside the YAML can override it. The
        // workflow_dispatch trigger is the recovery path the release flow
        // relies on (gh workflow run "Deploy Docs"); its absence bit 1.6.115
        // when the deploy silently never ran.
        const deployPagesWorkflow = readFileSync(
            join(process.cwd(), '.github/workflows/deploy-pages.yml'),
            'utf8',
        );
        expect(deployPagesWorkflow).toMatch(/^on:\n(?:.*\n)*?\s*workflow_dispatch:/m);
    });

    it('rebuilds Academy after hosted Reader assets so its revision hashes deployed bytes', () => {
        const deployPagesWorkflow = readFileSync(
            join(process.cwd(), '.github/workflows/deploy-pages.yml'),
            'utf8',
        );
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
});
