import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingsRestoreCoordinator } from '../../src/reader/settings/settings-restore-coordinator';

function coordinatorFixture() {
    document.body.innerHTML = `
        <form>
            <fieldset data-settings-panel="appearance"><input name="theme"></fieldset>
            <button type="submit">Save</button>
        </form>
    `;
    const form = document.querySelector<HTMLFormElement>('form')!;
    const coordinator = new SettingsRestoreCoordinator({
        interfaceLanguage: () => 'en',
        currentForm: () => form,
        toast: vi.fn(),
        invalidateRestoreDependents: vi.fn(),
    });
    return { coordinator, form };
}

describe('settings restore coordinator latch recovery', () => {
    afterEach(() => {
        document.body.replaceChildren();
        vi.restoreAllMocks();
    });

    it('releases a durable-action latch when its initial UI projection throws', async () => {
        const { coordinator, form } = coordinatorFixture();
        const query = vi.spyOn(form, 'querySelector').mockImplementationOnce(() => {
            throw new Error('detached form projection failed');
        });

        await expect(coordinator.runDurableOperation(async () => undefined))
            .rejects.toThrow('detached form projection failed');
        query.mockRestore();

        expect(coordinator.beginSave(form)).toBe(0);
        coordinator.finishSave(form);
    });

    it('releases the Save latch when its initial UI projection throws', () => {
        const { coordinator, form } = coordinatorFixture();
        const query = vi.spyOn(form, 'querySelector').mockImplementationOnce(() => {
            throw new Error('save projection failed');
        });

        expect(() => coordinator.beginSave(form)).toThrow('save projection failed');
        query.mockRestore();

        expect(coordinator.beginSave(form)).toBe(0);
        coordinator.finishSave(form);
    });

    it('releases restore and dictionary latches when their initial UI projection throws', async () => {
        const { coordinator, form } = coordinatorFixture();
        const restoreQuery = vi.spyOn(form, 'querySelector').mockImplementationOnce(() => {
            throw new Error('restore projection failed');
        });

        await expect(coordinator.runRestore(form, async () => undefined))
            .rejects.toThrow('restore projection failed');
        restoreQuery.mockRestore();
        await expect(coordinator.runRestore(form, async () => 'restored')).resolves.toBe('restored');

        const dictionaryQuery = vi.spyOn(form, 'querySelector').mockImplementationOnce(() => {
            throw new Error('dictionary projection failed');
        });
        expect(() => coordinator.enqueueDictionaryOperation(form, async () => undefined))
            .toThrow('dictionary projection failed');
        dictionaryQuery.mockRestore();

        expect(coordinator.beginSave(form)).toBe(4);
        coordinator.finishSave(form);
    });
});
