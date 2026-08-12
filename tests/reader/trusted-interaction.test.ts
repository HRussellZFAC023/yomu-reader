import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    allowSyntheticReaderInteractionsForTests,
    bindAuthorizedReaderFormSubmit,
    dispatchAuthorizedReaderControlClick,
    dispatchAuthorizedReaderControlEvent,
    installTrustedReaderRootBoundary,
    ReaderFormSubmitAuthorization,
} from '../../src/reader/ui/trusted-interaction';

const trustedBrowserEvent = { isTrusted: true } as Event;
const syntheticEvent = { isTrusted: false } as Event;

describe('trusted Reader form submission', () => {
    afterEach(() => allowSyntheticReaderInteractionsForTests(true));

    it('does not accept a browser-trusted submit without a preceding gesture token', () => {
        allowSyntheticReaderInteractionsForTests(false);
        const authorization = new ReaderFormSubmitAuthorization();

        expect(authorization.consume(trustedBrowserEvent)).toBe(false);

        authorization.arm(syntheticEvent);
        expect(authorization.consume(trustedBrowserEvent)).toBe(false);

        authorization.arm(trustedBrowserEvent);
        expect(authorization.consume(trustedBrowserEvent)).toBe(true);
        expect(authorization.consume(trustedBrowserEvent)).toBe(false);
    });

    it('expires an unused gesture token before a later scripted submit', async () => {
        allowSyntheticReaderInteractionsForTests(false);
        const authorization = new ReaderFormSubmitAuthorization();

        authorization.arm(trustedBrowserEvent);
        await Promise.resolve();

        expect(authorization.consume(trustedBrowserEvent)).toBe(false);
    });

    it('allows one privately derived submit click while requestSubmit stays blocked', () => {
        allowSyntheticReaderInteractionsForTests(false);
        document.body.innerHTML = `
            <div data-jpdb-reader-root="true">
                <form><button type="submit">Save</button></form>
            </div>
        `;
        const form = document.querySelector<HTMLFormElement>('form')!;
        const button = form.querySelector<HTMLButtonElement>('button')!;
        const onSubmit = vi.fn();
        bindAuthorizedReaderFormSubmit(form, onSubmit);
        const boundary = new AbortController();
        installTrustedReaderRootBoundary(document, boundary.signal);

        try {
            form.requestSubmit();
            button.click();
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
