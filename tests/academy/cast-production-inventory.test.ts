import fs from 'node:fs';
import path from 'node:path';
import {
    ACADEMY_CAST_IDENTITY_LOCKS,
    REQUIRED_CAST_PERFORMANCES,
} from '../../src/academy/domain/cast-identity-locks';

interface CastProductionInventory {
    readonly summary: {
        readonly cast: number;
        readonly requiredPerformancesPerCast: number;
        readonly requiredSlots: number;
        readonly integratedSlots: number;
        readonly missingSlots: number;
    };
    readonly cast: readonly {
        readonly castId: string;
        readonly assetFolder: string;
        readonly summary: { readonly required: number; readonly integrated: number; readonly missing: number };
        readonly performances: readonly {
            readonly expression: string;
            readonly status: 'integrated' | 'missing';
            readonly assetPath: string | null;
        }[];
    }[];
    readonly generationQueue: readonly {
        readonly key: string;
        readonly castId: string;
        readonly expression: string;
        readonly runtimeHomes: readonly string[];
        readonly status: string;
    }[];
}

describe('Academy cast production inventory', () => {
    const inventory = JSON.parse(
        fs.readFileSync(path.resolve('docs/academy/art/CAST-PRODUCTION-INVENTORY.json'), 'utf8'),
    ) as CastProductionInventory;

    it('covers the identity-locked roster with every required performance', () => {
        const castIds = Object.keys(ACADEMY_CAST_IDENTITY_LOCKS);
        expect(inventory.summary.cast).toBe(castIds.length);
        expect(inventory.summary.requiredPerformancesPerCast).toBe(REQUIRED_CAST_PERFORMANCES.length);
        expect(inventory.summary.requiredSlots).toBe(castIds.length * REQUIRED_CAST_PERFORMANCES.length);
        expect(inventory.cast.map(member => member.castId).sort()).toEqual([...castIds].sort());

        for (const member of inventory.cast) {
            expect(member.assetFolder).toBe(member.castId);
            expect(member.performances.map(performance => performance.expression))
                .toEqual(REQUIRED_CAST_PERFORMANCES);
            expect(member.summary.required).toBe(REQUIRED_CAST_PERFORMANCES.length);
            expect(member.summary.integrated + member.summary.missing).toBe(member.summary.required);
        }
    });

    it('counts only physical promoted files as integrated', () => {
        for (const member of inventory.cast) {
            for (const performance of member.performances) {
                if (performance.status === 'missing') {
                    expect(performance.assetPath).toBeNull();
                    continue;
                }
                expect(performance.assetPath).toMatch(
                    new RegExp(`^/academy/art/characters/${member.castId}/`, 'u'),
                );
                expect(fs.existsSync(path.resolve('public', performance.assetPath!.slice(1)))).toBe(true);
            }
        }
        expect(inventory.summary.integratedSlots + inventory.summary.missingSlots)
            .toBe(inventory.summary.requiredSlots);
    });

    it('allows the retained house-style anchor to gain newly produced performances', () => {
        const rie = inventory.cast.find(member => member.castId === 'rie');
        expect(rie).toBeDefined();
        expect(rie!.summary).toEqual({
            required: REQUIRED_CAST_PERFORMANCES.length,
            integrated: REQUIRED_CAST_PERFORMANCES.length,
            missing: 0,
        });
        expect(rie!.performances.every(performance => performance.status === 'integrated')).toBe(true);
    });

    it('gives every missing slot one unique runtime-bound generation request', () => {
        expect(inventory.generationQueue).toHaveLength(inventory.summary.missingSlots);
        expect(new Set(inventory.generationQueue.map(item => item.key)).size)
            .toBe(inventory.generationQueue.length);
        for (const item of inventory.generationQueue) {
            expect(item.status).toBe('queued');
            expect(item.runtimeHomes.length).toBeGreaterThan(0);
            expect(ACADEMY_CAST_IDENTITY_LOCKS).toHaveProperty(item.castId);
            expect(REQUIRED_CAST_PERFORMANCES).toContain(item.expression);
        }
    });
});
