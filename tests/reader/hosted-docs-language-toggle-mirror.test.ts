import { afterEach, describe, expect, it } from 'vitest';
import { cleanupHostedDocsAnnotations } from '../../docs/.vitepress/theme/chrome-annotation-cleanup';

// DOM regression for the iPad Safari report: rebuilding Japanese annotations
// used to remove in-place word wrappers but leave a `.jpdb-reader-text-mirror`
// hiding the native text. Website locale is now a static route; the same
// teardown remains necessary when annotation-affecting reader settings change.
describe('hosted docs annotation teardown vs reader overlay mirrors', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('un-hides intact homepage copy when Japanese annotations are rebuilt', () => {
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
        // The static route copy remains visible beneath no stale overlay.
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
