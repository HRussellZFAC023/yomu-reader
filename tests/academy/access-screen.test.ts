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
});
