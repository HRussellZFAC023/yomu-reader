import { afterEach, describe, expect, it } from 'vitest';
import { cleanupOwnedChromeAnnotations, readerWordSurfaceText } from '../../docs/.vitepress/theme/chrome-annotation-cleanup';

afterEach(() => {
    document.body.innerHTML = '';
});

// Browser-like regression for the old-runtime homepage race: a pre-fix
// userscript annotated the homepage's own chrome at document-start, before the
// theme mounted and stamped its scan boundary. Stamping now also strips those
// annotations without losing text, links, buttons, or their listeners.
describe('hosted homepage chrome annotation cleanup', () => {
    it('unwraps in-place word/ruby wrappers back to plain text while keeping link semantics', () => {
        document.body.innerHTML = `
            <section class="VPHomeHero" data-jpdb-reader-surface-ignore="true">
                <h1 class="heading"><span class="jpdb-reader-word" data-expression="日本語"><ruby>日本語<rt>にほんご</rt></ruby></span>を<span class="jpdb-reader-word"><ruby>読<rt>よ</rt></ruby>む</span></h1>
                <a href="/install/" id="cta"><span class="jpdb-reader-word"><ruby>追加<rt>ついか</rt></ruby></span></a>
            </section>
        `;
        const hero = document.querySelector<HTMLElement>('.VPHomeHero')!;
        const cta = document.querySelector<HTMLAnchorElement>('#cta')!;
        let clicks = 0;
        cta.addEventListener('click', event => { event.preventDefault(); clicks += 1; });

        cleanupOwnedChromeAnnotations(hero);

        expect(hero.querySelectorAll('.jpdb-reader-word')).toHaveLength(0);
        expect(hero.querySelectorAll('rt')).toHaveLength(0);
        expect(hero.querySelector('.heading')?.textContent).toBe('日本語を読む');
        // The link element, its href, its text, and its listener all survive.
        expect(cta.tagName).toBe('A');
        expect(cta.getAttribute('href')).toBe('/install/');
        expect(cta.textContent).toBe('追加');
        cta.click();
        expect(clicks).toBe(1);
    });

    it('removes overlay text mirrors and un-hides the native host text', () => {
        document.body.innerHTML = `
            <div class="yomu-install-panel" data-jpdb-reader-surface-ignore="true">
                <strong id="host" style="visibility: hidden; position: relative;">設定を開く<span class="jpdb-reader-text-mirror"><span class="jpdb-reader-word"><ruby>設定<rt>せってい</rt></ruby></span></span></strong>
            </div>
        `;
        const panel = document.querySelector<HTMLElement>('.yomu-install-panel')!;
        const host = document.querySelector<HTMLElement>('#host')!;

        cleanupOwnedChromeAnnotations(panel);

        expect(panel.querySelector('.jpdb-reader-text-mirror')).toBeNull();
        // Injected mirror-host styles are cleared so the native text re-appears.
        expect(host.style.getPropertyValue('visibility')).toBe('');
        expect(host.style.getPropertyValue('position')).toBe('');
        expect(host.textContent).toBe('設定を開く');
    });

    it('leaves a host style value the site itself set (only injected values are cleared)', () => {
        document.body.innerHTML = `
            <div class="VPNav" data-jpdb-reader-surface-ignore="true">
                <span id="host" style="visibility: hidden; overflow: auto;">ホーム<span class="jpdb-reader-control-text-mirror"><span class="jpdb-reader-word">ホーム</span></span></span>
            </div>
        `;
        const nav = document.querySelector<HTMLElement>('.VPNav')!;
        const host = document.querySelector<HTMLElement>('#host')!;

        cleanupOwnedChromeAnnotations(nav);

        expect(host.style.getPropertyValue('visibility')).toBe('');
        // overflow:auto is the site's own value (not the injected `visible`) — kept.
        expect(host.style.getPropertyValue('overflow')).toBe('auto');
    });

    it('is idempotent across repeated cleanups and SPA remounts', () => {
        document.body.innerHTML = `
            <nav class="VPNav" data-jpdb-reader-surface-ignore="true"><a href="/x"><span class="jpdb-reader-word"><ruby>始<rt>はじ</rt></ruby>める</span></a></nav>
        `;
        const nav = document.querySelector<HTMLElement>('.VPNav')!;

        cleanupOwnedChromeAnnotations(nav);
        const settled = nav.innerHTML;
        cleanupOwnedChromeAnnotations(nav);
        cleanupOwnedChromeAnnotations(nav);

        expect(nav.innerHTML).toBe(settled);
        expect(nav.querySelector('.jpdb-reader-word')).toBeNull();
        expect(nav.textContent?.trim()).toBe('始める');
        expect(nav.querySelector('a')?.getAttribute('href')).toBe('/x');
    });

    it('notifies the unwrapped-parent callback so the theme can drop stale text originals', () => {
        document.body.innerHTML = '<div class="VPNav"><span class="jpdb-reader-word">語</span></div>';
        const nav = document.querySelector<HTMLElement>('.VPNav')!;
        const seen: ParentNode[] = [];

        cleanupOwnedChromeAnnotations(nav, parent => seen.push(parent));

        expect(seen).toContain(nav);
    });

    it('extracts ruby-free surface text from a word wrapper', () => {
        document.body.innerHTML = '<span class="jpdb-reader-word"><ruby>読<rt>よ</rt></ruby>む</span>';
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        expect(readerWordSurfaceText(word)).toBe('読む');
    });
});
