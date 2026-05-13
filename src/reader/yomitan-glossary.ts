import type { DictionaryPreference } from './types';
import { Logger } from './logger';
import { dictionaryEnabled, dictionaryRank } from './yomitan-ranking';
import type { YomitanDictionaryInfo } from './yomitan-types';

interface StructuredRenderContext {
    dictionary: string;
    internalSearchLinks: boolean;
    root: boolean;
}

export interface GlossaryRenderOptions {
    internalSearchLinks?: boolean;
}

interface StructuredSearchReference {
    query: string;
    reading: string;
}

const STRUCTURED_CONTENT_TAGS = new Set([
    'br',
    'ruby',
    'rt',
    'rp',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'th',
    'td',
    'div',
    'span',
    'ol',
    'ul',
    'li',
    'details',
    'summary',
]);

const STRUCTURED_STYLE_PROPERTIES: Record<string, string> = {
    fontStyle: 'font-style',
    fontWeight: 'font-weight',
    fontSize: 'font-size',
    color: 'color',
    background: 'background',
    backgroundColor: 'background-color',
    textDecorationStyle: 'text-decoration-style',
    textDecorationColor: 'text-decoration-color',
    borderColor: 'border-color',
    borderStyle: 'border-style',
    borderRadius: 'border-radius',
    borderWidth: 'border-width',
    clipPath: 'clip-path',
    verticalAlign: 'vertical-align',
    textAlign: 'text-align',
    textEmphasis: 'text-emphasis',
    textShadow: 'text-shadow',
    margin: 'margin',
    marginTop: 'margin-top',
    marginLeft: 'margin-left',
    marginRight: 'margin-right',
    marginBottom: 'margin-bottom',
    padding: 'padding',
    paddingTop: 'padding-top',
    paddingLeft: 'padding-left',
    paddingRight: 'padding-right',
    paddingBottom: 'padding-bottom',
    wordBreak: 'word-break',
    whiteSpace: 'white-space',
    cursor: 'cursor',
    listStyleType: 'list-style-type',
};

const STRUCTURED_NUMERIC_EM_STYLES = new Set(['marginTop', 'marginLeft', 'marginRight', 'marginBottom']);
const log = Logger.scope('YomitanGlossary');

export function glossaryToText(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.map(glossaryToText).filter(Boolean).join(' ');
    if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if (typeof record.text === 'string') return record.text;
        if ('content' in record) return glossaryToText(record.content);
        if ('path' in record) return String(record.description || record.alt || '[media]');
        return Object.values(record).map(glossaryToText).filter(Boolean).join(' ');
    }
    return '';
}

export function glossaryToHtml(value: unknown, dictionary = '', options: GlossaryRenderOptions = {}): string {
    const html = renderGlossaryValue(value, { dictionary, internalSearchLinks: options.internalSearchLinks ?? false, root: true });
    log.debugThrottled('glossary-html', 1000, 'Rendered glossary HTML', { dictionary, htmlLength: html.length, valueType: Array.isArray(value) ? 'array' : typeof value });
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
    log.debug('Rendered dictionary scoped styles', { dictionaries: dictionaries.length, preferences: preferences.length, bytes: css.length });
    return css;
}

function renderGlossaryValue(value: unknown, context: StructuredRenderContext): string {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return escapeHtml(String(value));
    if (Array.isArray(value)) return value.map(item => renderGlossaryValue(item, { ...context, root: false })).filter(Boolean).join('');
    if (typeof value !== 'object') return '';

    const record = value as Record<string, unknown>;
    if (typeof record.text === 'string') return escapeHtml(record.text);
    if (record.type === 'structured-content') {
        const dictionaryAttr = context.dictionary ? ` data-dictionary="${escapeHtml(context.dictionary)}"` : '';
        return `<span class="structured-content"${dictionaryAttr}>${renderGlossaryValue(record.content, { ...context, root: false })}</span>`;
    }
    if (record.type === 'image' || 'path' in record) return renderStructuredImage(record, context.dictionary);
    if (record.type === 'text' && 'content' in record) return renderGlossaryValue(record.content, { ...context, root: false });

    const tag = typeof record.tag === 'string' ? record.tag.toLowerCase() : ('content' in record ? 'span' : '');
    if (!tag) return Object.values(record).map(item => renderGlossaryValue(item, { ...context, root: false })).filter(Boolean).join('');
    if (tag === 'a') return renderStructuredLink(record, context);
    if (tag === 'img') return renderStructuredImage(record, context.dictionary);

    const content = tag === 'br' ? '' : renderGlossaryValue(record.content, { ...context, root: false });
    if (tag === 'table') {
        return `<div class="gloss-sc-table-container"><table${renderStructuredElementAttributes(record, tag, context.dictionary)}>${content}</table></div>`;
    }
    if (STRUCTURED_CONTENT_TAGS.has(tag)) {
        const attrs = renderStructuredElementAttributes(record, tag, context.dictionary);
        return tag === 'br' ? `<br${attrs}>` : `<${tag}${attrs}>${content}</${tag}>`;
    }
    return content || escapeHtml(glossaryToText(value));
}

