import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';
// @ts-expect-error The executable catalog script intentionally has no TypeScript declaration file.
import { collectAudioSourceCatalog, publicAudioSourceCatalog } from '../../scripts/academy-audio-source-catalog.mjs';

const sharedAudio = Buffer.from('shared-mp3-bytes');
const unmatchedAudio = Buffer.from('unmatched-mp3-bytes');
const sharedVisual = Buffer.from('shared-visual-bytes');

describe('Academy external audio source catalog', () => {
    it('hashes and deduplicates local sources, then binds only byte-identical Moodle source items', () => {
        const root = mkdtempSync(path.join(tmpdir(), 'academy-audio-catalog-'));
        const lessons = path.join(root, 'lessons');
        const soya = path.join(root, 'soya');
        const minna = path.join(root, 'minna.zip');
        mkdirSync(lessons);
        mkdirSync(soya);
        writeFileSync(path.join(soya, 'one.mp3'), sharedAudio);
        writeFileSync(path.join(soya, 'two.mp3'), sharedAudio);
        writeFileSync(minna, zipSync({
            '0-0001-01-230001/minna_shokyu_1_066.mp3': new Uint8Array(sharedAudio),
            '0-0001-01-230001/minna_shokyu_1_067.mp3': new Uint8Array(unmatchedAudio),
        }));
        writeFileSync(path.join(lessons, '001-fixture.json'), JSON.stringify({
            id: 'fixture-week', order: 1,
            sourceCoverage: { members: [{ kind: 'audio', title: 'audio materials/minna_shokyu_1_066.mp3', payloadSha256: hash(sharedAudio) }] },
        }));

        const catalog = collectAudioSourceCatalog({
            sources: [
                { id: 'soya-public', kind: 'directory', path: soya, textbook: { publisher: 'Soya', collection: 'public audio corpus' } },
                { id: 'minna-shokyu-1', kind: 'zip', path: minna, textbook: { publisher: '3A Corporation', collection: 'Minna no Nihongo Shokyu I', volume: 1 } },
            ],
            moodleLedger: ledger(hash(sharedAudio)),
            lessonRoot: lessons,
            cache: null,
        }) as AudioSourceCatalog;

        const minnaSource = catalog.sources.find(source => source.id === 'minna-shokyu-1')!;
        expect(minnaSource.assets).toHaveLength(2);
        expect(minnaSource.assets[0].textbook).toMatchObject({ volume: 1, chapter: 19, track: 66 });
        expect(catalog.summary).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'soya-public', audioFileCount: 2, uniquePayloadCount: 1 }),
            expect.objectContaining({ id: 'minna-shokyu-1', exactMoodlePayloadCount: 1, unmatchedAudioFileCount: 1 }),
        ]));
        expect(catalog.bindings.find(binding => binding.sourceId === 'minna-shokyu-1')).toEqual(expect.objectContaining({
            sourceId: 'minna-shokyu-1',
            status: 'canonical-source-match-awaiting-task-pairing',
            runtime: 'unavailable',
            academyPackageReferences: [{ packageId: 'fixture-week', packageOrder: 1, sourceTitle: 'audio materials/minna_shokyu_1_066.mp3' }],
        }));
    });

    it('publishes only audit metadata and never turns an inventory match into playable media', () => {
        const catalog = {
            schema: 'yomu-academy.audio-source-inventory/v1',
            generation: { deterministic: true, generatedAt: null, method: 'test' },
            moodle: { audioOccurrenceCount: 1, uniquePayloadCount: 1, rights: 'private-course-source-review-required', runtime: 'inventory-only' },
            sources: [{ id: 'private', assets: [{ sourceRelativePath: '/secret/source.mp3' }] }],
            summary: [{ id: 'private', audioFileCount: 1, runtime: 'inventory-only' }],
            bindings: [{ runtime: 'unavailable' }],
            gaps: { unmatchedInventoryBySource: [], taskPairing: 'review required' },
        };
        const published = publicAudioSourceCatalog(catalog) as PublicAudioSourceCatalog;

        expect(JSON.stringify(published)).not.toContain('/secret/source.mp3');
        expect(published.bindings).toEqual([{ runtime: 'unavailable' }]);
        expect(published.sources).toEqual([{ id: 'private', audioFileCount: 1, runtime: 'inventory-only' }]);
    });

    it('invents no visual use: it inventories only byte-identical Moodle and package evidence', () => {
        const root = mkdtempSync(path.join(tmpdir(), 'academy-visual-catalog-'));
        const lessons = path.join(root, 'lessons');
        const japanese = path.join(root, 'japanese');
        mkdirSync(lessons);
        mkdirSync(japanese);
        writeFileSync(path.join(japanese, 'matching.png'), sharedVisual);
        writeFileSync(path.join(japanese, 'unmatched.mp4'), Buffer.from('unmatched-visual-bytes'));
        writeFileSync(path.join(lessons, '001-fixture.json'), JSON.stringify({
            id: 'fixture-week', order: 1,
            sourceCoverage: { members: [{ kind: 'image', title: 'matching source visual', payloadSha256: hash(sharedVisual) }] },
        }));

        const catalog = collectAudioSourceCatalog({
            sources: [{ id: 'japanese-folder', kind: 'directory', path: japanese, textbook: { collection: 'User-supplied Japanese folder' } }],
            moodleLedger: ledger(hash(sharedVisual), 'image'),
            lessonRoot: lessons,
            cache: null,
        }) as AudioSourceCatalog;

        expect(catalog.summary).toEqual([expect.objectContaining({
            id: 'japanese-folder',
            audioFileCount: 0,
            visualFileCount: 2,
            uniqueVisualPayloadCount: 2,
            exactMoodleVisualPayloadCount: 1,
            exactAcademyPackageVisualReferenceCount: 1,
            unmatchedVisualFileCount: 1,
            runtime: 'inventory-only',
        })]);
        expect(catalog.visualBindings).toEqual([expect.objectContaining({
            sourceRelativePath: 'matching.png',
            status: 'canonical-visual-source-match-awaiting-semantic-pairing',
            runtime: 'unavailable',
            academyPackageReferences: [{ packageId: 'fixture-week', packageOrder: 1, sourceTitle: 'matching source visual' }],
        })]);
        expect(catalog.bindings).toEqual([]);
        expect(catalog.gaps.visualPairing).toMatch(/reviewed media region/i);
    });

    it('identifies Genki I and II chapters, subtracks, and title files without assigning a false chapter', () => {
        const root = mkdtempSync(path.join(tmpdir(), 'academy-audio-genki-'));
        const lessons = path.join(root, 'lessons');
        const archive = path.join(root, 'genki.zip');
        mkdirSync(lessons);
        writeFileSync(archive, zipSync({
            'Genki I/Genki1_Yomikaki-hen(Textbook)/Y01-1.mp3': new Uint8Array(sharedAudio),
            'Genki II/Genki2_KaiwaBunpo-hen(Textbook)/K00-G.mp3': new Uint8Array(unmatchedAudio),
            'Genki II/Genki2_KaiwaBunpo-hen(Textbook)/Genki 2-Title.mp3': new Uint8Array(Buffer.from('title')),
        }));

        const catalog = collectAudioSourceCatalog({
            sources: [{ id: 'genki-2e', kind: 'zip', path: archive, textbook: { publisher: 'The Japan Times', collection: 'Genki', edition: 2 } }],
            moodleLedger: { archiveOccurrences: [], memberOccurrences: [] },
            lessonRoot: lessons,
            cache: null,
        }) as AudioSourceCatalog;
        const byPath = new Map(catalog.sources[0].assets.map(asset => [asset.sourceRelativePath, asset.textbook]));

        expect(byPath.get('Genki I/Genki1_Yomikaki-hen(Textbook)/Y01-1.mp3')).toMatchObject({ volume: 1, chapter: 1, track: '1' });
        expect(byPath.get('Genki II/Genki2_KaiwaBunpo-hen(Textbook)/K00-G.mp3')).toMatchObject({ volume: 2, chapter: 0, track: 'G' });
        expect(byPath.get('Genki II/Genki2_KaiwaBunpo-hen(Textbook)/Genki 2-Title.mp3')).toMatchObject({ volume: 2, item: 'title' });
    });

    it('commits the generated public and documentation mirrors with an honest unavailable runtime', () => {
        const repoRoot = path.resolve(__dirname, '../..');
        const publicCatalog = readFileSync(path.join(repoRoot, 'public/academy/content/audio/source-inventory.v1.json'));
        const docsCatalog = readFileSync(path.join(repoRoot, 'docs/public/academy/content/audio/source-inventory.v1.json'));
        const catalog = JSON.parse(publicCatalog.toString('utf8'));

        expect(docsCatalog.equals(publicCatalog)).toBe(true);
        expect(catalog.sources).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'soya-public', audioFileCount: 58_920, unmatchedAudioFileCount: 58_920 }),
            expect.objectContaining({
                id: 'minna-shokyu-1',
                exactMoodlePayloadCount: 30,
                exactAcademyPackageReferenceCount: 24,
                usagePolicy: 'exact-missing-tracks-only',
                harvestEligibility: 'official-free-no-registration',
                rights: 'official-download-access-verified-redistribution-not-claimed',
            }),
            expect.objectContaining({ id: 'genki-2e', audioFileCount: 464, exactMoodlePayloadCount: 0 }),
            expect.objectContaining({
                id: 'japanese-folder',
                audioFileCount: 3_801,
                visualFileCount: 1_302,
                exactMoodleVisualPayloadCount: 0,
                runtime: 'inventory-only',
            }),
        ]));
        expect(catalog.bindings).toHaveLength(53);
        expect(catalog.bindings.every((binding: { runtime: string; status: string }) => (
            binding.runtime === 'unavailable'
            && binding.status === 'canonical-source-match-awaiting-task-pairing'
        ))).toBe(true);
        expect(JSON.stringify(catalog)).not.toContain('/Users/heru/');
    });
});

