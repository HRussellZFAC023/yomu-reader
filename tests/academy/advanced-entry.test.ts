import { createN3AdvancedEntryPlan, N3_ADVANCED_ENTRY_SOURCE_ID } from '../../src/academy/content/advanced-entry';
import type { LearnerEvent } from '../../src/academy/domain/learner-record';
import { renderAdvancedArrivalBridge } from '../../src/academy/ui/advanced-arrival-bridge';

const NOW = Date.UTC(2026, 6, 16, 12);
const DAY = 24 * 60 * 60 * 1_000;

afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

describe('source-owned N3 advanced entry', () => {
    it('keeps the exact Moodle/Minna task, packaged recording, and post-attempt answer gate', () => {
        const plan = createN3AdvancedEntryPlan({ events: [], placementAccepted: false, now: NOW });

        expect(plan).toMatchObject({
            band: 'n3',
            mode: 'guided',
            lessonId: 'authored-week:l2-l07',
            sourceId: N3_ADVANCED_ENTRY_SOURCE_ID,
            independent: false,
        });
        expect(plan.activity).toMatchObject({
            id: 'activity:l2-l07-sensei-minna-074-true-false',
            curriculumPhase: 'assessed-recognition',
            provenance: {
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 6974653,
                    audio: {
                        payloadSha256: '2a287bcef237d1e3f12929dff00f29d7c345fbe622c7ef5bb2cff6caf6b218a0',
                        locator: 'academy/content/minna/audio/l2-l07-minna-074.mp3',
                        url: '/academy/content/listening/media/academy-listening-2a287bcef237d1e3.mp3',
                    },
                },
            },
        });
        expect(plan.activity.payload.tasks).toHaveLength(5);
    });

    it('adapts between placement test-out, lapse repair, and established independent practice', () => {
        expect(createN3AdvancedEntryPlan({ events: [], placementAccepted: true, now: NOW }).mode).toBe('test-out');
        expect(createN3AdvancedEntryPlan({
            events: [learning('lapse', NOW - DAY, 'lapse')],
            placementAccepted: false,
            now: NOW,
        }).mode).toBe('repair');
        expect(createN3AdvancedEntryPlan({
            events: [learning('pass-1', NOW - DAY, 'pass')],
            placementAccepted: false,
            now: NOW,
        }).mode).toBe('independent');
    });

    it('renders opt-in exact audio, teaches the task before commitment, and preserves plot state', async () => {
        const plan = createN3AdvancedEntryPlan({ events: [], placementAccepted: false, now: NOW });
        const onEvaluation = vi.fn(async () => undefined);
        const onContinue = vi.fn();
        const onListeningStart = vi.fn();
        const onListeningStop = vi.fn();
        const screen = renderAdvancedArrivalBridge({
            language: 'en', plan, onEvaluation, onContinue, onListeningStart, onListeningStop,
        });
        document.body.append(screen);

        expect(screen).toMatchObject({ dataset: expect.objectContaining({
            band: 'n3', entryMode: 'guided', storyProgression: 'preserve', sourceOwner: 'moodle-minna',
        }) });
        expect(screen.querySelector('.academy-advanced-entry-teaching')?.textContent)
            .toContain('Choose ○ when the statement matches');
        expect(screen.querySelector('[data-listening-support]')).toBeNull();
        expect(screen.querySelector('[data-audio-delivery="browser-speech"]')).toBeNull();
        const audio = screen.querySelector<HTMLAudioElement>('audio')!;
        expect(audio.controls).toBe(true);
        expect(audio.autoplay).toBe(false);
        expect(audio.preload).toBe('metadata');
        expect(audio.dataset.audioDelivery).toBe('source-recording');
        expect(audio.dataset.sourceSha256).toBe('2a287bcef237d1e3f12929dff00f29d7c345fbe622c7ef5bb2cff6caf6b218a0');
        expect(audio.getAttribute('src')).toBe('/academy/content/listening/media/academy-listening-2a287bcef237d1e3.mp3');

        audio.dispatchEvent(new Event('play'));
        audio.dispatchEvent(new Event('pause'));
        expect(onListeningStart).toHaveBeenCalledOnce();
        expect(onListeningStop).toHaveBeenCalledOnce();

        plan.activity.payload.tasks.forEach(task => {
            const fieldset = screen.querySelector<HTMLElement>(`[data-source-question-id="${task.sourceQuestionId}"]`)!;
            const answer = fieldset.querySelector<HTMLInputElement>(`input[value="${task.correctMark}"]`)!;
            answer.checked = true;
        });
        screen.querySelector<HTMLFormElement>('form')!.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));

        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(screen.querySelector('.academy-source-completion')?.textContent).toContain('Enter the campus'));
        expect(screen.querySelector('[data-listening-support]')).not.toBeNull();
        screen.querySelector<HTMLButtonElement>('.academy-source-completion button')?.click();
        expect(onContinue).toHaveBeenCalledOnce();
    });
});

function learning(eventId: string, at: number, outcome: 'pass' | 'lapse'): LearnerEvent {
    return {
        schemaVersion: 1,
        eventId,
        at,
        kind: 'learning-evidence-recorded',
        activityId: `activity:${eventId}`,
        modeId: 'normal-challenge',
        skill: 'listening',
        action: 'listen',
        outcome,
        conceptIds: ['concept:listening-evidence'],
        independent: true,
    };
}