function renderStructuredElementAttributes(record: Record<string, unknown>, tag: string, dictionary: string): string {
    const attrs = [` class="gloss-sc-${escapeHtml(tag)}"`];
    if (dictionary) attrs.push(` data-dictionary="${escapeHtml(dictionary)}"`);
    attrs.push(renderStructuredDataAttributes(record.data));
    attrs.push(renderDirectDataAttributes(record));
    const style = renderStructuredStyle(record.style);
    if (style) attrs.push(` style="${escapeHtml(style)}"`);
    if (typeof record.title === 'string') attrs.push(` title="${escapeHtml(record.title)}"`);
    if (typeof record.lang === 'string') attrs.push(` lang="${escapeHtml(record.lang)}"`);
    if (tag === 'details' && record.open === true) attrs.push(' open');
    if ((tag === 'td' || tag === 'th') && Number.isFinite(Number(record.colSpan))) attrs.push(` colspan="${Number(record.colSpan)}"`);
    if ((tag === 'td' || tag === 'th') && Number.isFinite(Number(record.rowSpan))) attrs.push(` rowspan="${Number(record.rowSpan)}"`);
    return attrs.filter(Boolean).join('');
}

function renderStructuredDataAttributes(value: unknown): string {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
    const attrs: string[] = [];
    for (const [key, rawValue] of Object.entries(value)) {
        if (!key || rawValue == null || (typeof rawValue !== 'string' && typeof rawValue !== 'number' && typeof rawValue !== 'boolean')) continue;
        attrs.push(` data-sc-${camelToKebabCase(key)}="${escapeHtml(String(rawValue))}"`);
    }
    return attrs.join('');
}

