import { LocalYomuSrsRepository } from '../../src/reader/srs/local-yomu';
import { createYomuLocalReviewService } from '../../src/academy/integration/yomu-local-review';
import type { ReviewSeed } from '../../src/academy/domain/activity-runtime';

describe('Academy Yomu review bridge', () => {
    beforeEach(() => localStorage.clear());

    it('imports activity evidence into Yomu and records a canonical review rating', async () => {
        let now = 1_000_000;
        const repository = new LocalYomuSrsRepository(() => now);
        const service = createYomuLocalReviewService(repository, () => now);
        const seed: ReviewSeed = {
            id: 'review:please-repeat',
            conceptId: 'repair-language',
            reason: 'repair',
            sourceQuestionId: 'question:welcome-1',
            content: {
                expression: 'もう一度お願いします',
                reading: 'もういちどおねがいします',
                meanings: ['One more time, please.'],
                sentence: 'すみません。もう一度お願いします。',
            },
        };

        await service.ingest([seed]);
        const [item] = await service.due(5);
        expect(item).toMatchObject({
            expression: 'もう一度お願いします',
            reading: 'もういちどおねがいします',
            meaning: 'One more time, please.',
        });

        await service.rate(item.id, 'good');
        now += 1;
        expect(await service.due(5)).toHaveLength(0);
        expect((await repository.stats()).reviewsToday).toBe(1);
    });
});
