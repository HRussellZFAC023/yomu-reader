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

    it.each(['delete-yomitan-dictionary', 'clear-local-dictionary-site-storage', 'future-durable-action'])
        ('keeps %s blocking Save alongside a nonblocking import', async action => {
            const { coordinator, form } = coordinatorFixture();
            let finishImport!: () => void;
            let finishAction!: () => void;
            const importing = coordinator.runAction(form, coordinator.captureAction(form, 'import-yomitan-dictionary')!,
                () => new Promise<void>(resolve => { finishImport = resolve; }));
            const blocking = coordinator.runAction(form, coordinator.captureAction(form, action)!,
                () => new Promise<void>(resolve => { finishAction = resolve; }));
            expect(coordinator.beginSave(form)).toBeUndefined();
            finishImport();
            await importing;
            expect(coordinator.beginSave(form)).toBeUndefined();
            finishAction();
            await blocking;
            expect(coordinator.beginSave(form)).toBe(0);
            coordinator.finishSave(form);
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

describe('settings restore coordinator install status', () => {
    afterEach(() => {
        document.body.replaceChildren();
        vi.restoreAllMocks();
    });

    function japaneseFixture() {
        document.body.innerHTML = `
            <form>
                <span data-settings-save-status hidden></span>
                <button type="submit">保存</button>
            </form>
        `;
        const form = document.querySelector<HTMLFormElement>('form')!;
        const coordinator = new SettingsRestoreCoordinator({
            interfaceLanguage: () => 'ja',
            currentForm: () => form,
            toast: vi.fn(),
            invalidateRestoreDependents: vi.fn(),
        });
        const save = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
        const status = form.querySelector<HTMLElement>('[data-settings-save-status]')!;
        return { coordinator, form, save, status };
    }

    // YQ-11: an install leaves Save enabled, so the line beside it must not
    // tell a Japanese learner to wait for it.
    it('reports a running install beside an enabled Save without asking to wait', async () => {
        const { coordinator, form, save, status } = japaneseFixture();
        let finish!: () => void;
        const done = new Promise<void>(resolve => { finish = resolve; });
        const install = coordinator.enqueueDictionaryOperation(form, () => done, { holdsSave: false });

        expect(save.disabled).toBe(false);
        expect(save.getAttribute('aria-label')).toBe('保存');
        expect(status.hidden).toBe(false);
        expect(status.textContent).toBe('1件インストール中。');
        expect(status.textContent).not.toContain('完了後に保存');

        finish();
        await install;
        expect(status.hidden).toBe(true);
    });

    it('still asks to wait while a removal holds Save', async () => {
        const { coordinator, form, save, status } = japaneseFixture();
        let finish!: () => void;
        const done = new Promise<void>(resolve => { finish = resolve; });
        const removal = coordinator.enqueueDictionaryOperation(form, () => done);

        expect(save.disabled).toBe(true);
        expect(save.dataset.saveBlocked).toBe('dictionary-import');
        expect(status.textContent).toContain('完了後に保存');

        finish();
        await removal;
    });
});
