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

interface StructuredImageMetrics {
    invAspectRatio: number;
    usedWidth: number;
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

export function glossaryValueToText(value: unknown): string {
    const primitiveText = primitiveGlossaryText(value);
    if (primitiveText !== undefined) return primitiveText;
    if (Array.isArray(value)) return value.map(glossaryValueToText).filter(Boolean).join(' ');
    return isRecord(value) ? glossaryRecordToText(value) : '';
}

function primitiveGlossaryText(value: unknown): string | undefined {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return undefined;
}

function glossaryRecordToText(record: Record<string, unknown>): string {
    if (typeof record.text === 'string') return record.text;
    if ('content' in record) return glossaryValueToText(record.content);
    const values = glossaryRecordTextValues(record);
    if (values.length) return values.join(' ');
    if ('path' in record) return glossaryPathRecordText(record);
    return '';
}

function glossaryPathRecordText(record: Record<string, unknown>): string {
    return String(record.description || record.alt || '');
}

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
    if (typeof record.text === 'string') return escapeHtml(record.text);
    if (record.type === 'structured-content') return renderStructuredContent(record, context);
    if (isStructuredImageRecord(record)) return renderStructuredImage(record, context.dictionary);
    if (record.type === 'text' && 'content' in record) return renderGlossaryValue(record.content, context);
    return renderTaggedGlossaryRecord(record, context);
}

function renderStructuredContent(record: Record<string, unknown>, context: StructuredRenderContext): string {
    const dictionaryAttr = context.dictionary ? ` data-dictionary="${escapeHtml(context.dictionary)}"` : '';
    return `<span class="structured-content"${dictionaryAttr}>${renderGlossaryValue(record.content, context)}</span>`;
}

