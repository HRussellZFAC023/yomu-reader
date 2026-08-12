import { isRecord } from '../../core/object-utils';
import { isJapaneseKanjiCharacter } from '../../lookup/japanese-script';
import { glossaryValueToText } from './glossary-text';
import { privateCommandAttributes } from '../../dom/private-command-capabilities';

export interface GlossaryRenderOptions {
    internalSearchLinks?: boolean;
}

interface StructuredRenderContext {
    dictionary: string;
    internalSearchLinks: boolean;
}

interface StructuredSearchReference {
    query: string;
    reading: string;
}

interface StructuredKanjiReference {
    kanji: string;
}

type DirectGlossaryRecordRenderer = (record: Record<string, unknown>, context: StructuredRenderContext) => string | null;

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

export function renderStructuredGlossaryHtml(value: unknown, dictionary = '', options: GlossaryRenderOptions = {}): string {
    return renderGlossaryValue(value, {
        dictionary,
        internalSearchLinks: options.internalSearchLinks ?? false,
    });
}

function renderGlossaryValue(value: unknown, context: StructuredRenderContext): string {
    if (value == null) return '';
    if (isStructuredPrimitive(value)) return escapeHtml(String(value));
    if (Array.isArray(value)) return renderGlossaryArray(value, context);
    if (!isRecord(value)) return '';
    return renderGlossaryRecord(value, context);
}

