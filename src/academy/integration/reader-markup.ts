const JAPANESE_SURFACE_SELECTOR = '[lang="ja"], [lang^="ja-"], [data-yomu-runtime-surface], .academy-japanese';
const READER_OWNED_SURFACE_QUERY = [
    '[data-jpdb-reader-root]',
    '.jpdb-reader-word',
    '.jpdb-reader-text-mirror',
    '.jpdb-reader-control-text-mirror',
    '.jpdb-reader-furi',
    '.jpdb-ocr-furi',
].join(',');
const HAS_JAPANESE = /[\u3040-\u30ff\u3400-\u9fff]/u;

const SOURCE_ATTRIBUTE = 'data-yomu-academy-reading-source';
const STATE_ATTRIBUTE = 'data-yomu-academy-reading-state';

/**
 * The Academy owns whether support is visible; the Reader owns how eligible
 * text is rendered. Keeping the plain source on the surface lets either side
 * replace ruby/pitch markup without corrupting inflected Japanese.
 */
export function setAcademyReadingSurface(
    surface: HTMLElement,
    visible: boolean,
    source?: string,
    runtimeSurface = 'academy-activity',
): void {
    const renderedByReader = Boolean(surface.querySelector(READER_OWNED_SURFACE_QUERY));
    const current = surface.textContent ?? '';
    const stored = surface.getAttribute(SOURCE_ATTRIBUTE);
    const canonical = source ?? (!renderedByReader && current !== stored ? current : stored ?? current);
    const state = visible ? 'shown' : 'hidden';
    const sourceChanged = stored !== canonical;

    if (surface.getAttribute(SOURCE_ATTRIBUTE) !== canonical) surface.setAttribute(SOURCE_ATTRIBUTE, canonical);
    // VN typewriter text is intentionally a temporary prefix of the canonical
    // line. Do not let annotation refreshes expand that prefix into the full
    // sentence; the stage applies furigana/pitch once speaking has finished.
    if (surface.dataset.performanceText === 'revealing') {
        surface.setAttribute('data-jpdb-reader-surface-ignore', '');
        delete surface.dataset.yomuRuntimeSurface;
        delete surface.dataset.yomuFuriganaMode;
        surface.setAttribute(STATE_ATTRIBUTE, state);
        return;
    }
    // A Reader-rendered surface (mirror/ruby markup) never has textContent equal
    // to its canonical source, so it must count as converged whenever nothing
    // Academy-owned (state, source) changed. Rewriting it here wiped the
    // Reader's text mirror with byte-identical text, which the Reader's
    // per-host observer answers with a synchronous mirror replay, whose
    // mutations re-fire the Academy annotation observers, which rewrote again —
    // an unbounded microtask-chained cycle that froze the whole tab (Week-02
    // lesson-note transitions, 4/5 runs).
    if (surface.getAttribute(STATE_ATTRIBUTE) === state && !sourceChanged
        && (current === canonical || renderedByReader)) return;

    // Ruby textContent contains both base and <rt>; always restore the authored
    // source before changing visibility so toggling cannot duplicate readings.
    if (current !== canonical) surface.textContent = canonical;
    if (visible) {
        surface.removeAttribute('data-jpdb-reader-surface-ignore');
        surface.dataset.yomuRuntimeSurface = runtimeSurface;
        surface.dataset.yomuFuriganaMode = 'all';
    } else {
        surface.setAttribute('data-jpdb-reader-surface-ignore', '');
        delete surface.dataset.yomuRuntimeSurface;
        delete surface.dataset.yomuFuriganaMode;
    }
    surface.setAttribute(STATE_ATTRIBUTE, state);
    surface.dispatchEvent(new CustomEvent('academy:annotation-change', {
        bubbles: true,
        detail: { visible },
    }));
}

/** Apply the owning Academy reading state to all prose under a route/activity. */
export function setAcademyReadingSurfaces(root: HTMLElement, visible: boolean): void {
    const candidates = root.matches(JAPANESE_SURFACE_SELECTOR)
        ? [root, ...Array.from(root.querySelectorAll<HTMLElement>(JAPANESE_SURFACE_SELECTOR))]
        : Array.from(root.querySelectorAll<HTMLElement>(JAPANESE_SURFACE_SELECTOR));
    candidates.forEach(surface => {
        if (isAcademyJapaneseSurface(surface)) setAcademyReadingSurface(surface, visible);
    });
}

/** Stamps newly-rendered Academy prose while respecting the nearest owning toggle. */
export function prepareAcademyReadingSurface(surface: HTMLElement): boolean {
    if (!isAcademyJapaneseSurface(surface)) return false;
    const support = surface.closest<HTMLElement>('[data-reading-support]')?.dataset.readingSupport;
    setAcademyReadingSurface(surface, support !== 'hidden', undefined, 'academy-copy');
    return true;
}

export function isAcademyJapaneseSurface(element: HTMLElement): boolean {
    if (element.matches('script, style, noscript, textarea, input, select, option, button, [aria-hidden="true"]')) return false;
    if (element.classList.contains('academy-assessed-japanese')) return false;
    if (element.dataset.performanceText === 'revealing') return false;
    const ignoredBy = element.closest<HTMLElement>('[data-jpdb-reader-surface-ignore]');
    if (ignoredBy && (ignoredBy !== element || !element.hasAttribute(STATE_ATTRIBUTE))) return false;
    if (element.closest(READER_OWNED_SURFACE_QUERY)) return false;
    return HAS_JAPANESE.test(element.textContent ?? '');
}
