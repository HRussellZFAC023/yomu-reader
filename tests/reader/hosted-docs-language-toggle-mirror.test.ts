import { afterEach, describe, expect, it } from 'vitest';
import { cleanupHostedDocsAnnotations } from '../../docs/.vitepress/theme/chrome-annotation-cleanup';

// DOM regression for the iPad Safari report: toggling the homepage
// language button from Japanese to English left the page blank. The reader
// runtime had covered a homepage copy node with a `.jpdb-reader-text-mirror`
// overlay (hiding the native text via `visibility: hidden` on the host) while
// the interface language was Japanese. On the language toggle, the theme's
// reader-word teardown removed the in-place `.jpdb-reader-word` wrapper but
// never removed the mirror overlay itself nor restored the host's
// `visibility: hidden`, so the freshly-translated English text underneath
// stayed invisible.
describe('hosted docs language toggle vs reader overlay mirrors', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('un-hides intact homepage copy when Japanese annotations are torn down for translation', () => {
        document.body.innerHTML = `
            <div class="yomu-install-panel">
                <strong id="host" style="visibility: hidden; position: relative;">設定を開く<span class="jpdb-reader-text-mirror"><span class="jpdb-reader-word"><ruby>設定<rt>せってい</rt></ruby>を開く</span></span></strong>
            </div>
        `;
        const host = document.querySelector<HTMLElement>('#host')!;

        expect(host.style.getPropertyValue('visibility')).toBe('hidden');
        cleanupHostedDocsAnnotations(document.body);

        expect(document.querySelector('.jpdb-reader-text-mirror')).toBeNull();
        expect(document.querySelector('.jpdb-reader-word')).toBeNull();
        // Localization now receives the original, visible native string once,
        // rather than translating text hidden beneath a stale overlay.
        expect(host.style.getPropertyValue('visibility')).toBe('');
        expect(host.textContent?.trim()).toBe('設定を開く');
    });

    it('does not tear down annotations owned by reader UI or localization opt-outs', () => {
        document.body.innerHTML = `
            <div data-jpdb-reader-root><span class="jpdb-reader-text-mirror">設定</span></div>
            <div data-yomu-localize="off"><span class="jpdb-reader-word">設定</span></div>
            <button id="control-host">設定</button><span class="jpdb-reader-control-text-mirror">設定</span>
        `;

        cleanupHostedDocsAnnotations(document.body);

        expect(document.querySelector('[data-jpdb-reader-root] .jpdb-reader-text-mirror')).not.toBeNull();
        expect(document.querySelector('[data-yomu-localize="off"] .jpdb-reader-word')).not.toBeNull();
        expect(document.querySelector('.jpdb-reader-control-text-mirror')).not.toBeNull();
    });
});
