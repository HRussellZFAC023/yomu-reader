import { renderAccessScreen } from '../../src/academy/ui/access-screen';

afterEach(() => document.body.replaceChildren());

describe('Academy access screen', () => {
    it('keeps an empty class-code error in the screen instead of opening a native validation bubble', async () => {
        const onSubmit = vi.fn();
        const screen = renderAccessScreen({ language: 'en', onSubmit });
        document.body.append(screen);

        const form = screen.querySelector<HTMLFormElement>('form')!;
        const input = screen.querySelector<HTMLInputElement>('input[name="code"]')!;
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        expect(form.noValidate).toBe(true);
        expect(onSubmit).not.toHaveBeenCalled();
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(screen.querySelector('[role="alert"]')?.textContent).toBeTruthy();
        expect(document.activeElement).toBe(input);

        input.value = 'CLASS-TEST-2026';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        expect(input.hasAttribute('aria-invalid')).toBe(false);
        expect(screen.querySelector('[role="alert"]')).toBeNull();
    });

    it('submits once, exposes mobile code-entry hints, and restores the action after a settled request', async () => {
        let resolveSubmit!: () => void;
        const onSubmit = vi.fn((_code: string, _signal: AbortSignal) => new Promise<void>(resolve => {
            resolveSubmit = resolve;
        }));
        const screen = renderAccessScreen({ language: 'en', onSubmit });
        document.body.append(screen);

        const form = screen.querySelector<HTMLFormElement>('form')!;
        const input = screen.querySelector<HTMLInputElement>('input[name="code"]')!;
        const submit = screen.querySelector<HTMLButtonElement>('button[type="submit"]')!;
        input.value = ' class-test-2026 ';
        form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
        form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));

        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(onSubmit.mock.calls[0]?.[0]).toBe(' class-test-2026 ');
        expect(onSubmit.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
        expect(input.autocapitalize).toBe('characters');
        expect(input.spellcheck).toBe(false);
        expect(submit.disabled).toBe(true);
        expect(submit.getAttribute('aria-busy')).toBe('true');

        resolveSubmit();
        await vi.waitFor(() => expect(submit.disabled).toBe(false));
        expect(submit.textContent).toBe('Open the doors');
    });

    it('aborts an in-flight exchange when its route is disposed without showing a false error', async () => {
        const onSubmit = vi.fn((_code: string, signal: AbortSignal) => new Promise<void>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        }));
        const screen = renderAccessScreen({ language: 'en', onSubmit });
        document.body.append(screen);
        const input = screen.querySelector<HTMLInputElement>('input[name="code"]')!;
        input.value = 'CLASS-TEST-2026';
        input.closest('form')?.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));

        const signal = onSubmit.mock.calls[0]?.[1];
        expect(signal?.aborted).toBe(false);
        screen.dispatchEvent(new CustomEvent('academy:dispose'));

        await vi.waitFor(() => expect(signal?.aborted).toBe(true));
        expect(screen.querySelector('[role="alert"]')).toBeNull();
    });
});
