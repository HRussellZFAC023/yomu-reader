export function panelSizeDelta(before, after) {
    if (!before || !after) return 0;
    return Math.max(Math.abs(before.width - after.width), Math.abs(before.height - after.height));
}

export async function dragTranscriptResizeHandle(page, placement, options = {}) {
    const {
        assert: assertFn,
        bottomDelta = -120,
        leftDelta = 140,
        missingMessage = 'Expected transcript drawer resize handle',
        rightDelta = -140,
        steps = 6,
        waitMs = 350,
    } = options;
    const handle = await transcriptResizeHandle(page, assertFn, missingMessage);
    if (!handle) return false;
    await dragFromBoxCenter(page, handle, resizeDelta(placement, { bottomDelta, leftDelta, rightDelta }), steps);
    await page.waitForTimeout(waitMs);
    return true;
}

async function transcriptResizeHandle(page, assertFn, missingMessage) {
    const handle = await page.locator('[data-resize-transcript]').boundingBox();
    if (assertFn) assertFn(handle, missingMessage);
    return handle;
}

function resizeDelta(placement, deltas) {
    const byPlacement = {
        bottom: [0, deltas.bottomDelta],
        left: [deltas.leftDelta, 0],
        right: [deltas.rightDelta, 0],
    };
    return byPlacement[placement] ?? byPlacement.right;
}

async function dragFromBoxCenter(page, box, delta, steps) {
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + delta[0], y + delta[1], { steps });
    await page.mouse.up();
}
