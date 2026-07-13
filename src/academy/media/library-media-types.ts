export type LibraryResourceKind =
    | 'document'
    | 'word-document'
    | 'spreadsheet'
    | 'presentation'
    | 'audio'
    | 'video'
    | 'image'
    | 'subtitle'
    | 'ebook'
    | 'anki-legacy-database'
    | 'anki-archive'
    | 'archive'
    | 'web'
    | 'web-dependency'
    | 'data'
    | 'text'
    | 'interactive'
    | 'build-artifact'
    | 'font'
    | 'executable'
    | 'source-code'
    | 'config'
    | 'finder-metadata'
    | 'playlist'
    | 'disc-image'
    | 'unsupported-archive'
    | 'unknown';

export type LibraryManualReviewReason =
    | 'rights-review'
    | 'content-type-mismatch'
    | 'pairing-required'
    | 'transcript-required'
    | 'metadata-incomplete'
    | 'source-region-required'
    | 'format-review'
    | 'corrupt-or-encrypted'
    | 'human-review';

export type LibraryUnsupportedReason =
    | 'unsupported-kind'
    | 'unsupported-format'
    | 'excluded-by-policy'
    | 'executable'
    | 'source-code'
    | 'archive-reader-unavailable'
    | 'interactive-runtime-unavailable';

export type LibraryRoutingReadiness =
    | Readonly<{ state: 'ready' }>
    | Readonly<{ state: 'manual-review'; reason: LibraryManualReviewReason }>
    | Readonly<{ state: 'unsupported'; reason: LibraryUnsupportedReason }>;

export interface LibrarySourceRegion {
    readonly page?: number;
    readonly bbox?: Readonly<{
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
        readonly unit: 'normalized' | 'points' | 'pixels';
    }>;
}

export interface LibraryTextTrackRef {
    readonly assetId: string;
    readonly mediaType: string;
    readonly language: string;
    readonly role: 'subtitles' | 'captions' | 'transcript';
    readonly default?: boolean;
}

export interface LibraryAnkiMetadata {
    readonly format: 'apkg' | 'colpkg' | 'legacy-database';
    readonly schema: 'anki2' | 'anki21' | 'unknown';
    readonly deckCount?: number;
    readonly noteCount?: number;
    readonly cardCount?: number;
    readonly mediaCount?: number;
}

/** Source path, original filename, title, hash and bytes stay private. */
export interface PrivacySafeLibraryResource {
    readonly assetId: string;
    readonly kind: LibraryResourceKind;
    readonly mediaType: string;
    readonly readiness: LibraryRoutingReadiness;
    readonly textTracks?: readonly LibraryTextTrackRef[];
    readonly sourceRegion?: LibrarySourceRegion;
    readonly anki?: LibraryAnkiMetadata;
}

export type LibraryAssetPurpose = 'video' | 'subtitle' | 'pdf' | 'audio' | 'transcript' | 'image';

export interface LibraryAssetResolutionRequest {
    readonly assetId: string;
    readonly purpose: LibraryAssetPurpose;
}

export type ResolvedLibraryAsset =
    | Readonly<{ readonly url: string; readonly access: 'academy-session' }>
    | Readonly<{ readonly url: string; readonly access: 'signed'; readonly expiresAt: string }>;

export interface LibraryAssetResolver {
    resolve(request: LibraryAssetResolutionRequest): Promise<ResolvedLibraryAsset>;
}

export interface LibraryMediaRouterConfig {
    readonly resolver: LibraryAssetResolver;
    /** HTTPS origins explicitly trusted for resolved CDN URLs. */
    readonly trustedOrigins?: readonly string[];
}

export interface RoutedLibraryTextTrack {
    readonly assetId: string;
    readonly mediaType: string;
    readonly language: string;
    readonly role: LibraryTextTrackRef['role'];
    readonly default: boolean;
    readonly delivery: ResolvedLibraryAsset;
}

export type LibraryMediaDestination =
    | Readonly<{
        readonly kind: 'embedded-yomu-video';
        readonly assetId: string;
        readonly video: ResolvedLibraryAsset;
        readonly textTracks: readonly RoutedLibraryTextTrack[];
        readonly subtitleState: 'paired' | 'unpaired';
    }>
    | Readonly<{
        readonly kind: 'yomu-pdf-ocr';
        readonly assetId: string;
        readonly document: ResolvedLibraryAsset;
        readonly sourceRegion?: LibrarySourceRegion;
        readonly ocr: 'available';
    }>
    | Readonly<{
        readonly kind: 'academy-listening';
        readonly assetId: string;
        readonly audio: ResolvedLibraryAsset;
        readonly textTracks: readonly RoutedLibraryTextTrack[];
        readonly transcriptState: 'paired' | 'unpaired';
    }>
    | Readonly<{
        readonly kind: 'source-region';
        readonly assetId: string;
        readonly image: ResolvedLibraryAsset;
        readonly sourceRegion?: LibrarySourceRegion;
    }>
    | Readonly<{
        readonly kind: 'anki-import-metadata';
        readonly assetId: string;
        readonly metadata: LibraryAnkiMetadata;
        readonly packageDelivery: 'explicit-import-adapter-required';
    }>
    | Readonly<{
        readonly kind: 'manual-review';
        readonly assetId: string;
        readonly sourceKind: LibraryResourceKind;
        readonly reason: LibraryManualReviewReason;
    }>
    | Readonly<{
        readonly kind: 'unsupported';
        readonly assetId: string;
        readonly sourceKind: LibraryResourceKind;
        readonly reason: LibraryUnsupportedReason;
    }>;

export interface LibraryMediaRouter {
    route(resource: PrivacySafeLibraryResource): Promise<LibraryMediaDestination>;
}