function renderTaggedGlossaryRecord(record: Record<string, unknown>, context: StructuredRenderContext): string {
    const tag = structuredRecordTag(record);
    if (!tag) return renderRecordValues(record, context);
    if (tag === 'a') return renderStructuredLink(record, context);
    if (tag === 'img') return renderStructuredImage(record, context.dictionary);

    const content = taggedRecordContent(record, tag, context);
    if (tag === 'table') return renderStructuredTable(record, content, context.dictionary);
    if (STRUCTURED_CONTENT_TAGS.has(tag)) return renderStructuredElement(record, tag, content, context.dictionary);
    return structuredFallbackContent(record, content);
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
    const attrs: string[] = [];
    for (const [key, value] of Object.entries(record)) {
        if (!key.startsWith('data-') || (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')) continue;
        attrs.push(` ${key}="${escapeHtml(String(value))}"`);
    }
    return attrs.join('');
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
}

function structuredLinkModel(record: Record<string, unknown>, context: StructuredRenderContext): StructuredLinkModel {
    const rawHref = typeof record.href === 'string' ? record.href : '';
    const searchReference = context.internalSearchLinks ? parseStructuredSearchReference(rawHref) : null;
    const href = searchReference ? '#jpdb-reader-dictionary-lookup' : normalizeStructuredHref(rawHref);
    return {
        href,
        external: href ? !href.startsWith(locationOrigin()) && !href.startsWith('#') : false,
        searchReference,
    };
}

function structuredLinkAttrs(link: StructuredLinkModel, dictionary: string, lang: unknown): string {
    return [
        ' class="gloss-link"',
        ` data-external="${link.external}"`,
        dictionaryAttribute(dictionary),
        searchReferenceQueryAttribute(link),
        searchReferenceReadingAttribute(link),
        hrefAttribute(link.href),
        externalLinkAttributes(link.external),
        langAttribute(lang),
    ].join('');
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
    const metrics = structuredImageMetrics(record);
    return `${renderStructuredImageLink(record, dictionary, path, title, metrics)}${renderStructuredImageDescription(description)}`;
}

function renderStructuredImageLink(record: Record<string, unknown>, dictionary: string, path: string, title: string, metrics: StructuredImageMetrics): string {
    return `<span${renderStructuredImageAttributes(record, dictionary, path)}>${renderStructuredImageContainer(record, title, metrics)}<span class="gloss-image-link-text">Image</span></span>`;
}

function renderStructuredImageAttributes(record: Record<string, unknown>, dictionary: string, path: string): string {
    const dictionaryAttr = dictionary ? ` data-dictionary="${escapeHtml(dictionary)}"` : '';
    return [
        ` class="gloss-image-link"`,
        dictionaryAttr,
        path ? ` data-path="${escapeHtml(path)}"` : '',
        ` data-image-load-state="unloaded"`,
        ` data-has-aspect-ratio="true"`,
        ` data-image-rendering="${escapeHtml(structuredImageRendering(record))}"`,
        ` data-appearance="${escapeHtml(String(record.appearance || 'auto'))}"`,
        structuredImageBooleanAttribute(record, 'background', true),
        structuredImageBooleanAttribute(record, 'collapsed', false),
        structuredImageBooleanAttribute(record, 'collapsible', true),
        typeof record.verticalAlign === 'string' ? ` data-vertical-align="${escapeHtml(record.verticalAlign)}"` : '',
        typeof record.sizeUnits === 'string' ? ` data-size-units="${escapeHtml(record.sizeUnits)}"` : '',
    ].join('');
}

function structuredImageBooleanAttribute(record: Record<string, unknown>, key: string, fallback: boolean): string {
    const value = typeof record[key] === 'boolean' ? record[key] : fallback;
    return ` data-${kebabCase(key)}="${value}"`;
}

function kebabCase(value: string): string {
    return value.replace(/[A-Z]/g, character => `-${character.toLowerCase()}`);
}

function renderStructuredImageContainer(record: Record<string, unknown>, title: string, metrics: StructuredImageMetrics): string {
    const containerTitle = title ? ` title="${escapeHtml(title)}"` : '';
    return `<span class="gloss-image-container" style="${escapeHtml(renderStructuredImageContainerStyle(record, metrics.usedWidth))}"${containerTitle}>${renderStructuredImageFrame(metrics)}</span>`;
}

function renderStructuredImageContainerStyle(record: Record<string, unknown>, usedWidth: number): string {
    return [
        `width:${formatCssNumber(usedWidth)}em;`,
        typeof record.border === 'string' ? `border:${record.border};` : '',
        typeof record.borderRadius === 'string' ? `border-radius:${record.borderRadius};` : '',
    ].join('');
}

function renderStructuredImageFrame(metrics: StructuredImageMetrics): string {
    return `<span class="gloss-image-sizer" style="padding-top:${formatCssNumber(metrics.invAspectRatio * 100)}%;"></span><span class="gloss-image-background"></span><span class="gloss-image-container-overlay"></span>`;
}

function renderStructuredImageDescription(description: string): string {
    return description ? `<span class="gloss-image-description">${escapeHtml(description)}</span>` : '';
}

function structuredImageDescription(record: Record<string, unknown>): string {
    if (typeof record.description === 'string') return record.description;
    return typeof record.alt === 'string' ? record.alt : '';
}

function structuredImageMetrics(record: Record<string, unknown>): StructuredImageMetrics {
    const preferredWidth = numericRecordValue(record, 'preferredWidth');
    const preferredHeight = numericRecordValue(record, 'preferredHeight');
    const { width, height } = structuredImageNaturalSize(record, preferredWidth, preferredHeight);
    const invAspectRatio = height > 0 && width > 0 ? height / width : 1;
    const usedWidth = structuredImageUsedWidth(width, invAspectRatio, preferredWidth, preferredHeight);
    return { invAspectRatio, usedWidth };
}

function structuredImageNaturalSize(record: Record<string, unknown>, preferredWidth: number | undefined, preferredHeight: number | undefined): { width: number; height: number } {
    return {
        width: preferredWidth ?? numericRecordValue(record, 'width') ?? 100,
        height: preferredHeight ?? numericRecordValue(record, 'height') ?? 100,
    };
}

function structuredImageUsedWidth(width: number, invAspectRatio: number, preferredWidth: number | undefined, preferredHeight: number | undefined): number {
    return preferredWidth ?? (preferredHeight ? preferredHeight / invAspectRatio : width);
}

function structuredImageRendering(record: Record<string, unknown>): string {
    return String(record.imageRendering || (record.pixelated ? 'pixelated' : 'auto'));
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

function glossaryRecordTextValues(record: Record<string, unknown>): string[] {
    const textKeys = new Set(['text', 'content', 'description', 'alt', 'title']);
    const values: string[] = [];
    for (const [key, childValue] of Object.entries(record)) {
        if (!textKeys.has(key) && !key.startsWith('data-')) continue;
        const childText = glossaryValueToText(childValue);
        if (childText) values.push(childText);
    }
    return values;
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
