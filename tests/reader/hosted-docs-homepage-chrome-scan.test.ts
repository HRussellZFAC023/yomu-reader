import { afterEach, describe, expect, it } from 'vitest';

import { collectScanTargets, getMatchingSiteParsers } from '../../src/reader/app/site-parsers';

const YOMU_HOMEPAGE_URL = 'https://yomureader.com/';

afterEach(() => {
    document.body.innerHTML = '';
});

// The hosted docs homepage chrome (nav/hero/install panel/next-step grid)
// must be covered like any other site: no visible Japanese stays bare. It is
// NOT prose — it arrives via the passive residual pass (click-through
// navigation preserved, per-element layout guards bound the decoration)
// while `.vp-doc` remains the curated prose root. An earlier release
// excluded the chrome wholesale to protect the tablet layout, which shipped
// a homepage whose own hero/install copy had no annotations in Japanese
// mode — that exclusion must not come back.
describe('hosted docs homepage chrome scan boundary', () => {
    it('matches the hosted-docs parser on the homepage', () => {
        const profiles = getMatchingSiteParsers(YOMU_HOMEPAGE_URL);
        expect(profiles.map(profile => profile.id)).toContain('yomu-hosted-docs-parser');
    });

    it('covers VPNav, VPHero/VPHomeHero, the install panel, and the next-step grid via the passive residual pass', () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = `
            <header class="VPNav">
                <div class="VPNavBar">
                    <a href="/getting-started">はじめる</a>
                    <div class="group yomu-hosted-overflow-group">
                        <a href="/changelog">更新履歴を見る</a>
                    </div>
                </div>
            </header>
            <div class="VPContent is-home">
                <div class="VPHero has-image VPHomeHero">
                    <div class="container">
                        <div class="main">
                            <h1 class="heading">
                                <span class="name">よむ</span>
                                <span class="text">ページを離れずに日本語を読む</span>
                            </h1>
                            <p class="tagline">ウェブページで単語を調べて、勉強のために例文を保存しましょう。</p>
                        </div>
                    </div>
                </div>
                <div class="yomu-install-panel">
                    <div class="yomu-install-copy">
                        <strong>数ステップで準備完了</strong>
                        <p>ユーザースクリプトマネージャーを選んでインストールしてください。</p>
                    </div>
                </div>
                <div class="yomu-link-grid yomu-next-grid">
                    <a class="yomu-link-card" href="/study/">
                        <strong>学習</strong>
                        <span>保存した単語や統計を確認します。</span>
                    </a>
                </div>
                <article class="vp-doc">
                    <p>今日は静かな喫茶店で新しい本を読みました。</p>
                </article>
            </div>
        `;

        try {
            // Exercise the production pipeline end to end: the chrome must be
            // reached by the residual pass, and every chrome target must be
            // passive (click-through) rather than a destructive prose rewrite.
            const targets = collectScanTargets(80, YOMU_HOMEPAGE_URL);
            const texts = targets.map(target => target.text);
            const chromeSamples = ['はじめる', '更新履歴', 'よむ', 'ページを離れずに', '準備完了', '学習'];
            for (const sample of chromeSamples) {
                expect(texts.some(text => text.includes(sample)), `chrome text "${sample}" must be scanned`).toBe(true);
            }
            for (const target of targets) {
                if (chromeSamples.some(sample => target.text.includes(sample))) {
                    expect(target.passiveInteraction, `chrome target "${target.text}" must stay passive`).toBe(true);
                }
            }
            // Real docs prose stays covered as regular (non-passive) prose.
            const prose = targets.find(target => target.text.includes('今日は静かな喫茶店'));
            expect(prose).toBeDefined();
            expect(prose?.passiveInteraction).not.toBe(true);
        } finally {
            restoreRects();
        }
    });

    it('still covers the intentional pre-rendered .yomu-try-me-text sample', () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = `
            <div class="VPContent is-home">
                <section class="yomu-demo">
                    <div class="yomu-try-me-text" data-yomu-furigana-mode="all">
                        <p class="yomu-try-me-label">Try me</p>
                        <p class="yomu-try-me-sample" lang="ja" data-jpdb-reader-surface-ignore="true">
                            今日は静かな喫茶店で新しい本を読みました。
                        </p>
                    </div>
                </section>
            </div>
        `;

        try {
            // The sample is pre-rendered with its own inline ruby markup and is
            // self-tagged with the runtime's hard scan boundary
            // (data-jpdb-reader-surface-ignore) so the live scanner never
            // re-parses it — it is not, and never was, covered via a hosted-docs
            // scan root. Confirm it keeps its boundary and stays out of the
            // active scan (which would otherwise double-annotate it).
            const sample = document.querySelector('.yomu-try-me-sample');
            expect(sample?.getAttribute('data-jpdb-reader-surface-ignore')).toBe('true');
            const texts = collectScanTargets(80, YOMU_HOMEPAGE_URL).map(target => target.text);
            expect(texts.some(text => text.includes('今日は静かな喫茶店'))).toBe(false);
        } finally {
            restoreRects();
        }
    });

    it('does not apply the hosted-docs profile to an unrelated site', () => {
        expect(getMatchingSiteParsers('https://example.com/')).toEqual([]);
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
