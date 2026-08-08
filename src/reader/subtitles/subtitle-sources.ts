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
    if (!url) return null;
    const rawLabel = track.label || track.srclang || track.getAttribute('aria-label') || '';
    const label = subtitleTrackSourceLabel(track, url, pageTitle);
    return {
        url,
        label,
        language: normalizeSubtitleLanguage(track.srclang || inferSubtitleLanguage(rawLabel, url) || inferSubtitleLanguage(label, url)),
        sourceKey: pageSubtitleSourceKey('track', url),
    };
}

function isSubtitleTrackElement(track: HTMLTrackElement): boolean {
    return !track.kind || /subtitles|captions/i.test(track.kind);
}

function subtitleTrackSourceUrl(track: HTMLTrackElement): string {
    return subtitleSourceUrl(track.src || track.getAttribute('src') || '');
}

function subtitleTrackSourceLabel(track: HTMLTrackElement, url: string, pageTitle: string): string {
    return subtitleSourceLabel(track.label || track.srclang || track.getAttribute('aria-label') || '', url, {
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
    const url = subtitleSourceUrl(link.href || link.getAttribute('href') || '');
    if (!url) return null;
    const rawLabel = linkSubtitleLabelText(link);
    const label = subtitleSourceLabel(rawLabel, url, { pageTitle });
    return {
        url,
        label,
        language: normalizeSubtitleLanguage(link.lang || inferSubtitleLanguage(rawLabel, url) || inferSubtitleLanguage(label, url)),
        sourceKey: pageSubtitleSourceKey('link', url),
    };
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
    const visit = (current: unknown, path: string[]): void => {
        const decoded = subtitleConfigTaggedValue(current);
        if (decoded !== current) {
            visit(decoded, path);
            return;
        }
        if (Array.isArray(current)) {
            for (const item of current) visit(item, path);
            return;
        }
        if (!current || typeof current !== 'object') return;
        if (seenObjects.has(current)) return;
        seenObjects.add(current);
        const record = current as Record<string, unknown>;
        const source = subtitleSourceFromConfigRecord(record, pageTitle, keyPrefix, sources.length, path);
        if (source) sources.push(source);
        for (const [key, child] of Object.entries(record)) visit(child, [...path, key]);
    };
    visit(value, []);
    return sources;
}

function subtitleSourceFromConfigRecord(
    record: Record<string, unknown>,
    pageTitle: string,
    keyPrefix: string,
    index: number,
    path: string[],
): PageSubtitleSource | null {
    const url = subtitleConfigRecordUrl(record);
    if (!url || !isSubtitleConfigRecord(record, path)) return null;
    const rawLabel = subtitleConfigRecordLabel(record);
    const label = subtitleConfigSourceLabel(rawLabel, url, pageTitle);
    return {
        url,
        label,
        language: normalizeSubtitleLanguage(subtitleConfigRecordLanguage(record) || inferSubtitleLanguage(rawLabel, url) || inferSubtitleLanguage(label, url)),
        sourceKey: pageSubtitleSourceKey(`${keyPrefix}-${index}`, url),
    };
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
    if (!Array.isArray(value) || value.length !== 2) return value;
    if (typeof value[0] !== 'number' && typeof value[0] !== 'string') return value;
    return value[1];
}

function linkSubtitleLabelText(link: HTMLAnchorElement): string {
    return link.getAttribute('download')
        || link.getAttribute('aria-label')
        || link.getAttribute('title')
        || link.textContent
        || '';
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
    return cleaned || filename || 'Subtitle file';
}

function shouldUsePageTitleForGeneric(cleaned: string, options: { pageTitle?: string; preferPageTitleForGeneric?: boolean }): boolean {
    if (!options.pageTitle) return false;
    return !cleaned || Boolean(options.preferPageTitleForGeneric && cleaned);
}

function specificSubtitleLabel(cleaned: string, filename: string): string {
    if (cleaned && !isGenericSubtitleLabel(cleaned)) return cleaned;
    if (filename && !isGenericSubtitleLabel(filename)) return filename;
    return '';
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
