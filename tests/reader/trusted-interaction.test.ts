import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    allowSyntheticReaderInteractionsForTests,
    bindAuthorizedReaderFormSubmit,
    dispatchAuthorizedReaderControlClick,
    dispatchAuthorizedReaderControlEvent,
    installTrustedReaderRootBoundary,
} from '../../src/reader/ui/trusted-interaction';

function mountReaderForm(contents: string): HTMLFormElement {
    document.body.innerHTML = `<div data-jpdb-reader-root="true"><form>${contents}</form></div>`;
    return document.querySelector<HTMLFormElement>('form')!;
}

describe('trusted Reader form submission', () => {
    afterEach(() => allowSyntheticReaderInteractionsForTests(true));

    it('allows one privately derived submit click while requestSubmit stays blocked', () => {
        allowSyntheticReaderInteractionsForTests(false);
        document.body.innerHTML = `
            <div data-jpdb-reader-root="true">
                <form>
                    <button type="button">Cancel</button>
                    <button type="submit">Save</button>
                </form>
            </div>
        `;
        const form = document.querySelector<HTMLFormElement>('form')!;
        const cancel = form.querySelector<HTMLButtonElement>('button[type="button"]')!;
        const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
        const onSubmit = vi.fn();
        bindAuthorizedReaderFormSubmit(form, onSubmit);
        const boundary = new AbortController();
        installTrustedReaderRootBoundary(document, boundary.signal);

        try {
            form.requestSubmit();
            button.click();
            expect(onSubmit).not.toHaveBeenCalled();

            dispatchAuthorizedReaderControlClick(cancel);
            form.requestSubmit();
            expect(onSubmit).not.toHaveBeenCalled();

            dispatchAuthorizedReaderControlClick(button);
            expect(onSubmit).toHaveBeenCalledTimes(1);

            form.requestSubmit();
            expect(onSubmit).toHaveBeenCalledTimes(1);
        } finally {
            boundary.abort();
            document.body.innerHTML = '';
        }
    });

    it('runs Save before hostile target listeners and rejects their sync and microtask requestSubmit calls', async () => {
        allowSyntheticReaderInteractionsForTests(false);
        document.body.innerHTML = `
            <div data-jpdb-reader-root="true">
                <form><button type="submit">Save</button></form>
            </div>
        `;
        const form = document.querySelector<HTMLFormElement>('form')!;
        const button = form.querySelector<HTMLButtonElement>('button')!;
        const boundary = new AbortController();
        const hostileRequestActive: boolean[] = [];
        let insideHostileRequest = false;
        bindAuthorizedReaderFormSubmit(form, () => hostileRequestActive.push(insideHostileRequest));
        button.addEventListener('click', () => {
            insideHostileRequest = true;
            form.requestSubmit(button);
            insideHostileRequest = false;
            queueMicrotask(() => {
                insideHostileRequest = true;
                form.requestSubmit(button);
                insideHostileRequest = false;
            });
        });
        installTrustedReaderRootBoundary(document, boundary.signal);

        try {
            dispatchAuthorizedReaderControlClick(button);
            expect(hostileRequestActive).toEqual([false]);

            await Promise.resolve();
            expect(hostileRequestActive).toEqual([false]);
        } finally {
            boundary.abort();
            document.body.innerHTML = '';
        }
    });

    it('does not let a nested document-capture requestSubmit become the privileged callback', () => {
        allowSyntheticReaderInteractionsForTests(false);
        document.body.innerHTML = `
            <div data-jpdb-reader-root="true">
                <form><button type="submit">Save</button></form>
            </div>
        `;
        const form = document.querySelector<HTMLFormElement>('form')!;
        const button = form.querySelector<HTMLButtonElement>('button')!;
        const boundary = new AbortController();
        const nestedRequestActive: boolean[] = [];
        let insideNestedRequest = false;
        let observedSubmitEvents = 0;
        bindAuthorizedReaderFormSubmit(form, () => nestedRequestActive.push(insideNestedRequest));
        installTrustedReaderRootBoundary(document, boundary.signal);
        document.addEventListener('submit', event => {
            if (event.target !== form) return;
            observedSubmitEvents += 1;
            if (insideNestedRequest) return;
            insideNestedRequest = true;
            form.requestSubmit(button);
            insideNestedRequest = false;
        }, { capture: true, signal: boundary.signal });

        try {
            dispatchAuthorizedReaderControlClick(button);

            expect(nestedRequestActive).toEqual([false]);
            expect(observedSubmitEvents).toBe(0);
        } finally {
            boundary.abort();
            document.body.innerHTML = '';
        }
    });

    it('rejects broad private events, composing Enter grants, and disconnected controls', () => {
        allowSyntheticReaderInteractionsForTests(false);
        const form = mountReaderForm('<input type="text"><button type="submit">Save</button>');
        const input = form.querySelector<HTMLInputElement>('input')!;
        const button = form.querySelector<HTMLButtonElement>('button')!;
        const onSubmit = vi.fn();
        const boundary = new AbortController();
        bindAuthorizedReaderFormSubmit(form, onSubmit);
        installTrustedReaderRootBoundary(document, boundary.signal);

        try {
            dispatchAuthorizedReaderControlEvent(button, new MouseEvent('click', { bubbles: true, cancelable: true }));
            dispatchAuthorizedReaderControlEvent(input, new KeyboardEvent('keydown', {
                key: 'Enter',
                isComposing: true,
                bubbles: true,
                cancelable: true,
            }));
            form.requestSubmit(button);
            expect(onSubmit).not.toHaveBeenCalled();

            form.remove();
            dispatchAuthorizedReaderControlClick(button);
            expect(onSubmit).not.toHaveBeenCalled();
        } finally {
            boundary.abort();
            document.body.innerHTML = '';
        }
    });

    it('binds one exact owned Save control and rejects injected, cross-form, reparented, and disabled controls', () => {
        allowSyntheticReaderInteractionsForTests(false);
        document.body.innerHTML = `
            <div data-jpdb-reader-root="true">
                <form id="reader-form"><button type="submit">Save</button></form>
                <form id="other-form"></form>
            </div>
        `;
        const form = document.querySelector<HTMLFormElement>('#reader-form')!;
        const otherForm = document.querySelector<HTMLFormElement>('#other-form')!;
        const save = form.querySelector<HTMLButtonElement>('button')!;
        const onSubmit = vi.fn();
        const boundary = new AbortController();
        bindAuthorizedReaderFormSubmit(form, onSubmit);
        otherForm.addEventListener('submit', event => event.preventDefault());
        installTrustedReaderRootBoundary(document, boundary.signal);

        try {
            const injected = document.createElement('button');
            injected.type = 'submit';
            injected.textContent = 'Injected';
            form.append(injected);
            dispatchAuthorizedReaderControlClick(injected);
            expect(onSubmit).not.toHaveBeenCalled();

            save.setAttribute('aria-disabled', 'true');
            dispatchAuthorizedReaderControlClick(save);
            save.removeAttribute('aria-disabled');
            expect(onSubmit).not.toHaveBeenCalled();

            otherForm.append(save);
            dispatchAuthorizedReaderControlClick(save);
            expect(onSubmit).not.toHaveBeenCalled();

            form.append(save);
            dispatchAuthorizedReaderControlClick(save);
            expect(onSubmit).toHaveBeenCalledTimes(1);
        } finally {
            boundary.abort();
            document.body.innerHTML = '';
        }
    });

    it('fails closed when more than one submit control exists at bind time', () => {
        allowSyntheticReaderInteractionsForTests(false);
        document.body.innerHTML = `
            <div data-jpdb-reader-root="true">
                <form>
                    <button type="submit">First</button>
                    <input type="submit" value="Second">
                </form>
            </div>
        `;
        const form = document.querySelector<HTMLFormElement>('form')!;
        const controls = Array.from(form.querySelectorAll<HTMLElement>('button, input'));
        const onSubmit = vi.fn();
        const boundary = new AbortController();
        bindAuthorizedReaderFormSubmit(form, onSubmit);
        installTrustedReaderRootBoundary(document, boundary.signal);

        try {
            for (const control of controls) dispatchAuthorizedReaderControlClick(control);
            expect(onSubmit).not.toHaveBeenCalled();
        } finally {
            boundary.abort();
            document.body.innerHTML = '';
        }
    });

    it('uses intrinsic interactive validation before invoking the privileged callback', () => {
        allowSyntheticReaderInteractionsForTests(false);
        const form = mountReaderForm(`
            <input name="endpoint" type="url" required value="not a URL">
            <button type="submit">Save</button>
        `);
        const input = form.querySelector<HTMLInputElement>('input')!;
        const button = form.querySelector<HTMLButtonElement>('button')!;
        const forgedReportValidity = vi.spyOn(form, 'reportValidity').mockReturnValue(true);
        const onSubmit = vi.fn();
        const boundary = new AbortController();
        bindAuthorizedReaderFormSubmit(form, onSubmit);
        installTrustedReaderRootBoundary(document, boundary.signal);

        try {
            dispatchAuthorizedReaderControlClick(button);
            expect(forgedReportValidity).not.toHaveBeenCalled();
            expect(onSubmit).not.toHaveBeenCalled();

            input.value = 'https://example.com/';
            dispatchAuthorizedReaderControlClick(button);
            expect(onSubmit).toHaveBeenCalledTimes(1);
        } finally {
            boundary.abort();
            document.body.innerHTML = '';
        }
    });

    it('blocks hostile Reader-root state events and grants only one exact private event', () => {
        allowSyntheticReaderInteractionsForTests(false);
        document.body.innerHTML = `
            <div data-jpdb-reader-root="true">
                <form><input name="subtitleFontSize"><button type="submit">Save</button></form>
            </div>
        `;
        const boundary = new AbortController();
        installTrustedReaderRootBoundary(document, boundary.signal);
        const input = document.querySelector<HTMLInputElement>('input')!;
        const form = document.querySelector<HTMLFormElement>('form')!;
        const observed = vi.fn();
        for (const type of ['input', 'change', 'keydown']) input.addEventListener(type, observed);
        form.addEventListener('submit', observed);

        try {
            input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            expect(observed).not.toHaveBeenCalled();

            const authorized = new Event('change', { bubbles: true, cancelable: true });
            dispatchAuthorizedReaderControlEvent(input, authorized);
            expect(observed).toHaveBeenCalledTimes(1);

            input.dispatchEvent(authorized);
            expect(observed).toHaveBeenCalledTimes(1);
        } finally {
            boundary.abort();
            document.body.innerHTML = '';
        }
    });
});
