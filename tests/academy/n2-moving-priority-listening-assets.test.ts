import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    canonicalN2ApartmentMovingSourceLocus,
    N2_APARTMENT_MOVING_PROVENANCE,
} from '../../src/academy/content/n2-apartment-moving';
import {
    canonicalN2HomeLifeReaderCombinedLocus,
    canonicalN2HomeLifeReaderImageLocus,
    canonicalN2HomeLifeReaderStrategyLocus,
    N2_HOME_LIFE_READER_PROVENANCE,
} from '../../src/academy/content/n2-home-life-reader';
import {
    canonicalN2MovingCouponSourceLocus,
    N2_MOVING_COUPON_PROVENANCE,
} from '../../src/academy/content/n2-moving-coupon';
import {
    canonicalN2MovingPriorityCombinedLocus,
    canonicalN2MovingPriorityPointLocus,
    canonicalN2MovingPriorityPronunciationLocus,
    canonicalN2MovingPrioritySoyaLocus,
    N2_MOVING_PRIORITY_ANSWER,
    N2_MOVING_PRIORITY_LISTENING_PROVENANCE,
    N2_MOVING_PRIORITY_TRANSCRIPT,
} from '../../src/academy/content/n2-moving-priority-listening';
import {
    canonicalN2PpoiImpressionSourceLocus,
    N2_PPOI_IMPRESSION_PROVENANCE,
} from '../../src/academy/content/n2-ppoi-impression';

const LIBRARY_ROOT = process.env.ACADEMY_LIBRARY_ROOT ?? path.join(homedir(), 'Documents/Japanese');
const SOYA_ROOT = path.resolve(process.cwd(), '../..', 'references/soya-research');
const PACKAGE_ROOT = 'academy/content/n2-moving-priority-listening';

