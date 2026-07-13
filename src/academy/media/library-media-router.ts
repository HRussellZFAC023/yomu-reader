/**
 * Privacy-safe routing for the authorised Japanese-library corpus.
 *
 * Interface invariants:
 * - callers provide only opaque Academy asset ids and reviewed metadata;
 * - the resolver receives no source path, filename, hash, or source bytes;
 * - returned media is session-authenticated or short-lived signed delivery;
 * - signed URLs are ephemeral runtime values and must not be persisted or logged;
 * - content/readiness gaps are explicit destinations, not silent fallbacks.
 *
 * Invalid records or unsafe resolver output throw. Transient resolver failures
 * propagate so callers can retry without turning an outage into a content verdict.
 */
import {
    cloneRegion,
    normalizeMediaType,
    unsupportedReasonFor,
    validateResolvedAsset,
    validateResource,
    validateTrustedOrigins,
} from './library-media-privacy';
import type {
    LibraryAssetPurpose,
    LibraryAssetResolver,
    LibraryManualReviewReason,
    LibraryMediaDestination,
    LibraryMediaRouter,
    LibraryMediaRouterConfig,
    LibraryTextTrackRef,
    LibraryUnsupportedReason,
    PrivacySafeLibraryResource,
    ResolvedLibraryAsset,
    RoutedLibraryTextTrack,
} from './library-media-types';

export type {
    LibraryAnkiMetadata,
    LibraryAssetPurpose,
    LibraryAssetResolutionRequest,
    LibraryAssetResolver,
    LibraryManualReviewReason,
    LibraryMediaDestination,
    LibraryMediaRouter,
    LibraryMediaRouterConfig,
    LibraryResourceKind,
    LibraryRoutingReadiness,
    LibrarySourceRegion,
    LibraryTextTrackRef,
    LibraryUnsupportedReason,
    PrivacySafeLibraryResource,
    ResolvedLibraryAsset,
    RoutedLibraryTextTrack,
} from './library-media-types';

export function createLibraryMediaRouter(config: LibraryMediaRouterConfig): LibraryMediaRouter {
    if (!config || typeof config.resolver?.resolve !== 'function') {
        throw new TypeError('Library media routing needs an asset resolver.');
    }
    const trustedOrigins = validateTrustedOrigins(config.trustedOrigins ?? []);

    return {
        async route(resource) {
            validateResource(resource);
            if (resource.readiness.state === 'manual-review') return manualReview(resource, resource.readiness.reason);
            if (resource.readiness.state === 'unsupported') return unsupported(resource, resource.readiness.reason);

            const mediaType = normalizeMediaType(resource.mediaType);
            if (resource.kind === 'video') {
                if (!mediaType.startsWith('video/')) return manualReview(resource, 'content-type-mismatch');
                const [video, textTracks] = await Promise.all([
                    resolve(config.resolver, resource.assetId, 'video', trustedOrigins),
                    resolveTextTracks(config.resolver, resource.textTracks ?? [], 'subtitle', trustedOrigins),
                ]);
                return {
                    kind: 'embedded-yomu-video',
                    assetId: resource.assetId,
                    video,
                    textTracks,
                    subtitleState: textTracks.length ? 'paired' : 'unpaired',
                };
            }
            if (resource.kind === 'document') {
                if (mediaType !== 'application/pdf') return manualReview(resource, 'content-type-mismatch');
                return {
                    kind: 'yomu-pdf-ocr',
                    assetId: resource.assetId,
                    document: await resolve(config.resolver, resource.assetId, 'pdf', trustedOrigins),
                    ...(resource.sourceRegion ? { sourceRegion: cloneRegion(resource.sourceRegion) } : {}),
                    ocr: 'available',
                };
            }
            if (resource.kind === 'audio') {
                if (!mediaType.startsWith('audio/')) return manualReview(resource, 'content-type-mismatch');
                const [audio, textTracks] = await Promise.all([
                    resolve(config.resolver, resource.assetId, 'audio', trustedOrigins),
                    resolveTextTracks(config.resolver, resource.textTracks ?? [], 'transcript', trustedOrigins),
                ]);
                return {
                    kind: 'academy-listening',
                    assetId: resource.assetId,
                    audio,
                    textTracks,
                    transcriptState: textTracks.length ? 'paired' : 'unpaired',
                };
            }
            if (resource.kind === 'image') {
                if (!mediaType.startsWith('image/')) return manualReview(resource, 'content-type-mismatch');
                return {
                    kind: 'source-region',
                    assetId: resource.assetId,
                    image: await resolve(config.resolver, resource.assetId, 'image', trustedOrigins),
                    ...(resource.sourceRegion ? { sourceRegion: cloneRegion(resource.sourceRegion) } : {}),
                };
            }
            if (resource.kind === 'anki-archive' || resource.kind === 'anki-legacy-database') {
                if (!resource.anki) return manualReview(resource, 'metadata-incomplete');
                return {
                    kind: 'anki-import-metadata',
                    assetId: resource.assetId,
                    metadata: { ...resource.anki },
                    packageDelivery: 'explicit-import-adapter-required',
                };
            }
            if (resource.kind === 'subtitle') return manualReview(resource, 'pairing-required');
            return unsupported(resource, unsupportedReasonFor(resource.kind));
        },
    };
}

async function resolveTextTracks(
    resolver: LibraryAssetResolver,
    tracks: readonly LibraryTextTrackRef[],
    purpose: 'subtitle' | 'transcript',
    trustedOrigins: ReadonlySet<string>,
): Promise<readonly RoutedLibraryTextTrack[]> {
    return Promise.all(tracks.map(async track => ({
        assetId: track.assetId,
        mediaType: normalizeMediaType(track.mediaType),
        language: track.language.toLowerCase(),
        role: track.role,
        default: track.default === true,
        delivery: await resolve(resolver, track.assetId, purpose, trustedOrigins),
    })));
}

async function resolve(
    resolver: LibraryAssetResolver,
    assetId: string,
    purpose: LibraryAssetPurpose,
    trustedOrigins: ReadonlySet<string>,
): Promise<ResolvedLibraryAsset> {
    const delivery = await resolver.resolve({ assetId, purpose });
    validateResolvedAsset(delivery, trustedOrigins);
    return delivery.access === 'signed'
        ? { url: delivery.url, access: 'signed', expiresAt: delivery.expiresAt }
        : { url: delivery.url, access: 'academy-session' };
}

function manualReview(
    resource: PrivacySafeLibraryResource,
    reason: LibraryManualReviewReason,
): LibraryMediaDestination {
    return { kind: 'manual-review', assetId: resource.assetId, sourceKind: resource.kind, reason };
}

function unsupported(
    resource: PrivacySafeLibraryResource,
    reason: LibraryUnsupportedReason,
): LibraryMediaDestination {
    return { kind: 'unsupported', assetId: resource.assetId, sourceKind: resource.kind, reason };
}
