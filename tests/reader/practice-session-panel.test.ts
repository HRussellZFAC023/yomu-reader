import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PracticeSessionPanel, practiceSessionTabOpen } from '../../src/reader/study/practice-session-panel';
import { PracticeSessions } from '../../src/reader/study/practice-session';
import {
    allowSyntheticReaderInteractionsForTests, dispatchAuthorizedReaderControlClick, dispatchAuthorizedReaderControlEvent,
    installTrustedReaderRootBoundary,
} from '../../src/reader/ui/trusted-interaction';
import { ensureManagedWebStorageCurrent, managedSessionStorage } from '../../src/reader/app/storage';

const material = [
    { id: 'water', language: 'ja', spelling: '水', reading: 'みず', meaning: 'water', sentence: '水を飲む。' },
    { id: 'book', language: 'ja', spelling: '本', reading: 'ほん', meaning: 'book', sentence: '本を読む。' },
];

describe('practice session controls', () => {
    let sessions: PracticeSessions;
    let root: HTMLElement;
    let boundary: AbortController;
    const panels: PracticeSessionPanel[] = [];
    beforeEach(async () => {
        sessions = new PracticeSessions(new IDBFactory());
        root = document.createElement('main');
        root.dataset.jpdbReaderRoot = 'true';
        document.body.replaceChildren(root);
        await ensureManagedWebStorageCurrent();
        managedSessionStorage.removeItem('yomu:practice-session-tab:v1');
        boundary = new AbortController();
        installTrustedReaderRootBoundary(document, boundary.signal);
        allowSyntheticReaderInteractionsForTests(false);
    });
    afterEach(() => {
        panels.splice(0).forEach(panel => panel.destroy());
        boundary?.abort();
        allowSyntheticReaderInteractionsForTests(true);
        managedSessionStorage.removeItem('yomu:practice-session-tab:v1');
        vi.restoreAllMocks();
        document.body.replaceChildren();
    });

    function panel(language: () => 'en' | 'ja' = () => 'en') {
        const instance = new PracticeSessionPanel({ sessions, language, selection: () => ({ title: 'Saved words', material }), leave: vi.fn() });
        panels.push(instance);
        return instance;
    }
    function click(selector: string) {
        const control = root.querySelector<HTMLElement>(selector);
        expect(control, selector).not.toBeNull();
        dispatchAuthorizedReaderControlClick(control!);
    }
    async function start(purpose: string) {
        const select = root.querySelector<HTMLSelectElement>('[data-practice-purpose]')!;
        select.value = purpose;
        dispatchAuthorizedReaderControlEvent(select, new Event('change', { bubbles: true }));
        await vi.waitFor(() => expect(root.querySelector<HTMLButtonElement>('[data-practice-action="start"]')?.disabled).toBe(false));
        click('[data-practice-action="start"]');
        await vi.waitFor(() => expect(root.querySelector('.yomu-practice-prompt')).not.toBeNull());
    }
    async function saved() {
        await vi.waitFor(() => expect(root.querySelector('[data-practice-panel]')?.getAttribute('aria-busy')).toBe('false'));
    }
    function deferred() {
        let resolve!: () => void;
        const promise = new Promise<void>(done => { resolve = done; });
        return { promise, resolve };
    }

    it('disables Start before a selected practice mode has no eligible words', async () => {
        const current = new PracticeSessionPanel({ sessions, language: () => 'en',
            selection: () => ({ title: 'Words without sentences', material: material.map(({ sentence, ...word }) => word) }), leave: vi.fn() });
        panels.push(current);
        await current.show(root);
        const startButton = root.querySelector<HTMLButtonElement>('[data-practice-action="start"]')!;
        expect(startButton.disabled).toBe(false);
        const purpose = root.querySelector<HTMLSelectElement>('[data-practice-purpose]')!;
        purpose.value = 'cloze';
        dispatchAuthorizedReaderControlEvent(purpose, new Event('change', { bubbles: true }));
        await vi.waitFor(() => {
            expect(startButton.disabled).toBe(true);
            expect(root.querySelector('[data-practice-status]')?.textContent).toContain('No selected words');
        });
        expect(await sessions.list()).toEqual([]);
        purpose.value = 'writing';
        dispatchAuthorizedReaderControlEvent(purpose, new Event('change', { bubbles: true }));
        await vi.waitFor(() => expect(startButton.disabled).toBe(false));
    });

    it('shares a delayed restore across two shows without clearing the reload pointer', async () => {
        const record = await sessions.start({ purpose: 'writing', material, title: 'Restored words' });
        await record.dispatch({ kind: 'draft', turn: record.view().turn, text: 'みず' });
        const id = record.view().id;
        record.close();
        managedSessionStorage.setItem('yomu:practice-session-tab:v1', JSON.stringify({ version: 1, sessionId: id }));
        const gate = deferred();
        const resume = sessions.resume.bind(sessions);
        const resumeSpy = vi.spyOn(sessions, 'resume').mockImplementation(async sessionId => {
            await gate.promise;
            return resume(sessionId);
        });
        const listSpy = vi.spyOn(sessions, 'list');
        const current = panel();
        const first = current.show(root);
        const second = current.show(root);
        expect(resumeSpy).toHaveBeenCalledTimes(1);
        expect(listSpy).not.toHaveBeenCalled();
        expect(JSON.parse(managedSessionStorage.getItem('yomu:practice-session-tab:v1')!).sessionId).toBe(id);
        gate.resolve();
        await Promise.all([first, second]);
        expect(root.querySelector<HTMLInputElement>('[data-practice-input]')?.value).toBe('みず');
        expect(JSON.parse(managedSessionStorage.getItem('yomu:practice-session-tab:v1')!).sessionId).toBe(id);
    });

    it('keeps a pending start when shown again', async () => {
        const current = panel();
        await current.show(root);
        const gate = deferred();
        const create = sessions.start.bind(sessions);
        vi.spyOn(sessions, 'start').mockImplementation(async request => {
            await gate.promise;
            return create(request);
        });
        root.querySelector<HTMLSelectElement>('[data-practice-purpose]')!.value = 'writing';
        click('[data-practice-action="start"]');
        const shown = current.show(root);
        gate.resolve();
        await shown;
        expect(root.querySelector('h1')?.textContent).toBe('Write words');
        expect(root.querySelector('[data-practice-input]')).not.toBeNull();
        expect(await sessions.list()).toHaveLength(1);
    });

    it('does not publish an obsolete resume error after a new session starts', async () => {
        managedSessionStorage.setItem('yomu:practice-session-tab:v1', JSON.stringify({ version: 1, sessionId: 'missing' }));
        vi.spyOn(sessions, 'resume').mockRejectedValueOnce(new Error('Missing session'));
        const gate = deferred();
        vi.spyOn(sessions, 'list').mockImplementationOnce(async () => { await gate.promise; return []; });
        const current = panel();
        const opening = current.show(root);
        await vi.waitFor(() => expect(root.querySelector('[data-practice-purpose]')).not.toBeNull());
        expect(root.textContent).toContain('This session could not be opened');
        await start('writing');
        const pointer = managedSessionStorage.getItem('yomu:practice-session-tab:v1');
        gate.resolve();
        await opening;
        expect(root.querySelector('[data-practice-input]')).not.toBeNull();
        expect(root.querySelector('[data-practice-status]')?.textContent).toBe('');
        expect(managedSessionStorage.getItem('yomu:practice-session-tab:v1')).toBe(pointer);
    });

    it('keeps the selected purpose across two words and resumes the exact draft after replacement', async () => {
        const first = panel();
        await first.show(root);
        await start('writing');
        const input = root.querySelector<HTMLInputElement>('[data-practice-input]')!;
        input.value = 'みず';
        input.focus(); input.setSelectionRange(1, 1);
        dispatchAuthorizedReaderControlEvent(input, new Event('input', { bubbles: true }));
        await saved();
        expect(root.querySelector('[data-practice-input]')).toBe(input);
        expect(document.activeElement).toBe(input);
        expect(input.selectionStart).toBe(1);
        first.destroy();

        const resumed = panel();
        await resumed.show(root);
        expect(root.querySelector('h1')?.textContent).toBe('Write words');
        expect(root.querySelector<HTMLInputElement>('[data-practice-input]')?.value).toBe('みず');
        click('button[type="submit"]');
        await vi.waitFor(() => expect(root.querySelector('[data-practice-answer]')?.textContent).toContain('水'));
        click('[data-practice-action="next"]');
        await vi.waitFor(() => expect(root.querySelector('.yomu-practice-prompt')?.textContent).toBe('book'));
        expect(root.querySelector('h1')?.textContent).toBe('Write words');
    });

    it('blocks untrusted starts while permitting the exact private activation', async () => {
        await panel().show(root);
        root.querySelector<HTMLButtonElement>('[data-practice-action="start"]')!.click();
        expect(await sessions.list()).toEqual([]);
        await start('recognition');
        expect(await sessions.list()).toHaveLength(1);
    });

    it('preserves unsaved input across failure and a language refresh', async () => {
        let language: 'en' | 'ja' = 'en';
        const current = panel(() => language);
        await current.show(root);
        await start('writing');
        const input = root.querySelector<HTMLInputElement>('[data-practice-input]')!;
        vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => { throw new DOMException('Quota', 'QuotaExceededError'); });
        input.value = 'まだ保存されていない';
        dispatchAuthorizedReaderControlEvent(input, new Event('input', { bubbles: true }));
        await vi.waitFor(() => expect(root.textContent).toContain('Progress could not be saved'));
        language = 'ja';
        await current.show(root);
        expect(root.querySelector<HTMLInputElement>('[data-practice-input]')?.value).toBe('まだ保存されていない');
        expect(root.textContent).not.toContain('未翻訳');
        expect(root.textContent).toContain('進捗を保存できませんでした');
    });

    it('does not submit an answer while composition is active', async () => {
        await panel().show(root);
        await start('writing');
        const input = root.querySelector<HTMLInputElement>('[data-practice-input]')!;
        input.value = '水';
        dispatchAuthorizedReaderControlEvent(input, new CompositionEvent('compositionstart', { bubbles: true }));
        click('button[type="submit"]');
        expect(root.querySelector('[data-practice-answer]')).toBeNull();
        dispatchAuthorizedReaderControlEvent(input, new CompositionEvent('compositionend', { bubbles: true }));
        click('button[type="submit"]');
        await vi.waitFor(() => expect(root.querySelector('[data-practice-answer]')).not.toBeNull());
    });

    it('supports the same reveal and advance keyboard rhythm without repeating held keys', async () => {
        await panel().show(root);
        await start('recognition');
        const surface = root.querySelector<HTMLElement>('[data-practice-panel]')!;
        dispatchAuthorizedReaderControlEvent(surface, new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
        await vi.waitFor(() => expect(root.querySelector('[data-practice-answer]')).not.toBeNull());
        dispatchAuthorizedReaderControlEvent(surface, new KeyboardEvent('keydown', { key: ' ', repeat: true, bubbles: true, cancelable: true }));
        expect(root.querySelector('.yomu-practice-prompt')?.textContent).toBe('水');
        dispatchAuthorizedReaderControlEvent(surface, new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
        await vi.waitFor(() => expect(root.querySelector('.yomu-practice-prompt')?.textContent).toBe('本'));
    });

    it('offers a working recovery control after a conflicting writer', async () => {
        const current = panel();
        await current.show(root);
        await start('writing');
        const [savedSession] = await sessions.list();
        const other = await sessions.resume(savedSession!.id);
        await other.dispatch({ turn: other.view().turn, kind: 'draft', text: 'other window' });
        const input = root.querySelector<HTMLInputElement>('[data-practice-input]')!;
        input.value = 'this window';
        dispatchAuthorizedReaderControlEvent(input, new Event('input', { bubbles: true }));
        await vi.waitFor(() => expect(root.querySelector('[data-practice-action="reopen"]')).not.toBeNull());
        expect(input.value).toBe('this window');
        click('[data-practice-action="reopen"]');
        await vi.waitFor(() => expect(root.querySelector<HTMLInputElement>('[data-practice-input]')?.value).toBe('other window'));
    });

    it.each(['reveal', 'pause'])('preserves a failed visible draft when %s succeeds', async action => {
        const current = panel();
        await current.show(root);
        await start('writing');
        vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => { throw new DOMException('Quota', 'QuotaExceededError'); });
        const input = root.querySelector<HTMLInputElement>('[data-practice-input]')!;
        input.value = '未保存';
        dispatchAuthorizedReaderControlEvent(input, new Event('input', { bubbles: true }));
        await vi.waitFor(() => expect(root.textContent).toContain('Progress could not be saved'));
        click(`[data-practice-action="${action}"]`);
        await vi.waitFor(() => {
            if (action === 'reveal') expect(root.querySelector('[data-practice-answer]')?.textContent).toContain('水');
            else expect(root.querySelector('[data-practice-command="continue"]')).not.toBeNull();
        });
        await saved();
        const [record] = await sessions.list();
        const restored = await sessions.resume(record!.id);
        expect(restored.view()).toMatchObject({
            status: action === 'pause' ? 'paused' : 'ready',
            position: 0,
            current: { response: { draft: '未保存', revealed: action === 'reveal' } },
        });
        restored.close();
    });

    it('restores the active pointer after leaving and reopening Practice', async () => {
        const current = panel();
        await current.show(root);
        await start('writing');
        const input = root.querySelector<HTMLInputElement>('[data-practice-input]')!;
        input.value = 'みず';
        dispatchAuthorizedReaderControlEvent(input, new Event('input', { bubbles: true }));
        expect(await current.pause()).toBe(true);
        current.hide();
        expect(practiceSessionTabOpen()).toBe(false);
        await current.show(root);
        expect(practiceSessionTabOpen()).toBe(true);
        click('[data-practice-command="continue"]');
        expect(current.element.getAttribute('aria-busy')).toBe('true');
        await saved();
        expect(root.querySelector<HTMLInputElement>('[data-practice-input]')?.value).toBe('みず');
        current.destroy();
        await panel().show(root);
        expect(root.querySelector('h1')?.textContent).toBe('Write words');
        expect(root.querySelector<HTMLInputElement>('[data-practice-input]')?.value).toBe('みず');
    });

    it('renders the durable paused phase after overlapping lifecycle pauses', async () => {
        const current = panel();
        await current.show(root);
        await start('writing');
        const first = current.pause();
        const second = current.pause();
        expect(root.querySelector<HTMLInputElement>('[data-practice-input]')?.disabled).toBe(true);
        expect(await first).toBe(true);
        expect(await second).toBe(true);
        expect(root.querySelector('[data-practice-input]')).toBeNull();
        expect(root.querySelector('[data-practice-command="continue"]')).not.toBeNull();
    });

    it('starts another mode from a restored session without a native word pool', async () => {
        const current = panel();
        await current.show(root);
        await start('recognition');
        current.destroy();
        const restored = new PracticeSessionPanel({ sessions, language: () => 'en', selection: () => ({ title: 'Empty native queue', material: [] }), leave: vi.fn() });
        panels.push(restored);
        await restored.show(root);
        click('[data-practice-command="pause"]');
        expect(restored.element.getAttribute('aria-busy')).toBe('true');
        await saved();
        click('[data-practice-action="new"]');
        await vi.waitFor(() => expect(root.querySelector('[data-practice-purpose]')).not.toBeNull());
        await start('cloze');
        expect(root.querySelector('.yomu-practice-prompt')?.textContent).toBe('＿＿を飲む。');
        expect(root.querySelector('h1')?.textContent).toBe('Complete sentences');
    });

    it('restores keyboard focus for a retry and for the next written prompt', async () => {
        await panel().show(root);
        await start('writing');
        let input = root.querySelector<HTMLInputElement>('[data-practice-input]')!;
        input.value = 'wrong';
        click('button[type="submit"]');
        await vi.waitFor(() => expect(root.querySelector('[data-practice-feedback]')?.textContent).toContain('Try again'));
        input = root.querySelector<HTMLInputElement>('[data-practice-input]')!;
        await vi.waitFor(() => expect(document.activeElement).toBe(input));
        expect(input.selectionStart).toBe(input.value.length);
        input.value = '水';
        click('button[type="submit"]');
        await vi.waitFor(() => expect(root.querySelector('[data-practice-answer]')).not.toBeNull());
        click('[data-practice-action="next"]');
        await vi.waitFor(() => expect(root.querySelector('.yomu-practice-prompt')?.textContent).toBe('book'));
        input = root.querySelector<HTMLInputElement>('[data-practice-input]')!;
        await vi.waitFor(() => expect(document.activeElement).toBe(input));
    });
});
