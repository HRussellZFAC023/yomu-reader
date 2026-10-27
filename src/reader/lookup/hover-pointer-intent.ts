type Point = { x: number; y: number };

/** Boundary events can come from page reflow, without the learner moving. */
export class HoverPointerIntent {
    private point?: Point;
    private released = false;

    accepts(event: { type: string; clientX: number; clientY: number }): boolean {
        const point = { x: event.clientX, y: event.clientY };
        const stationary = this.isStationary(point);
        if (!stationary) this.released = false;
        this.point = point;
        return !stationary || (!this.released && event.type !== 'pointerover' && event.type !== 'mouseover');
    }

    isAt(point: Point | undefined): boolean {
        return !this.released && this.isStationary(point);
    }

    /** Scrolling releases ownership; boundary events must not acquire it again. */
    release(): void {
        this.released = true;
    }

    leave(): void {
        this.point = undefined;
    }

    private isStationary(point: Point | undefined): boolean {
        // Mobile WebKit can round a stationary pointer differently after scroll.
        return Boolean(point && this.point && Math.abs(this.point.x - point.x) < 0.01 && Math.abs(this.point.y - point.y) < 0.01);
    }
}
