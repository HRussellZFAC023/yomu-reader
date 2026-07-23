import { renderRieUnlockScreen } from '../../src/academy/ui/character-scenes';

afterEach(() => {
    document.body.replaceChildren();
});

describe('Rie introduction screen', () => {
    it('lets the learner retry when recording the introduction fails', async () => {
        const onComplete = vi.fn()
            .mockRejectedValueOnce(new Error('offline write failed'))
            .mockResolvedValueOnce(undefined);
        const screen = renderRieUnlockScreen({ language: 'en', onComplete });
        document.body.append(screen);
        const button = screen.querySelector<HTMLButtonElement>('.academy-rie-introduction-primary')!;
        const status = screen.querySelector<HTMLElement>('.academy-rie-introduction-status')!;

        button.click();
        await vi.waitFor(() => expect(status.textContent).toBe('That didn’t save. Try once more.'));
        expect(button.disabled).toBe(false);
        expect(document.activeElement).toBe(button);

        button.click();
        await vi.waitFor(() => expect(onComplete).toHaveBeenCalledTimes(2));
    });
});