describe('N2 opening source provenance and exact listening assets', () => {
    it('pins every inspected Sou Matome, Shin Kanzen, and graded-reader locus', () => {
        expect(sha256(canonicalN2ApartmentMovingSourceLocus())).toBe(
            N2_APARTMENT_MOVING_PROVENANCE.sourceLocusSha256,
        );
        expect(sha256(canonicalN2PpoiImpressionSourceLocus())).toBe(
            N2_PPOI_IMPRESSION_PROVENANCE.sourceLocusSha256,
        );
        expect(sha256(canonicalN2MovingCouponSourceLocus())).toBe(
            N2_MOVING_COUPON_PROVENANCE.sourceLocusSha256,
        );
        expect(sha256(canonicalN2HomeLifeReaderImageLocus())).toBe(
            N2_HOME_LIFE_READER_PROVENANCE.readerReference.sourceLocusSha256,
        );
        expect(sha256(canonicalN2HomeLifeReaderStrategyLocus())).toBe(
            N2_HOME_LIFE_READER_PROVENANCE.strategyReference.sourceLocusSha256,
        );
        expect(sha256(canonicalN2HomeLifeReaderCombinedLocus())).toBe(
            N2_HOME_LIFE_READER_PROVENANCE.combinedSourceLocusSha256,
        );
        expect(sha256(canonicalN2MovingPriorityPronunciationLocus())).toBe(
            N2_MOVING_PRIORITY_LISTENING_PROVENANCE.pronunciationReference.sourceLocusSha256,
        );
        expect(sha256(canonicalN2MovingPriorityPointLocus())).toBe(
            N2_MOVING_PRIORITY_LISTENING_PROVENANCE.pointReference.sourceLocusSha256,
        );
        expect(sha256(canonicalN2MovingPriorityCombinedLocus())).toBe(
            N2_MOVING_PRIORITY_LISTENING_PROVENANCE.combinedSourceLocusSha256,
        );
        expect(sha256(canonicalN2MovingPrioritySoyaLocus())).toBe(
            N2_MOVING_PRIORITY_LISTENING_PROVENANCE.sourceItem.sourceLocusSha256,
        );
        expect(N2_MOVING_PRIORITY_LISTENING_PROVENANCE.sourceItem).toMatchObject({
            sourceDocumentSha256: '4665de0aab5656717c930508ee9b92e60d11f71d5030482b86ea31b7a50b5aa5',
            sourceDocumentByteLength: 292617,
            sourceItemId: 'n2_m1_listening_task_0_3',
            sourceItemJsonSha256: '29438b237e0698d53a3dedc56e3553d19d7d283ecb3b8aa8b270cd952dd8abb5',
            sourceAudio: {
                sha256: '52bcc28d845bfbd4fa2cff6a2a2c036e72940f988076528f68a80bf508d37c42',
                byteLength: 667700,
            },
            sourceImage: {
                sha256: 'f83c5f590d046b22281762da385004877f69d1b753fddeb6defff9fe217eb2b3',
                byteLength: 317807,
            },
            rights: {
                authorization: 'explicit-user-request-2026-07-18-first-real-n2-source-tranche',
                sourceTextDelivery: 'post-attempt-transcript',
                sourceAnswerDelivery: 'after-attempt',
                serviceWorkerPrecache: 'not-registered',
            },
        });
        expect(N2_MOVING_PRIORITY_TRANSCRIPT).toHaveLength(10);
        expect(N2_MOVING_PRIORITY_ANSWER).toBe('粗大ごみの収集を申し込む');

        const localLibraryPresent = existsSync(LIBRARY_ROOT);
        for (const source of librarySources()) {
            const sourceFile = path.join(LIBRARY_ROOT, source.relativePath);
            if (localLibraryPresent) expect(existsSync(sourceFile), source.relativePath).toBe(true);
            if (existsSync(sourceFile)) {
                expect(sha256(readFileSync(sourceFile))).toBe(source.sha256);
                expect(statSync(sourceFile).size).toBe(source.byteLength);
            }
        }

        const provenance = JSON.stringify([
            N2_APARTMENT_MOVING_PROVENANCE,
            N2_PPOI_IMPRESSION_PROVENANCE,
            N2_MOVING_COUPON_PROVENANCE,
            N2_HOME_LIFE_READER_PROVENANCE,
            N2_MOVING_PRIORITY_LISTENING_PROVENANCE,
        ]);
        expect(provenance).not.toContain('/Users/');
        expect(provenance).toContain('user-permitted-local-reference-only');
    });

    it.runIf(existsSync(SOYA_ROOT))('rehashes the exact Soya pool item, audio, and image from their inspected locations', () => {
        const provenance = N2_MOVING_PRIORITY_LISTENING_PROVENANCE.sourceItem;
        const sourceFile = path.join(SOYA_ROOT, 'extracted-src-all', provenance.relativePath);
        const source = readFileSync(sourceFile, 'utf8');
        expect(sha256(source)).toBe(provenance.sourceDocumentSha256);
        expect(statSync(sourceFile).size).toBe(provenance.sourceDocumentByteLength);
        const pool = JSON.parse(source
            .replace(/^\/\/[^\n]*\nexport const n2_mock_no1_pool = /u, '')
            .replace(/;\s*$/u, '')) as readonly Readonly<{ id: string }>[];
        const item = pool.find(candidate => candidate.id === provenance.sourceItemId);
        expect(item).toBeDefined();
        expect(sha256(JSON.stringify(item))).toBe(provenance.sourceItemJsonSha256);

        const sourceAudio = path.join(SOYA_ROOT, 'audio-public', provenance.sourceAudio.relativePath);
        const sourceImage = path.join(SOYA_ROOT, 'assets-public', provenance.sourceImage.relativePath);
        expectAsset(sourceAudio, provenance.sourceAudio.sha256, provenance.sourceAudio.byteLength);
        expectAsset(sourceImage, provenance.sourceImage.sha256, provenance.sourceImage.byteLength);
    });

    it('keeps public and docs asset mirrors byte-identical with an answer-free manifest', () => {
        const provenance = N2_MOVING_PRIORITY_LISTENING_PROVENANCE.sourceItem;
        for (const root of ['public', 'docs/public']) {
            expectAsset(
                path.resolve(root, PACKAGE_ROOT, 'soya-n2-m1-listening-task-0-3.mp3'),
                provenance.sourceAudio.sha256,
                provenance.sourceAudio.byteLength,
            );
            expectAsset(
                path.resolve(root, PACKAGE_ROOT, 'soya-n2-m1-task-home.png'),
                provenance.sourceImage.sha256,
                provenance.sourceImage.byteLength,
            );
        }

        const publicManifestText = readFileSync(path.resolve('public', PACKAGE_ROOT, 'package.v1.json'), 'utf8');
        const docsManifestText = readFileSync(path.resolve('docs/public', PACKAGE_ROOT, 'package.v1.json'), 'utf8');
        expect(docsManifestText).toBe(publicManifestText);
        const manifest = JSON.parse(publicManifestText);
        expect(manifest).toMatchObject({
            package: {
                id: 'n2-home-life-opening-05-listening',
                activityKind: 'academy-n2-moving-priority-listening',
                sequence: { order: 5, total: 5, previousPackageId: 'n2-home-life-opening-04-reader' },
                assessment: { answerVisibility: 'after-attempt', transcriptVisibility: 'after-attempt' },
            },
            source: {
                itemId: 'n2_m1_listening_task_0_3',
                itemJsonSha256: provenance.sourceItemJsonSha256,
                combinedSourceLocusSha256: N2_MOVING_PRIORITY_LISTENING_PROVENANCE.combinedSourceLocusSha256,
            },
            rights: {
                authorization: 'explicit-user-request-2026-07-18-first-real-n2-source-tranche',
                soyaTranscript: 'post-attempt-only',
                soyaAnswer: 'post-attempt-only',
            },
            offline: {
                requiredNetworkRequests: 2,
                sourceMediaBundled: true,
                offlineReady: false,
                serviceWorkerPrecached: false,
            },
            registration: { sharedActivityRegistry: 'deferred' },
        });
        expect(manifest.readerSrs.miningRequestCount).toBe(0);
        expect(manifest.assets.map((asset: { sha256: string }) => asset.sha256)).toEqual([
            provenance.sourceAudio.sha256,
            provenance.sourceImage.sha256,
        ]);
        expect(publicManifestText).not.toContain('/Users/');
        expect(publicManifestText).not.toContain(N2_MOVING_PRIORITY_ANSWER);
        expect(publicManifestText).not.toContain(N2_MOVING_PRIORITY_TRANSCRIPT[0].text);
        expect(publicManifestText).not.toContain('correctOptionId');
    });

    it('states the network dependency honestly and does not smuggle it into either service worker', () => {
        const assetPaths = [
            '/academy/content/n2-moving-priority-listening/package.v1.json',
            '/academy/content/n2-moving-priority-listening/soya-n2-m1-listening-task-0-3.mp3',
            '/academy/content/n2-moving-priority-listening/soya-n2-m1-task-home.png',
        ];
        for (const workerPath of ['public/academy/sw.js', 'docs/public/academy/sw.js']) {
            const worker = readFileSync(path.resolve(workerPath), 'utf8');
            assetPaths.forEach(assetPath => expect(worker).not.toContain(`'${assetPath}'`));
        }
    });
});

