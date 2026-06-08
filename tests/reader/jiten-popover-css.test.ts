import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const POPOVER_CORE_CSS = readFileSync('src/reader/styles/popover-core.css', 'utf8');

function normalizedPopoverCss(): string {
    return POPOVER_CORE_CSS.replace(/\s+/g, ' ');
}

function ruleBody(selector: string): string {
    const css = normalizedPopoverCss();
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`${escapedSelector} \\{ ([^}]+) \\}`).exec(css);
    expect(match?.[1], `Missing CSS rule for ${selector}`).toBeTruthy();
    return match?.[1] ?? '';
}

describe('Jiten popover CSS', () => {
    it('keeps Jiten speaker controls neutral until interaction', () => {
        const defaultRule = ruleBody('button.jpdb-reader-jiten-audio.jpdb-reader-icon-mini');
        expect(defaultRule).toContain('border-color: var(--jpdb-reader-border);');
        expect(defaultRule).toContain('background: color-mix(in srgb, var(--jpdb-reader-surface-2) 88%, transparent);');
        expect(defaultRule).toContain('color: var(--jpdb-reader-text);');
        expect(defaultRule).not.toContain('--jpdb-reader-accent');
        expect(defaultRule).not.toContain('--jpdb-reader-accent-soft');
        expect(defaultRule).not.toContain('--jpdb-reader-accent-readable');

        const interactiveRule = ruleBody([
            'button.jpdb-reader-jiten-audio.jpdb-reader-icon-mini:hover,',
            'button.jpdb-reader-jiten-audio.jpdb-reader-icon-mini:focus-visible,',
            'button.jpdb-reader-jiten-audio.jpdb-reader-icon-mini:active',
        ].join(' '));
        expect(interactiveRule).toContain('border-color: var(--jpdb-reader-accent);');
        expect(interactiveRule).toContain('background: color-mix(in srgb, var(--jpdb-reader-accent-soft) 88%, var(--jpdb-reader-surface));');
        expect(interactiveRule).toContain('color: var(--jpdb-reader-accent-readable);');
    });
});