function isStructuredPrimitive(value: unknown): value is string | number | boolean {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function renderGlossaryArray(value: unknown[], context: StructuredRenderContext): string {
    return value.map(item => renderGlossaryValue(item, context)).filter(Boolean).join('');
}

function renderGlossaryRecord(record: Record<string, unknown>, context: StructuredRenderContext): string {
    return renderDirectGlossaryRecord(record, context) ?? renderTaggedGlossaryRecord(record, context);
}

const DIRECT_GLOSSARY_RECORD_RENDERERS: DirectGlossaryRecordRenderer[] = [
    renderTextGlossaryRecord,
    renderStructuredContentGlossaryRecord,
    renderImageGlossaryRecord,
    renderTextContentGlossaryRecord,
];

function renderDirectGlossaryRecord(record: Record<string, unknown>, context: StructuredRenderContext): string | null {
    for (const render of DIRECT_GLOSSARY_RECORD_RENDERERS) {
        const html = render(record, context);
        if (html !== null) return html;
    }
    return null;
}

function renderTextGlossaryRecord(record: Record<string, unknown>): string | null {
    return typeof record.text === 'string' ? escapeHtml(record.text) : null;
}

function renderStructuredContentGlossaryRecord(record: Record<string, unknown>, context: StructuredRenderContext): string | null {
    return record.type === 'structured-content' ? renderStructuredContent(record, context) : null;
}

function renderImageGlossaryRecord(record: Record<string, unknown>, context: StructuredRenderContext): string | null {
    return isStructuredImageRecord(record) ? renderStructuredImage(record, context.dictionary) : null;
}

function renderTextContentGlossaryRecord(record: Record<string, unknown>, context: StructuredRenderContext): string | null {
    return record.type === 'text' && 'content' in record ? renderGlossaryValue(record.content, context) : null;
}

function renderStructuredContent(record: Record<string, unknown>, context: StructuredRenderContext): string {
    const dictionaryAttr = context.dictionary ? ` data-dictionary="${escapeHtml(context.dictionary)}"` : '';
    return `<span class="structured-content"${dictionaryAttr}>${renderGlossaryValue(record.content, context)}</span>`;
}

function renderTaggedGlossaryRecord(record: Record<string, unknown>, context: StructuredRenderContext): string {
    const tag = structuredRecordTag(record);
    if (!tag) return renderRecordValues(record, context);
    return renderKnownTaggedGlossaryRecord(record, tag, context)
        ?? structuredFallbackContent(record, taggedRecordContent(record, tag, context));
}

function renderKnownTaggedGlossaryRecord(record: Record<string, unknown>, tag: string, context: StructuredRenderContext): string | null {
    if (tag === 'a') return renderStructuredLink(record, context);
    if (tag === 'img') return renderStructuredImage(record, context.dictionary);
    const content = taggedRecordContent(record, tag, context);
    if (tag === 'table') return renderStructuredTable(record, content, context.dictionary);
    if (STRUCTURED_CONTENT_TAGS.has(tag)) return renderStructuredElement(record, tag, content, context.dictionary);
    return null;
}

function taggedRecordContent(record: Record<string, unknown>, tag: string, context: StructuredRenderContext): string {
    return tag === 'br' ? '' : renderGlossaryValue(record.content, context);
}

function structuredFallbackContent(record: Record<string, unknown>, content: string): string {
    return content || escapeHtml(glossaryValueToText(record));
}

function structuredRecordTag(record: Record<string, unknown>): string {
    if (typeof record.tag === 'string') return record.tag.toLowerCase();
    return 'content' in record ? 'span' : '';
}

function renderRecordValues(record: Record<string, unknown>, context: StructuredRenderContext): string {
    return Object.values(record).map(item => renderGlossaryValue(item, context)).filter(Boolean).join('');
}

function renderStructuredTable(record: Record<string, unknown>, content: string, dictionary: string): string {
    return `<div class="gloss-sc-table-container"><table${renderStructuredElementAttributes(record, 'table', dictionary)}>${content}</table></div>`;
}

function renderStructuredElement(record: Record<string, unknown>, tag: string, content: string, dictionary: string): string {
    const attrs = renderStructuredElementAttributes(record, tag, dictionary);
    return tag === 'br' ? `<br${attrs}>` : `<${tag}${attrs}>${content}</${tag}>`;
}

function renderStructuredElementAttributes(record: Record<string, unknown>, tag: string, dictionary: string): string {
    return [
        ` class="gloss-sc-${escapeHtml(tag)}"`,
        dictionaryDataAttribute(dictionary),
        renderStructuredDataAttributes(record.data),
        renderDirectDataAttributes(record),
        structuredStyleAttribute(record.style),
        structuredStringAttribute('title', record.title),
        structuredStringAttribute('lang', record.lang),
        ...structuredStateAttributes(record, tag),
    ].filter(Boolean).join('');
}

function dictionaryDataAttribute(dictionary: string): string {
    return dictionary ? ` data-dictionary="${escapeHtml(dictionary)}"` : '';
}

function structuredStyleAttribute(value: unknown): string {
    const style = renderStructuredStyle(value);
    return style ? ` style="${escapeHtml(style)}"` : '';
}

function structuredStringAttribute(name: string, value: unknown): string {
    return typeof value === 'string' ? ` ${name}="${escapeHtml(value)}"` : '';
}

function structuredStateAttributes(record: Record<string, unknown>, tag: string): string[] {
    return [
        tag === 'details' && record.open === true ? ' open' : '',
        tableCellSpanAttribute(record, tag, 'colSpan', 'colspan'),
        tableCellSpanAttribute(record, tag, 'rowSpan', 'rowspan'),
    ];
}

function tableCellSpanAttribute(record: Record<string, unknown>, tag: string, key: string, attr: string): string {
    const value = Number(record[key]);
    return isTableCellTag(tag) && Number.isFinite(value) ? ` ${attr}="${value}"` : '';
}

function isTableCellTag(tag: string): boolean {
    return tag === 'td' || tag === 'th';
}

function renderStructuredDataAttributes(value: unknown): string {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
    return Object.entries(value)
        .map(([key, rawValue]) => renderStructuredDataAttribute(key, rawValue))
        .filter(Boolean)
        .join('');
}

function renderStructuredDataAttribute(key: string, rawValue: unknown): string {
    return key && isStructuredAttributeValue(rawValue)
        ? ` data-sc-${camelToKebabCase(key)}="${escapeHtml(String(rawValue))}"`
        : '';
}

function isStructuredAttributeValue(value: unknown): value is string | number | boolean {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function renderDirectDataAttributes(record: Record<string, unknown>): string {
    return Object.entries(record).map(renderDirectDataAttribute).filter(Boolean).join('');
}

function renderDirectDataAttribute([key, value]: [string, unknown]): string {
    return isDirectDataAttribute(key, value) ? ` ${key}="${escapeHtml(String(value))}"` : '';
}

function isDirectDataAttribute(key: string, value: unknown): value is string | number | boolean {
    return key.startsWith('data-') && isStructuredAttributeValue(value);
}

function renderStructuredStyle(value: unknown): string {
    const style = structuredStyleRecord(value);
    if (!style) return '';
    const declarations: string[] = [];
    const decoration = structuredTextDecoration(style.textDecorationLine);
    if (decoration) declarations.push(decoration);

    for (const [key, property] of Object.entries(STRUCTURED_STYLE_PROPERTIES)) {
        const declaration = structuredStyleDeclaration(key, property, style[key]);
        if (declaration) declarations.push(declaration);
    }
    return declarations.join('');
}

function structuredStyleRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function structuredTextDecoration(value: unknown): string {
    if (typeof value === 'string') return `text-decoration:${value};`;
    if (Array.isArray(value)) return `text-decoration:${value.map(String).join(' ')};`;
    return '';
}

function structuredStyleDeclaration(key: string, property: string, rawValue: unknown): string {
    if (typeof rawValue === 'string') return `${property}:${rawValue};`;
    if (typeof rawValue === 'number' && STRUCTURED_NUMERIC_EM_STYLES.has(key)) return `${property}:${rawValue}em;`;
    return '';
}

function renderStructuredLink(record: Record<string, unknown>, context: StructuredRenderContext): string {
    const content = renderGlossaryValue(record.content, context) || escapeHtml(glossaryValueToText(record));
    const link = structuredLinkModel(record, context);
    const icon = link.external ? '<span class="gloss-link-external-icon icon" data-icon="external-link"></span>' : '';
    return `<a${structuredLinkAttrs(link, context.dictionary, record.lang)}><span class="gloss-link-text">${content}</span>${icon}</a>`;
}

interface StructuredLinkModel {
    href: string;
    external: boolean;
    searchReference: ReturnType<typeof parseStructuredSearchReference>;
    kanjiReference: ReturnType<typeof parseStructuredKanjiReference>;
}

function structuredLinkModel(record: Record<string, unknown>, context: StructuredRenderContext): StructuredLinkModel {
    const rawHref = typeof record.href === 'string' ? record.href : '';
    const searchReference = structuredLinkSearchReference(rawHref, context);
    const kanjiReference = structuredLinkKanjiReference(rawHref, context);
    const href = structuredLinkHref(rawHref, searchReference, kanjiReference);
    return {
        href,
        external: isExternalStructuredHref(href),
        searchReference,
        kanjiReference,
    };
}

function structuredLinkSearchReference(rawHref: string, context: StructuredRenderContext): StructuredSearchReference | null {
    return context.internalSearchLinks ? parseStructuredSearchReference(rawHref) : null;
}

function structuredLinkKanjiReference(rawHref: string, context: StructuredRenderContext): StructuredKanjiReference | null {
    return context.internalSearchLinks ? parseStructuredKanjiReference(rawHref) : null;
}

function structuredLinkHref(
    rawHref: string,
    searchReference: StructuredSearchReference | null,
    kanjiReference: StructuredKanjiReference | null,
): string {
    if (searchReference) return '#jpdb-reader-dictionary-lookup';
    if (kanjiReference) return '#jpdb-reader-kanji-lookup';
    return normalizeStructuredHref(rawHref);
}

function isExternalStructuredHref(href: string): boolean {
    return Boolean(href && !href.startsWith(locationOrigin()) && !href.startsWith('#'));
}

function structuredLinkAttrs(link: StructuredLinkModel, dictionary: string, lang: unknown): string {
    return [
        ' class="gloss-link"',
        ` data-external="${link.external}"`,
        dictionaryAttribute(dictionary),
        kanjiReferenceActionAttribute(link),
        searchReferenceQueryAttribute(link),
        searchReferenceReadingAttribute(link),
        hrefAttribute(link.href),
        externalLinkAttributes(link.external),
        langAttribute(lang),
    ].join('');
}

function kanjiReferenceActionAttribute(link: StructuredLinkModel): string {
    if (!link.kanjiReference) return '';
    const kanji = link.kanjiReference.kanji;
    return ` data-action="kanji" data-kanji="${escapeHtml(kanji)}"${privateCommandAttributes({ kind: 'kanji-lookup', kanji })}`;
}

function dictionaryAttribute(dictionary: string): string {
    return dictionary ? ` data-dictionary="${escapeHtml(dictionary)}"` : '';
}

function searchReferenceQueryAttribute(link: StructuredLinkModel): string {
    return link.searchReference ? ` data-dictionary-lookup="${escapeHtml(link.searchReference.query)}"` : '';
}

function searchReferenceReadingAttribute(link: StructuredLinkModel): string {
    return link.searchReference?.reading ? ` data-dictionary-reading="${escapeHtml(link.searchReference.reading)}"` : '';
}

function hrefAttribute(href: string): string {
    return href ? ` href="${escapeHtml(href)}"` : '';
}

function externalLinkAttributes(external: boolean): string {
    return external ? ' target="_blank" rel="noopener noreferrer"' : '';
}

function langAttribute(lang: unknown): string {
    return typeof lang === 'string' ? ` lang="${escapeHtml(lang)}"` : '';
}

function renderStructuredImage(record: Record<string, unknown>, dictionary: string): string {
    const path = typeof record.path === 'string' ? record.path : '';
    const title = typeof record.title === 'string' ? record.title : '';
    const description = structuredImageDescription(record);
    const src = structuredImageSrc(path);
    const alt = escapeHtml(description || title || 'Dictionary image');
    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';
    return `<span${renderStructuredImageAttributes(record, dictionary)}${titleAttribute}><img class="gloss-image"${src ? ` src="${escapeHtml(src)}"` : ''} alt="${alt}"><span class="gloss-image-fallback">${alt}</span></span>`;
}

function renderStructuredImageAttributes(record: Record<string, unknown>, dictionary: string): string {
    return [
        ` class="gloss-image-link"`,
        dictionaryAttribute(dictionary),
        structuredImageStateAttribute(record),
    ].join('');
}

function structuredImageStateAttribute(record: Record<string, unknown>): string {
    const path = typeof record.path === 'string' ? record.path : '';
    return ` data-image-load-state="${structuredImageSrc(path) ? 'loaded' : 'error'}"`;
}

function structuredImageSrc(path: string): string {
    return /^data:image\//i.test(path) ? path : '';
}

function structuredImageDescription(record: Record<string, unknown>): string {
    if (typeof record.description === 'string') return record.description;
    return typeof record.alt === 'string' ? record.alt : '';
}

function isStructuredImageRecord(record: Record<string, unknown>): boolean {
    return record.type === 'image' || 'path' in record;
}

function normalizeStructuredHref(href: string): string {
    if (!href) return '';
    if (/^https?:\/\//i.test(href) || href.startsWith('#')) return href;
    if (href.startsWith('?')) return `https://jpdb.io/search${href}`;
    return '';
}

function parseStructuredSearchReference(href: string): StructuredSearchReference | null {
    if (!href.startsWith('?')) return null;
    const params = structuredSearchParams(href);
    return params ? structuredSearchReferenceFromParams(params) : null;
}

function parseStructuredKanjiReference(href: string): StructuredKanjiReference | null {
    const match = /^(?:https:\/\/jpdb\.io)?\/kanji\/([^/?#]+)/i.exec(href.trim());
    if (!match) return null;
    const value = decodeStructuredPathSegment(match[1]);
    const kanji = Array.from(value).find(isJapaneseKanjiCharacter) ?? '';
    return kanji ? { kanji } : null;
}

function decodeStructuredPathSegment(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function structuredSearchParams(href: string): URLSearchParams | null {
    try {
        return new URLSearchParams(href.slice(1));
    } catch {
        return null;
    }
}

function structuredSearchReferenceFromParams(params: URLSearchParams): StructuredSearchReference | null {
    const query = (params.get('query') ?? '').trim();
    return query ? { query, reading: (params.get('primary_reading') ?? '').trim() } : null;
}

function locationOrigin(): string {
    try {
        return location.origin;
    } catch {
        return '';
    }
}

function camelToKebabCase(value: string): string {
    return value.replace(/[A-Z]/g, character => `-${character.toLowerCase()}`);
}


function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
