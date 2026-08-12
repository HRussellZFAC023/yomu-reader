import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .cjs release policy without type declarations
import policy from '../../scripts/lib/public-release-policy.cjs';

const {
    USERSCRIPT_DISTRIBUTION_METADATA,
    isLiveStudyAppUrl,
    liveHostedAnkiBridgeUrl,
    liveStudyAliasUrl,
    liveStudyUrl,
    userscriptDistributionMetadataViolations,
} = policy as {
    USERSCRIPT_DISTRIBUTION_METADATA: Record<'downloadURL' | 'updateURL', string>;
    isLiveStudyAppUrl: (value: string) => boolean;
    liveHostedAnkiBridgeUrl: (origin: string, smokeId: string) => string;
    liveStudyAliasUrl: (origin: string, smokeId: string) => string;
    liveStudyUrl: (origin: string) => string;
    userscriptDistributionMetadataViolations: (
        code: string,
        values: (code: string, key: string) => string[],
    ) => Array<{ key: string; expected: string; values: string[] }>;
};

function metadataValues(code: string, key: string): string[] {
    const pattern = new RegExp(`^// @${key}\\s+(.+)$`, 'gm');
    return Array.from(code.matchAll(pattern), (match) => match[1].trim());
}

describe('public release policy', () => {
    it('models the retired newtab route as an alias of Study without losing the deployment base', () => {
        const origin = 'https://hrussellzfac023.github.io/yomu-reader/';

        expect(liveStudyAliasUrl(origin, 'release-1')).toBe(
            'https://hrussellzfac023.github.io/yomu-reader/newtab/?yomu-smoke=release-1',
        );
        expect(liveStudyUrl(origin)).toBe(
            'https://hrussellzfac023.github.io/yomu-reader/study/',
        );
        expect(isLiveStudyAppUrl('https://yomureader.com/study/app.js?v=abc123')).toBe(true);
        expect(isLiveStudyAppUrl('https://yomureader.com/newtab/app.js?v=abc123')).toBe(false);
    });

    it('runs the hosted Anki bridge smoke on canonical Study rather than the redirect alias', () => {
        const target = liveHostedAnkiBridgeUrl(
            'https://hrussellzfac023.github.io/yomu-reader/',
            'release-1',
        );

        expect(target).toBe(
            'https://hrussellzfac023.github.io/yomu-reader/study/?yomu-anki-bridge-smoke=release-1',
        );
        expect(new URL(target).pathname).toBe('/yomu-reader/study/');
        expect(new URL(target).pathname).not.toContain('/newtab/');
    });

    it('allows absent or exact Greasy Fork update metadata and rejects alternates or duplicates', () => {
        const approved = `// @downloadURL ${USERSCRIPT_DISTRIBUTION_METADATA.downloadURL}\n`
            + `// @updateURL ${USERSCRIPT_DISTRIBUTION_METADATA.updateURL}\n`;
        const alternate = '// @downloadURL https://yomureader.com/yomu.user.js\n';
        const duplicate = `${approved}// @updateURL https://example.com/yomu.meta.js\n`;

        expect(userscriptDistributionMetadataViolations('', metadataValues)).toEqual([]);
        expect(userscriptDistributionMetadataViolations(approved, metadataValues)).toEqual([]);
        expect(userscriptDistributionMetadataViolations(alternate, metadataValues)).toEqual([
            {
                key: 'downloadURL',
                expected: USERSCRIPT_DISTRIBUTION_METADATA.downloadURL,
                values: ['https://yomureader.com/yomu.user.js'],
            },
        ]);
        expect(userscriptDistributionMetadataViolations(duplicate, metadataValues)).toEqual([
            {
                key: 'updateURL',
                expected: USERSCRIPT_DISTRIBUTION_METADATA.updateURL,
                values: [USERSCRIPT_DISTRIBUTION_METADATA.updateURL, 'https://example.com/yomu.meta.js'],
            },
        ]);
    });
});
