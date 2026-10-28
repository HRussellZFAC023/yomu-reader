// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { resolveRoots } from '../../scripts/academy-source-pipeline/paths.mjs';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { buildPrivateLedger } from '../../scripts/academy-source-pipeline/ledger.mjs';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { migrateDonorPacks } from '../../scripts/academy-source-pipeline/packs.mjs';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { buildListeningPairings } from '../../scripts/academy-source-pipeline/pairing.mjs';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { buildPackMigrationSummary } from '../../scripts/academy-source-pipeline/public-outputs.mjs';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { generateTeacherComparison } from '../../scripts/academy-source-pipeline/compare.mjs';
// @ts-expect-error Plain-JS source-pipeline tooling is exercised directly.
import { insideRoot } from '../../scripts/academy-source-pipeline/paths.mjs';
import { buildFixture, toEnv, donorPack } from './helpers/source-pipeline-fixture';

function migrate() {
    const resolved = resolveRoots(toEnv(buildFixture()));
    const ledger = buildPrivateLedger(resolved, {});
    const packCandidates = migrateDonorPacks(resolved, ledger, {});
    return { resolved, ledger, packCandidates };
}

describe('pack migration', () => {
    it('preserves every donor item as exactly one source candidate plus one augmentation record', () => {
        const { packCandidates } = migrate();
        const donorItemCount = donorPack().items.length;
        expect(packCandidates.totals.packCount).toBe(1);
        expect(packCandidates.totals.donorItemCount).toBe(donorItemCount);
        expect(packCandidates.totals.sourceCandidateCount).toBe(donorItemCount);
        expect(packCandidates.totals.augmentationRecordCount).toBe(donorItemCount);
        expect(packCandidates.totals.instructionCount).toBe(1);
        expect(packCandidates.totals.audioMediaRefCount).toBe(1);
        expect(packCandidates.totals.imageMediaRefCount).toBe(1);
        expect(packCandidates.totals.donorAnswerClaimCount).toBe(1);
        const pack = packCandidates.packs[0];
        expect(pack.sourceCandidates.map((candidate: any) => candidate.itemId))
            .toEqual(donorPack().items.map(item => item.id));
    });

    it('keeps source and augmentation fields strictly disjoint', () => {
        const { packCandidates } = migrate();
        const pack = packCandidates.packs[0];
        for (const candidate of pack.sourceCandidates) {
            expect(candidate).not.toHaveProperty('promptTranslation');
            expect(candidate).not.toHaveProperty('answer');
            expect(candidate).not.toHaveProperty('furigana');
            expect(candidate.promptOriginal).toBeTruthy();
        }
        for (const record of pack.augmentation) {
            expect(record).not.toHaveProperty('promptOriginal');
            expect(record).not.toHaveProperty('locus');
            expect(record).not.toHaveProperty('mediaDescriptions');
        }
    });

    it('keeps unresolved loci and media descriptions review-required, never verified', () => {
        const { packCandidates } = migrate();
        const pack = packCandidates.packs[0];
        for (const candidate of pack.sourceCandidates) {
            expect(candidate.locus).toEqual({ page: null, status: 'unresolved-review-required' });
            expect(candidate.reviewState).toBe('machine-migrated-review-required');
        }
        const withMedia = pack.sourceCandidates.find((candidate: any) => candidate.mediaDescriptions.length > 0);
        expect(withMedia).toBeDefined();
        for (const description of withMedia.mediaDescriptions) {
            expect(description.status).toBe('described-not-verified');
        }
        const answered = pack.augmentation.find((record: any) => record.answer);
        expect(answered.answer.provenance).toBe('donor-claimed-review-required');
    });

    it('preserves donor page/number/section candidates without promoting their locus', () => {
        const roots = buildFixture();
        const donor = donorPack();
        Object.assign(donor.items[0], { page: 2, number: '1a', section: 'A', options: ['a', 'b'] });
        writeFileSync(
            path.join(roots.donorPacksRoot, 'packs', 'secret-lesson-pack.json'),
            JSON.stringify(donor, null, 2),
        );
        const resolved = resolveRoots(toEnv(roots));
        const ledger = buildPrivateLedger(resolved, {});
        const migrated = migrateDonorPacks(resolved, ledger, {}).packs[0].sourceCandidates[0];
        expect(migrated).toMatchObject({ number: '1a', section: 'A', options: ['a', 'b'] });
        expect(migrated.locus).toEqual({ page: 2, status: 'donor-page-candidate-review-required' });
    });

    it('fails closed when a donor field has no explicit migration home', () => {
        const roots = buildFixture();
        const donor = donorPack() as any;
        donor.items[0].silentDataLoss = 'must not disappear';
        writeFileSync(
            path.join(roots.donorPacksRoot, 'packs', 'secret-lesson-pack.json'),
            JSON.stringify(donor, null, 2),
        );
        const resolved = resolveRoots(toEnv(roots));
        const ledger = buildPrivateLedger(resolved, {});
        expect(() => migrateDonorPacks(resolved, ledger, {})).toThrow(/unmapped fields: silentDataLoss/);
    });

    it('summarises packs publicly with opaque refs and review-required status only', () => {
        const { resolved, packCandidates } = migrate();
        const pairings = buildListeningPairings(resolved, packCandidates, {
            payloads: [
                { payloadSha256: 'a'.repeat(64), status: 'probed', durationSeconds: 88.4 },
                { payloadSha256: 'b'.repeat(64), status: 'probed', durationSeconds: 300 },
            ],
        });
        expect(pairings.pairings[0].confidence).toBe('high');
        expect(pairings.pairings[0].transcriptStatus).toBe('none');
        expect(pairings.pairings[0].rights).toBe('private-use-review-required');

        const summary = buildPackMigrationSummary(packCandidates, pairings);
        expect(summary.packs[0].packRef).toBe('wp-fixture000001');
        expect(summary.packs[0].status).toBe('candidates-review-required');
        expect(JSON.stringify(summary)).not.toContain('secret-lesson');
    });
});

