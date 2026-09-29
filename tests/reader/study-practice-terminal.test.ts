import { Blob as NodeBlob } from 'node:buffer';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PracticeSessions, type PracticePurpose } from '../../src/reader/study/practice-session';

describe('practice terminal checkpoints', () => {
    afterEach(() => { vi.unstubAllGlobals(); });

    it.each<PracticePurpose>(['recognition', 'cloze', 'writing', 'listening', 'speaking'])('completes and reloads the last %s item without a pending draft', async purpose => {
        vi.stubGlobal('Blob', NodeBlob);
        const manager = new PracticeSessions(new IDBFactory());
        const session = await manager.start({ purpose, title: 'One word', material: [{
            id: 'water', language: 'ja', spelling: '水', reading: 'みず', meaning: 'water', sentence: '水を飲む。',
            audio: new Blob(['bytes only; not playback proof'], { type: 'audio/wav' }),
        }] });
        const views: string[] = [];
        session.subscribe(view => { views.push(view.status); });
        const written = purpose === 'writing' || purpose === 'cloze';
        await session.dispatch(written
            ? { turn: session.view().turn, kind: 'answer', text: '水' }
            : { turn: session.view().turn, kind: 'reveal' });
        const completion = await session.dispatch(written
            ? { turn: session.view().turn, kind: 'next' }
            : { turn: session.view().turn, kind: 'self-check', outcome: 'recalled' });
        expect(completion).toMatchObject({ kind: 'applied', view: { status: 'complete', phase: 'complete', current: null, position: 1, total: 1 } });
        expect(views.at(-1)).toBe('complete');
        expect((await manager.resume(session.view().id)).view()).toMatchObject({ status: 'complete', current: null, position: 1 });
        expect(await session.pause()).toMatchObject({ kind: 'applied', view: { status: 'complete' } });
    });
});
