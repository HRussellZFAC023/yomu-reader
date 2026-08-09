import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SMOKE_SOURCE = readFileSync('scripts/docs-localization-browser-smoke.mjs', 'utf8');

function functionBody(name: string): string {
    const start = SMOKE_SOURCE.indexOf(`async function ${name}(`);
    if (start < 0) throw new Error(`Missing ${name}`);
    const nextFunction = SMOKE_SOURCE.indexOf('\nasync function ', start + 1);
    return SMOKE_SOURCE.slice(start, nextFunction < 0 ? undefined : nextFunction);
}

describe('docs localization browser smoke readiness', () => {
    it('does not make Academy readiness depend on its offline precache becoming idle', () => {
        const navigation = functionBody('navigateToAcademyShell');

        expect(navigation).toContain("waitUntil: 'domcontentloaded'");
        expect(navigation).not.toContain("waitUntil: 'networkidle'");
        expect(navigation).toContain("assert.ok(response?.ok(), 'Academy route response failed')");
        expect(SMOKE_SOURCE.match(/await navigateToAcademyShell\(page\);/gu)).toHaveLength(2);
    });

    it('keeps semantic cold-shell and hosted-runtime readiness assertions after navigation', () => {
        const academyFlow = SMOKE_SOURCE.slice(
            SMOKE_SOURCE.indexOf('await navigateToAcademyShell(page);'),
            SMOKE_SOURCE.indexOf('assert.deepEqual(hydrationMessages'),
        );
        const coldAssertion = functionBody('assertAcademyReaderCold');
        const runtimeAssertion = functionBody('assertHostedRuntimeOrder');

        expect(academyFlow).toMatch(
            /navigateToAcademyShell\(page\);[\s\S]*assertAcademyReaderCold\(page\);[\s\S]*navigateToAcademyShell\(page\);[\s\S]*assertHostedRuntimeOrder\(page,/u,
        );
        expect(coldAssertion).toContain(".academy-root').waitFor({ state: 'visible' })");
        expect(runtimeAssertion).toContain("data-yomu-runtime-health=\"ready\"");
        expect(runtimeAssertion).toContain("waitFor({ state: 'visible', timeout: 20_000 })");
        expect(runtimeAssertion).toContain("script.state === 'loaded'");
    });
});
