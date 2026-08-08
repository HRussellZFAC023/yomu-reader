import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    docsNav,
    hostedOverflowLinks,
    MEMBERSHIP_NAV,
    OVERFLOW_NAV,
    PRIMARY_NAV,
} from '../../docs/.vitepress/shared/nav';

const ROOT = process.cwd();

function readProjectFile(file: string): string {
    return readFileSync(path.join(ROOT, file), 'utf8');
}

describe('hosted overflow menus', () => {
    it('keeps every shared navigation route in the docs and hosted menus', () => {
        const theme = readProjectFile('docs/.vitepress/theme/index.ts');
        const config = readProjectFile('docs/.vitepress/config.mts');
        const docsEntries = docsNav() as Array<{
            text: string;
            link?: string;
            items?: Array<{ text: string; link: string }>;
        }>;
        const docsLinks = docsEntries.flatMap(entry => entry.items ?? [entry]);
        const hostedLinks = hostedOverflowLinks();
        const expectedRoutes = [...PRIMARY_NAV, MEMBERSHIP_NAV, ...OVERFLOW_NAV];

        for (const route of expectedRoutes) {
            expect(docsLinks).toContainEqual(expect.objectContaining({ text: route.text, link: route.link }));
            if (route.text !== 'Study') {
                expect(hostedLinks).toContainEqual(expect.objectContaining({
                    text: route.text,
                    href: route.link,
                }));
            }
        }

        expect(theme).toContain("import { hostedOverflowLinks } from '../shared/nav';");
        expect(theme).toContain('const HOSTED_OVERFLOW_LINKS = hostedOverflowLinks();');
        expect(config).toContain("import { APPS_NAV_LABEL, docsNav } from './shared/nav';");
        expect(config).toContain('const siteNav = docsNav() as WebsiteNavigationItem[];');
        expect(config).toContain("localizeWebsiteNavigation(siteNav, 'ja')");
    });

    it('keeps one Membership route beside the GitHub and Discord navbar links', () => {
        const config = readProjectFile('docs/.vitepress/config.mts');
        const membership = readProjectFile('docs/membership.md');
        const popover = readProjectFile('docs/.vitepress/theme/membership-popover.ts');

        expect(MEMBERSHIP_NAV).toEqual({
            text: 'Membership',
            ja: 'メンバーシップ',
            link: '/membership',
            target: '_self',
        });
        expect(config).toContain("{ icon: 'github', link: `https://github.com/HRussellZFAC023/${repositoryName}` }");
        expect(config).toContain("{ icon: 'discord', link: 'https://discord.gg/jD6NPURewD' }");
        expect(config).not.toContain('...donationSocialLinks');
        for (const providerUrl of [
            'https://support.yomureader.com/donate',
            'https://www.patreon.com/yomureader',
            'https://ko-fi.com/yomureader',
        ]) {
            expect(membership).toContain(providerUrl);
            expect(popover).toContain(providerUrl);
        }
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
