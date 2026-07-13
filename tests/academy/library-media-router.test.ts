import {
    createLibraryMediaRouter,
    type LibraryAssetResolutionRequest,
    type LibraryAssetResolver,
    type PrivacySafeLibraryResource,
    type ResolvedLibraryAsset,
} from '../../src/academy/media/library-media-router';

const VIDEO_ID = 'lib_01j2videoasset0001';
const SUBTITLE_ID = 'lib_01j2subtitle000001';
const AUDIO_ID = 'lib_01j2audioasset0001';
const TRANSCRIPT_ID = 'lib_01j2transcript0001';
const PDF_ID = 'lib_01j2document000001';
const IMAGE_ID = 'lib_01j2imageasset0001';
const ANKI_ID = 'lib_01j2ankiarchive001';

function ready(overrides: Partial<PrivacySafeLibraryResource> = {}): PrivacySafeLibraryResource {
    return {
        assetId: VIDEO_ID,
        kind: 'video',
        mediaType: 'video/mp4',
        readiness: { state: 'ready' },
        ...overrides,
    };
}

function resolverWith(
    resolveDelivery: (request: LibraryAssetResolutionRequest) => ResolvedLibraryAsset = request => ({
        url: `/academy/media/library/${request.assetId}?purpose=${request.purpose}&token=opaque`,
        access: 'academy-session',
    }),
) {
    const calls: LibraryAssetResolutionRequest[] = [];
    const resolver: LibraryAssetResolver = {
        async resolve(request) {
            calls.push(request);
            return resolveDelivery(request);
        },
    };
    return { resolver, calls };
}

describe('authorised library media routing', () => {
    it('routes paired video and subtitle assets to the embedded Yomu player', async () => {
        const { resolver, calls } = resolverWith(request => request.purpose === 'video'
            ? { url: `/academy/media/library/${request.assetId}`, access: 'academy-session' }
            : {
                url: `https://media.yomureader.test/assets/${request.assetId}?sig=opaque`,
                access: 'signed',
                expiresAt: '2026-07-13T12:00:00.000Z',
            });
        const router = createLibraryMediaRouter({
            resolver,
            trustedOrigins: ['https://media.yomureader.test'],
        });

        const destination = await router.route(ready({
            textTracks: [{
                assetId: SUBTITLE_ID,
                mediaType: 'text/vtt; charset=utf-8',
                language: 'ja-JP',
                role: 'subtitles',
                default: true,
            }],
        }));

        expect(destination).toEqual({
            kind: 'embedded-yomu-video',
            assetId: VIDEO_ID,
            video: { url: `/academy/media/library/${VIDEO_ID}`, access: 'academy-session' },
            textTracks: [{
                assetId: SUBTITLE_ID,
                mediaType: 'text/vtt',
                language: 'ja-jp',
                role: 'subtitles',
                default: true,
                delivery: {
                    url: `https://media.yomureader.test/assets/${SUBTITLE_ID}?sig=opaque`,
                    access: 'signed',
                    expiresAt: '2026-07-13T12:00:00.000Z',
                },
            }],
            subtitleState: 'paired',
        });
        expect(calls).toEqual([
            { assetId: VIDEO_ID, purpose: 'video' },
            { assetId: SUBTITLE_ID, purpose: 'subtitle' },
        ]);
    });

    it('routes PDFs, listening audio and images through the same resolver seam', async () => {
        const { resolver, calls } = resolverWith();
        const router = createLibraryMediaRouter({ resolver });
        const region = {
            page: 2,
            bbox: { x: 0.1, y: 0.2, width: 0.5, height: 0.4, unit: 'normalized' as const },
        };

        const pdf = await router.route(ready({
            assetId: PDF_ID,
            kind: 'document',
            mediaType: 'application/pdf',
            sourceRegion: region,
        }));
        const audio = await router.route(ready({
            assetId: AUDIO_ID,
            kind: 'audio',
            mediaType: 'audio/mpeg',
            textTracks: [{
                assetId: TRANSCRIPT_ID,
                mediaType: 'application/x-subrip',
                language: 'ja',
                role: 'transcript',
            }],
        }));
        const image = await router.route(ready({
            assetId: IMAGE_ID,
            kind: 'image',
            mediaType: 'image/png',
            sourceRegion: { bbox: { x: 12, y: 8, width: 240, height: 180, unit: 'pixels' } },
        }));

        expect(pdf).toMatchObject({ kind: 'yomu-pdf-ocr', assetId: PDF_ID, sourceRegion: region, ocr: 'available' });
        expect(audio).toMatchObject({
            kind: 'academy-listening',
            assetId: AUDIO_ID,
            transcriptState: 'paired',
            textTracks: [{ assetId: TRANSCRIPT_ID, role: 'transcript' }],
        });
        expect(image).toMatchObject({ kind: 'source-region', assetId: IMAGE_ID });
        expect(calls).toEqual([
            { assetId: PDF_ID, purpose: 'pdf' },
            { assetId: AUDIO_ID, purpose: 'audio' },
            { assetId: TRANSCRIPT_ID, purpose: 'transcript' },
            { assetId: IMAGE_ID, purpose: 'image' },
        ]);
    });

    it('keeps Anki routing metadata-only until an explicit package importer exists', async () => {
        const { resolver, calls } = resolverWith();
        const router = createLibraryMediaRouter({ resolver });

        const destination = await router.route(ready({
            assetId: ANKI_ID,
            kind: 'anki-archive',
            mediaType: 'application/octet-stream',
            anki: {
                format: 'apkg',
                schema: 'anki21',
                deckCount: 3,
                noteCount: 240,
                cardCount: 360,
                mediaCount: 18,
            },
        }));

        expect(destination).toEqual({
            kind: 'anki-import-metadata',
            assetId: ANKI_ID,
            metadata: {
                format: 'apkg',
                schema: 'anki21',
                deckCount: 3,
                noteCount: 240,
                cardCount: 360,
                mediaCount: 18,
            },
            packageDelivery: 'explicit-import-adapter-required',
        });
        expect(calls).toEqual([]);
    });

    it('returns explicit review and unsupported states without resolving private bytes', async () => {
        const { resolver, calls } = resolverWith();
        const router = createLibraryMediaRouter({ resolver });

        await expect(router.route(ready({
            kind: 'subtitle',
            mediaType: 'text/vtt',
        }))).resolves.toEqual({
            kind: 'manual-review',
            assetId: VIDEO_ID,
            sourceKind: 'subtitle',
            reason: 'pairing-required',
        });
        await expect(router.route(ready({
            kind: 'document',
            mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }))).resolves.toMatchObject({ kind: 'manual-review', reason: 'content-type-mismatch' });
        await expect(router.route(ready({
            kind: 'unsupported-archive',
            mediaType: 'application/x-rar-compressed',
        }))).resolves.toMatchObject({ kind: 'unsupported', reason: 'archive-reader-unavailable' });
        await expect(router.route(ready({
            readiness: { state: 'manual-review', reason: 'rights-review' },
        }))).resolves.toMatchObject({ kind: 'manual-review', reason: 'rights-review' });
        expect(calls).toEqual([]);
    });

    it('marks missing transcripts honestly while retaining a usable audio route', async () => {
        const { resolver } = resolverWith();
        const router = createLibraryMediaRouter({ resolver });

        await expect(router.route(ready({
            assetId: AUDIO_ID,
            kind: 'audio',
            mediaType: 'audio/flac',
        }))).resolves.toMatchObject({
            kind: 'academy-listening',
            transcriptState: 'unpaired',
            textTracks: [],
        });
    });
});

