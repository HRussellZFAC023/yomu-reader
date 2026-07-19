import { afterEach, describe, expect, it } from 'vitest';

import { collectScanTargets, getMatchingSiteParsers } from '../../src/reader/app/site-parsers';

const YOMU_HOMEPAGE_URL = 'https://yomureader.com/';

afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-yomu-annotation-scope');
});

// Hosted docs annotate only declared Reader Surfaces. Navigation, hero,
// install chrome, link grids, and docs prose are translated site copy; mass
// annotating them caused long tasks and a very slow first hover in Japanese
// mode. Pages that do not declare this scope retain ordinary scanning.
describe('hosted docs homepage chrome scan boundary', () => {
    it('matches the hosted-docs parser on the homepage', () => {
        const profiles = getMatchingSiteParsers(YOMU_HOMEPAGE_URL);
        expect(profiles.map(profile => profile.id)).toContain('yomu-hosted-docs-parser');
    });

    it('does not scan translated chrome or docs prose', () => {
        const restoreRects = mockVisibleElementRects();
        document.documentElement.setAttribute('data-yomu-annotation-scope', 'surface');
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
            const targets = collectScanTargets(80, YOMU_HOMEPAGE_URL);
            const texts = targets.map(target => target.text);
            const chromeSamples = ['はじめる', '更新履歴', 'よむ', 'ページを離れずに', '準備完了', '学習', '今日は静かな喫茶店'];
            for (const sample of chromeSamples) {
                expect(texts.some(text => text.includes(sample)), `site copy "${sample}" must not be scanned`).toBe(false);
            }
        } finally {
            restoreRects();
        }
    });

    it('scans a declared reading surface and nothing around it', () => {
        const restoreRects = mockVisibleElementRects();
        document.documentElement.setAttribute('data-yomu-annotation-scope', 'surface');
        document.body.innerHTML = `
            <div class="VPHero"><p>ページを離れずに日本語を読む</p></div>
            <figure data-yomu-runtime-surface><figcaption>吾輩は猫である。名前はまだ無い。</figcaption></figure>
            <article class="vp-doc"><p>今日は静かな喫茶店で新しい本を読みました。</p></article>
        `;
        try {
            const texts = collectScanTargets(80, YOMU_HOMEPAGE_URL).map(target => target.text);
            expect(texts.some(text => text.includes('吾輩は猫である'))).toBe(true);
            expect(texts.some(text => text.includes('ページを離れずに'))).toBe(false);
            expect(texts.some(text => text.includes('今日は静かな喫茶店'))).toBe(false);
        } finally {
            restoreRects();
        }
    });

    // Japanese mode: the theme stamps data-yomu-runtime-surface on #VPContent,
    // turning the whole content column into ordinary Japanese reading material
    // while navigation chrome outside it stays untouched.
    it('scans the whole content column when Japanese mode declares it a surface', () => {
        const restoreRects = mockVisibleElementRects();
        document.documentElement.setAttribute('data-yomu-annotation-scope', 'surface');
        document.body.innerHTML = `
            <header class="VPNav"><a href="/changelog">更新履歴を見る</a></header>
            <div class="VPContent is-home" id="VPContent" data-yomu-runtime-surface>
                <div class="VPHero"><p>ページを離れずに日本語を読む</p></div>
                <article class="vp-doc"><p>今日は静かな喫茶店で新しい本を読みました。</p></article>
            </div>
        `;
        try {
            const texts = collectScanTargets(80, YOMU_HOMEPAGE_URL).map(target => target.text);
            expect(texts.some(text => text.includes('ページを離れずに'))).toBe(true);
            expect(texts.some(text => text.includes('今日は静かな喫茶店'))).toBe(true);
            expect(texts.some(text => text.includes('更新履歴を見る'))).toBe(false);
        } finally {
            restoreRects();
        }
    });

    it('does not reparse the intentional pre-rendered Try Me sample', () => {
        const restoreRects = mockVisibleElementRects();
        document.documentElement.setAttribute('data-yomu-annotation-scope', 'surface');
        document.body.innerHTML = `
            <div class="VPContent is-home">
                <section class="yomu-demo">
                    <div class="yomu-try-me-text" data-yomu-furigana-mode="all" data-yomu-runtime-surface>
                        <p class="yomu-try-me-label">Try me</p>
                        <p class="yomu-try-me-sample" lang="ja" data-jpdb-reader-surface-ignore="true">
                            今日は静かな喫茶店で新しい本を読みました。
                        </p>
                    </div>
                </section>
            </div>
        `;

        try {
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
