// Docs-facing names for the shared hosted accent tokens. The implementation
// lives in src/reader/core/hosted-accent-css.ts so the pre-paint bootstrap and
// the hydrated theme cannot compute different colours from the same accent.
import { HOSTED_ACCENT_TOKENS, readableTextOnHostedAccent } from '../../../src/reader/core/hosted-accent-css';

export const DOC_COLOR_TOKENS = HOSTED_ACCENT_TOKENS;

export function readableTextOn(background: string): string {
    return readableTextOnHostedAccent(background);
}
