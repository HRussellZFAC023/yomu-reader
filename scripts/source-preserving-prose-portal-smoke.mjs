#!/usr/bin/env node
// Real-engine regression gate for source-preserving prose. Frameworks often
// replace a comment/message text node with an identical one. The annotation
// must stay in a document portal by identity instead of being deleted with the
// source and replay-mounted in a DOM/mutation loop.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CSS_PATH = path.join(ROOT, 'dist', 'yomu.css');
const tempDir = mkdtempSync(path.join(tmpdir(), 'yomu-prose-portal-smoke-'));
const entryPath = path.join(tempDir, 'probe.ts');
const bundlePath = path.join(tempDir, 'probe.js');

writeFileSync(entryPath, `
    import {
        applyTokensToScanTarget,
        collectTextTargetsIn,
        documentPortalProjectionCountsForTest,
        documentPortalReaderWordScopeForSource,
        projectAdditiveTextMirrors,
        removeNonDestructiveScanMirrors,
    } from ${JSON.stringify(path.join(ROOT, 'src/reader/dom/index.ts'))};
    import { documentPortalClipMeasurementCountsForTest } from ${JSON.stringify(path.join(ROOT, 'src/reader/dom/youtube-chrome-annotation-portal.ts'))};
    import { DEFAULT_SETTINGS } from ${JSON.stringify(path.join(ROOT, 'src/reader/settings/index.ts'))};
    import type { JPDBCard, JPDBToken } from ${JSON.stringify(path.join(ROOT, 'src/reader/app/types.ts'))};

    const TEXT = '日本語の長いコメントを読みます。ページが更新されても注釈は安定します。';
    const LONG_TEXT = Array.from({ length: 96 }, () => TEXT).join(' ');

    function token(): JPDBToken {
        const card: JPDBCard = {
            vid: 1,
            sid: 1,
            rid: 0,
            spelling: TEXT,
            reading: 'にほんごのながいこめんとをよみますぺーじがこうしんされてもちゅうしゃくはあんていします',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [],
            cardState: ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'jpdb',
        };
        return {
            card,
            start: 0,
            end: TEXT.length,
            length: TEXT.length,
            rubies: [{ text: card.reading, start: 0, end: TEXT.length, length: TEXT.length }],
            pitchClass: 'heiban',
            sentence: TEXT,
        };
    }

    function frame(): Promise<void> {
        return new Promise(resolve => requestAnimationFrame(() => resolve()));
    }

    async function frames(count: number): Promise<void> {
        for (let index = 0; index < count; index += 1) await frame();
    }

    function paint(host: HTMLElement): void {
        paintText(host, TEXT, [token()]);
    }

    function paintLong(host: HTMLElement): void {
        const tokens = Array.from({ length: 96 }, (_, index) => {
            const start = index * (TEXT.length + 1);
            return { ...token(), start, end: start + TEXT.length };
        });
        paintText(host, LONG_TEXT, tokens);
    }

    function paintText(host: HTMLElement, text: string, tokens: JPDBToken[]): void {
        const target = collectTextTargetsIn(host, 40, false).find(candidate => candidate.text.trim() === text);
        if (!target) throw new Error('source-preserving prose target was not collected');
        applyTokensToScanTarget({ ...target, nonDestructive: true }, tokens, {
            ...DEFAULT_SETTINGS,
            showFurigana: true,
            furiganaMode: 'all',
        });
    }

    function rounded(value: number): number {
        return Math.round(value * 1000) / 1000;
    }

    function geometry(host: HTMLElement) {
        const rect = host.getBoundingClientRect();
        return {
            width: rounded(rect.width),
            height: rounded(rect.height),
            clientWidth: host.clientWidth,
            clientHeight: host.clientHeight,
            scrollWidth: host.scrollWidth,
            scrollHeight: host.scrollHeight,
        };
    }

    function readerNodes(nodes: NodeList, selector: string): number {
        return Array.from(nodes).reduce((count, node) => {
            if (!(node instanceof Element)) return count;
            return count + (node.matches(selector) ? 1 : 0) + node.querySelectorAll(selector).length;
        }, 0);
    }

    function firstSourceRect(host: HTMLElement): DOMRect {
        const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
        const node = walker.nextNode();
        if (!(node instanceof Text) || !node.length) throw new Error('source text node missing');
        const range = document.createRange();
        range.setStart(node, 0);
        range.setEnd(node, Math.min(3, node.length));
        const rect = [...range.getClientRects()].find(candidate => candidate.width > 0 && candidate.height > 0);
        if (!rect) throw new Error('source glyph rect missing');
        return rect;
    }

    function portalFor(host: HTMLElement): HTMLElement {
        const portal = documentPortalReaderWordScopeForSource(host);
        if (!portal) throw new Error('portal not registered for ' + host.id);
        return portal;
    }

    /** Deterministic real-engine guard for the projection phase boundary. */
    function projectWithSourceReadWriteProbe(root: ParentNode) {
        const originalRangeRects = Range.prototype.getClientRects;
        const originalAppend = Element.prototype.append;
        const originalRemove = Element.prototype.remove;
        let sourceRangeReads = 0;
        let fragmentWrites = 0;
        let sourceRangeReadsAfterFirstWrite = 0;
        let wroteFragment = false;
        const noteFragmentWrite = () => {
            wroteFragment = true;
            fragmentWrites += 1;
        };

        Range.prototype.getClientRects = function() {
            sourceRangeReads += 1;
            if (wroteFragment) sourceRangeReadsAfterFirstWrite += 1;
            return originalRangeRects.call(this);
        };
        Element.prototype.append = function(...nodes: (Node | string)[]) {
            if (nodes.some(node => node instanceof Element
                && node.classList.contains('jpdb-reader-source-fragment'))) noteFragmentWrite();
            originalAppend.call(this, ...nodes);
        };
        Element.prototype.remove = function() {
            if (this.classList.contains('jpdb-reader-source-fragment')) noteFragmentWrite();
            originalRemove.call(this);
        };
        try {
            projectAdditiveTextMirrors(root);
        } finally {
            Range.prototype.getClientRects = originalRangeRects;
            Element.prototype.append = originalAppend;
            Element.prototype.remove = originalRemove;
        }
        return { sourceRangeReads, fragmentWrites, sourceRangeReadsAfterFirstWrite };
    }

    function firstFragmentAlignment(host: HTMLElement, portal = portalFor(host)) {
        const source = firstSourceRect(host);
        const fragment = portal.querySelector<HTMLElement>('.jpdb-reader-source-fragment');
        if (!fragment) throw new Error('projected source fragment missing for ' + host.id);
        const projected = fragment.getBoundingClientRect();
        return {
            left: rounded(projected.left - source.left),
            top: rounded(projected.top - source.top),
            sourceHeight: rounded(source.height),
            sourceTop: rounded(source.top),
            fragmentTop: rounded(projected.top),
            fragmentBottom: rounded(projected.bottom),
        };
    }

    function restoreInlineStyle(element: HTMLElement, authoredStyle: string | null): void {
        if (authoredStyle === null) element.removeAttribute('style');
        else element.setAttribute('style', authoredStyle);
    }

    function portalVisibilityLifecycle(host: HTMLElement, portal: HTMLElement) {
        const sourceOwner = host.parentElement ?? host;
        // Chromium may already have materialized style="" while measuring the
        // source. Treat an empty declaration as the same authored no-style state
        // that removeAttribute restores.
        const authoredSourceStyle = sourceOwner.getAttribute('style') || null;
        sourceOwner.style.setProperty('display', 'none');
        projectAdditiveTextMirrors(document);
        const sourceHideConcealed = portal.style.getPropertyValue('visibility') === 'hidden';
        restoreInlineStyle(sourceOwner, authoredSourceStyle);
        projectAdditiveTextMirrors(document);
        const sourceRestoreVisible = portal.style.getPropertyValue('visibility') !== 'hidden';
        // CSSStyleDeclaration reads in Chromium can materialize style="" after
        // exact teardown. Remove that projection-only artifact before comparing
        // the framework-owned source with its authored state.
        restoreInlineStyle(sourceOwner, authoredSourceStyle);

        const dialog = document.createElement('dialog');
        document.body.append(dialog);
        let dialogTopLayerSupported = false;
        let dialogTopLayerConcealed = false;
        try {
            if (typeof dialog.showModal === 'function') {
                dialog.showModal();
                dialogTopLayerSupported = true;
                projectAdditiveTextMirrors(document);
                dialogTopLayerConcealed = portal.style.getPropertyValue('visibility') === 'hidden';
            }
        } finally {
            if (dialog.open) dialog.close();
            dialog.remove();
            projectAdditiveTextMirrors(document);
        }
        const dialogCloseRestored = portal.style.getPropertyValue('visibility') !== 'hidden';

        const authoredOverlay = document.createElement('div');
        authoredOverlay.setAttribute('aria-modal', 'true');
        authoredOverlay.style.cssText = 'position:fixed;inset:0;z-index:100;background:white;';
        document.body.append(authoredOverlay);
        projectAdditiveTextMirrors(document);
        const authoredModalConcealed = portal.style.getPropertyValue('visibility') === 'hidden';
        authoredOverlay.remove();
        projectAdditiveTextMirrors(document);
        const authoredModalRestored = portal.style.getPropertyValue('visibility') !== 'hidden';
        restoreInlineStyle(sourceOwner, authoredSourceStyle);
        const finalSourceStyle = sourceOwner.getAttribute('style') || null;
        const sourceStyleRestored = finalSourceStyle === authoredSourceStyle;

        return {
            authoredSourceStyle,
            finalSourceStyle,
            sourceHideConcealed,
            sourceRestoreVisible,
            sourceStyleRestored,
            dialogTopLayerSupported,
            dialogTopLayerConcealed,
            dialogCloseRestored,
            authoredModalConcealed,
            authoredModalRestored,
        };
    }

    function visualViewportNeutrality(portal: HTMLElement) {
        const viewport = window.visualViewport;
        const paint = portal.querySelector<HTMLElement>('.jpdb-reader-document-annotation-paint');
        if (!paint) throw new Error('document portal paint layer missing');
        // This prose portal's reading already lives in the document paint layer;
        // unlike a clipped source reading, it needs no second overlay clone.
        // Measure the actual reading paint so the viewport assertion stays
        // non-vacuous for the generic portal lane.
        const readingPaints = [...portal.querySelectorAll<HTMLElement>('rt,.jpdb-reader-detached-furi')];
        const result = {
            supported: false,
            readingPaintCount: readingPaints.length,
            scrollPaintTransform: '',
            scrollReadingTranslations: [] as string[],
            resizePaintTransform: '',
            resizeProjectionDelta: -1,
        };
        if (!viewport) return result;

        const ownOffset = Object.getOwnPropertyDescriptor(viewport, 'offsetTop');
        const ownScale = Object.getOwnPropertyDescriptor(viewport, 'scale');
        const offsetTop = viewport.offsetTop;
        const scale = viewport.scale;
        try {
            Object.defineProperty(viewport, 'offsetTop', { configurable: true, value: offsetTop + 13 });
            result.supported = viewport.offsetTop === offsetTop + 13;
            viewport.dispatchEvent(new Event('scroll'));
            result.scrollPaintTransform = paint.style.getPropertyValue('transform');
            result.scrollReadingTranslations = readingPaints
                .map(reading => reading.style.getPropertyValue('translate'));

            const projectionBeforeResize = documentPortalProjectionCountsForTest().mirrors;
            Object.defineProperty(viewport, 'scale', { configurable: true, value: scale + 0.25 });
            viewport.dispatchEvent(new Event('resize'));
            result.resizePaintTransform = paint.style.getPropertyValue('transform');
            result.resizeProjectionDelta = documentPortalProjectionCountsForTest().mirrors - projectionBeforeResize;
        } finally {
            if (ownOffset) Object.defineProperty(viewport, 'offsetTop', ownOffset);
            else Reflect.deleteProperty(viewport, 'offsetTop');
            if (ownScale) Object.defineProperty(viewport, 'scale', ownScale);
            else Reflect.deleteProperty(viewport, 'scale');
            viewport.dispatchEvent(new Event('resize'));
        }
        return result;
    }

    Object.assign(window, {
        async runSourcePreservingProsePortalProbe() {
            const host = document.querySelector<HTMLElement>('#comment-text')!;
            const nativeStyle = host.getAttribute('style');
            const before = geometry(host);
            const bodyScrollHeightBefore = document.body.scrollHeight;
            paint(host);
            await frames(3);

            const portal = document.querySelector<HTMLElement>(
                '.jpdb-reader-document-annotation-portal[data-yomu-document-portal="volatile-prose"]',
            );
            if (!portal) throw new Error('source-preserving prose did not mount a document portal');
            const initialWord = portal.querySelector<HTMLElement>('.jpdb-reader-word');

            const lifecycle = {
                records: 0,
                portalAdds: 0,
                portalRemovals: 0,
                wordAdds: 0,
                wordRemovals: 0,
            };
            const observer = new MutationObserver(mutations => {
                lifecycle.records += mutations.length;
                for (const mutation of mutations) {
                    lifecycle.portalAdds += readerNodes(mutation.addedNodes, '.jpdb-reader-document-annotation-portal');
                    lifecycle.portalRemovals += readerNodes(mutation.removedNodes, '.jpdb-reader-document-annotation-portal');
                    lifecycle.wordAdds += readerNodes(mutation.addedNodes, '.jpdb-reader-word');
                    lifecycle.wordRemovals += readerNodes(mutation.removedNodes, '.jpdb-reader-word');
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });

            for (let pass = 0; pass < 20; pass += 1) {
                host.textContent = TEXT;
                paint(host);
                await frame();
            }
            await frames(3);
            observer.disconnect();

            let quiescentRecords = 0;
            const quiescence = new MutationObserver(mutations => { quiescentRecords += mutations.length; });
            quiescence.observe(document.body, { childList: true, subtree: true });
            await frames(3);
            quiescence.disconnect();

            const retained = document.querySelector<HTMLElement>(
                '.jpdb-reader-document-annotation-portal[data-yomu-document-portal="volatile-prose"]',
            );
            const bodyScrollHeightAfterRewrite = document.body.scrollHeight;
            const portalRect = retained?.getBoundingClientRect();
            const word = retained?.querySelector<HTMLElement>('.jpdb-reader-word') ?? null;
            const rewritePortalCount = document.querySelectorAll(
                '.jpdb-reader-document-annotation-portal[data-yomu-document-portal="volatile-prose"]',
            ).length;
            const visibilityLifecycle = portalVisibilityLifecycle(host, retained!);
            const viewportNeutrality = visualViewportNeutrality(retained!);
            // The VisualViewport restoration and modal removals schedule the
            // ordinary production refresh. Drain it before existing scroll/work
            // counters begin so each ratchet continues measuring one stimulus.
            await frames(3);
            const projectionBeforeDocumentScroll = documentPortalProjectionCountsForTest();
            window.scrollBy(0, 56);
            window.dispatchEvent(new Event('scroll'));
            const documentScrollImmediate = firstFragmentAlignment(host, retained!);
            await frames(2);
            const documentScrollSettled = firstFragmentAlignment(host, retained!);
            const projectionAfterDocumentScroll = documentPortalProjectionCountsForTest();

            const nestedHost = document.querySelector<HTMLElement>('#nested-comment')!;
            const nestedScroller = document.querySelector<HTMLElement>('#comment-scroller')!;
            nestedScroller.scrollIntoView({ block: 'center' });
            window.dispatchEvent(new Event('scroll'));
            await frames(2);
            paint(nestedHost);
            await frames(3);
            const nestedPortal = portalFor(nestedHost);
            const nestedClipBefore = nestedPortal.getBoundingClientRect();
            const nestedProjectionBefore = documentPortalProjectionCountsForTest();
            nestedScroller.scrollTop += 24;
            nestedScroller.dispatchEvent(new Event('scroll'));
            const nestedScrollImmediate = firstFragmentAlignment(nestedHost, nestedPortal);
            const nestedClipImmediate = nestedPortal.getBoundingClientRect();
            await new Promise(resolve => setTimeout(resolve, 140));
            await frames(2);
            const nestedScrollSettled = firstFragmentAlignment(nestedHost, nestedPortal);
            const nestedClipSettled = nestedPortal.getBoundingClientRect();
            const nestedProjectionAfter = documentPortalProjectionCountsForTest();
            const nestedScrollerProbeRect = nestedScroller.getBoundingClientRect();
            const nestedPortalOverflow = getComputedStyle(nestedPortal).overflow;

            const transformedHost = document.querySelector<HTMLElement>('#transformed-comment')!;
            paint(transformedHost);
            await frames(3);
            projectAdditiveTextMirrors(document);
            const transformedInHostMirror = transformedHost.querySelector<HTMLElement>('.jpdb-reader-text-mirror');

            const fixedHost = document.querySelector<HTMLElement>('#fixed-comment')!;
            const stickyHost = document.querySelector<HTMLElement>('#sticky-comment')!;
            stickyHost.scrollIntoView({ block: 'start' });
            window.dispatchEvent(new Event('scroll'));
            await frames(2);
            paint(fixedHost);
            paint(stickyHost);
            const perfHosts = [...document.querySelectorAll<HTMLElement>('[data-portal-perf-host]')];
            perfHosts.forEach(paint);
            const giantHost = document.querySelector<HTMLElement>('#giant-comment')!;
            paintLong(giantHost);
            const giantProjectionBatch = projectWithSourceReadWriteProbe(giantHost);
            await frames(3);
            const giantPortal = portalFor(giantHost);
            const giantWordCount = giantPortal.querySelectorAll('.jpdb-reader-word').length;
            const fixedPortal = portalFor(fixedHost);
            const stickyPortal = portalFor(stickyHost);
            const fixedBefore = firstFragmentAlignment(fixedHost, fixedPortal);
            const stickyBefore = firstFragmentAlignment(stickyHost, stickyPortal);

            const rehydrateProjectionBefore = documentPortalProjectionCountsForTest();
            nestedHost.replaceChildren(document.createTextNode(TEXT));
            await Promise.resolve();
            await frames(3);
            const rehydrateProjectionAfter = documentPortalProjectionCountsForTest();
            const giantWordCountAfterRehydrate = giantPortal.querySelectorAll('.jpdb-reader-word').length;

            const originalAnchorRect = Range.prototype.getBoundingClientRect;
            let sourceGeometryReads = 0;
            Range.prototype.getBoundingClientRect = function() {
                sourceGeometryReads += 1;
                return originalAnchorRect.call(this);
            };
            let portalAttributeMutations = 0;
            const portalMutations = new MutationObserver(mutations => {
                portalAttributeMutations += mutations.filter(mutation => mutation.type === 'attributes').length;
            });
            portalMutations.observe(document.body, { attributes: true, subtree: true });
            const portalCountForPerf = document.querySelectorAll('.jpdb-reader-document-annotation-portal').length;
            const unrelatedBefore = documentPortalProjectionCountsForTest();
            document.querySelector('#unrelated-transition')!.dispatchEvent(new Event('transitionend', { bubbles: true }));
            await frames(2);
            const unrelatedAfter = documentPortalProjectionCountsForTest();
            const scrollProjectionBefore = documentPortalProjectionCountsForTest();
            const clipMeasurementBeforeScroll = documentPortalClipMeasurementCountsForTest();
            for (let step = 0; step < 10; step += 1) {
                window.scrollBy(0, 6);
                window.dispatchEvent(new Event('scroll'));
            }
            const clipMeasurementImmediate = documentPortalClipMeasurementCountsForTest();
            const fixedImmediate = firstFragmentAlignment(fixedHost, fixedPortal);
            const stickyImmediate = firstFragmentAlignment(stickyHost, stickyPortal);
            // Slow WebKit frames can exceed the clipped-portal settle delay.
            // Observe the settled state explicitly so an offscreen portal
            // reprojection cannot hide behind a fast local two-frame window.
            await new Promise(resolve => setTimeout(resolve, 140));
            await frames(2);
            const fixedSettled = firstFragmentAlignment(fixedHost, fixedPortal);
            const stickySettled = firstFragmentAlignment(stickyHost, stickyPortal);
            const scrollProjectionAfter = documentPortalProjectionCountsForTest();
            const sourceGeometryReadsBeforeResize = sourceGeometryReads;
            const clipMeasurementBeforeResize = documentPortalClipMeasurementCountsForTest();
            window.dispatchEvent(new Event('resize'));
            const clipMeasurementAfterResize = documentPortalClipMeasurementCountsForTest();
            portalMutations.disconnect();
            Range.prototype.getBoundingClientRect = originalAnchorRect;
            // Drain the intentional all-portal resize settle before proving
            // that retiring a clipped portal cancels its own pending timer.
            await frames(3);
            const disconnectedPortal = portalFor(perfHosts[0]!);
            perfHosts[0]!.remove();
            window.dispatchEvent(new Event('scroll'));
            const disconnectedRegistryPruned = !disconnectedPortal.isConnected;
            nestedScroller.scrollIntoView({ block: 'center' });
            window.dispatchEvent(new Event('scroll'));
            await frames(2);
            const scopedPortalCountBefore = document.querySelectorAll('.jpdb-reader-document-annotation-portal').length;
            const retiredSettleBefore = documentPortalProjectionCountsForTest();
            nestedScroller.scrollTop += 8;
            nestedScroller.dispatchEvent(new Event('scroll'));
            const scopedRemovalCount = removeNonDestructiveScanMirrors(nestedScroller);
            await new Promise(resolve => setTimeout(resolve, 140));
            await frames(2);
            const retiredSettleAfter = documentPortalProjectionCountsForTest();
            const scopedPortalCountAfter = document.querySelectorAll('.jpdb-reader-document-annotation-portal').length;
            return {
                before,
                after: geometry(host),
                bodyScrollHeightBefore,
                bodyScrollHeightAfter: bodyScrollHeightAfterRewrite,
                nativeStyle,
                finalStyle: host.getAttribute('style'),
                nativeText: host.textContent,
                nativeYomuDescendants: host.querySelectorAll('.jpdb-reader-word,.jpdb-reader-text-mirror').length,
                directBodyPortal: retained?.parentElement === document.body,
                samePortal: retained === portal,
                sameWord: word === initialWord,
                portalCount: rewritePortalCount,
                portalSource: retained?.dataset.sourceText ?? '',
                portalWidth: portalRect ? rounded(portalRect.width) : -1,
                portalHeight: portalRect ? rounded(portalRect.height) : -1,
                projectedFragments: retained?.querySelectorAll('.jpdb-reader-source-fragment').length ?? 0,
                readings: retained?.querySelectorAll('rt,.jpdb-reader-detached-furi').length ?? 0,
                lifecycle,
                quiescentRecords,
                visibilityLifecycle,
                viewportNeutrality,
                documentScrollImmediate,
                documentScrollSettled,
                documentScrollProjectionPasses: projectionAfterDocumentScroll.passes - projectionBeforeDocumentScroll.passes,
                nestedScrollImmediate,
                nestedScrollSettled,
                nestedScrollProjectionPasses: nestedProjectionAfter.passes - nestedProjectionBefore.passes,
                nestedScrollMirrorProjections: nestedProjectionAfter.mirrors - nestedProjectionBefore.mirrors,
                nestedClipBefore: {
                    left: rounded(nestedClipBefore.left), top: rounded(nestedClipBefore.top),
                    width: rounded(nestedClipBefore.width), height: rounded(nestedClipBefore.height),
                },
                nestedClipImmediate: {
                    left: rounded(nestedClipImmediate.left), top: rounded(nestedClipImmediate.top),
                    width: rounded(nestedClipImmediate.width), height: rounded(nestedClipImmediate.height),
                },
                nestedClipSettled: {
                    left: rounded(nestedClipSettled.left), top: rounded(nestedClipSettled.top),
                    width: rounded(nestedClipSettled.width), height: rounded(nestedClipSettled.height),
                },
                nestedScrollerRect: (() => {
                    const rect = nestedScrollerProbeRect;
                    return { left: rounded(rect.left), top: rounded(rect.top), width: rounded(rect.width), height: rounded(rect.height) };
                })(),
                nestedPortalOverflow,
                transformedUsesPortal: Boolean(documentPortalReaderWordScopeForSource(transformedHost)),
                transformedInHostMirror: Boolean(transformedInHostMirror),
                transformedFragmentCount: transformedInHostMirror?.querySelectorAll('.jpdb-reader-source-fragment').length ?? 0,
                fixedBefore,
                fixedImmediate,
                fixedSettled,
                stickyBefore,
                stickyImmediate,
                stickySettled,
                portalCountForPerf,
                giantWordCount,
                giantWordCountAfterRehydrate,
                giantProjectionBatch,
                rehydrateProjectionPasses: rehydrateProjectionAfter.passes - rehydrateProjectionBefore.passes,
                rehydrateMirrorProjections: rehydrateProjectionAfter.mirrors - rehydrateProjectionBefore.mirrors,
                sourceGeometryReads: sourceGeometryReadsBeforeResize,
                portalAttributeMutations,
                unrelatedProjectionPasses: unrelatedAfter.passes - unrelatedBefore.passes,
                unrelatedMirrorProjections: unrelatedAfter.mirrors - unrelatedBefore.mirrors,
                scrollProjectionPasses: scrollProjectionAfter.passes - scrollProjectionBefore.passes,
                scrollMirrorProjections: scrollProjectionAfter.mirrors - scrollProjectionBefore.mirrors,
                cachedScrollClipStyleReads: clipMeasurementImmediate.styles - clipMeasurementBeforeScroll.styles,
                cachedScrollClipRectReads: clipMeasurementImmediate.rects - clipMeasurementBeforeScroll.rects,
                resizeTopologyStyleReads: clipMeasurementAfterResize.styles - clipMeasurementBeforeResize.styles,
                resizeTopologyRectReads: clipMeasurementAfterResize.rects - clipMeasurementBeforeResize.rects,
                disconnectedRegistryPruned,
                scopedRemovalCount,
                scopedPortalRetired: !nestedPortal.isConnected,
                scopedPortalDelta: scopedPortalCountBefore - scopedPortalCountAfter,
                retiredScrollSettlePasses: retiredSettleAfter.passes - retiredSettleBefore.passes,
                retiredScrollSettleMirrors: retiredSettleAfter.mirrors - retiredSettleBefore.mirrors,
            };
        },
    });
`);

