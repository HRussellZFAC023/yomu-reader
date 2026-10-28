import { afterEach, describe, expect, it } from 'vitest';

import { collectScanTargets, getMatchingSiteParsers } from '../../src/reader/app/site-parsers';

const MIGAKU_URL = 'https://migaku.com/';

afterEach(() => {
    document.body.innerHTML = '';
});

describe('Migaku marketing-site scan boundary', () => {
    it('skips the rotating hero and Migaku-owned annotations but keeps stable Japanese prose', () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = `
            <main>
                <!-- Fixture: selectors and overlapping transition shape captured from migaku.com. -->
                <h1 class="UiTypo UiTypo__headingHuge -heading WelcomeText__title">
                    Start
                    <span class="WelcomeText__title__nested WelcomeText__title__activity fade-leave-active fade-leave-to">日本語を読む</span>
                    <span class="WelcomeText__title__nested WelcomeText__title__activity fade-enter-active fade-enter-from">日本語を見る</span>
                </h1>
                <section class="learning-demo">
                    <p><ruby><span class="migaku-surface">宇宙</span><rt>うちゅう</rt></ruby>は神秘に満ちている</p>
                </section>
                <article><p>今日は静かな喫茶店で日本語の本を読みました。</p></article>
            </main>
        `;

        try {
            const [profile] = getMatchingSiteParsers(MIGAKU_URL);
            expect(profile?.id).toBe('migaku-marketing-parser');
            expect(getMatchingSiteParsers('https://www.migaku.com/learn-japanese').map(profile => profile.id))
                .toEqual(['migaku-marketing-parser']);

            const texts = collectScanTargets(40, MIGAKU_URL).map(target => target.text);
            expect(texts.some(text => text.includes('今日は静かな喫茶店'))).toBe(true);
            expect(texts.some(text => text.includes('日本語を読む'))).toBe(false);
            expect(texts.some(text => text.includes('日本語を見る'))).toBe(false);
            expect(texts.some(text => text.includes('宇宙'))).toBe(false);

            // The generic residual pass scans document.body without profile
            // exclusions. Prove the profile-level suppression is load-bearing,
            // rather than getting a false pass from the main-root exclusion.
            const suppressResidual = profile.suppressResidualVisibleScan;
            profile.suppressResidualVisibleScan = false;
            try {
                const leakedTexts = collectScanTargets(40, MIGAKU_URL).map(target => target.text);
                expect(leakedTexts.some(text => text.includes('日本語を読む'))).toBe(true);
            } finally {
                profile.suppressResidualVisibleScan = suppressResidual;
            }
        } finally {
            restoreRects();
        }
    });

    it('does not apply Migaku exclusions to an unrelated site', () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = `
            <main>
                <h1 class="WelcomeText__title"><span>日本語を読む</span></h1>
                <article><p><span class="migaku-surface">宇宙を旅する</span></p></article>
            </main>
        `;

        try {
            expect(getMatchingSiteParsers('https://example.com/article')).toEqual([]);
            expect(getMatchingSiteParsers('https://study.migaku.com/')).toEqual([]);
            const texts = collectScanTargets(40, 'https://example.com/article').map(target => target.text);
            expect(texts.some(text => text.includes('日本語を読む'))).toBe(true);
            expect(texts.some(text => text.includes('宇宙を旅する'))).toBe(true);
        } finally {
            restoreRects();
        }
    });
});

function mockVisibleElementRects(): () => void {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = () => ({
        x: 0,
        y: 0,
        width: 240,
        height: 36,
        top: 0,
        right: 240,
        bottom: 36,
        left: 0,
        toJSON: () => ({}),
    } as DOMRect);
    return () => {
        HTMLElement.prototype.getBoundingClientRect = originalRect;
    };
}
