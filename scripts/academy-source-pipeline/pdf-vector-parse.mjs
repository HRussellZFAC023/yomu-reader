/**
 * Reduce a Poppler SVG page to metadata-only vector signals. Glyph outlines in
 * `<defs>` are excluded; paths/shapes in the rendered body are the review
 * signal. No SVG or source text is retained after census.
 */
export function parsePdfVectorSvg(svg, page) {
    const body = svg.replace(/<defs\b[\s\S]*?<\/defs>/giu, '');
    const primitivePattern = /<(?:path|rect|circle|ellipse|line|polyline|polygon)\b/giu;
    const pathDataPattern = /<path\b[^>]*\bd="([^"]*)"[^>]*>/giu;
    const vectorPrimitiveCount = countMatches(body, primitivePattern);
    let pathDataBytes = 0;
    let match;
    while ((match = pathDataPattern.exec(body)) !== null) pathDataBytes += Buffer.byteLength(match[1], 'utf8');
    return {
        page,
        status: 'complete',
        vectorPrimitiveCount,
        pathDataBytes,
        glyphUseCount: countMatches(body, /<use\b/giu),
        embeddedImageCount: countMatches(body, /<image\b/giu),
    };
}

export function vectorReviewState(signal) {
    if (!signal || signal.status !== 'complete') return 'vector-review-unavailable';
    if (signal.vectorPrimitiveCount >= 20 || signal.pathDataBytes >= 1_000) {
        return 'vector-heavy-review-required';
    }
    if (signal.vectorPrimitiveCount > 0) return 'vector-content-review-required';
    return 'no-vector-signal';
}

function countMatches(text, pattern) {
    pattern.lastIndex = 0;
    let count = 0;
    while (pattern.exec(text) !== null) count += 1;
    return count;
}
