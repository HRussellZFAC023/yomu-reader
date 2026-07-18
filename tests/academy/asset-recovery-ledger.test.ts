import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error The production validator is intentionally a directly executable ESM script.
import { canonicalizeLedger, renderReport, serializeLedger, validateLedger } from '../../scripts/academy-asset-ledger.mjs';
import { sha256File } from './helpers/hash-memo';

const ledgerPath = path.resolve('docs/academy/recovery/ASSET-CARRYOVER.json');
const reportPath = path.resolve('docs/academy/recovery/ASSET-LEDGER-REPORT.md');

describe('Academy recovery asset ledger', () => {
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));

    it('is canonical, internally valid, and byte-stable', () => {
        expect(validateLedger(ledger, { checkFiles: false })).toEqual([]);
        expect(serializeLedger(ledger)).toBe(fs.readFileSync(ledgerPath, 'utf8'));
        expect(renderReport(ledger)).toBe(fs.readFileSync(reportPath, 'utf8'));
    });

    it('canonicalizes perturbed row and nested-array order deterministically', () => {
        const perturbed = structuredClone(ledger);
        perturbed.assets.reverse();
        perturbed.speculativeMissingAssets.reverse();
        for (const asset of perturbed.assets) {
            asset.characters.reverse();
            asset.runtimeUses.reverse();
            asset.occurrences.reverse();
        }

        expect(serializeLedger(perturbed)).toBe(serializeLedger(canonicalizeLedger(ledger)));
        expect(renderReport(perturbed)).toBe(renderReport(ledger));
    });

    it('keeps counts derived from the hash-deduplicated rows', () => {
        expect(new Set(ledger.assets.map((asset: { sha256: string }) => asset.sha256)).size).toBe(ledger.assets.length);
        expect(ledger.counts.uniquePayloads).toBe(ledger.assets.length);
        expect(ledger.counts.physicalOccurrences).toBe(
            ledger.assets.reduce((sum: number, asset: { occurrenceCount: number }) => sum + asset.occurrenceCount, 0),
        );
        expect(ledger.counts.formatCoverage.gif).toBe(0);
        expect(ledger.counts.formatCoverage.wav).toBe(0);
    });

    it('verifies every recovered byte and keeps it outside runtime delivery', () => {
        const recovered = ledger.assets.filter(
            (asset: { occurrences: Array<{ role: string }> }) => asset.occurrences.some(occurrence => occurrence.role === 'recovery-archive'),
        );
        expect(recovered).toHaveLength(66);

        for (const asset of recovered) {
            const archive = asset.occurrences.find((occurrence: { role: string }) => occurrence.role === 'recovery-archive');
            expect(archive.path).toMatch(/^docs\/academy\/recovery\/recovered-assets\/codex-production-v1\/(backgrounds\/(wide|mobile)|lesson-assets)\//);
            if (asset.destination.status === 'recovered-non-runtime') {
                expect(asset.runtimeUses.some((use: { worktree: string }) => use.worktree === 'current')).toBe(false);
            }
            const file = path.resolve(archive.path);
            const digest = sha256File(file);
            expect(digest, archive.path).toBe(asset.sha256);
        }
    });

    it('preserves the purposeful mission ticket as a non-runtime recovery candidate', () => {
        const ticket = ledger.assets.find((asset: { sha256: string }) =>
            asset.sha256 === 'f2c1348655e3145eb8e2722ce0a9708330adf1b6124831ecee4dbc9d0e62a795',
        );
        expect(ticket).toMatchObject({
            orphanState: 'recovered-archive-only',
            bindingVerdict: 'archive-preserved-not-authorized',
            destination: {
                status: 'recovered-non-runtime',
                path: 'docs/academy/recovery/recovered-assets/codex-production-v1/lesson-assets/wide/mission-ticket-letter.jpg',
            },
        });
        expect(ticket.runtimeUses.some((use: { worktree: string }) => use.worktree === 'current')).toBe(false);
    });

    it('records explicit route-home usage for current runtime deliveries', () => {
        const homeDesk = ledger.assets.find((asset: { sha256: string }) =>
            asset.sha256 === '99fa2dbb6eaf91ebb9d4f93e24141e14daa340d70f5fdcd003db05d9cd6be3c1',
        );
        expect(homeDesk).toMatchObject({
            orphanState: 'current-runtime',
            bindingVerdict: 'runtime-authorized',
            destination: {
                status: 'current-runtime',
                path: 'public/academy/art/locations/wide/home-morning-desk__routine--wide.jpg',
            },
        });
        expect(homeDesk.runtimeUses).toEqual(expect.arrayContaining([
            expect.objectContaining({
                worktree: 'current',
                match: 'runtime-ledger-route-home',
                route: 'access:home',
            }),
            expect.objectContaining({
                worktree: 'current',
                match: 'runtime-ledger-route-home',
                route: 'location:home',
            }),
        ]));
    });

    it('records the recovered no-likeness map at the open street reward, not as a generic lesson decoration', () => {
        const map = ledger.assets.find((asset: { sha256: string }) =>
            asset.sha256 === '216a75b37dd745fde640d3821433ee4c460efc7b0a13da5d498f2246bc4b97d1',
        );
        expect(map).toMatchObject({
            orphanState: 'current-runtime',
            bindingVerdict: 'runtime-authorized',
            destination: {
                status: 'current-runtime',
                path: 'public/academy/art/items/street-direction-map__v001.jpg',
            },
        });
        expect(map.runtimeUses).toEqual(expect.arrayContaining([
            expect.objectContaining({
                worktree: 'current',
                match: 'runtime-ledger-route-home',
                route: 'reward:street:directions-map',
            }),
        ]));
    });

    it('records the recovered cafe scene at its one inspectable order home', () => {
        const scene = ledger.assets.find((asset: { sha256: string }) =>
            asset.sha256 === '13773a75ec1369166c763ac2b57f4d1f7bf01baeb7530d0638e104c80de1cf74',
        );
        expect(scene).toMatchObject({
            orphanState: 'current-runtime',
            bindingVerdict: 'runtime-authorized',
            destination: {
                status: 'current-runtime',
                path: 'public/academy/art/items/cafe-order-scene__v001.jpg',
            },
        });
        expect(scene.runtimeUses).toEqual(expect.arrayContaining([
            expect.objectContaining({
                worktree: 'current',
                match: 'runtime-ledger-route-home',
                route: 'reward:cafe:inspectable-order-scene',
            }),
        ]));
    });

    it('keeps high-value speculative props and pose coverage explicit without authorizing them', () => {
        const highValue = ledger.speculativeMissingAssets.filter((asset: { priority: string }) => asset.priority === 'high');
        expect(highValue.map((asset: { id: string }) => asset.id).sort()).toEqual([
            'approved-cast-expression-matrix',
            'interaction-prop-kit',
            'responsive-place-companions',
        ]);
        expect(highValue.every((asset: { confidence: string; routeCandidates: string[] }) =>
            asset.confidence === 'speculative' && asset.routeCandidates.length > 0,
        )).toBe(true);
    });

    it('never promotes rejected or review-only ledger deliveries to current runtime', () => {
        const runtimeLedger = JSON.parse(fs.readFileSync(path.resolve('public/academy/art/ASSET-USAGE.json'), 'utf8')) as {
            assets: Array<{ verdict: string; deliveries?: Array<{ sha256: string }> }>;
        };
        const authorizedHashes = new Set(runtimeLedger.assets
            .filter(asset => asset.verdict.startsWith('approved-runtime') || asset.verdict === 'review-candidate/runtime-preview')
            .flatMap(asset => asset.deliveries ?? [])
            .map(delivery => delivery.sha256));

        for (const asset of ledger.assets.filter((candidate: { runtimeUses: Array<{ worktree: string }> }) =>
            candidate.runtimeUses.some(use => use.worktree === 'current')) as Array<{ sha256: string }>) {
            expect(authorizedHashes.has(asset.sha256), `${asset.sha256} is not runtime-authorized`).toBe(true);
        }
        for (const sha256 of [
            'd66ecccf0c25183923b83bf99f589996e21bd9d7618f9205c294084b7ee5f132',
            'f73eb1e59d604ef728e0a0c6fda33932e5abc098b0860dbd04e0a1ce09d43d6d',
        ]) {
            const asset = ledger.assets.find((candidate: { sha256: string }) => candidate.sha256 === sha256);
            expect(asset.runtimeUses.some((use: { worktree: string }) => use.worktree === 'current')).toBe(false);
            expect(asset.bindingVerdict).not.toBe('runtime-authorized');
        }
    });
});
