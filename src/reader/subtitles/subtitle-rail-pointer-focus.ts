/**
 * Owns the short-lived provenance needed to release Safari's touch-retained
 * subtitle-rail focus without ever treating keyboard, programmatic, or
 * assistive-technology focus as disposable.
 */
export class SubtitleRailPointerFocus {
    private inputWasKeyboardValue = false;
    private pendingControl?: HTMLElement;
    private pointerFocusedControl?: HTMLElement;
    private gestureControl?: HTMLElement;
    private pressId?: number;
    private completionTimer?: number;

    constructor(
        private readonly getRoot: () => HTMLElement | undefined,
        private readonly playerChromeHidden: () => boolean,
        private readonly scheduleIdle: () => void,
    ) {}

    get inputWasKeyboard(): boolean {
        return this.inputWasKeyboardValue;
    }

    bind(signal?: AbortSignal): void {
        document.addEventListener('pointerup', event => this.handlePointerEnd(event), { passive: true, capture: true, signal });
        document.addEventListener('pointercancel', event => this.handlePointerEnd(event), { passive: true, capture: true, signal });
        document.addEventListener('click', event => this.handleClick(event), { capture: true, signal });
    }

    notePointerInput(): void {
        this.inputWasKeyboardValue = false;
    }

    handlePointerDown(event: PointerEvent, target: Element | null): void {
        const control = this.controlForTarget(target);
        // A quick tap elsewhere must not cancel the pending release for a rail
        // control Safari kept focused. The page still receives that pointer;
        // only this exact focus-provenance lifecycle stays intact.
        if (!control && this.hasPointerFocusedControl()) return;
        this.clearCompletionTimer();
        this.pendingControl = control;
        this.gestureControl = control;
        this.pressId = control ? event.pointerId : undefined;
        const active = document.activeElement;
        if (control && active === control) this.pointerFocusedControl = control;
        else if (!this.hasPointerFocusedControl()) this.pointerFocusedControl = undefined;
    }

    private handlePointerEnd(event: PointerEvent): void {
        if (event.pointerId !== this.pressId) return;
        this.pressId = undefined;
        // Touch compatibility click/focus may be delivered in a later task.
        // Click normally completes first; this fallback covers cancelled or
        // suppressed clicks without retaining provenance indefinitely.
        this.queueCompletion(event.type === 'pointercancel' ? 0 : 750);
    }

    private handleClick(event: MouseEvent): void {
        const target = event.target instanceof Element ? event.target : null;
        if (this.controlForTarget(target) !== this.gestureControl) return;
        // WebKit may apply or restore touch focus just after click propagation.
        this.queueCompletion(50);
    }

    handleFocusIn(target: Element): void {
        this.pointerFocusedControl = (target === this.pendingControl || target === this.gestureControl)
            && target instanceof HTMLElement
            ? target
            : undefined;
        this.pendingControl = undefined;
    }

    handleFocusOut(target: Element): void {
        if (target === this.pointerFocusedControl) this.pointerFocusedControl = undefined;
    }

    handleKeydown(target: EventTarget | null, editable: boolean): void {
        if (target instanceof Element && target.closest('.jpdb-subtitle-rail')) this.clearProvenance();
        if (editable) return;
        this.inputWasKeyboardValue = true;
        this.clearProvenance();
    }

    hasPointerFocusedControl(): boolean {
        const active = document.activeElement;
        return Boolean(active === this.pointerFocusedControl
            && active instanceof HTMLElement
            && this.getRoot()?.contains(active)
            && active.closest('.jpdb-subtitle-rail'));
    }

    shouldReleasePointerFocus(): boolean {
        return this.pressId === undefined && this.hasPointerFocusedControl();
    }

    blurPointerFocus(): void {
        if (this.pressId !== undefined || !this.hasPointerFocusedControl()) return;
        const active = document.activeElement;
        this.pointerFocusedControl = undefined;
        if (active instanceof HTMLElement) active.blur();
    }

    destroy(): void {
        this.clearCompletionTimer();
        this.pendingControl = undefined;
        this.pointerFocusedControl = undefined;
        this.gestureControl = undefined;
        this.pressId = undefined;
        this.inputWasKeyboardValue = false;
    }

    private controlForTarget(target: Element | null): HTMLElement | undefined {
        const selector = 'button, input, select, textarea, a[href], [tabindex]';
        const direct = target?.closest<HTMLElement>(
            '.jpdb-subtitle-rail button, .jpdb-subtitle-rail input, .jpdb-subtitle-rail select, .jpdb-subtitle-rail textarea, .jpdb-subtitle-rail a[href], .jpdb-subtitle-rail [tabindex]',
        );
        // A style-range label also contains an <output>, which can be exposed as
        // label.control even though the interactive descendant is the input.
        const labelled = target?.closest<HTMLLabelElement>('.jpdb-subtitle-rail label')
            ?.querySelector<HTMLElement>(selector);
        return direct ?? labelled ?? undefined;
    }

    private queueCompletion(delay: number): void {
        const candidate = this.gestureControl;
        if (!candidate) return;
        this.clearCompletionTimer();
        this.completionTimer = window.setTimeout(() => {
            this.completionTimer = undefined;
            if (this.gestureControl !== candidate) return;
            this.gestureControl = undefined;
            if (this.pendingControl === candidate) this.pendingControl = undefined;
            if (!this.hasPointerFocusedControl()) return;
            if (this.playerChromeHidden()) this.blurPointerFocus();
            else this.scheduleIdle();
        }, delay);
    }

    private clearCompletionTimer(): void {
        window.clearTimeout(this.completionTimer);
        this.completionTimer = undefined;
    }

    private clearProvenance(): void {
        this.pendingControl = undefined;
        this.pointerFocusedControl = undefined;
        this.gestureControl = undefined;
    }
}
