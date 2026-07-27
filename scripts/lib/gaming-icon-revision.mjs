import { createHash } from 'node:crypto';

export function gamingIconSourceRevision(svg) {
    // Git may check text out as CRLF on Windows. Line endings do not change the
    // rendered SVG, so they must not make a committed icon look stale.
    const canonicalSvg = svg.replace(/\r\n?/g, '\n');
    return createHash('sha256').update(canonicalSvg).digest('hex');
}
