import fs from 'node:fs';
import path from 'node:path';
import type { LearnerEvent } from '../../src/academy/domain/learner-record';
import { renderReplayStreamPanel } from '../../src/academy/ui/replay-stream-panel';

const DAY = 86_400_000;
const NOW = DAY * 10;

describe('Replay stream panel', () => {
    beforeEach(() => { vi.useFakeTimers({ now: NOW }); });
    afterEach(() => { vi.useRealTimers(); });

    it('keeps the finite-canon and no-rewrite boundary visible with accessible cadence controls', () => {
        const panel = renderReplayStreamPanel({ language: 'en', events: [], onOpenChapter: vi.fn() });

        expect(panel.querySelector('h2')?.textContent).toBe('NG+ replay stream');
        expect(panel.textContent).toContain('Canon: 0 / 48 chapters');
        expect(panel.textContent).toContain('cannot change canon, relationships, or graduation');
        expect(panel.querySelectorAll('fieldset')).toHaveLength(2);
        expect(panel.querySelectorAll('legend')).toHaveLength(2);
        expect(panel.querySelectorAll('input[name="replay-band"]')).toHaveLength(3);
        expect(panel.querySelector<HTMLInputElement>('input[value="ngPlus"]')?.nextElementSibling?.textContent).toContain('NG+');
        expect(panel.querySelector('[role="status"]')?.textContent).toContain('Complete an authored scene');
    });

    it('opens only a completed higher-language practice memory and offers a weekly view without duplicate controls', () => {
        const onOpenChapter = vi.fn();
        const onOpenLesson = vi.fn();
        const panel = renderReplayStreamPanel({ language: 'en', events: replayReadyEvents(), onOpenChapter, onOpenLesson });
        const task = panel.querySelector<HTMLElement>('[data-replay-task="srs-callback"]')!;

        expect(task.dataset.sceneId).toBe('replay:blank-atlas:arrival-greetings');
        task.querySelector<HTMLButtonElement>('.academy-replay-open')?.click();
        expect(onOpenChapter).toHaveBeenCalledWith('s1e01-the-blank-atlas', 'n5');
        task.querySelector<HTMLButtonElement>('.academy-replay-lesson')?.click();
        expect(onOpenLesson).toHaveBeenCalledWith('lesson:foundation-00');

        const ngPlus = panel.querySelector<HTMLInputElement>('input[value="ngPlus"]')!;
        ngPlus.checked = true;
        ngPlus.dispatchEvent(new Event('change', { bubbles: true }));
        panel.querySelector<HTMLButtonElement>('.academy-replay-open')?.click();
        expect(onOpenChapter).toHaveBeenLastCalledWith('s1e01-the-blank-atlas', 'ngPlus');

        const weekly = panel.querySelector<HTMLInputElement>('input[value="weekly"]')!;
        weekly.checked = true;
        weekly.dispatchEvent(new Event('change', { bubbles: true }));
        expect(panel.dataset.replayCadence).toBe('weekly');
        expect(panel.querySelectorAll('input[name="replay-cadence"]')).toHaveLength(2);
    });

    it('keeps the replay layout responsive without hiding the full-width memory action on small screens', () => {
        const styles = fs.readFileSync(path.resolve('src/academy/styles/replay-stream.css'), 'utf8');

        expect(styles).toMatch(/@media \(max-width: 600px\)/);
        expect(styles).toMatch(/\.academy-replay-task \{\s*grid-template-columns: minmax\(0, 1fr\);/s);
        expect(styles).toMatch(/\.academy-replay-task-actions \{ grid-row: auto; width: 100%;/);
    });
});

function replayReadyEvents(): readonly LearnerEvent[] {
    return [
        {
            schemaVersion: 1,
            eventId: 'story:opening',
            at: 1,
            kind: 'characters-encountered',
            encounterId: 'story:s1e01-the-blank-atlas:scene:blank-atlas:arrival-greetings',
            sceneId: 'scene:blank-atlas:arrival-greetings',
            attendeeIds: ['rie'],
        },
        ...[0, 1, 2].map(index => ({
            schemaVersion: 1 as const,
            eventId: `evidence:${index}`,
            at: DAY * (index + 1),
            kind: 'learning-evidence-recorded' as const,
            activityId: 'activity:lesson-zero-greet-rie',
            modeId: 'replay-test',
            skill: 'vocabulary' as const,
            action: 'recall' as const,
            outcome: 'pass' as const,
            conceptIds: ['concept:replay:greeting'],
            independent: true,
        })),
        {
            schemaVersion: 1,
            eventId: 'review:greeting',
            at: NOW - 2,
            kind: 'review-scheduled',
            reviewItemId: 'review:greeting',
            conceptId: 'concept:replay:greeting',
            dueAt: NOW - 1,
            provenance: { source: 'replay-test' },
        },
    ];
}
