import {
    inferSubtitleLanguage,
    isGenericSubtitleLabel,
    normalizeSubtitleLanguage,
} from './subtitle-language';

export interface PageSubtitleSource {
    url: string;
    label: string;
    language?: string;
    sourceKey: string;
}

interface PageSubtitleSourceDescriptor {
    url: string;
    label: string;
    rawLabel: string;
    explicitLanguage?: string;
    sourceKind: string;
}

export function collectPageSubtitleSources(root: ParentNode = document): PageSubtitleSource[] {
    const pageTitle = pageSubtitleTitle(root);
    return dedupeSubtitleSources([
        ...collectTrackSubtitleSources(root, pageTitle),
        ...collectLinkSubtitleSources(root, pageTitle),
        ...collectConfigSubtitleSources(root, pageTitle),
    ]);
}

function collectTrackSubtitleSources(root: ParentNode, pageTitle: string): PageSubtitleSource[] {
    return Array.from(root.querySelectorAll<HTMLTrackElement>('track[src]'))
        .map(track => subtitleSourceFromTrack(track, pageTitle))
        .filter((source): source is PageSubtitleSource => Boolean(source));
}

function subtitleSourceFromTrack(track: HTMLTrackElement, pageTitle: string): PageSubtitleSource | null {
    if (!isSubtitleTrackElement(track)) return null;
    const url = subtitleTrackSourceUrl(track);
    const rawLabel = firstSubtitleText([track.label, track.srclang, track.getAttribute('aria-label')]);
    return pageSubtitleSource({
        url,
        rawLabel,
        label: subtitleTrackSourceLabel(track, url, pageTitle),
        explicitLanguage: track.srclang,
        sourceKind: 'track',
    });
}

function isSubtitleTrackElement(track: HTMLTrackElement): boolean {
    return !track.kind || /subtitles|captions/i.test(track.kind);
}

function subtitleTrackSourceUrl(track: HTMLTrackElement): string {
    return subtitleSourceUrl(firstSubtitleText([track.src, track.getAttribute('src')]));
}

function subtitleTrackSourceLabel(track: HTMLTrackElement, url: string, pageTitle: string): string {
    return subtitleSourceLabel(firstSubtitleText([track.label, track.srclang, track.getAttribute('aria-label')]), url, {
        pageTitle,
        preferPageTitleForGeneric: true,
    });
}

function collectLinkSubtitleSources(root: ParentNode, pageTitle: string): PageSubtitleSource[] {
    return Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]'))
        .map(link => subtitleSourceFromLink(link, pageTitle))
        .filter((source): source is PageSubtitleSource => Boolean(source));
}

function subtitleSourceFromLink(link: HTMLAnchorElement, pageTitle: string): PageSubtitleSource | null {
    const url = subtitleSourceUrl(firstSubtitleText([link.href, link.getAttribute('href')]));
    const rawLabel = linkSubtitleLabelText(link);
    return pageSubtitleSource({
        url,
        rawLabel,
        label: subtitleSourceLabel(rawLabel, url, { pageTitle }),
        explicitLanguage: link.lang,
        sourceKind: 'link',
    });
}

function collectConfigSubtitleSources(root: ParentNode, pageTitle: string): PageSubtitleSource[] {
    return subtitleConfigElements(root)
        .flatMap((element, index) => subtitleSourcesFromConfigElement(element, pageTitle, index));
}

function subtitleConfigElements(root: ParentNode): Element[] {
    return Array.from(root.querySelectorAll([
        '[props]',
        '[data-props]',
        '[data-tracks]',
        '[data-subtitles]',
        '[data-captions]',
        '[data-config]',
        '[data-player]',
        '[data-setup]',
        'script[type="application/json"]',
        'script[type="application/ld+json"]',
    ].join(',')));
}

function subtitleSourcesFromConfigElement(element: Element, pageTitle: string, elementIndex: number): PageSubtitleSource[] {
    const texts = [
        ...subtitleConfigAttributeTexts(element),
        element instanceof HTMLScriptElement ? element.textContent ?? '' : '',
    ].filter(text => text && hasSubtitleSourceText(text));
    return texts.flatMap((text, textIndex) => subtitleSourcesFromConfigText(text, pageTitle, `config-${elementIndex}-${textIndex}`));
}

function subtitleConfigAttributeTexts(element: Element): string[] {
    return Array.from(element.attributes)
        .filter(attribute => subtitleConfigAttributeName(attribute.name) || hasSubtitleSourceText(attribute.value))
        .map(attribute => attribute.value);
}

function subtitleConfigAttributeName(name: string): boolean {
    return /^(?:props|data-(?:props|tracks|subtitles?|captions?|config|player|setup|sources?))$/i.test(name);
}

