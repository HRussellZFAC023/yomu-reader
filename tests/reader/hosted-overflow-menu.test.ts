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

    it('keeps support banner status on the Yomu domain with a workers.dev fallback during DNS migration', () => {
        const theme = readProjectFile('docs/.vitepress/theme/index.ts');

        expect(theme).toContain("const YOMU_SUPPORT_STATUS_URL = 'https://support.yomureader.com/status'");
        expect(theme).toContain("const YOMU_SUPPORT_DONATE_URL = 'https://support.yomureader.com/donate'");
        expect(theme).toContain("const YOMU_SUPPORT_FALLBACK_STATUS_URL = 'https://yomu-support.henry-robert-christopher-russell.workers.dev/status'");
        expect(theme).toContain("for (const url of [YOMU_SUPPORT_STATUS_URL, YOMU_SUPPORT_FALLBACK_STATUS_URL])");
        expect(theme).not.toContain("fallbackHostedSupportStatus");
        expect(theme).toContain("const YOMU_SUPPORT_BANNER_DISMISS_MS = 7 * 24 * 60 * 60 * 1000");
        expect(theme).toContain("dismissedUntil: Date.now() + YOMU_SUPPORT_BANNER_DISMISS_MS");
        expect(theme).toContain("Yomu's Ultimate Audio is donation funded.");
    });

    it('uses homepage-style labels and compact sizing on the newtab menu', () => {
        const controller = readProjectFile('src/reader/newtab/controller.ts');
        const css = readProjectFile('src/reader/styles/new-tab.css').replace(/\s+/g, ' ');

        expect(controller).toContain("uiText(language, 'localAudio')");
        expect(controller).toContain("`${DOCS_BASE_URL}local-audio`");
        expect(controller).not.toContain("`${DOCS_BASE_URL}local-audio/`");
        expect(controller).toContain("uiText(language, 'changelog')");
        expect(controller).toContain("uiText(language, 'support')");
        expect(controller).toContain("uiText(language, 'github')");
        expect(controller).toContain("SUPPORT_STATUS_URL");
        expect(controller).toContain("NEW_TAB_SUPPORT_BANNER_DISMISS_MS = 7 * 24 * 60 * 60 * 1000");
        expect(controller).toContain("dismiss-support-banner");
        expect(controller).not.toContain("this.renderOverflowMenuLink('Local Audio'");
        expect(controller).not.toContain("this.renderOverflowMenuLink('Support'");
        expect(css).toContain('.jpdb-reader-newtab-support-banner {');
        expect(css).toContain('min-width: 190px; padding: 8px;');
        expect(css).toContain('.jpdb-reader-newtab-menu-description { display: none;');
    });

    it('keeps PDF and video hosted tool menus aligned with the homepage links', () => {
        for (const file of ['docs/public/pdf-reader/index.html', 'docs/public/video-player/index.html']) {
            const html = readProjectFile(file);
            expect(html).toContain('class="more-icon"');
            expect(html).not.toContain('hamburger-icon');
            expect(html).toContain('href="https://github.com/HRussellZFAC023/yomu-reader"');
            expect(html).toContain('href="https://discord.gg/jD6NPURewD"');
            expect(html).toContain('href="../pdf-reader/index.html"');
            expect(html).not.toContain('github.com/Ajatt-Tools/yomitan-for-jpdb');
            expect(html).not.toContain('discord.gg/nhqjydaR8j');
            for (const selector of [
                'data-settings-trigger',
                'data-menu-study',
                'data-menu-video',
                'data-menu-pdf-reader',
                'data-menu-stats',
                'data-menu-local-audio',
                'data-menu-changelog',
                'data-menu-support',
                'data-menu-github',
                'data-menu-discord',
            ]) {
                expect(html).toContain(selector);
            }
        }
    });
});
