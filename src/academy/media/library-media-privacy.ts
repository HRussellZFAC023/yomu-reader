import type {
    LibraryAnkiMetadata,
    LibraryResourceKind,
    LibraryRoutingReadiness,
    LibrarySourceRegion,
    LibraryUnsupportedReason,
    PrivacySafeLibraryResource,
    ResolvedLibraryAsset,
} from './library-media-types';

const OPAQUE_ASSET_ID = /^lib_[a-z0-9_-]{16,80}$/u;
const LANGUAGE_TAG = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/iu;
const MAX_TEXT_TRACKS = 32;
const INTERNAL_URL_ORIGIN = 'https://academy.invalid';
const RESOURCE_KINDS = new Set<LibraryResourceKind>([
    'document', 'word-document', 'spreadsheet', 'presentation', 'audio', 'video',
    'image', 'subtitle', 'ebook', 'anki-legacy-database', 'anki-archive', 'archive',
    'web', 'web-dependency', 'data', 'text', 'interactive', 'build-artifact', 'font',
    'executable', 'source-code', 'config', 'finder-metadata', 'playlist', 'disc-image',
    'unsupported-archive', 'unknown',
]);
const MANUAL_REASONS = new Set([
    'rights-review', 'content-type-mismatch', 'pairing-required', 'transcript-required',
    'metadata-incomplete', 'source-region-required', 'format-review',
    'corrupt-or-encrypted', 'human-review',
]);
const UNSUPPORTED_REASONS = new Set([
    'unsupported-kind', 'unsupported-format', 'excluded-by-policy', 'executable',
    'source-code', 'archive-reader-unavailable', 'interactive-runtime-unavailable',
]);
const SUBTITLE_MEDIA_TYPES = new Set([
    'application/x-subrip', 'text/plain', 'text/srt', 'text/vtt', 'text/x-ass', 'text/x-ssa',
]);

export function validateResource(resource: PrivacySafeLibraryResource): void {
    if (!resource || typeof resource !== 'object') throw new TypeError('Library resource must be an object.');
    requireOpaqueAssetId(resource.assetId, 'resource.assetId');
    if (!RESOURCE_KINDS.has(resource.kind)) throw new TypeError(`Unsupported library resource kind: ${resource.kind}`);
    requireText(resource.mediaType, 'resource.mediaType');
    validateReadiness(resource.readiness);

    const tracks = resource.textTracks ?? [];
    if (!Array.isArray(tracks) || tracks.length > MAX_TEXT_TRACKS) {
        throw new TypeError(`Library resources support at most ${MAX_TEXT_TRACKS} text tracks.`);
    }
    const trackIds = new Set<string>();
    let defaultCount = 0;
    for (const track of tracks) {
        requireOpaqueAssetId(track.assetId, 'textTrack.assetId');
        if (track.assetId === resource.assetId) throw new TypeError('A text track cannot reuse its parent asset id.');
        if (trackIds.has(track.assetId)) throw new TypeError(`Duplicate text-track asset id: ${track.assetId}`);
        trackIds.add(track.assetId);
        const mediaType = normalizeMediaType(track.mediaType);
        if (!SUBTITLE_MEDIA_TYPES.has(mediaType)) throw new TypeError(`Unsupported text-track media type: ${mediaType}`);
        if (!LANGUAGE_TAG.test(track.language)) throw new TypeError(`Invalid text-track language: ${track.language}`);
        if (!['subtitles', 'captions', 'transcript'].includes(track.role)) throw new TypeError(`Invalid text-track role: ${track.role}`);
        if (track.default === true) defaultCount += 1;
        else if (track.default !== undefined && track.default !== false) throw new TypeError('textTrack.default must be boolean.');
    }
    if (defaultCount > 1) throw new TypeError('Only one text track may be the default.');
    if (tracks.length && resource.kind !== 'video' && resource.kind !== 'audio') {
        throw new TypeError('Only video and audio resources may declare text tracks.');
    }
    if (resource.sourceRegion) validateRegion(resource.sourceRegion);
    if (resource.anki) validateAnkiMetadata(resource.anki);
    if (resource.anki && resource.kind !== 'anki-archive' && resource.kind !== 'anki-legacy-database') {
        throw new TypeError('Anki metadata may only be attached to Anki resources.');
    }
    if (resource.kind === 'anki-legacy-database' && resource.anki?.format !== 'legacy-database') {
        throw new TypeError('Legacy Anki database resources need legacy-database metadata.');
    }
    if (resource.kind === 'anki-archive' && resource.anki?.format === 'legacy-database') {
        throw new TypeError('Anki archives need apkg or colpkg metadata.');
    }
}

export function validateResolvedAsset(delivery: ResolvedLibraryAsset, trustedOrigins: ReadonlySet<string>): void {
    if (!delivery || typeof delivery !== 'object') throw new TypeError('Library asset resolver returned no delivery.');
    if (delivery.access !== 'academy-session' && delivery.access !== 'signed') {
        throw new TypeError('Library asset delivery must be session-authenticated or signed.');
    }
    validateResolvedUrl(delivery.url, trustedOrigins);
    if (delivery.access === 'signed'
        && (typeof delivery.expiresAt !== 'string' || !Number.isFinite(Date.parse(delivery.expiresAt)))) {
        throw new TypeError('Signed library asset delivery needs a valid expiry time.');
    }
}

