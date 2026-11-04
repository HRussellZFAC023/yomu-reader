import { afterEach, describe, expect, it, vi } from 'vitest';
import { copySourceTypography, sameSourcePresentation, typographyRequiresSourceProjection } from '../../src/reader/dom/source-preserving-typography';
import { styleDocumentAnnotationPortalMirror } from '../../src/reader/dom/youtube-chrome-annotation-portal';
import { styleDetachedReadingElements } from '../../src/reader/dom/detached-reading-overlay';
import { applyTokensToScanTarget, collectFragmentTextTargetsIn, removeNonDestructiveScanMirrors } from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { mirrorToken } from './helpers/japanese-token-fixtures';

afterEach(() => {
    removeNonDestructiveScanMirrors(document);
    document.body.replaceChildren();
});

describe('typography requiring source projection', () => {
    it.each(['"palt"', '"palt" on', '"palt" 1', "'palt' 2", '"kern" 0, "palt" 1'])(
        'preserves the native shaping run for enabled %s', fontFeatureSettings => {
            expect(typographyRequiresSourceProjection({ fontFeatureSettings })).toBe(true);
        },
    );

    it.each(['normal', '', '"palt" off', '"palt" 0', '"palt" 00', '"liga" 1', '"palt" 1, "palt" 0'])(
        'keeps ordinary inline annotation for %s', fontFeatureSettings => {
            expect(typographyRequiresSourceProjection({ fontFeatureSettings })).toBe(false);
        },
    );

    it('uses the current feature declaration after a host style change', () => {
        const host = document.createElement('p');
        host.style.fontFeatureSettings = '"palt" 0';
        document.body.append(host);
        expect(typographyRequiresSourceProjection(getComputedStyle(host))).toBe(false);
        host.style.fontFeatureSettings = '"palt" 1';
        expect(typographyRequiresSourceProjection(getComputedStyle(host))).toBe(true);
        host.style.fontFeatureSettings = '"palt" off';
        expect(typographyRequiresSourceProjection(getComputedStyle(host))).toBe(false);
        host.remove();
    });

    it('copies feature-enabled host typography into an isolated annotation portal', () => {
        const host = document.createElement('p');
        host.style.cssText = 'font-family:Meiryo;font-size:20px;font-style:italic;font-weight:500;font-stretch:condensed;font-feature-settings:"palt";font-kerning:none;word-spacing:2px';
        const mirror = document.createElement('span');
        document.body.append(host, mirror);
        styleDocumentAnnotationPortalMirror(mirror, host);
        const style = getComputedStyle(host);
        for (const property of ['font-family', 'font-size', 'font-style', 'font-weight', 'font-stretch', 'font-feature-settings', 'font-kerning', 'word-spacing']) {
            expect(mirror.style.getPropertyValue(property)).toBe(style.getPropertyValue(property));
        }
        host.remove();
        mirror.remove();
    });

    it('copies in-host mirror typography without redundant style mutations', () => {
        const host = document.createElement('p');
        host.style.cssText = 'font-family:Meiryo;font-size:20px;font-feature-settings:"palt";letter-spacing:1px';
        const mirror = document.createElement('span');
        document.body.append(host, mirror);
        const style = getComputedStyle(host);
        copySourceTypography(mirror, style);
        expect(mirror.style.fontFamily).toBe(style.fontFamily);
        expect(mirror.style.fontFeatureSettings).toBe(style.fontFeatureSettings);
        const observer = new MutationObserver(() => {});
        observer.observe(mirror, { attributes: true });
        copySourceTypography(mirror, style);
        expect(observer.takeRecords()).toEqual([]);
        observer.disconnect();
        host.remove();
        mirror.remove();
    });

    it('retains half-size page readings for projected proportional text and the existing compact reading size', () => {
        const host = document.createElement('p');
        host.style.cssText = 'font-size:20px;font-feature-settings:"palt"';
        const mirror = document.createElement('span');
        mirror.innerHTML = '<span class="jpdb-reader-detached-ruby">学<span class="jpdb-reader-detached-furi">がく</span></span>';
        host.append(mirror);
        document.body.append(host);
        const reading = mirror.querySelector<HTMLElement>('.jpdb-reader-detached-furi');
        styleDetachedReadingElements(mirror, host);
        expect(reading?.style.fontSize).toBe('10px');
        host.style.fontFeatureSettings = '"palt" off';
        styleDetachedReadingElements(mirror, host);
        expect(reading?.style.fontSize).toBe('12px');
        host.style.fontFeatureSettings = '"palt"';
        host.style.fontSize = '12px';
        styleDetachedReadingElements(mirror, host);
        expect(reading?.style.fontSize).toBe('8px');
        host.remove();
    });

    it('distinguishes source font and ink owners', () => {
        const first = document.createElement('p');
        const second = document.createElement('p');
        first.style.cssText = second.style.cssText = 'font:20px Meiryo;color:#202122';
        document.body.append(first, second);
        expect(sameSourcePresentation(getComputedStyle(first), getComputedStyle(second))).toBe(true);
        second.style.color = '#3366cc';
        expect(sameSourcePresentation(getComputedStyle(first), getComputedStyle(second))).toBe(false);
        second.style.color = '#202122';
        second.style.fontFeatureSettings = '"palt"';
        expect(sameSourcePresentation(getComputedStyle(first), getComputedStyle(second))).toBe(false);
    });

    it('gives nested links one reading owner while retaining the native link and event dispatch', () => {
        const host = document.createElement('p');
        host.style.cssText = 'font:20px Meiryo;font-feature-settings:"palt"';
        const link = document.createElement('a');
        link.href = '#school';
        link.style.cssText = host.style.cssText;
        link.textContent = '学校教育';
        const plain = document.createElement('span');
        plain.style.cssText = host.style.cssText;
        plain.textContent = '本語';
        host.append('日', plain, link, 'で');
        document.body.append(host);
        const clicked = vi.fn();
        link.addEventListener('click', clicked);
        const target = collectFragmentTextTargetsIn(host, 40, false).find(candidate => candidate.text === '日本語学校教育で');
        const linkTarget = collectFragmentTextTargetsIn(link, 40, false).find(candidate => candidate.text === '学校教育');
        if (!target || !linkTarget) throw new Error('mixed-link source targets were not collected');
        const school = mirrorToken('学校教育', 'がっこうきょういく');
        const settings = { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' as const };
        applyTokensToScanTarget(target, [mirrorToken('日本語'), {
            ...school, start: 3, end: 7, rubies: school.rubies.map(ruby => ({ ...ruby, start: ruby.start + 3, end: ruby.end + 3 })),
        }], settings);
        applyTokensToScanTarget(linkTarget, [school], settings);
        expect(document.querySelectorAll('.jpdb-reader-text-mirror .jpdb-reader-word[data-expression="学校教育"]')).toHaveLength(1);
        expect(document.querySelectorAll('.jpdb-reader-text-mirror .jpdb-reader-word[data-expression="学校教育"] .jpdb-reader-furi')).toHaveLength(1);
        expect(document.querySelectorAll('.jpdb-reader-text-mirror .jpdb-reader-word[data-expression="日本語"] .jpdb-reader-furi')).toHaveLength(1);
        expect(host.querySelector('a')).toBe(link);
        expect(host.querySelector('span')).toBe(plain);
        link.click();
        expect(clicked).toHaveBeenCalledTimes(1);
    });

    it('keeps uniform inline spans in one source word and retains its reading', () => {
        const host = document.createElement('p');
        host.style.cssText = 'font:20px Meiryo;font-feature-settings:"palt"';
        const span = document.createElement('span');
        span.style.cssText = host.style.cssText;
        span.textContent = '本語';
        host.append('日', span);
        document.body.append(host);
        const target = collectFragmentTextTargetsIn(host, 40, false).find(candidate => candidate.text === '日本語');
        if (!target) throw new Error('uniform inline source target was not collected');
        applyTokensToScanTarget(target, [mirrorToken('日本語')], { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' });
        expect(document.querySelectorAll('.jpdb-reader-text-mirror .jpdb-reader-word[data-expression="日本語"]')).toHaveLength(1);
        expect(document.querySelectorAll('.jpdb-reader-text-mirror .jpdb-reader-furi')).toHaveLength(1);
        expect(host.querySelector('span')).toBe(span);
    });
});
