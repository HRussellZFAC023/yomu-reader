import achievementData from '../../public/academy/content/achievements.v1.json';
import {
    projectAchievements,
    projectAchievementTiers,
    validateAchievementRegistry,
} from '../../src/academy/domain/achievement-registry';
import { createLearnerRecord } from '../../src/academy/domain/learner-record';

describe('Academy achievement registry', () => {
    it('contains exactly 100 useful bilingual definitions across every required group', () => {
        const registry = validateAchievementRegistry(achievementData);
        expect(registry.definitions).toHaveLength(100);
        expect(new Set(registry.definitions.map(definition => definition.id)).size).toBe(100);
        expect(registry.definitions.every(definition => definition.title.en && definition.title.ja && definition.description.en && definition.description.ja)).toBe(true);
        expect(registry.definitions.every(definition => definition.medalId === `academy:${definition.id}`)).toBe(true);
        expect(new Set(registry.definitions.map(definition => definition.group)).size).toBe(14);
        expect(JSON.stringify(registry)).not.toMatch(/payment|purchase|spend|missed streak|click /i);
    });

    it('tests all 100 x 4 exact tier states and keeps ceremony separate from earned truth', () => {
        const registry = validateAchievementRegistry(achievementData);
        let states = 0;
        registry.definitions.forEach(definition => {
            (['bronze', 'silver', 'gold', 'platinum'] as const).forEach((tier, tierIndex) => {
                const progress = projectAchievementTiers(definition, definition.thresholds[tier], new Set([`${definition.id}:${tier}`]));
                expect(progress[tierIndex]).toMatchObject({ tier, earned: true, ceremonySeen: true });
                expect(progress.slice(tierIndex + 1).every(next => !next.earned)).toBe(true);
                states += 1;
            });
        });
        expect(states).toBe(400);
    });

    it('derives earning only from matching immutable evidence and never treats an encounter as mastery', async () => {
        const registry = validateAchievementRegistry(achievementData);
        const target = registry.definitions.find(definition => definition.id === 'kana-hiragana-recall')!;
        const empty = projectAchievements(registry, []);
        expect(empty.every(progress => progress.tiers.every(tier => !tier.earned))).toBe(true);
        const record = createLearnerRecord();
        await record.record({
            kind: 'vocabulary-collected',
            eventId: 'encounter',
            collectionItemId: 'item:1',
            expression: 'かな',
            meanings: ['kana'],
            provenance: { origin: 'academy', encounterId: 'e', activityId: 'a' },
        });
        expect(projectAchievements(registry, await record.history()).find(progress => progress.id === target.id)?.tiers[0]?.earned).toBe(false);
        await record.recordMany(Array.from({ length: target.thresholds.bronze }, (_, index) => ({
            kind: 'learning-evidence-recorded' as const,
            eventId: `recall:${index}`,
            activityId: `kana:${index}`,
            modeId: 'normal-challenge',
            skill: 'kana' as const,
            action: 'recall' as const,
            outcome: 'pass' as const,
            conceptIds: [`${target.criterion.conceptPrefix}${index}`],
            independent: true,
        })));
        const earned = projectAchievements(registry, await record.history()).find(progress => progress.id === target.id)!;
        expect(earned.tiers[0]).toMatchObject({ earned: true, ceremonySeen: false });
    });

    it('earns relationship achievements from authored journal chapters, never raw bond points', async () => {
        const registry = validateAchievementRegistry(achievementData);
        const target = registry.definitions.find(definition => definition.id === 'character-bond-open-journal-chapters')!;
        const record = createLearnerRecord();
        await record.record({ kind: 'bond-changed', eventId: 'points', characterId: 'rie', delta: 999 });
        expect(projectAchievements(registry, await record.history()).find(progress => progress.id === target.id)?.tiers[0]?.earned).toBe(false);
        await record.record({ kind: 'relationship-chapter-unlocked', eventId: 'chapter', characterId: 'rie', chapter: 1, majorTurn: 'recognition' });
        expect(projectAchievements(registry, await record.history()).find(progress => progress.id === target.id)?.tiers[0]?.earned).toBe(true);
    });
});
