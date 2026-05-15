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
    const label = subtitleTrackSourceLabel(track, url, pageTitle);
    return {
        url,
        label,
        language: normalizeSubtitleLanguage(track.srclang || inferSubtitleLanguage(label, url)),
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
    const label = subtitleSourceLabel(linkSubtitleLabelText(link), url, { pageTitle });
    return {
        url,
        label,
        language: normalizeSubtitleLanguage(link.lang || inferSubtitleLanguage(label, url)),
        sourceKey: pageSubtitleSourceKey('link', url),
    };
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
    const candidate = doc.querySelector<HTMLMetaElement>('meta[property="og:title"], meta[name="twitter:title"]')?.content
        || doc.querySelector<HTMLElement>('h1')?.textContent
        || doc.title
        || '';
    return cleanSubtitleTitle(candidate);
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

function isGenericSubtitleLabel(value: string): boolean {
    return /^(?:vtt|srt|ass|ssa|subtitles?|captions?|cc|closed captions?|日本語|英語|japanese|english|native|ja(?:panese)?|en(?:glish)?)$/i.test(value.trim());
}

function inferSubtitleLanguage(label: string, url: string): string | undefined {
    const text = `${label} ${url}`;
    if (/(^|[\s._/-])(ja|jp|jpn|japanese|日本語)(?=$|[\s._/-])/i.test(text) || /[\u3040-\u30ff\u3400-\u9fff]/u.test(label)) return 'ja';
    if (/(^|[\s._/-])(en|eng|english|native)(?=$|[\s._/-])/i.test(text)) return 'en';
    return undefined;
}

export function normalizeSubtitleLanguage(language: string | undefined): string | undefined {
    if (!language) return undefined;
    if (/^(ja|jp|jpn)(?:-|$)/i.test(language)) return 'ja';
    if (/^(en|eng)(?:-|$)/i.test(language)) return 'en';
    return language;
}

function pageSubtitleSourceKey(kind: 'link' | 'track', url: string): string {
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
