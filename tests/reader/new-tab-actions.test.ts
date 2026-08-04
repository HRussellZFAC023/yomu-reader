/**
 * The Study surface's action vocabulary is a closed union (src/reader/newtab/actions.ts).
 * TypeScript already rejects a handler keyed to a name outside the union and a
 * render site that writes one. These tests close the two holes the compiler
 * cannot see:
 *
 *  - a name in the union that no render site emits (a handler wired to a button
 *    that no longer exists — the click-side of the wrong-wiring regression class);
 *  - a raw `data-newtab-action="…"` literal written outside the helpers, which
 *    escapes the union entirely.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NEW_TAB_ACTIONS, isNewTabAction, newTabActionAttr, newTabActionSelector } from '../../src/reader/newtab/actions';

const ROOT = process.cwd();
const READER_SRC = path.join(ROOT, 'src/reader');
const ACTIONS_MODULE = path.join(READER_SRC, 'newtab/actions.ts');

function sourceFiles(directory: string): string[] {
    if (!existsSync(directory)) return [];
    const found: string[] = [];
    for (const entry of readdirSync(directory).sort()) {
        const full = path.join(directory, entry);
        if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
        else if (full.endsWith('.ts') && full !== ACTIONS_MODULE) found.push(full);
    }
    return found;
}

const READER_SOURCES = sourceFiles(READER_SRC).map(file => ({ file, text: readFileSync(file, 'utf8') }));

describe('new tab action vocabulary', () => {
    it('lists every action exactly once', () => {
        expect(new Set(NEW_TAB_ACTIONS).size).toBe(NEW_TAB_ACTIONS.length);
    });

    it('narrows only known names', () => {
        expect(isNewTabAction('grade')).toBe(true);
        expect(isNewTabAction('listen-grade')).toBe(false);
        expect(isNewTabAction(undefined)).toBe(false);
        expect(isNewTabAction('')).toBe(false);
    });

    it('builds attributes and selectors from the same name', () => {
        expect(newTabActionAttr('grade')).toBe('data-newtab-action="grade"');
        expect(newTabActionSelector('grade', '[data-grade]')).toBe('[data-newtab-action="grade"][data-grade]');
    });

    // A union member no render site emits means a handler keyed to a control
    // that does not exist: the click silently does nothing forever.
    it('renders every action it dispatches', () => {
        const unrendered = NEW_TAB_ACTIONS.filter(action => {
            const emitters = [
                `newTabAction('${action}')`,
                `newTabActionAttr('${action}')`,
                `data-newtab-action="${action}"`,
            ];
            return !READER_SOURCES.some(({ text }) => emitters.some(needle => text.includes(needle)));
        });
        expect(unrendered).toEqual([]);
    });

    // Raw literals bypass the union, so a rename cannot be caught by typecheck.
    // The newtab surface owns the vocabulary and must never write one by hand.
    it('writes action names only through the typed helpers', () => {
        const raw: string[] = [];
        for (const { file, text } of READER_SOURCES) {
            if (!path.relative(READER_SRC, file).startsWith('newtab/')) continue;
            for (const match of text.matchAll(/data-newtab-action="([a-z0-9-]+)"/g)) {
                raw.push(`${path.relative(ROOT, file)}: ${match[0]}`);
            }
            for (const match of text.matchAll(/newtabAction: '([a-z0-9-]+)'/g)) {
                raw.push(`${path.relative(ROOT, file)}: ${match[0]}`);
            }
        }
        expect(raw).toEqual([]);
    });

    // Two shells outside src/reader/newtab render a Study control directly
    // (the settings dialog's theme switch, the hosted site-nav links). They
    // cannot import the helper without a cycle, so assert their hand-written
    // names still resolve — a rename inside the union would otherwise leave a
    // dead control on a surface the newtab typecheck never sees.
    it('keeps the names hand-written outside src/reader/newtab inside the union', () => {
        const external = READER_SOURCES
            .filter(({ file }) => !path.relative(READER_SRC, file).startsWith('newtab/'))
            .flatMap(({ file, text }) => Array.from(
                text.matchAll(/data-newtab-action="([a-z0-9-]+)"/g),
                match => ({ file: path.relative(ROOT, file), action: match[1] }),
            ));
        expect(external.length).toBeGreaterThan(0);
        expect(external.filter(entry => !isNewTabAction(entry.action))).toEqual([]);
    });
});
