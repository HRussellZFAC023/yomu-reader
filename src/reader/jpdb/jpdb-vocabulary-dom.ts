import { escapeHtml } from '../dom';
import { isRubyAnnotation, rubyReadingText } from './jpdb-ruby-text';
import { cleanText, JAPANESE_RE } from './jpdb-text';
export { escapeRegExp } from '../core/string-utils';

interface JpdbRichTextOptions {
    preserveHighlight?: boolean;
}

export function isJapaneseTerm(value: string): boolean {
    if (!value) return false;
    return JAPANESE_RE.test(value);
}

export function sectionLabel(section: HTMLElement): string {
    return cleanText(section.querySelector<HTMLElement>('.subsection-label')?.textContent ?? '').toLowerCase();
}

export function baseText(root: Node): string {
    if (root.nodeType === Node.TEXT_NODE) return root.textContent ?? '';
    if (root.nodeType !== Node.ELEMENT_NODE) return '';
    return baseElementText(root as HTMLElement);
}

function baseElementText(element: HTMLElement): string {
    if (isRubyAnnotation(element)) return '';
    return Array.from(element.childNodes).map(baseText).join('');
}

export function readingText(root: Node): string {
    if (root.nodeType === Node.TEXT_NODE) return root.textContent ?? '';
    if (root.nodeType !== Node.ELEMENT_NODE) return '';
    return readingElementText(root as HTMLElement);
}

function readingElementText(element: HTMLElement): string {
    if (isRubyAnnotation(element)) return '';
    if (element.tagName === 'RUBY') return rubyReadingText(element, baseText);
    return Array.from(element.childNodes).map(readingText).join('');
}

export function optionalRichHtml<K extends 'termHtml' | 'sentenceHtml'>(
    key: K,
    root: Node | null,
    options: JpdbRichTextOptions = {},
): Partial<Record<K, string>> {
    const html = jpdbRichTextHtml(root, options);
    return html ? { [key]: html } as Partial<Record<K, string>> : {};
}

function jpdbRichTextHtml(root: Node | null, options: JpdbRichTextOptions): string {
    if (!root || !hasReadableRuby(root)) return '';
    return Array.from(root.childNodes).map(node => jpdbRichTextNodeHtml(node, options)).join('').trim();
}

function jpdbRichTextNodeHtml(node: Node, options: JpdbRichTextOptions): string {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent ?? '');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    return jpdbRichTextElementHtml(node as Element, options);
}

function jpdbRichTextElementHtml(element: Element, options: JpdbRichTextOptions): string {
    const html = jpdbRichTextElementContentHtml(element, options);
    return options.preserveHighlight && element.classList.contains('highlight')
        ? `<mark class="jpdb-reader-example-target">${html}</mark>`
        : html;
}

function jpdbRichTextElementContentHtml(element: Element, options: JpdbRichTextOptions): string {
    if (isRubyAnnotation(element)) return '';
    if (element.tagName === 'BR') return ' ';
    return element.tagName === 'RUBY'
        ? jpdbRubyHtml(element, options)
        : jpdbRichTextChildrenHtml(element, options);
}

function jpdbRichTextChildrenHtml(element: Element, options: JpdbRichTextOptions): string {
    return Array.from(element.childNodes).map(child => jpdbRichTextNodeHtml(child, options)).join('');
}

function jpdbRubyHtml(element: Element, options: JpdbRichTextOptions): string {
    let html = '';
    let baseHtml = '';
    const flushBase = (reading = '') => {
        if (!baseHtml) return;
        html += reading
            ? `<ruby><span class="jpdb-reader-ruby-base">${baseHtml}</span><rp>(</rp><rt class="jpdb-reader-furi">${escapeHtml(reading)}</rt><rp>)</rp></ruby>`
            : baseHtml;
        baseHtml = '';
    };

    element.childNodes.forEach(child => {
        if (child.nodeType !== Node.ELEMENT_NODE) {
            baseHtml += jpdbRichTextNodeHtml(child, options);
            return;
        }
        const childElement = child as Element;
        if (childElement.tagName === 'RT') {
            flushBase(cleanText(childElement.textContent ?? ''));
            return;
        }
        if (childElement.tagName === 'RP') return;
        baseHtml += jpdbRichTextNodeHtml(child, options);
    });
    flushBase();
    return html;
}

function hasReadableRuby(root: Node): boolean {
    if (root.nodeType !== Node.ELEMENT_NODE) return false;
    return Array.from((root as Element).querySelectorAll('rt'))
        .some(rt => cleanText(rt.textContent ?? ''));
}

export function cleanMeaning(value: string): string {
    return cleanText(value).replace(/^\d+\.\s*/, '');
}

export function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
    const seen = new Set<string>();
    return values.filter(value => {
        const current = key(value);
        if (seen.has(current)) return false;
        seen.add(current);
        return true;
    });
}

export function mergeBy<T>(primary: T[], supplemental: T[], key: (value: T) => string, limit: number): T[] {
    return uniqueBy([...primary, ...supplemental], key).slice(0, limit);
}