export function validateTrustedOrigins(values: readonly string[]): ReadonlySet<string> {
    const origins = new Set<string>();
    for (const value of values) {
        let parsed: URL;
        try {
            parsed = new URL(value);
        } catch {
            throw new TypeError(`Invalid trusted library media origin: ${value}`);
        }
        if (parsed.protocol !== 'https:' || parsed.origin !== value.replace(/\/$/u, '') || parsed.pathname !== '/') {
            throw new TypeError(`Trusted library media origins must be bare HTTPS origins: ${value}`);
        }
        origins.add(parsed.origin);
    }
    return origins;
}

export function cloneRegion(region: LibrarySourceRegion): LibrarySourceRegion {
    return {
        ...(region.page === undefined ? {} : { page: region.page }),
        ...(region.bbox ? { bbox: { ...region.bbox } } : {}),
    };
}

export function normalizeMediaType(value: string): string {
    return requireText(value, 'mediaType').split(';', 1)[0]!.trim().toLowerCase();
}

export function unsupportedReasonFor(kind: LibraryResourceKind): LibraryUnsupportedReason {
    if (kind === 'executable') return 'executable';
    if (kind === 'source-code') return 'source-code';
    if (kind === 'archive' || kind === 'unsupported-archive') return 'archive-reader-unavailable';
    if (kind === 'interactive') return 'interactive-runtime-unavailable';
    if (kind === 'build-artifact' || kind === 'font' || kind === 'config' || kind === 'finder-metadata') {
        return 'excluded-by-policy';
    }
    return 'unsupported-kind';
}

function validateReadiness(readiness: LibraryRoutingReadiness): void {
    if (!readiness || typeof readiness !== 'object') throw new TypeError('Library resource readiness is required.');
    if (readiness.state === 'ready') return;
    if (readiness.state === 'manual-review' && MANUAL_REASONS.has(readiness.reason)) return;
    if (readiness.state === 'unsupported' && UNSUPPORTED_REASONS.has(readiness.reason)) return;
    throw new TypeError('Library resource readiness is invalid.');
}

function validateRegion(region: LibrarySourceRegion): void {
    if (region.page !== undefined && (!Number.isSafeInteger(region.page) || region.page < 1)) {
        throw new TypeError('Source-region pages are one-based positive integers.');
    }
    if (!region.bbox) return;
    const { x, y, width, height, unit } = region.bbox;
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
        throw new TypeError('Source-region bounding boxes need finite coordinates and positive size.');
    }
    if (!['normalized', 'points', 'pixels'].includes(unit)) throw new TypeError(`Invalid source-region unit: ${unit}`);
    if (unit === 'normalized' && (x < 0 || y < 0 || x + width > 1 || y + height > 1)) {
        throw new TypeError('Normalized source regions must fit within the source surface.');
    }
}

function validateAnkiMetadata(metadata: LibraryAnkiMetadata): void {
    if (!['apkg', 'colpkg', 'legacy-database'].includes(metadata.format)) throw new TypeError(`Invalid Anki format: ${metadata.format}`);
    if (!['anki2', 'anki21', 'unknown'].includes(metadata.schema)) throw new TypeError(`Invalid Anki schema: ${metadata.schema}`);
    const counts = [metadata.deckCount, metadata.noteCount, metadata.cardCount, metadata.mediaCount];
    if (counts.some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0))) {
        throw new TypeError('Anki counts must be non-negative integers.');
    }
}

function validateResolvedUrl(raw: string, trustedOrigins: ReadonlySet<string>): void {
    const value = requireText(raw, 'resolvedAsset.url');
    if (value.startsWith('//')) throw new TypeError('Protocol-relative library media URLs are not allowed.');
    const relative = value.startsWith('/');
    let parsed: URL;
    try {
        parsed = new URL(value, INTERNAL_URL_ORIGIN);
    } catch {
        throw new TypeError('Library asset resolver returned an invalid URL.');
    }
    if (!relative && (parsed.protocol !== 'https:' || !trustedOrigins.has(parsed.origin))) {
        throw new TypeError(`Untrusted library media origin: ${parsed.origin}`);
    }
    if (parsed.username || parsed.password) throw new TypeError('Library media URLs cannot contain credentials.');
    if (parsed.hash) throw new TypeError('Library media URLs cannot contain fragments.');
    for (const key of parsed.searchParams.keys()) {
        if (/^(?:absolute_?path|file(?:name)?|path|source(?:_?path)?)$/iu.test(key)) {
            throw new TypeError('Library media URLs cannot expose source-path parameters.');
        }
    }
    assertNoPrivatePath(value);
}

function assertNoPrivatePath(value: string): void {
    let decoded = value;
    for (let index = 0; index < 2; index += 1) {
        try {
            const next = decodeURIComponent(decoded);
            if (next === decoded) break;
            decoded = next;
        } catch {
            break;
        }
    }
    if (decoded.includes('\0')
        || /(?:^|[?&#=])file:\/{2,3}/iu.test(decoded)
        || /(?:^|[?&#=])\/(?:Users|home\/[^/]+|Volumes|private|var\/(?:folders|tmp)|tmp|etc|opt|srv|mnt)\//iu.test(decoded)
        || /(?:^|[?&#=])[a-z]:[\\/]/iu.test(decoded)
        || decoded.split(/[?#]/u, 1)[0]?.split('/').includes('..')) {
        throw new TypeError('Library media URL exposes or contains a private filesystem path.');
    }
}

function requireOpaqueAssetId(value: string, label: string): string {
    if (typeof value !== 'string' || !OPAQUE_ASSET_ID.test(value)) {
        throw new TypeError(`${label} must be an opaque lib_ asset id.`);
    }
    return value;
}

function requireText(value: string, label: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be non-empty.`);
    return value.trim();
}