function ledger(payloadSha256: string, kind: 'audio' | 'image' = 'audio') {
    return {
        archiveOccurrences: [{ id: 'archive-000001', mapping: { moduleId: 12, title: 'Lesson 2' } }],
        memberOccurrences: [{
            archiveOccurrenceId: 'archive-000001', payloadSha256,
            name: kind === 'audio' ? 'audio materials/minna_shokyu_1_066.mp3' : 'source visual.png',
            classification: { kind, extension: kind === 'audio' ? '.mp3' : '.png' },
        }],
    };
}

function hash(value: Buffer): string {
    return createHash('sha256').update(value).digest('hex');
}

interface AudioSourceCatalog {
    sources: Array<{
        id: string;
        assets: Array<{ sourceRelativePath: string; mediaKind: 'audio' | 'visual'; textbook: Record<string, unknown> }>;
    }>;
    summary: Array<{
        id: string;
        audioFileCount: number;
        uniquePayloadCount: number;
        exactMoodlePayloadCount: number;
        unmatchedAudioFileCount: number;
        exactAcademyPackageReferenceCount: number;
        visualFileCount: number;
        uniqueVisualPayloadCount: number;
        exactMoodleVisualPayloadCount: number;
        exactAcademyPackageVisualReferenceCount: number;
        unmatchedVisualFileCount: number;
    }>;
    bindings: Array<{
        sourceId: string;
        status: string;
        runtime: string;
        academyPackageReferences: Array<{ packageId: string; packageOrder: number; sourceTitle: string }>;
    }>;
    visualBindings: Array<{
        sourceRelativePath: string;
        status: string;
        runtime: string;
        academyPackageReferences: Array<{ packageId: string; packageOrder: number; sourceTitle: string }>;
    }>;
    gaps: {
        visualPairing: string;
    };
}

interface PublicAudioSourceCatalog {
    bindings: Array<{ runtime: string }>;
    sources: Array<{ id: string; audioFileCount: number; runtime: string }>;
}
