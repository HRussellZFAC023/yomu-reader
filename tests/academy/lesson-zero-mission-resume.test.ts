import { readFileSync } from 'node:fs';
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';
import { openAcademyPersistence } from '../../src/academy/persistence/indexeddb';
import type { AcademyCheckpoint } from '../../src/academy/persistence/indexeddb';
import { createMemoryLearnerEventRepository } from '../../src/academy/domain/learner-record';
import { createLearnerEvidence } from '../../src/academy/evidence/learner-evidence';
import { createLessonFlow } from '../../src/academy/routing/lesson-flow';
import type { AcademyRouteContext } from '../../src/academy/routing/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLessonZeroMissionDefinition, type LessonZeroMissionActivityId } from '../../src/academy/content/lesson-zero-mission-activity';
import { createLessonZeroMissionScreen, type LessonZeroMissionScreenOptions } from '../../src/academy/ui/lesson-zero-mission-screen';
import { missionProgressIsValid, reconcileMissionReceipt, restoreLessonZeroMissionSession, type LessonZeroMissionSession } from '../../src/academy/domain/lesson-zero-mission-session';
import type { PrivatePracticeRecording } from '../../src/academy/audio/private-practice-recorder';

const content = JSON.parse(readFileSync('public/academy/content/lessons/lesson-zero.v1.json', 'utf8'));
function mount(id: LessonZeroMissionActivityId, overrides: Partial<LessonZeroMissionScreenOptions> = {}) {
    const screen = createLessonZeroMissionScreen({
        language: 'en', definition: createLessonZeroMissionDefinition(content, id, 'Henry'),
        pronunciation: { play: vi.fn(async () => ({ dispose() {} })) },
        onEvaluation: vi.fn(), onBack: vi.fn(), onComplete: vi.fn(), ...overrides,
    });
    document.body.append(screen.element);
    return screen;
}
function click(root: HTMLElement, label: string) {
    const button = [...root.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent?.trim() === label);
    expect(button, label).toBeDefined();
    button!.click();
}
function type(root: HTMLElement, value: string) {
    const input = root.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(input).not.toBeNull();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}
