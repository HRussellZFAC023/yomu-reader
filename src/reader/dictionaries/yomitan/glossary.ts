import type { DictionaryPreference } from '../../types';
import { dictionaryEnabled, dictionaryRank } from './ranking';
import { glossaryValueToText } from './glossary-text';
import { renderStructuredGlossaryHtml, type GlossaryRenderOptions } from './structured-content';
import type { YomitanDictionaryInfo } from './types';

export type { GlossaryRenderOptions } from './structured-content';

export function glossaryToText(value: unknown): string {
    return glossaryValueToText(value);
}

export function glossaryToHtml(value: unknown, dictionary = '', options: GlossaryRenderOptions = {}): string {
    const html = renderStructuredGlossaryHtml(value, dictionary, options);
    return html;
}

export function renderDictionaryScopedStyles(dictionaries: YomitanDictionaryInfo[], preferences: DictionaryPreference[] = []): string {
    const rank = dictionaryRank(preferences);
    const css = dictionaries
        .filter(dictionary => dictionaryEnabled(dictionary.title, rank))
        .map(dictionary => {
            const styles = dictionary.styles?.trim();
            if (!styles) return '';
            return scopeDictionaryStyles(styles, dictionaryScopeSelector(dictionary.title));
        })
        .filter(Boolean)
        .join('\n');
    return css;
}

function dictionaryScopeSelector(dictionary: string): string {
    return `[data-dictionary="${dictionary.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
}

function scopeDictionaryStyles(styles: string, scope: string): string {
    return splitTopLevelCssBlocks(styles)
        .map(block => scopeDictionaryStyleBlock(block, scope))
        .filter(Boolean)
        .join('\n');
}

function scopeDictionaryStyleBlock(block: string, scope: string): string {
    const openIndex = block.indexOf('{');
    const closeIndex = block.lastIndexOf('}');
    if (openIndex < 0 || closeIndex <= openIndex) return '';
    const selector = block.slice(0, openIndex).trim();
    const declarations = block.slice(openIndex + 1, closeIndex).trim();
    if (!hasCssRuleParts(selector, declarations)) return '';
    if (selector.startsWith('@')) {
        const scopedInner = splitTopLevelCssBlocks(declarations)
            .map(innerBlock => scopeDictionaryStyleBlock(innerBlock, scope))
            .filter(Boolean)
            .join('\n');
        return renderScopedAtRule(selector, declarations, scopedInner);
    }
    const scopedSelectors = splitSelectorList(selector)
        .map(part => `${scope} ${part.trim()}`)
        .join(', ');
    return `${scopedSelectors} { ${declarations} }`;
}

function hasCssRuleParts(selector: string, declarations: string): boolean {
    return Boolean(selector && declarations);
}

function renderScopedAtRule(selector: string, declarations: string, scopedInner: string): string {
    return scopedInner ? `${selector} {\n${scopedInner}\n}` : `${selector} { ${declarations} }`;
}

function splitTopLevelCssBlocks(styles: string): string[] {
    const state: CssBlockSplitState = { blocks: [], depth: 0, start: 0, inString: null, escaped: false };
    for (let index = 0; index < styles.length; index++) {
        const character = styles[index];
        if (consumeStringScanCharacter(state, character)) continue;
        if (openStringScan(state, character)) continue;
        if (openCssBlock(state, styles, index, character)) continue;
        closeCssBlock(state, styles, index, character);
    }
    return state.blocks;
}

interface CssBlockSplitState extends StringScanState {
    blocks: string[];
    depth: number;
    start: number;
}

function openCssBlock(state: CssBlockSplitState, styles: string, index: number, character: string): boolean {
    if (character !== '{') return false;
    if (state.depth === 0) state.start = findSelectorStart(styles, index);
    state.depth++;
    return true;
}

function closeCssBlock(state: CssBlockSplitState, styles: string, index: number, character: string): void {
    if (character !== '}' || state.depth === 0) return;
    state.depth--;
    if (state.depth > 0) return;
    state.blocks.push(styles.slice(state.start, index + 1).trim());
    state.start = index + 1;
}

function splitSelectorList(selector: string): string[] {
    const state: SelectorSplitState = { selectors: [], start: 0, bracketDepth: 0, parenDepth: 0, inString: null, escaped: false };
    for (let index = 0; index < selector.length; index++) {
        const character = selector[index];
        if (consumeStringScanCharacter(state, character)) continue;
        if (openStringScan(state, character)) continue;
        updateSelectorDepth(state, character);
        if (!isSelectorSeparator(state, character)) continue;
        state.selectors.push(selector.slice(state.start, index).trim());
        state.start = index + 1;
    }
    state.selectors.push(selector.slice(state.start).trim());
    return state.selectors.filter(Boolean);
}

interface SelectorSplitState extends StringScanState {
    selectors: string[];
    start: number;
    bracketDepth: number;
    parenDepth: number;
}

interface StringScanState {
    inString: string | null;
    escaped: boolean;
}

function consumeStringScanCharacter(state: StringScanState, character: string): boolean {
    if (!state.inString) return false;
    if (state.escaped) state.escaped = false;
    else if (character === '\\') state.escaped = true;
    else if (character === state.inString) state.inString = null;
    return true;
}

function openStringScan(state: StringScanState, character: string): boolean {
    if (character !== '"' && character !== "'") return false;
    state.inString = character;
    return true;
}

function updateSelectorDepth(state: SelectorSplitState, character: string): void {
    if (character === '[') state.bracketDepth++;
    if (character === ']') state.bracketDepth = Math.max(0, state.bracketDepth - 1);
    if (character === '(') state.parenDepth++;
    if (character === ')') state.parenDepth = Math.max(0, state.parenDepth - 1);
}

function isSelectorSeparator(state: SelectorSplitState, character: string): boolean {
    return character === ',' && state.bracketDepth === 0 && state.parenDepth === 0;
}

function findSelectorStart(styles: string, openIndex: number): number {
    const separators = ['}', ';'];
    let start = 0;
    for (let index = openIndex - 1; index >= 0; index--) {
        if (!separators.includes(styles[index])) continue;
        start = index + 1;
        break;
    }
    return start;
}
