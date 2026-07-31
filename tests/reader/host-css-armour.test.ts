import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
    ARMOURED_PROPERTIES,
    ARMOUR_LAYER,
    ARMOUR_STRONG_LAYER,
    hostCssArmour,
    withHostCssArmour,
} from '../../src/reader/styles/host-armour';

const SRC_ROOT = path.resolve(__dirname, '../../src');

describe('host CSS armour', () => {
    it('mirrors a Yomu paint declaration into a cascade layer as !important', () => {
        const armour = hostCssArmour('.jpdb-reader-fab{border-radius:50%;background:#f4f7fa;color:#17202a;padding:6px}');
        expect(armour).toContain(`@layer ${ARMOUR_STRONG_LAYER},${ARMOUR_LAYER};`);
        expect(armour).toContain(`@layer ${ARMOUR_LAYER}{.jpdb-reader-fab{border-radius:50%!important;background:#f4f7fa!important;color:#17202a!important}}`);
        // `padding` is written inline at runtime, so it must never be armoured.
        expect(armour).not.toContain('padding');
    });

    it('does not armour colour on surfaces whose colour the runtime derives from the host', () => {
        // These mirrors copy the host's computed colour with a plain inline
        // style; an !important author rule would outrank it and freeze them.
        for (const selector of [
            '.jpdb-reader-canvas-text-layer',
            '.jpdb-reader-control-text-mirror',
            '.jpdb-reader-text-mirror',
            '.jpdb-reader-word-text-pitch .jpdb-reader-word',
            '.jpdb-reader-furi',
        ]) {
            const armour = hostCssArmour(`${selector}{color:#123456;border-radius:4px}`);
            expect(armour, selector).not.toContain('color:#123456');
            expect(armour, selector).toContain('border-radius:4px!important');
        }
    });

    it('keeps source !important declarations in the earlier, stronger layer', () => {
        const armour = hostCssArmour('.jpdb-reader-icon-btn{border-radius:50% !important;background:#fff}');
        const strongIndex = armour.indexOf(`@layer ${ARMOUR_STRONG_LAYER}{`);
        const normalIndex = armour.indexOf(`@layer ${ARMOUR_LAYER}{`, strongIndex + 1);
        expect(strongIndex).toBeGreaterThan(-1);
        expect(normalIndex).toBeGreaterThan(strongIndex);
        // Important declarations win from the EARLIER layer, so the sheet's own
        // "important beats normal" ordering survives across specificities.
        expect(armour.slice(strongIndex, normalIndex)).toContain('border-radius:50%!important');
        expect(armour.slice(normalIndex)).toContain('background:#fff!important');
    });

    it('never armours a rule that does not name a Yomu class', () => {
        // Yomu styling must not leak onto the host either; armouring a host-facing
        // selector would make Yomu the aggressor.
        expect(hostCssArmour('ytd-watch-flexy .banner{border-radius:8px}')).toBe('');
        expect(hostCssArmour('button{background:red}')).toBe('');
    });

    it('never armours a rule whose subject is markup Yomu did not author', () => {
        // Native captions Yomu suppresses while showing its own: host elements.
        expect(hostCssArmour('html.jpdb-subtitle-native-captions-suppressed .player-timedtext-text-container{background:transparent !important}')).toBe('');
        expect(hostCssArmour('html.jpdb-subtitle-yomu-captions-active .ytp-caption-segment *{background:transparent !important}')).toBe('');
        // Third-party dictionary HTML rendered inside Yomu's popover ships its
        // own inline styles; an !important author rule would outrank them.
        expect(hostCssArmour('.jpdb-reader-local-glossary [data-sc-class="tag"]{background:#333}')).toBe('');
        expect(hostCssArmour('.jpdb-reader-local-glossary td{border:1px solid #444}')).toBe('');
        // A universal subject reaches whatever the surface happens to display.
        expect(hostCssArmour('[data-jpdb-reader-root] *{background:transparent;color:inherit}')).toBe('');
    });

    it('armours Yomu-owned skeleton elements inside a Yomu container', () => {
        // These are the rules that fight a host `input,select,textarea{...!important}`.
        expect(hostCssArmour('.jpdb-reader-settings input{background:#fff}')).toContain('.jpdb-reader-settings input{background:#fff!important}');
        expect(hostCssArmour('.jpdb-reader-settings input[type="checkbox"]{border:1px solid #999}')).toContain('border:1px solid #999!important');
        expect(hostCssArmour('.jpdb-reader-popover > summary{background:#eee}')).toContain('background:#eee!important');
    });

    it('keeps only the armourable selectors from a mixed selector list', () => {
        const armour = hostCssArmour('.jpdb-reader-fab,html.jpdb-subtitle-yomu-captions-active .captions-text{background:#fff}');
        expect(armour).toContain('.jpdb-reader-fab{background:#fff!important}');
        expect(armour).not.toContain('captions-text');
    });

    it('preserves conditional at-rule context', () => {
        const armour = hostCssArmour('@media (max-width:600px){.jpdb-reader-popover{border-radius:16px 16px 0 0}}');
        expect(armour).toContain('@media (max-width:600px){.jpdb-reader-popover{border-radius:16px 16px 0 0!important}}');
    });

    it('ignores keyframe and font-face blocks', () => {
        const armour = hostCssArmour('@keyframes jpdb-reader-pulse{0%{background:red}to{background:blue}}');
        expect(armour).toBe('');
        expect(hostCssArmour('@font-face{font-family:jpdb-reader;src:url(a.woff2)}')).toBe('');
    });

    it('does not mistake declaration text inside comments or strings for rules', () => {
        const armour = hostCssArmour('.jpdb-reader-chip{content:"}{border-radius:0";border-radius:999px}/* .jpdb-x{border-radius:1px} */');
        expect(armour).toContain('.jpdb-reader-chip{border-radius:999px!important}');
        expect(armour).not.toContain('1px');
    });

    it('returns the sheet unchanged when there is nothing to armour', () => {
        expect(withHostCssArmour('')).toBe('');
        expect(withHostCssArmour('body{margin:0}')).toBe('body{margin:0}');
    });

    it('armours the real reader stylesheet without emitting unbalanced CSS', () => {
        const sheet = readFileSync(path.resolve(__dirname, '../../dist/yomu.css'), 'utf8');
        const armour = hostCssArmour(sheet);
        expect(armour.length).toBeGreaterThan(1_000);
        expect(countUnescaped(armour, '{')).toBe(countUnescaped(armour, '}'));
        // The two flagship shapes the host flattened on yomuapp.jp.
        expect(armour).toMatch(/\.jpdb-reader-fab[^{}]*\{[^{}]*border-radius:[^{}]*!important/u);
        expect(armour).not.toContain('!important!important');
    });

    // b14: `all: initial` plus a `direction: ltr` pin on the reader root are author
    // declarations, so they outrank the presentational hint of the `dir` attribute
    // that applyInterfaceLocaleToRoot stamps -- every RTL root was laid out LTR
    // anyway. Both halves matter, so both are asserted: the pin still keeps a host
    // page's direction out, and a root Yomu itself marks RTL now wins.
    it('lets a root Yomu marks RTL beat its own LTR pin', () => {
        const sheet = readFileSync(path.resolve(__dirname, '../../dist/yomu.css'), 'utf8');
        expect(sheet).toMatch(/\[data-jpdb-reader-root\]\s*\{[^{}]*direction:\s*ltr/u);
        // Two attribute selectors outrank the one-attribute pin regardless of order.
        expect(sheet).toMatch(/\[data-jpdb-reader-root\]\[dir=(?:'|")?rtl(?:'|")?\][^{}]*\{[^{}]*direction:\s*rtl/u);
        expect(sheet).toContain('data-yomu-interface-dir=');
    });

    it('only armours properties that no runtime writes inline', () => {
        // An `!important` author declaration outranks a plain inline style, so an
        // armoured property that some module also sets via element.style would be
        // silently frozen. This test is the guard on that invariant.
        const inlineWrites = new Set<string>();
        for (const file of typescriptSources(SRC_ROOT)) {
            const source = readFileSync(file, 'utf8');
            for (const match of source.matchAll(/\.style\.([A-Za-z]+)\s*=(?!=)/gu)) {
                inlineWrites.add(kebabCase(match[1]));
            }
            for (const match of source.matchAll(/setProperty\(\s*['"]([-a-zA-Z]+)['"]/gu)) {
                inlineWrites.add(match[1].toLowerCase());
            }
        }
        expect(inlineWrites.size).toBeGreaterThan(10);
        // `color` is the single deliberate exception: it is armoured only for
        // selectors that name no host-derived surface, pinned by the test above.
        const conflicts = [...ARMOURED_PROPERTIES]
            .filter(property => property !== 'color')
            .filter(property => inlineWrites.has(property));
        expect(conflicts).toEqual([]);
    });
});

function countUnescaped(css: string, char: string): number {
    return css.split(char).length - 1;
}

function kebabCase(value: string): string {
    return value.replace(/[A-Z]/gu, letter => `-${letter.toLowerCase()}`);
}

function typescriptSources(root: string): string[] {
    const files: string[] = [];
    const walk = (directory: string): void => {
        for (const entry of readdirSync(directory)) {
            const full = path.join(directory, entry);
            if (statSync(full).isDirectory()) {
                walk(full);
                continue;
            }
            if (full.endsWith('.ts') && !full.endsWith('.d.ts')) files.push(full);
        }
    };
    walk(root);
    return files;
}