function hasSubtitleSourceText(text: string): boolean {
    return /\.(?:vtt|srt|ass|ssa)(?:$|[?#\s"'\\<>,\])}])/i.test(text);
}

function subtitleSourcesFromConfigText(text: string, pageTitle: string, keyPrefix: string): PageSubtitleSource[] {
    const parsed = parseSubtitleConfigJson(text);
    return parsed === undefined ? [] : subtitleSourcesFromConfigValue(parsed, pageTitle, keyPrefix);
}

function parseSubtitleConfigJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

function subtitleSourcesFromConfigValue(value: unknown, pageTitle: string, keyPrefix: string): PageSubtitleSource[] {
    const sources: PageSubtitleSource[] = [];
    const seenObjects = new Set<object>();
    const collect: SubtitleConfigCollector = { pageTitle, keyPrefix, sources, seenObjects };
    visitSubtitleConfigValue(value, [], collect);
    return sources;
}

interface SubtitleConfigCollector {
    pageTitle: string;
    keyPrefix: string;
    sources: PageSubtitleSource[];
    seenObjects: Set<object>;
}

function visitSubtitleConfigValue(current: unknown, path: string[], collect: SubtitleConfigCollector): void {
    const decoded = subtitleConfigTaggedValue(current);
    if (decoded !== current) return visitSubtitleConfigValue(decoded, path, collect);
    if (Array.isArray(current)) return visitSubtitleConfigArray(current, path, collect);
    const record = subtitleConfigObject(current);
    if (record) visitSubtitleConfigRecord(record, path, collect);
}

function visitSubtitleConfigArray(values: unknown[], path: string[], collect: SubtitleConfigCollector): void {
    values.forEach(value => visitSubtitleConfigValue(value, path, collect));
}

function visitSubtitleConfigRecord(record: Record<string, unknown>, path: string[], collect: SubtitleConfigCollector): void {
    if (collect.seenObjects.has(record)) return;
    collect.seenObjects.add(record);
    const source = subtitleSourceFromConfigRecord(record, collect.pageTitle, collect.keyPrefix, collect.sources.length, path);
    if (source) collect.sources.push(source);
    Object.entries(record).forEach(([key, child]) => visitSubtitleConfigValue(child, [...path, key], collect));
}

function subtitleConfigObject(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function subtitleSourceFromConfigRecord(
    record: Record<string, unknown>,
    pageTitle: string,
    keyPrefix: string,
    index: number,
    path: string[],
): PageSubtitleSource | null {
    if (!isSubtitleConfigRecord(record, path)) return null;
    const url = subtitleConfigRecordUrl(record);
    const rawLabel = subtitleConfigRecordLabel(record);
    return pageSubtitleSource({
        url,
        rawLabel,
        label: subtitleConfigSourceLabel(rawLabel, url, pageTitle),
        explicitLanguage: subtitleConfigRecordLanguage(record),
        sourceKind: `${keyPrefix}-${index}`,
    });
}

function pageSubtitleSource(descriptor: PageSubtitleSourceDescriptor): PageSubtitleSource | null {
    if (!descriptor.url) return null;
    return {
        url: descriptor.url,
        label: descriptor.label,
        language: subtitleSourceLanguage(descriptor),
        sourceKey: pageSubtitleSourceKey(descriptor.sourceKind, descriptor.url),
    };
}

function subtitleSourceLanguage(descriptor: PageSubtitleSourceDescriptor): string | undefined {
    const inferred = [
        descriptor.explicitLanguage,
        inferSubtitleLanguage(descriptor.rawLabel, descriptor.url),
        inferSubtitleLanguage(descriptor.label, descriptor.url),
    ].find((language): language is string => Boolean(language));
    return normalizeSubtitleLanguage(inferred);
}

function subtitleConfigRecordUrl(record: Record<string, unknown>): string {
    for (const key of ['src', 'file', 'url', 'href']) {
        const value = subtitleConfigString(record[key]);
        const url = value ? subtitleSourceUrl(value) : '';
        if (url) return url;
    }
    return '';
}

function subtitleConfigRecordLabel(record: Record<string, unknown>): string {
    return subtitleConfigString(record.label)
        || subtitleConfigString(record.name)
        || subtitleConfigString(record.title)
        || subtitleConfigRecordLanguage(record);
}

function subtitleConfigRecordLanguage(record: Record<string, unknown>): string {
    return subtitleConfigString(record.language)
        || subtitleConfigString(record.lang)
        || subtitleConfigString(record.srclang);
}

function subtitleConfigSourceLabel(value: string, url: string, pageTitle: string): string {
    const cleaned = cleanSubtitleTitle(value);
    return cleaned || subtitleSourceLabel('', url, { pageTitle });
}

function isSubtitleConfigRecord(record: Record<string, unknown>, path: string[]): boolean {
    const context = `${path.join(' ')} ${Object.keys(record).join(' ')}`;
    if (/(?:thumbnail|thumb|preview|poster|image|sprite|chapter|manifest|playlist)/i.test(context)) return false;
    const type = [
        subtitleConfigString(record.kind),
        subtitleConfigString(record.type),
        subtitleConfigString(record.role),
        subtitleConfigString(record.trackKind),
    ].join(' ');
    return /(?:subtitles?|captions?|closed.?captions?|text.?tracks?)/i.test(`${context} ${type}`)
        || Boolean(subtitleConfigRecordLanguage(record) && subtitleConfigRecordLabel(record));
}

function subtitleConfigString(value: unknown): string {
    const decoded = subtitleConfigTaggedValue(value);
    return typeof decoded === 'string' ? decoded.trim() : '';
}

function subtitleConfigTaggedValue(value: unknown): unknown {
    if (!Array.isArray(value)) return value;
    if (value.length !== 2) return value;
    if (!['number', 'string'].includes(typeof value[0])) return value;
    return value[1];
}

function linkSubtitleLabelText(link: HTMLAnchorElement): string {
    return firstSubtitleText([
        link.getAttribute('download'),
        link.getAttribute('aria-label'),
        link.getAttribute('title'),
        link.textContent,
    ]);
}

function firstSubtitleText(values: readonly (string | null | undefined)[]): string {
    return values.find((value): value is string => Boolean(value)) ?? '';
}

function subtitleSourceUrl(value: string): string {
    const url = resolveSubtitleSourceUrl(value);
    return url && isSupportedSubtitleSourceUrl(url) ? url : '';
}

function dedupeSubtitleSources(sources: PageSubtitleSource[]): PageSubtitleSource[] {
    const seen = new Set<string>();
    return sources.filter(source => {
        const key = source.sourceKey;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function pageSubtitleTitle(root: ParentNode): string {
    const doc = root instanceof Document ? root : root.ownerDocument ?? document;
    return cleanSubtitleTitle(pageSubtitleTitleCandidate(doc));
}

function pageSubtitleTitleCandidate(doc: Document): string {
    return openGraphSubtitleTitle(doc) || headingSubtitleTitle(doc) || doc.title || '';
}

function openGraphSubtitleTitle(doc: Document): string {
    return doc.querySelector<HTMLMetaElement>('meta[property="og:title"], meta[name="twitter:title"]')?.content ?? '';
}

function headingSubtitleTitle(doc: Document): string {
    return doc.querySelector<HTMLElement>('h1')?.textContent ?? '';
}

function resolveSubtitleSourceUrl(value: string): string {
    try {
        const url = new URL(value, document.baseURI);
        if (!/^(https?|blob|data):$/i.test(url.protocol)) return '';
        return url.href;
    } catch {
        return '';
    }
}

function isSupportedSubtitleSourceUrl(value: string): boolean {
    try {
        const url = new URL(value, document.baseURI);
        const haystack = [
            decodeURIComponent(url.pathname),
            ...Array.from(url.searchParams.values()).map(part => decodeURIComponent(part)),
        ].join(' ');
        return /\.(vtt|srt|ass|ssa)(?:$|[?#\s])/i.test(`${haystack} `);
    } catch {
        return /\.(vtt|srt|ass|ssa)(?:$|[?#\s])/i.test(value);
    }
}

function subtitleSourceLabel(value: string, url: string, options: { pageTitle?: string; preferPageTitleForGeneric?: boolean } = {}): string {
    const cleaned = cleanSubtitleTitle(value);
    const filename = subtitleSourceFilenameLabel(url);
    const specific = specificSubtitleLabel(cleaned, filename);
    if (specific) return specific;
    return genericSubtitleLabel(cleaned, filename, options);
}

function genericSubtitleLabel(cleaned: string, filename: string, options: { pageTitle?: string; preferPageTitleForGeneric?: boolean }): string {
    if (shouldUsePageTitleForGeneric(cleaned, options)) return options.pageTitle ?? '';
    return firstSubtitleText([cleaned, filename, 'Subtitle file']);
}

function shouldUsePageTitleForGeneric(cleaned: string, options: { pageTitle?: string; preferPageTitleForGeneric?: boolean }): boolean {
    if (!options.pageTitle) return false;
    return !cleaned || Boolean(options.preferPageTitleForGeneric && cleaned);
}

function specificSubtitleLabel(cleaned: string, filename: string): string {
    return [cleaned, filename].find(isSpecificSubtitleLabel) ?? '';
}

function isSpecificSubtitleLabel(value: string): boolean {
    return Boolean(value) && !isGenericSubtitleLabel(value);
}

function subtitleSourceFilenameLabel(url: string): string {
    try {
        const parsed = new URL(url, document.baseURI);
        const filename = parsed.searchParams.get('filename') || parsed.pathname.split('/').pop() || '';
        return cleanSubtitleTitle(decodeURIComponent(filename).replace(/[_-]+/g, ' '));
    } catch {
        return '';
    }
}

function cleanSubtitleTitle(value: string): string {
    return value
        .replace(/\.(vtt|srt|ass|ssa)$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function pageSubtitleSourceKey(kind: string, url: string): string {
    return `${kind}:${normalizedSubtitleUrl(url)}`;
}

export function normalizedSubtitleUrl(value: string): string {
    try {
        const url = new URL(value, document.baseURI);
        url.searchParams.delete('v');
        url.hash = '';
        return url.href;
    } catch {
        return value;
    }
}

export function sameSubtitleUrl(a: string, b: string): boolean {
    return normalizedSubtitleUrl(a) === normalizedSubtitleUrl(b);
}