await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    outfile: bundlePath,
    format: 'iife',
    platform: 'browser',
    logLevel: 'silent',
});

const FIXTURE = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
html, body { margin: 0; min-height: 900px; }
body { font: 17px/1.6 system-ui, sans-serif; }
main { width: 340px; margin: 80px 40px; }
#comment-text, #nested-comment, #transformed-comment { margin: 0; padding: 6px 8px; border-left: 2px solid #999; }
#giant-comment { width: 340px; margin: 36px 40px; }
#comment-scroller { width: 360px; height: 110px; margin: 36px 40px; overflow: auto; border: 1px solid #777; }
#nested-thread { min-height: 420px; }
#transformed-shell { width: 340px; margin: 36px 40px; transform: scale(1.2); transform-origin: 0 0; }
#fixed-thread { position: fixed; z-index: 2; top: 24px; right: 24px; width: 300px; background: white; }
#sticky-region { height: 1100px; margin: 80px 40px; }
#sticky-thread { position: sticky; top: 96px; width: 320px; background: white; }
#portal-perf-grid { position: fixed; left: 8px; bottom: 8px; width: 220px; font-size: 12px; line-height: 14px; }
#portal-perf-grid p { margin: 0; height: 14px; }
.portal-depth { display:block; }
</style></head><body>
<main><article id="comment-thread"><p id="comment-text">日本語の長いコメントを読みます。ページが更新されても注釈は安定します。</p></article></main>
<section id="comment-scroller"><article id="nested-thread" class="comment-thread"><p id="nested-comment">日本語の長いコメントを読みます。ページが更新されても注釈は安定します。</p></article></section>
<article class="comment-thread"><p id="giant-comment">${Array.from({ length: 96 }, () => '日本語の長いコメントを読みます。ページが更新されても注釈は安定します。').join(' ')}</p></article>
<div id="transformed-shell"><article class="comment-thread"><p id="transformed-comment">日本語の長いコメントを読みます。ページが更新されても注釈は安定します。</p></article></div>
<article id="fixed-thread" class="comment-thread"><p id="fixed-comment">日本語の長いコメントを読みます。ページが更新されても注釈は安定します。</p></article>
<section id="sticky-region"><article id="sticky-thread" class="comment-thread"><p id="sticky-comment">日本語の長いコメントを読みます。ページが更新されても注釈は安定します。</p></article></section>
${Array.from({ length: 18 }, (_, index) => `<div class="portal-depth" data-depth="${index}">`).join('')}<div id="portal-perf-grid" class="comment-thread">${Array.from({ length: 20 }, (_, index) => `<p data-portal-perf-host="${index}">日本語の長いコメントを読みます。ページが更新されても注釈は安定します。</p>`).join('')}</div>${'</div>'.repeat(18)}
<div id="unrelated-transition">unrelated</div>
</body></html>`;

function fail(engine, message, result) {
    console.error(`${engine}: ${message}`, JSON.stringify(result, null, 2));
    process.exitCode = 1;
}

function sameGeometry(before, after) {
    return Object.keys(before).every(key => Math.abs(before[key] - after[key]) <= 0.5);
}

function aligned(alignment) {
    return Math.abs(alignment.left) <= 0.5 && Math.abs(alignment.top) <= 0.5;
}

function sameRect(first, second) {
    return ['left', 'top', 'width', 'height'].every(key => Math.abs(first[key] - second[key]) <= 0.5);
}

function verifyPortalMountAndNativeLayout(name, result) {
    if (!result.directBodyPortal || result.portalCount !== 1) fail(name, 'prose portal was not a single direct body child', result);
    if (!result.samePortal || !result.sameWord) fail(name, 'same-text rewrites remounted the portal annotation', result);
    if (result.nativeYomuDescendants !== 0) fail(name, 'framework-owned prose gained Yomu descendants', result);
    if (result.nativeText !== result.portalSource) fail(name, 'portal source no longer matched native prose', result);
    if (result.nativeStyle !== result.finalStyle) fail(name, 'native prose inline style changed', result);
    if (!sameGeometry(result.before, result.after)) fail(name, 'native prose geometry changed', result);
    if (result.bodyScrollHeightBefore !== result.bodyScrollHeightAfter) fail(name, 'zero-size portal changed page overflow', result);
    if (result.portalWidth !== 0 || result.portalHeight !== 0) fail(name, 'document portal occupied layout space', result);
    if (result.projectedFragments < 1 || result.readings < 1) fail(name, 'portal lost its visible annotation projection', result);
    if (result.lifecycle.portalAdds || result.lifecycle.portalRemovals
        || result.lifecycle.wordAdds || result.lifecycle.wordRemovals) {
        fail(name, 'same-text rewrites churned reader DOM', result);
    }
    if (result.quiescentRecords !== 0) fail(name, 'reader DOM did not become quiescent', result);
}

function verifyPortalScrollProjection(name, result) {
    if (!aligned(result.documentScrollImmediate) || !aligned(result.documentScrollSettled)
        || result.documentScrollProjectionPasses !== 0) {
        fail(name, 'prose portal drifted or over-projected during document scroll', result);
    }
    const settledNestedClipped = Math.abs(result.nestedScrollSettled.left) <= 0.5
        && result.nestedScrollSettled.top >= -0.5
        && result.nestedScrollSettled.top <= result.nestedScrollSettled.sourceHeight + 0.5
        && result.nestedScrollSettled.fragmentTop >= result.nestedScrollerRect.top - 0.5
        && result.nestedScrollSettled.fragmentBottom <= result.nestedScrollerRect.top + result.nestedScrollerRect.height + 0.5;
    if (!aligned(result.nestedScrollImmediate) || !settledNestedClipped) {
        fail(name, 'prose portal drifted during nested-panel scroll', result);
    }
    if (result.nestedScrollProjectionPasses !== 1 || result.nestedScrollMirrorProjections !== 1) {
        fail(name, 'nested-panel scroll did not settle only its affected clipped portal', result);
    }
    if (result.nestedPortalOverflow !== 'hidden'
        || !sameRect(result.nestedClipBefore, result.nestedScrollerRect)
        || !sameRect(result.nestedClipImmediate, result.nestedScrollerRect)
        || !sameRect(result.nestedClipSettled, result.nestedScrollerRect)) {
        fail(name, 'nested prose portal escaped its authored scroll-panel clip', result);
    }
    if (result.transformedUsesPortal || !result.transformedInHostMirror || result.transformedFragmentCount < 1) {
        fail(name, 'scaled prose was not narrowed to the transform-safe in-host lane', result);
    }
    if (![result.fixedBefore, result.fixedImmediate, result.fixedSettled,
        result.stickyBefore, result.stickyImmediate, result.stickySettled].every(aligned)) {
        fail(name, 'fixed or sticky portal source drifted during document momentum scroll', result);
    }
    if (Math.abs(result.fixedBefore.sourceTop - result.fixedImmediate.sourceTop) > 0.5
        || Math.abs(result.stickyBefore.sourceTop - result.stickyImmediate.sourceTop) > 0.5) {
        fail(name, 'fixed or stuck-sticky fixture did not retain its measured source position', result);
    }
}

function verifyPortalProjectionBatch(name, result) {
    if (result.giantWordCount !== 96
        || result.giantWordCountAfterRehydrate !== 96
        || result.giantProjectionBatch.sourceRangeReads < result.giantWordCount
        || result.giantProjectionBatch.sourceRangeReads > result.giantWordCount * 2
        || result.giantProjectionBatch.fragmentWrites < result.giantWordCount
        || result.giantProjectionBatch.sourceRangeReadsAfterFirstWrite !== 0
        || result.rehydrateProjectionPasses !== 1
        || result.rehydrateMirrorProjections !== 1) {
        fail(name, 'one host rehydrate reprojected or disturbed an unrelated giant portal', result);
    }
}

function neutralTranslation(value) {
    return !value || value === 'initial' || value === 'none' || value === 'unset';
}

function verifyPortalVisibilityAndViewport(name, result) {
    const visibility = result.visibilityLifecycle;
    const visibilityEvidence = [
        visibility.sourceHideConcealed,
        visibility.sourceRestoreVisible,
        visibility.sourceStyleRestored,
        visibility.dialogTopLayerSupported,
        visibility.dialogTopLayerConcealed,
        visibility.dialogCloseRestored,
        visibility.authoredModalConcealed,
        visibility.authoredModalRestored,
    ];
    if (!visibilityEvidence.every(Boolean)) {
        fail(name, 'prose portal ignored source or top-layer visibility', result);
    }

    const viewport = result.viewportNeutrality;
    const viewportEvidence = [
        viewport.supported,
        viewport.readingPaintCount >= 1,
        neutralTranslation(viewport.scrollPaintTransform),
        viewport.scrollReadingTranslations.every(neutralTranslation),
        neutralTranslation(viewport.resizePaintTransform),
        viewport.resizeProjectionDelta === 0,
    ];
    if (!viewportEvidence.every(Boolean)) {
        fail(name, 'prose portal did not keep VisualViewport scroll and resize neutral', result);
    }
}

function verifyMultiPortalWorkBounds(name, result) {
    if (result.portalCountForPerf < 24
        || result.unrelatedProjectionPasses !== 0
        || result.unrelatedMirrorProjections !== 0
        || result.scrollProjectionPasses !== 0
        || result.scrollMirrorProjections !== 0
        || result.cachedScrollClipStyleReads !== 0
        || result.cachedScrollClipRectReads > 20
        || result.resizeTopologyStyleReads > result.portalCountForPerf * 4
        || result.resizeTopologyRectReads > result.portalCountForPerf
        || result.sourceGeometryReads > result.portalCountForPerf * 12
        || result.portalAttributeMutations > result.portalCountForPerf * 12
        || !result.disconnectedRegistryPruned
        || result.scopedRemovalCount < 1
        || !result.scopedPortalRetired
        || result.scopedPortalDelta !== 1
        || result.retiredScrollSettlePasses !== 0
        || result.retiredScrollSettleMirrors !== 0) {
        fail(name, 'multi-portal scroll/transition work exceeded its bounded one-pass budget', result);
    }
}

async function runEngine(name, browserType) {
    const browser = await browserType.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 768, height: 640 } });
        await page.route('https://prose-portal.example/**', route => route.fulfill({
            status: 200,
            contentType: 'text/html; charset=utf-8',
            body: FIXTURE,
        }));
        await page.goto('https://prose-portal.example/', { waitUntil: 'domcontentloaded' });
        await page.addStyleTag({ content: readFileSync(CSS_PATH, 'utf8') });
        await page.addScriptTag({ path: bundlePath });
        const result = await page.evaluate(() => window.runSourcePreservingProsePortalProbe());

        verifyPortalMountAndNativeLayout(name, result);
        verifyPortalScrollProjection(name, result);
        verifyPortalProjectionBatch(name, result);
        verifyPortalVisibilityAndViewport(name, result);
        verifyMultiPortalWorkBounds(name, result);

        console.log(`${name}: 24+ portals stayed aligned; 96-word projection used ${result.giantProjectionBatch.sourceRangeReads} source Range reads with 0 after its first fragment write`);
    } finally {
        await browser.close();
    }
}

try {
    await runEngine('chromium', chromium);
    await runEngine('webkit', webkit);
} finally {
    rmSync(tempDir, { recursive: true, force: true });
}

if (process.exitCode) console.error('source-preserving prose portal smoke FAILED');
else console.log('source-preserving prose portal smoke passed');
