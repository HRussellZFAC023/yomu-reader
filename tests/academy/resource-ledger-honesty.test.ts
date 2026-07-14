import fs from 'node:fs';
import path from 'node:path';
import { ACADEMY_LESSON_CONTENT_REGISTRY } from '../../src/academy/content/lesson-content-registry';

describe('Academy resource-ledger claim honesty', () => {
    it('counts only grounded complete class Weeks as playable', () => {
        const lessonRoot = path.resolve('public/academy/content/lessons');
        const ledger = JSON.parse(fs.readFileSync(
            path.resolve('public/academy/content/RESOURCE-LEDGER.json'),
            'utf8',
        ));
        const playableWeekIds = ACADEMY_LESSON_CONTENT_REGISTRY.flatMap(entry => {
                if (entry.kind !== 'lesson' || !entry.classWeekId) return [];
                const value = JSON.parse(fs.readFileSync(path.join(lessonRoot, entry.filename), 'utf8'));
                return entry.audit(value).status === 'playable' ? [entry.classWeekId] : [];
            });

        expect(new Set(playableWeekIds).size).toBe(playableWeekIds.length);
        expect(ledger.coverage.sourceQuestionsAudited).toBe(1);
        expect(ledger.coverage.sourceQuestionsImplemented).toBe(1);
        expect(ledger.coverage.sourceQuestionsPlayable).toBe(0);
        expect(ledger.stage1VerticalSlice.currentRouteState).toBe('legacy-ungrounded-quarantined');
        expect(ledger.stage1VerticalSlice.learnerEvidenceWritesAllowed).toBe(false);
        expect(ledger.coverage.classWeeksPlayable).toBe(playableWeekIds.length);
        expect(ledger.coverage.classWeeksTotal).toBe(73);
        expect(ledger.stage2LibraryCensus.note).toMatch(/contributes no verified or playable source questions/i);
    });
});
