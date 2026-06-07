export function hasPositiveRectArea(rect: DOMRect, right = rect.right || rect.left + rect.width, bottom = rect.bottom || rect.top + rect.height): boolean {
    return right > rect.left && bottom > rect.top;
}

export function coordinateInRange(value: number, start: number, end: number, slack: number): boolean {
    return value >= start - slack && value <= end + slack;
}
