import { createSceneRuntime, type SceneHost, type SceneScript } from '../../src/academy/domain/scene-runtime';

function script(): SceneScript {
    return {
        id: 'scene:opening',
        revision: 'v1',
        title: 'The open doors',
        band: 'foundation',
        nodes: [
            { kind: 'stage', id: 'stage:doors', plate: 'campus-entrance', theme: 'opening.invitation' },
            { kind: 'line', id: 'line:welcome', speaker: 'rie', ja: 'こんばんは。', en: 'Good evening.' },
            {
                kind: 'choice',
                id: 'choice:reason',
                options: [
                    { id: 'books', en: 'Read books', set: { reason: 'books' }, to: 'after-choice' },
                    { id: 'friends', en: 'Talk with friends', set: { reason: 'friends' }, to: 'after-choice' },
                ],
            },
            { kind: 'line', id: 'line:unreachable', en: 'This is skipped.' },
            { kind: 'label', id: 'label:after-choice', name: 'after-choice' },
            { kind: 'line', id: 'line:next', speaker: 'rie', ja: '始めましょう。', en: 'Let us begin.' },
            { kind: 'complete', id: 'complete:opening', result: { rieUnlocked: true } },
        ],
    };
}

function host(events: string[], choice = 'books'): SceneHost {
    return {
        async direct(direction) { events.push(`stage:${direction.id}`); },
        async line(line) { events.push(`line:${line.id}`); },
        async choice(node) { events.push(`choice:${node.id}`); return choice; },
        async activity(node) { events.push(`activity:${node.id}`); return {}; },
        async finish() { events.push('finish'); },
        dispose() { events.push('dispose'); },
    };
}

describe('scene runtime', () => {
    it('executes data, choices and flags without narrative DOM ownership', async () => {
        const events: string[] = [];
        const result = await createSceneRuntime().play(script(), { host: host(events) });

        expect(result.completed).toBe(true);
        expect(result.snapshot.flags).toMatchObject({ reason: 'books', rieUnlocked: true });
        expect(result.snapshot.choices).toEqual(['books']);
        expect(result.snapshot.readLineIds).toEqual(['line:welcome', 'line:next']);
        expect(events).toEqual([
            'stage:stage:doors',
            'line:line:welcome',
            'choice:choice:reason',
            'line:line:next',
            'finish',
            'dispose',
        ]);
    });

    it('checkpoints an aborted scene and resumes from the compatible snapshot', async () => {
        const controller = new AbortController();
        const firstEvents: string[] = [];
        const firstHost = host(firstEvents);
        const originalLine = firstHost.line;
        firstHost.line = async line => {
            await originalLine(line);
            controller.abort();
        };
        const runtime = createSceneRuntime();
        const interrupted = await runtime.play(script(), { host: firstHost, signal: controller.signal });
        expect(interrupted.completed).toBe(false);
        expect(interrupted.snapshot.cursor).toBe(2);

        const resumedEvents: string[] = [];
        const resumed = await runtime.play(script(), { host: host(resumedEvents), snapshot: interrupted.snapshot });
        expect(resumed.completed).toBe(true);
        expect(resumedEvents[0]).toBe('choice:choice:reason');
        expect(resumedEvents).not.toContain('line:line:welcome');
    });

    it('keeps completion committed when cancellation arrives during finish cleanup', async () => {
        const controller = new AbortController();
        const events: string[] = [];
        const finishingHost = host(events);
        finishingHost.finish = async () => {
            events.push('finish');
            controller.abort();
        };
        const result = await createSceneRuntime().play(script(), { host: finishingHost, signal: controller.signal });
        expect(result.completed).toBe(true);
        expect(result.snapshot.cursor).toBe(script().nodes.length);
    });

    it('rejects invalid control flow before mounting a host', async () => {
        const invalid: SceneScript = {
            ...script(),
            nodes: [{ kind: 'jump', id: 'jump:missing', to: 'nowhere' }],
        };
        expect(createSceneRuntime().validate(invalid)).toEqual(expect.arrayContaining([
            'jump jump:missing targets missing label nowhere',
            'scene has no complete node',
        ]));
        await expect(createSceneRuntime().play(invalid, { host: host([]) })).rejects.toThrow('invalid');
    });
});