function renderDirectDataAttributes(record: Record<string, unknown>): string {
    const attrs: string[] = [];
    for (const [key, value] of Object.entries(record)) {
        if (!key.startsWith('data-') || (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')) continue;
        attrs.push(` ${key}="${escapeHtml(String(value))}"`);
    }
    return attrs.join('');
}

function renderStructuredStyle(value: unknown): string {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
    const declarations: string[] = [];
    const style = value as Record<string, unknown>;
    const textDecorationLine = style.textDecorationLine;
    if (typeof textDecorationLine === 'string') declarations.push(`text-decoration:${textDecorationLine};`);
    else if (Array.isArray(textDecorationLine)) declarations.push(`text-decoration:${textDecorationLine.map(String).join(' ')};`);

    for (const [key, property] of Object.entries(STRUCTURED_STYLE_PROPERTIES)) {
        const rawValue = style[key];
        if (typeof rawValue === 'string') declarations.push(`${property}:${rawValue};`);
        else if (typeof rawValue === 'number' && STRUCTURED_NUMERIC_EM_STYLES.has(key)) declarations.push(`${property}:${rawValue}em;`);
    }
    return declarations.join('');
}

function renderStructuredLink(record: Record<string, unknown>, context: StructuredRenderContext): string {
    const content = renderGlossaryValue(record.content, { ...context, root: false }) || escapeHtml(glossaryToText(record));
    const rawHref = typeof record.href === 'string' ? record.href : '';
    const searchReference = context.internalSearchLinks ? parseStructuredSearchReference(rawHref) : null;
    const href = searchReference ? '#jpdb-reader-dictionary-lookup' : normalizeStructuredHref(rawHref);
    const external = href ? !href.startsWith(locationOrigin()) && !href.startsWith('#') : false;
    const attrs = [
        ' class="gloss-link"',
        ` data-external="${external}"`,
        context.dictionary ? ` data-dictionary="${escapeHtml(context.dictionary)}"` : '',
        searchReference ? ` data-dictionary-lookup="${escapeHtml(searchReference.query)}"` : '',
        searchReference?.reading ? ` data-dictionary-reading="${escapeHtml(searchReference.reading)}"` : '',
        href ? ` href="${escapeHtml(href)}"` : '',
        external ? ' target="_blank" rel="noopener noreferrer"' : '',
        typeof record.lang === 'string' ? ` lang="${escapeHtml(record.lang)}"` : '',
    ].join('');
    const icon = external ? '<span class="gloss-link-external-icon icon" data-icon="external-link"></span>' : '';
    return `<a${attrs}><span class="gloss-link-text">${content}</span>${icon}</a>`;
}

function renderStructuredImage(record: Record<string, unknown>, dictionary: string): string {
    const path = typeof record.path === 'string' ? record.path : '';
    const title = typeof record.title === 'string' ? record.title : '';
    const description = typeof record.description === 'string' ? record.description : typeof record.alt === 'string' ? record.alt : '';
    const preferredWidth = numericRecordValue(record, 'preferredWidth');
    const preferredHeight = numericRecordValue(record, 'preferredHeight');
    const width = preferredWidth ?? numericRecordValue(record, 'width') ?? 100;
    const height = preferredHeight ?? numericRecordValue(record, 'height') ?? 100;
    const invAspectRatio = height > 0 && width > 0 ? height / width : 1;
    const usedWidth = preferredWidth ?? (preferredHeight ? preferredHeight / invAspectRatio : width);
    const dictionaryAttr = dictionary ? ` data-dictionary="${escapeHtml(dictionary)}"` : '';
    const attrs = [
        ` class="gloss-image-link"`,
        dictionaryAttr,
        path ? ` data-path="${escapeHtml(path)}"` : '',
        ` data-image-load-state="unloaded"`,
        ` data-has-aspect-ratio="true"`,
        ` data-image-rendering="${escapeHtml(String(record.imageRendering || (record.pixelated ? 'pixelated' : 'auto')))}"`,
        ` data-appearance="${escapeHtml(String(record.appearance || 'auto'))}"`,
        ` data-background="${typeof record.background === 'boolean' ? record.background : true}"`,
        ` data-collapsed="${typeof record.collapsed === 'boolean' ? record.collapsed : false}"`,
        ` data-collapsible="${typeof record.collapsible === 'boolean' ? record.collapsible : true}"`,
        typeof record.verticalAlign === 'string' ? ` data-vertical-align="${escapeHtml(record.verticalAlign)}"` : '',
        typeof record.sizeUnits === 'string' ? ` data-size-units="${escapeHtml(record.sizeUnits)}"` : '',
    ].join('');
    const containerStyle = [
        `width:${formatCssNumber(usedWidth)}em;`,
        typeof record.border === 'string' ? `border:${record.border};` : '',
        typeof record.borderRadius === 'string' ? `border-radius:${record.borderRadius};` : '',
    ].join('');
    const containerTitle = title ? ` title="${escapeHtml(title)}"` : '';
    const descriptionHtml = description ? `<span class="gloss-image-description">${escapeHtml(description)}</span>` : '';
    return `<span${attrs}><span class="gloss-image-container" style="${escapeHtml(containerStyle)}"${containerTitle}><span class="gloss-image-sizer" style="padding-top:${formatCssNumber(invAspectRatio * 100)}%;"></span><span class="gloss-image-background"></span><span class="gloss-image-container-overlay"></span></span><span class="gloss-image-link-text">Image</span></span>${descriptionHtml}`;
}

function normalizeStructuredHref(href: string): string {
    if (!href) return '';
    if (/^https?:\/\//i.test(href) || href.startsWith('#')) return href;
    if (href.startsWith('?')) return `https://jpdb.io/search${href}`;
    return '';
}

function parseStructuredSearchReference(href: string): StructuredSearchReference | null {
    if (!href.startsWith('?')) return null;
    try {
        const params = new URLSearchParams(href.slice(1));
        const query = (params.get('query') ?? '').trim();
        if (!query) return null;
        return {
            query,
            reading: (params.get('primary_reading') ?? '').trim(),
        };
    } catch {
        return null;
    }
}

function locationOrigin(): string {
    try {
        return location.origin;
    } catch {
        return '';
    }
}

function numericRecordValue(record: Record<string, unknown>, key: string): number | undefined {
    const value = record[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function formatCssNumber(value: number): string {
    return Number.isFinite(value) ? Number(value.toFixed(4)).toString() : '0';
}

function camelToKebabCase(value: string): string {
    return value.replace(/[A-Z]/g, character => `-${character.toLowerCase()}`);
}

function dictionaryScopeSelector(dictionary: string): string {
    return `[data-dictionary="${dictionary.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
}

function scopeDictionaryStyles(styles: string, scope: string): string {
    return styles
        .split('}')
        .map(block => {
            const [selectorText, ...declarationParts] = block.split('{');
            const declarations = declarationParts.join('{').trim();
            if (!selectorText?.trim() || !declarations) return '';
            const selector = selectorText.trim();
            if (selector.startsWith('@')) return `${selector} { ${declarations} }`;
            const scopedSelectors = selector
                .split(',')
                .map(part => `${scope} ${part.trim()}`)
                .join(', ');
            return `${scopedSelectors} { ${declarations} }`;
        })
        .filter(Boolean)
        .join('\n');
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
