interface LookupTapStart {
    id: number;
    x: number;
    y: number;
    word?: HTMLElement;
    startedAt: number;
}

interface CompletedTextTap {
    target: EventTarget | null;
    x: number;
    y: number;
    expiresAt: number;
}

const TAP_MOVEMENT_PX = 12;

/** Tracks one stationary touch and the compatibility click it already handled. */
export class PointerLookupTap {
    private pending?: LookupTapStart;
    private completed?: CompletedTextTap;

    reset(): void {
        this.pending = undefined;
        this.completed = undefined;
    }

    begin(event: PointerEvent, word?: HTMLElement): void {
        this.pending = { id: event.pointerId, x: event.clientX, y: event.clientY, word, startedAt: Date.now() };
    }

    update(event: PointerEvent): void {
        if (this.pending?.id !== event.pointerId) return;
        if (!this.containsRelease(this.pending, event)) this.reset();
    }

    finish(event: PointerEvent): LookupTapStart | undefined {
        const tap = this.pending;
        if (!tap || tap.id !== event.pointerId) return undefined;
        this.reset();
        return this.containsRelease(tap, event) ? tap : undefined;
    }

    cancel(event: PointerEvent): void {
        if (this.pending?.id === event.pointerId) this.reset();
    }

    suppressCompatibilityClick(event: PointerEvent): void {
        this.completed = { target: event.target, x: event.clientX, y: event.clientY, expiresAt: Date.now() + 700 };
    }

    consumeCompatibilityClick(event: MouseEvent): boolean {
        const tap = this.completed;
        if (!tap) return false;
        if (Date.now() > tap.expiresAt) {
            this.completed = undefined;
            return false;
        }
        if (!event.detail || event.target !== tap.target || Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 25) return false;
        this.completed = undefined;
        event.preventDefault();
        event.stopPropagation();
        return true;
    }

    private containsRelease(tap: LookupTapStart, event: PointerEvent): boolean {
        return Math.hypot(event.clientX - tap.x, event.clientY - tap.y) <= TAP_MOVEMENT_PX;
    }
}