describe('library routing privacy contract', () => {
    it('rejects source-derived identifiers before the resolver sees them', async () => {
        const { resolver, calls } = resolverWith();
        const router = createLibraryMediaRouter({ resolver });

        await expect(router.route(ready({ assetId: 'Lessons/秘密/video.mp4' }))).rejects.toThrow(/opaque lib_ asset id/);
        await expect(router.route(ready({
            textTracks: [{
                assetId: '/Users/learner/secret.srt',
                mediaType: 'text/vtt',
                language: 'ja',
                role: 'subtitles',
            }],
        }))).rejects.toThrow(/opaque lib_ asset id/);
        await expect(router.route(ready({
            kind: 'Lessons/秘密' as PrivacySafeLibraryResource['kind'],
        }))).rejects.toThrow(/Unsupported library resource kind/);
        expect(calls).toEqual([]);
    });

    it.each([
        'file:///Users/learner/secret.mp4',
        '/academy/media?sourcePath=%2FUsers%2Flearner%2Fsecret.mp4',
        '/academy/media?path=%2FJapanese%2Fprivate-title.mp4',
        '/academy/media?sourcePath=C%3A%5Cprivate%5Csecret.mp4',
        '//private.example.test/secret.mp4',
        'data:video/mp4;base64,AAAA',
    ])('rejects unsafe resolver URL %s', async unsafeUrl => {
        const { resolver } = resolverWith(() => ({ url: unsafeUrl, access: 'academy-session' }));
        const router = createLibraryMediaRouter({ resolver });
        await expect(router.route(ready())).rejects.toThrow();
    });

    it('requires an explicit HTTPS-origin allowlist for external delivery', async () => {
        const { resolver } = resolverWith(() => ({
            url: 'https://cdn.example.test/media/opaque',
            access: 'signed',
            expiresAt: '2026-07-13T12:00:00Z',
        }));
        await expect(createLibraryMediaRouter({ resolver }).route(ready())).rejects.toThrow(/Untrusted library media origin/);
        await expect(createLibraryMediaRouter({
            resolver,
            trustedOrigins: ['https://cdn.example.test'],
        }).route(ready())).resolves.toMatchObject({ kind: 'embedded-yomu-video' });
    });

    it('validates track bounds and source regions before any delivery request', async () => {
        const { resolver, calls } = resolverWith();
        const router = createLibraryMediaRouter({ resolver });

        await expect(router.route(ready({
            textTracks: [
                { assetId: SUBTITLE_ID, mediaType: 'text/vtt', language: 'ja', role: 'subtitles', default: true },
                { assetId: TRANSCRIPT_ID, mediaType: 'text/vtt', language: 'en', role: 'captions', default: true },
            ],
        }))).rejects.toThrow(/Only one text track/);
        await expect(router.route(ready({
            assetId: IMAGE_ID,
            kind: 'image',
            mediaType: 'image/webp',
            sourceRegion: { bbox: { x: 0.8, y: 0.8, width: 0.4, height: 0.4, unit: 'normalized' } },
        }))).rejects.toThrow(/must fit/);
        expect(calls).toEqual([]);
    });
});
