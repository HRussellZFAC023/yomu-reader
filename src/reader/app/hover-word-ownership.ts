import { HOVER_WORD_HOST_CONTROL_SELECTOR } from './main-runtime-support';

type PointerPosition = { x: number; y: number };

type HoverWordOwnershipQueries = {
    wordFromPointStack: (x: number, y: number) => HTMLElement | null;
    ocrLineWordForPointer: (target: Element | null, x: number, y: number) => HTMLElement | null;
    wordFromRenderedGeometry: (target: Element, x: number, y: number) => HTMLElement | null;
};

type HoverWordOwnershipOptions = {
    ignoreCssHover?: boolean;
    ignorePointerPosition?: boolean;
};

/**
 * Owns the connected-word half of hover liveness.
 *
 * Reactive-page mirrors are pointer-transparent and OCR lines deliberately
 * preserve a lookup while crossing gaps, so ordinary `:hover`/containment is
 * not authoritative. Keep those competing ownership rules together and make
 * callers provide only the three app-specific word resolvers.
 */
export class HoverWordOwnership {
    constructor(private readonly queries: HoverWordOwnershipQueries) {}

    hostControl(word: HTMLElement): HTMLElement | null {
        return word.closest<HTMLElement>(HOVER_WORD_HOST_CONTROL_SELECTOR);
    }

    isActive(
        word: HTMLElement,
        position: PointerPosition | undefined,
        options: HoverWordOwnershipOptions = {},
    ): boolean {
        if (this.hasCssHover(word, options.ignoreCssHover)) return true;
        return this.pointerOwnsWord(word, position, options);
    }

    private pointerOwnsWord(
        word: HTMLElement,
        position: PointerPosition | undefined,
        options: HoverWordOwnershipOptions,
    ): boolean {
        if (!position) return false;
        const target = document.elementFromPoint(position.x, position.y);
        const renderedHover = this.renderedHoverAtPointer(
            word,
            target,
            position,
            Boolean(options.ignorePointerPosition),
        );
        if (renderedHover !== undefined) return renderedHover;
        return this.hasLooseContainment(word, target, Boolean(options.ignorePointerPosition));
    }

    private hasCssHover(word: HTMLElement, ignoreCssHover = false): boolean {
        if (ignoreCssHover) return false;
        return word.matches(':hover')
            || Boolean(this.hostControl(word)?.matches(':hover'));
    }

    private renderedHoverAtPointer(
        word: HTMLElement,
        target: Element | null,
        position: PointerPosition,
        ignorePointerPosition: boolean,
    ): boolean | undefined {
        if (!(target instanceof Element)) return undefined;
        const ocrLineHover = this.ocrLineHoverAtPointer(word, target, position, ignorePointerPosition);
        if (ocrLineHover !== undefined) return ocrLineHover;
        return this.matchesExactWordGeometry(word, target, position) || undefined;
    }

    private ocrLineHoverAtPointer(
        word: HTMLElement,
        target: Element,
        position: PointerPosition,
        ignorePointerPosition: boolean,
    ): boolean | undefined {
        const line = word.closest<HTMLElement>('.jpdb-ocr-line');
        if (ignorePointerPosition || !line?.contains(target)) return undefined;
        const pointedWord = this.queries.ocrLineWordForPointer(target, position.x, position.y);
        // A gap inside the same line retains the active lookup. A different
        // exact word owns the point and must win over overlapping projections.
        return pointedWord ? pointedWord === word : true;
    }

    private matchesExactWordGeometry(
        word: HTMLElement,
        target: Element,
        position: PointerPosition,
    ): boolean {
        return this.queries.wordFromPointStack(position.x, position.y) === word
            || this.queries.ocrLineWordForPointer(target, position.x, position.y) === word
            || this.queries.wordFromRenderedGeometry(target, position.x, position.y) === word;
    }

    private hasLooseContainment(
        word: HTMLElement,
        target: Element | null,
        ignorePointerPosition: boolean,
    ): boolean {
        if (ignorePointerPosition || !target) return false;
        return target === word || word.contains(target);
    }
}
