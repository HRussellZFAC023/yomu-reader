import { afterEach, expect, it, vi } from 'vitest';
import { AnkiConnectClient } from '../../src/reader/anki/client';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { reviewGradeScale } from '../../src/reader/cards/grade-scale';

afterEach(() => { vi.restoreAllMocks(); });

it('submits one distinct native ease for each visible Anki grade', async () => {
    const client = new AnkiConnectClient(() => DEFAULT_SETTINGS);
    const invoke = vi.spyOn(client, 'invoke').mockResolvedValue([true]);
    vi.spyOn(client as unknown as { markStatusIndexDirtyAfterMutation(kind: string): void }, 'markStatusIndexDirtyAfterMutation').mockImplementation(() => undefined);
    try {
        for (const [grade] of reviewGradeScale(DEFAULT_SETTINGS, 'anki').grades) await client.answerCard(123, grade);
        expect(invoke.mock.calls).toEqual([1, 2, 3, 4].map(ease => ['answerCards', { answers: [{ cardId: 123, ease }] }]));
    } finally { client.destroy(); }
});

it.each([[false], [], [true, true], null, true].map(result => ({ result })))('rejects an unconfirmed native review result $result', async ({ result }) => {
    const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, interfaceLanguage: 'en' }));
    const invoke = vi.spyOn(client, 'invoke').mockResolvedValue(result);
    const dirty = vi.spyOn(client as unknown as { markStatusIndexDirtyAfterMutation(kind: string): void }, 'markStatusIndexDirtyAfterMutation');
    try {
        await expect(client.answerCard(123, 'okay')).rejects.toThrow();
        expect(invoke).toHaveBeenCalledWith('answerCards', { answers: [{ cardId: 123, ease: 3 }] });
        expect(dirty).not.toHaveBeenCalled();
    } finally { client.destroy(); }
});

it('accepts exactly one affirmative native result', async () => {
    const client = new AnkiConnectClient(() => DEFAULT_SETTINGS);
    vi.spyOn(client, 'invoke').mockResolvedValue([true]);
    const dirty = vi.spyOn(client as unknown as { markStatusIndexDirtyAfterMutation(kind: string): void }, 'markStatusIndexDirtyAfterMutation').mockImplementation(() => undefined);
    try {
        await expect(client.answerCard(123, 'okay')).resolves.toBeUndefined();
        expect(dirty).toHaveBeenCalledOnce();
    } finally { client.destroy(); }
});