function librarySources(): readonly Readonly<{
    relativePath: string;
    sha256: string;
    byteLength: number;
}>[] {
    return [
        {
            relativePath: N2_APARTMENT_MOVING_PROVENANCE.relativePath,
            sha256: N2_APARTMENT_MOVING_PROVENANCE.sourceDocumentSha256,
            byteLength: N2_APARTMENT_MOVING_PROVENANCE.sourceDocumentByteLength,
        },
        {
            relativePath: N2_PPOI_IMPRESSION_PROVENANCE.relativePath,
            sha256: N2_PPOI_IMPRESSION_PROVENANCE.sourceDocumentSha256,
            byteLength: N2_PPOI_IMPRESSION_PROVENANCE.sourceDocumentByteLength,
        },
        {
            relativePath: N2_MOVING_COUPON_PROVENANCE.relativePath,
            sha256: N2_MOVING_COUPON_PROVENANCE.sourceDocumentSha256,
            byteLength: N2_MOVING_COUPON_PROVENANCE.sourceDocumentByteLength,
        },
        {
            relativePath: N2_HOME_LIFE_READER_PROVENANCE.readerReference.relativePath,
            sha256: N2_HOME_LIFE_READER_PROVENANCE.readerReference.sourceAssetSha256,
            byteLength: N2_HOME_LIFE_READER_PROVENANCE.readerReference.sourceAssetByteLength,
        },
        {
            relativePath: N2_HOME_LIFE_READER_PROVENANCE.strategyReference.relativePath,
            sha256: N2_HOME_LIFE_READER_PROVENANCE.strategyReference.sourceDocumentSha256,
            byteLength: N2_HOME_LIFE_READER_PROVENANCE.strategyReference.sourceDocumentByteLength,
        },
        {
            relativePath: N2_MOVING_PRIORITY_LISTENING_PROVENANCE.pronunciationReference.relativePath,
            sha256: N2_MOVING_PRIORITY_LISTENING_PROVENANCE.pronunciationReference.sourceDocumentSha256,
            byteLength: N2_MOVING_PRIORITY_LISTENING_PROVENANCE.pronunciationReference.sourceDocumentByteLength,
        },
        {
            relativePath: N2_MOVING_PRIORITY_LISTENING_PROVENANCE.pointReference.relativePath,
            sha256: N2_MOVING_PRIORITY_LISTENING_PROVENANCE.pointReference.sourceDocumentSha256,
            byteLength: N2_MOVING_PRIORITY_LISTENING_PROVENANCE.pointReference.sourceDocumentByteLength,
        },
    ];
}

function expectAsset(filename: string, expectedSha256: string, expectedBytes: number): void {
    const bytes = readFileSync(filename);
    expect(sha256(bytes), filename).toBe(expectedSha256);
    expect(bytes.byteLength, filename).toBe(expectedBytes);
}

function sha256(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
}
