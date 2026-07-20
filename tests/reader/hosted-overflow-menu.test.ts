import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function readProjectFile(file: string): string {
    return readFileSync(path.join(ROOT, file), 'utf8');
}

describe('hosted overflow menus', () => {
    it('keeps the homepage overflow link set complete', () => {
        const theme = readProjectFile('docs/.vitepress/theme/index.ts');
        const config = readProjectFile('docs/.vitepress/config.mts');

        for (const label of ['Video Player', 'PDF Reader', 'Stats', 'Local Audio', 'Changelog', 'Support']) {
            expect(theme).toContain(`text: '${label}'`);
            expect(config).toContain(`text: '${label}'`);
        }
        expect(theme).toContain("href: '/pdf-reader/index.html'");
        expect(config).toContain("const pdfReaderLink = '/pdf-reader/index.html';");
    });

    it('places verified donation providers beside the GitHub and Discord navbar links', () => {
        const config = readProjectFile('docs/.vitepress/config.mts');
        const workflow = readProjectFile('.github/workflows/deploy-pages.yml');

        expect(config).toContain("{ icon: stripeDonationIcon, link: stripeDonationLink, ariaLabel: 'Donate to Yomu with Stripe' }");
        expect(config).toContain('<title>Stripe</title>');
        expect(config).toContain('<title>Patreon</title>');
        expect(config).toContain('<title>Ko-fi</title>');
        expect(config).toContain("{ icon: 'github', link: `https://github.com/HRussellZFAC023/${repositoryName}` }");
        expect(config).toContain("{ icon: 'discord', link: 'https://discord.gg/jD6NPURewD' }");
        expect(config).toContain('...donationSocialLinks');
        expect(config).toContain("process.env.YOMU_PATREON_ENABLED === '1'");
        expect(config).toContain('process.env.YOMU_PATREON_URL');
        expect(config).toContain('process.env.YOMU_KOFI_URL');
        expect(config).toContain('? [{ icon: patreonDonationIcon, link: patreonDonationLink');
        expect(config).toContain('? [{ icon: kofiDonationIcon, link: kofiDonationLink');
        expect(config).toContain("'https://www.patreon.com/yomureader'");
        expect(config).not.toMatch(/ko-fi\.com\/(?:yomu|Yomu)/);
        expect(workflow).toContain('YOMU_PATREON_ENABLED: ${{ vars.YOMU_PATREON_ENABLED }}');
        expect(workflow).toContain('YOMU_PATREON_URL: ${{ vars.YOMU_PATREON_URL }}');
        expect(workflow).toContain('YOMU_KOFI_URL: ${{ vars.YOMU_KOFI_URL }}');
    });

    it('renders every live donation provider in the README badge row', () => {
        const readme = readProjectFile('README.md');

        expect(readme).toContain('href="https://support.yomureader.com/donate"');
        expect(readme).toContain('href="https://patreon.com/yomureader"');
        expect(readme).toContain('href="https://ko-fi.com/yomureader"');
        expect(readme).not.toContain('Donation badge release templates');
        expect(readme).not.toContain('KOFI_CREATOR_URL');
    });

});
