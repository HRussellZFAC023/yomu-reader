type Point = { x: number; y: number };

/** Boundary events can come from page reflow, without the learner moving. */
export class HoverPointerIntent {
    private point?: Point;

    accepts(event: { type: string; clientX: number; clientY: number }): boolean {
        const point = { x: event.clientX, y: event.clientY };
        const stationary = this.isAt(point);
        this.point = point;
        return !stationary || (event.type !== 'pointerover' && event.type !== 'mouseover');
    }

    isAt(point: Point | undefined): boolean {
        return Boolean(point && this.point?.x === point.x && this.point.y === point.y);
    }

    leave(): void {
        this.point = undefined;
    }
}