function submit(root: HTMLElement) { root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('durable Lesson Zero mission state', () => {
    it('restores the second completed mission using the shared canonical SRS schedule', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(readFileSync('public/academy/content/lessons/lesson-zero.v1.json'))));
        const repository = createMemoryLearnerEventRepository();
        const evidence = createLearnerEvidence(repository, { ingest: vi.fn(async () => undefined),
            due: async () => [], rate: async () => undefined });
        await evidence.initialize();
        let checkpoint: AcademyCheckpoint = { schemaVersion: 2, route: 'source-activity', routeHistory: [],
            presentationMode: 'course', lessonId: 'lesson:foundation-00', activityId: 'activity:lesson-zero-text-input', updatedAt: 1 };
        let current!: HTMLElement;
        const flow = createLessonFlow({ evidence, pronunciation: { play: async () => ({ dispose() {} }) } as never,
            kanjiWriting: {} as never });
        const context = (): AcademyRouteContext => ({ language: 'en', checkpoint, projection: evidence.projection,
            shell: { replace(view: HTMLElement) { current?.dispatchEvent(new Event('academy:dispose')); current?.remove(); current = view; document.body.append(view); } } as never,
            go: async () => undefined, back: async () => undefined,
            save: async update => { checkpoint = JSON.parse(JSON.stringify({ ...checkpoint, ...update })); },
        });
        await flow.render('source-activity', context());
        click(current, 'の'); click(current, 'も'); click(current, 'Check');
        await vi.waitFor(() => expect(checkpoint.lessonZeroMissionProgress?.['activity:lesson-zero-text-input']?.receipt?.committed).toBe(true));
        checkpoint = { ...checkpoint, activityId: 'activity:lesson-zero-read-name-cards' };
        await flow.render('source-activity', context());
        [...current.querySelectorAll<HTMLButtonElement>('.academy-mission-name-card')]
            .find(button => button.textContent?.includes('Ruparna'))!.click();
        await vi.waitFor(() => expect(checkpoint.lessonZeroMissionProgress?.['activity:lesson-zero-read-name-cards']?.receipt?.committed).toBe(true));
        const before = await repository.readAll();
        expect(before.filter(event => event.kind === 'attempt-recorded')).toHaveLength(2);
        expect(before.filter(event => event.kind === 'review-scheduled')).toHaveLength(1);
        expect(before.some(event => event.eventId === 'review-scheduled:academy:review:activity:lesson-zero-read-name-cards')).toBe(false);
        checkpoint = JSON.parse(JSON.stringify(checkpoint));
        await flow.render('source-activity', context());
        expect(current.textContent).toContain('Done.');
        expect(current.querySelector('.academy-mission-name-card')).toBeNull();
        expect(await repository.readAll()).toEqual(before);
        current.dispatchEvent(new Event('academy:dispose'));
    });

    it('round-trips a UI draft through IndexedDB while rejecting media fields', async () => {
        const name = `mission-resume-${crypto.randomUUID()}`;
        const database = await openAcademyPersistence(fakeIndexedDB, name);
        const checkpoint = { schemaVersion: 2 as const, route: 'source-activity' as const,
            routeHistory: [], presentationMode: 'course' as const, updatedAt: 1 };
        const screen = mount('activity:lesson-zero-text-transfer', {
            onStateChange: state => database.checkpoint.save({ ...checkpoint, lessonZeroMissionProgress: { [state.activityId]: state } }),
        });
        type(screen.element, 'わたしの本です。');
        await vi.waitFor(async () => expect((await database.checkpoint.load())?.lessonZeroMissionProgress
            ?.['activity:lesson-zero-text-transfer']?.writtenDraft).toBe('わたしの本です。'));
        screen.dispose(); screen.element.remove(); database.close();
        const reopened = await openAcademyPersistence(fakeIndexedDB, name);
        try {
            const state = (await reopened.checkpoint.load())!.lessonZeroMissionProgress!['activity:lesson-zero-text-transfer']!;
            const restored = mount('activity:lesson-zero-text-transfer', { initialState: state });
            expect(restored.element.querySelector('textarea')?.value).toBe('わたしの本です。');
            restored.dispose();
            await expect(reopened.checkpoint.save({ ...checkpoint,
                lessonZeroMissionProgress: { [state.activityId]: { ...state, capture: 'blob:private' } },
            } as never)).rejects.toThrow(/mission progress/);
        } finally { reopened.close(); }
    });

    it('restores writing, repair, and a completed outcome without replaying evidence', async () => {
        let saved: LessonZeroMissionSession | undefined;
        const save = vi.fn(async (state: LessonZeroMissionSession) => { saved = structuredClone(state); });
        const evidence = vi.fn();
        let screen = mount('activity:lesson-zero-text-transfer', { onStateChange: save, onEvaluation: evidence });
        type(screen.element, 'aaaaのです');
        await vi.waitFor(() => expect(saved?.writtenDraft).toBe('aaaaのです'));
        submit(screen.element);
        await vi.waitFor(() => expect(saved?.unassessedFeedback).toBeDefined());
        expect(saved?.receipt).toBeUndefined();
        expect(evidence).not.toHaveBeenCalled();
        screen.dispose(); screen.element.remove();
        screen = mount('activity:lesson-zero-text-transfer', { initialState: saved, onStateChange: save, onEvaluation: evidence });
        expect(screen.element.querySelector('textarea')?.value).toBe('aaaaのです');
        expect(screen.element.textContent).toContain('Try again');
        expect(screen.element.querySelector('[data-outcome="unassessed"]')).not.toBeNull();
        click(screen.element, 'Try again');
        type(screen.element, 'わたしの本です。');
        submit(screen.element);
        await vi.waitFor(() => expect(saved?.receipt?.outcome).toBe('pass'));
        await vi.waitFor(() => expect(saved?.receipt?.committed).toBe(true));
        expect(evidence).toHaveBeenCalledOnce();
        screen.dispose(); screen.element.remove();
        screen = mount('activity:lesson-zero-text-transfer', { initialState: saved, onEvaluation: evidence });
        expect(screen.element.textContent).toContain('Done.');
        expect(screen.element.querySelector('textarea')).toBeNull();
        expect(evidence).toHaveBeenCalledOnce();
        expect(missionProgressIsValid({ [saved!.activityId]: saved })).toBe(true);
        expect(missionProgressIsValid({ [saved!.activityId]: { ...saved,
            unassessedFeedback: { explanation: { en: 'Not assessed', ja: '未評価' } },
        } })).toBe(false);
        expect(restoreLessonZeroMissionSession(saved!.activityId, 'changed-revision', saved)).toBeUndefined();
        expect(restoreLessonZeroMissionSession('another-activity', saved!.revision, saved)).toBeUndefined();
        screen.dispose();
    });

    it('does not submit or leave when the draft checkpoint cannot save', async () => {
        const evidence = vi.fn(); const back = vi.fn();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const screen = mount('activity:lesson-zero-text-transfer', { onEvaluation: evidence, onBack: back,
            onStateChange: async () => { throw new Error('disk full'); } });
        type(screen.element, 'わたしの本です。'); submit(screen.element);
        await vi.waitFor(() => expect(screen.element.textContent).toContain('That did not save'));
        expect(evidence).not.toHaveBeenCalled();
        screen.element.querySelector<HTMLButtonElement>('.academy-mission-back')!.click();
        await vi.waitFor(() => expect(screen.element.textContent).toContain('Progress did not save'));
        expect(back).not.toHaveBeenCalled();
        expect(screen.element.querySelector('textarea')?.value).toBe('わたしの本です。');
        screen.dispose();
    });

    it('retries a failed unassessed checkpoint without recording a lapse', async () => {
        let failed = false;
        let saved: LessonZeroMissionSession | undefined;
        const evidence = vi.fn();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const screen = mount('activity:lesson-zero-text-transfer', { onEvaluation: evidence,
            onStateChange: async state => {
                if (state.unassessedFeedback && !failed) { failed = true; throw new Error('disk full'); }
                saved = structuredClone(state);
            } });
        try {
            type(screen.element, '昨日、図書館で勉強しました。'); submit(screen.element);
            await vi.waitFor(() => expect(screen.element.textContent).toContain('That did not save'));
            expect(screen.element.querySelector('textarea')?.value).toBe('昨日、図書館で勉強しました。');
            submit(screen.element);
            await vi.waitFor(() => expect(saved?.unassessedFeedback).toBeDefined());
            expect(saved?.receipt).toBeUndefined();
            expect(evidence).not.toHaveBeenCalled();
        } finally { screen.dispose(); }
    });

    it('does not rebind a disposed screen after an unassessed checkpoint finishes', async () => {
        let release!: () => void;
        const evidence = vi.fn();
        const screen = mount('activity:lesson-zero-text-transfer', { onEvaluation: evidence,
            onStateChange: state => state.unassessedFeedback
                ? new Promise<void>(resolve => { release = resolve; }) : Promise.resolve(),
        });
        type(screen.element, '昨日、図書館で勉強しました。'); submit(screen.element);
        await vi.waitFor(() => expect(release).toBeTypeOf('function'));
        screen.dispose(); screen.element.remove();
        const html = screen.element.innerHTML;
        const add = vi.spyOn(EventTarget.prototype, 'addEventListener');
        release();
        await vi.waitFor(() => expect(screen.element.hasAttribute('aria-busy')).toBe(false));
        expect(screen.element.innerHTML).toBe(html);
        expect(add).not.toHaveBeenCalled();
        expect(evidence).not.toHaveBeenCalled();
    });

    it('heals an evidence commit followed by failed checkpoint save without resubmitting', async () => {
        let saved: LessonZeroMissionSession | undefined;
        const evidence = vi.fn();
        const screen = mount('activity:lesson-zero-written-transfer', { onEvaluation: evidence,
            onStateChange: async state => {
                if (state.receipt?.committed) throw new Error('checkpoint unavailable');
                saved = structuredClone(state);
            } });
        type(screen.element, 'はじめまして。Henryです。'); submit(screen.element);
        await vi.waitFor(() => expect(screen.element.textContent).toContain('Progress did not save'));
        expect(evidence).toHaveBeenCalledOnce();
        expect(saved?.receipt?.committed).toBe(false);
        screen.dispose(); screen.element.remove();
        const committed = { eventId: saved!.receipt!.eventId, kind: 'attempt-recorded', activityId: saved!.activityId, outcome: 'pass' };
        const healed = reconcileMissionReceipt(saved!, [committed]);
        const restored = mount('activity:lesson-zero-written-transfer', { initialState: healed, onEvaluation: evidence });
        expect(restored.element.textContent).toContain('Done.');
        expect(evidence).toHaveBeenCalledOnce();
        expect(reconcileMissionReceipt(saved!, []).receipt).toBeUndefined();
        expect(reconcileMissionReceipt(saved!, [{ ...committed, activityId: 'unrelated' }]).receipt).toBeUndefined();
        expect(reconcileMissionReceipt(saved!, [{ ...committed, outcome: 'lapse' }]).receipt).toBeUndefined();
        const withReview = { ...saved!, receipt: { ...saved!.receipt!, reviewEventIds: ['review-scheduled:needed'],
            reviewKeys: [{ canonical: 'canonical-repeat-request', legacy: 'yomu-local:repeat-request' }] } };
        expect(reconcileMissionReceipt(withReview, [committed]).receipt).toBeUndefined();
        expect(reconcileMissionReceipt({ ...withReview, receipt: { ...withReview.receipt, committed: true } }, [committed]).receipt).toBeUndefined();
        const existingSchedule = { eventId: 'review-scheduled:other-activity', kind: 'review-scheduled', reviewItemId: 'canonical-repeat-request' };
        expect(reconcileMissionReceipt(withReview, [committed, existingSchedule]).receipt?.committed).toBe(true);
        expect(reconcileMissionReceipt(withReview, [committed, { ...existingSchedule, reviewItemId: 'unrelated' }]).receipt).toBeUndefined();
        expect(reconcileMissionReceipt(withReview, [committed, existingSchedule,
            { eventId: 'neutralized', kind: 'review-schedule-neutralized', scheduledEventId: existingSchedule.eventId }]).receipt).toBeUndefined();
        expect(reconcileMissionReceipt(withReview, [committed, { ...existingSchedule, reviewItemId: 'yomu-local:repeat-request' }]).receipt?.committed).toBe(true);
        restored.dispose();
    });

    it('retains self-checks but never persists or restores recording/playback claims', async () => {
        let saved: LessonZeroMissionSession | undefined;
        let complete!: (take: PrivatePracticeRecording) => void;
        const take = { url: 'blob:private-take', mimeType: 'audio/webm', durationMs: 100, dispose: vi.fn() };
        const recorder = { supported: true, dispose: vi.fn(), start: vi.fn(async () => ({
            completion: new Promise<PrivatePracticeRecording>(resolve => { complete = resolve; }), cancel: vi.fn(), stop: vi.fn(),
        })) };
        const screen = mount('activity:lesson-zero-sound-transfer', { recorder,
            onStateChange: async state => { saved = structuredClone(state); } });
        click(screen.element, 'Record');
        await vi.waitFor(() => expect(complete).toBeTypeOf('function'));
        complete(take);
        await vi.waitFor(() => expect(screen.element.querySelector('audio')).not.toBeNull());
        for (const input of screen.element.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
            input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        await vi.waitFor(() => expect(saved?.checks.length).toBeGreaterThan(0));
        expect(saved!.checks).not.toContain('listen-back-reflection');
        expect(JSON.stringify(saved)).not.toMatch(/blob:|mimeType|durationMs|capture|audio\/webm/);
        screen.dispose(); screen.element.remove();
        expect(take.dispose).toHaveBeenCalledOnce();
        const restored = mount('activity:lesson-zero-sound-transfer', { initialState: saved });
        expect(restored.element.querySelector('audio')).toBeNull();
        expect(restored.element.querySelector('input[type="checkbox"]')).toBeNull();
        click(restored.element, 'Speak now');
        const reflection = [...restored.element.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
            .find(input => input.parentElement?.textContent?.includes('listened back'))!;
        expect(reflection.checked).toBe(false);
        expect(missionProgressIsValid({ [saved!.activityId]: { ...saved, recording: take } })).toBe(false);
        restored.dispose();
    });

    it('does not render or rebind a screen disposed during evaluation', async () => {
        let release!: () => void;
        const evidence = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
        let saved: LessonZeroMissionSession | undefined;
        const screen = mount('activity:lesson-zero-text-transfer', { onEvaluation: evidence,
            onStateChange: async state => { saved = structuredClone(state); } });
        type(screen.element, 'わたしの本です。'); submit(screen.element);
        await vi.waitFor(() => expect(release).toBeTypeOf('function'));
        screen.dispose(); screen.element.remove();
        const html = screen.element.innerHTML;
        const add = vi.spyOn(EventTarget.prototype, 'addEventListener');
        release();
        await vi.waitFor(() => expect(saved?.receipt?.committed).toBe(true));
        expect(screen.element.innerHTML).toBe(html);
        expect(add).not.toHaveBeenCalled();
        expect(evidence).toHaveBeenCalledOnce();
    });

    it('cancels a capture that starts after the screen was disposed', async () => {
        let release!: (capture: { completion: Promise<null>; cancel: () => void; stop: () => void }) => void;
        const recorder = { supported: true, dispose: vi.fn(), start: vi.fn(() => new Promise<{ completion: Promise<null>; cancel: () => void; stop: () => void }>(resolve => { release = resolve; })) };
        const screen = mount('activity:lesson-zero-speaking-input', { recorder });
        click(screen.element, 'Record'); screen.dispose(); screen.element.remove();
        const html = screen.element.innerHTML; const cancel = vi.fn();
        release({ completion: Promise.resolve(null), cancel, stop: vi.fn() });
        await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
        expect(screen.element.innerHTML).toBe(html);
    });
});
