import { afterEach, expect, it, vi } from 'vitest';
import { AnkiConnectClient } from '../../src/reader/anki/client';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { reviewGradeScale } from '../../src/reader/cards/grade-scale';
import type { JPDBGrade } from '../../src/reader/app/types';

const clients: AnkiConnectClient[] = [];
afterEach(() => {
    clients.splice(0).forEach(client => client.destroy());
    vi.restoreAllMocks();
});

function fixture(result: unknown = [true]) {
    const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, interfaceLanguage: 'en' }));
    clients.push(client);
    const invoke = vi.spyOn(client, 'invoke').mockResolvedValue(result);
    const dirty = vi.spyOn(client as unknown as { markStatusIndexDirtyAfterMutation(kind: string): void }, 'markStatusIndexDirtyAfterMutation').mockImplementation(() => undefined);
    return { client, invoke, dirty };
}

it.each(['invalid', 'toString', 'constructor', '__proto__', undefined, null, 3, {}, { toString: () => 'okay' }])('refuses an invalid runtime grade before native dispatch: %s', async grade => {
    const { client, invoke, dirty } = fixture();
    await expect(client.answerCard(123, grade as JPDBGrade)).rejects.toMatchObject({
        name: 'UserFacingError', yomuUiCopyKey: 'ankiConnectActionFailed',
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(dirty).not.toHaveBeenCalled();
});

it.each([0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, '123', undefined, null])('refuses an invalid runtime card identity before native dispatch: %s', async cardId => {
    const { client, invoke } = fixture();
    await expect(client.answerCard(cardId as number, 'okay')).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
});

it('submits one distinct native ease for each visible Anki grade', async () => {
    const { client, invoke } = fixture();
    for (const [grade] of reviewGradeScale(DEFAULT_SETTINGS, 'anki').grades) await client.answerCard(123, grade);
    expect(invoke.mock.calls).toEqual([1, 2, 3, 4].map(ease => ['answerCards', { answers: [{ cardId: 123, ease }] }]));
});

it.each([['fail', 1], ['something', 2], ['pass', 3]] as const)('preserves the supported %s grade mapping', async (grade, ease) => {
    const { client, invoke } = fixture();
    await client.answerCard(1789730074738, grade);
    expect(invoke).toHaveBeenCalledWith('answerCards', { answers: [{ cardId: 1789730074738, ease }] });
});

it.each([[false], [], [true, true], null, true].map(result => ({ result })))('rejects an unconfirmed native review result $result', async ({ result }) => {
    const { client, invoke, dirty } = fixture(result);
    await expect(client.answerCard(123, 'okay')).rejects.toThrow();
    expect(invoke).toHaveBeenCalledWith('answerCards', { answers: [{ cardId: 123, ease: 3 }] });
    expect(dirty).not.toHaveBeenCalled();
});

it('accepts exactly one affirmative native result', async () => {
    const { client, dirty } = fixture();
    await expect(client.answerCard(123, 'okay')).resolves.toBeUndefined();
    expect(dirty).toHaveBeenCalledOnce();
});