describe('teacher comparison surface', () => {
    it('writes every page inside the private artifact root', () => {
        const { resolved, packCandidates } = migrate();
        const compareRoot = generateTeacherComparison(resolved, packCandidates, {});
        expect(compareRoot.startsWith(resolved.privateRoot + path.sep)).toBe(true);
        const files = readdirSync(compareRoot);
        expect(files).toContain('index.html');
        expect(files).toContain('wp-fixture000001.html');
        expect(existsSync(path.join(compareRoot, 'index.html'))).toBe(true);
        const packHtml = readFileSync(path.join(compareRoot, 'wp-fixture000001.html'), 'utf8');
        expect(packHtml).not.toContain('file://');
    });

    it('refuses pack ids that would escape the private artifact root', () => {
        const { resolved, packCandidates } = migrate();
        const hostile = structuredClone(packCandidates);
        hostile.packs[0].packId = '../escape';
        expect(() => generateTeacherComparison(resolved, hostile, {})).toThrow(/Unsafe pack id|escapes its root/);
        expect(() => insideRoot(resolved.privateRoot, '..', 'outside.html')).toThrow(/escapes its root/);
    });

    it('copies donor-workspace renders under the private HTTP-served comparison root', () => {
        const { resolved, packCandidates } = migrate();
        const workspacesRoot = path.join(path.dirname(resolved.privateRoot), 'external-pack-workspaces');
        const pagesRoot = path.join(workspacesRoot, 'wp-fixture000001', 'pages');
        mkdirSync(pagesRoot, { recursive: true });
        writeFileSync(path.join(pagesRoot, 'page-1.png'), Buffer.from('page one'));
        writeFileSync(path.join(pagesRoot, 'page-2.png'), Buffer.from('page two'));

        const compareRoot = generateTeacherComparison(resolved, packCandidates, { packWorkspacesRoot: workspacesRoot });
        const html = readFileSync(path.join(compareRoot, 'wp-fixture000001.html'), 'utf8');
        expect(html).not.toContain('file://');
        expect(html).toContain('source-renders/wp-fixture000001/page-1.png');
        expect(existsSync(path.join(compareRoot, 'source-renders', 'wp-fixture000001', 'page-1.png'))).toBe(true);
        expect(existsSync(path.join(compareRoot, 'source-renders', 'wp-fixture000001', 'page-2.png'))).toBe(true);
    });
});
