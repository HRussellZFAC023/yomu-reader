import { ACADEMY_ASSETS } from '../../src/academy/assets';
import { renderDayEndScene } from '../../src/academy/ui/day-end-scene';

afterEach(() => document.body.replaceChildren());

describe('Academy day-end scene', () => {
    it('uses the full-bleed Rie stage and one reversible action', async () => {
        const onReturn = vi.fn();
        const screen = renderDayEndScene({ language: 'en', onReturn });
        document.body.append(screen);

        expect(screen.matches('.academy-vn-stage')).toBe(true);
        expect(screen.dataset.academyRoute).toBe('day-end');
        expect(screen.querySelector<HTMLImageElement>('.academy-vn-plate img')?.src).toContain(ACADEMY_ASSETS.locations.classroom.wide);
        expect(screen.querySelector<HTMLImageElement>('[data-character="rie"] img')?.src).toContain(ACADEMY_ASSETS.rie);
        expect(screen.querySelector('.academy-vn-speaker')?.textContent).toBe('Rie-sensei');
        screen.querySelector<HTMLElement>('.academy-vn-japanese')?.click();
        await vi.waitFor(() => {
            expect(screen.querySelector('.academy-vn-japanese')?.textContent).toBe('今日はここまでにしましょう。またね。');
            expect(screen.querySelector('.academy-vn-translation')?.textContent).toBe('Let’s stop here for today. See you.');
        });
        expect(screen.querySelectorAll('button.academy-day-end-return')).toHaveLength(1);

        screen.querySelector<HTMLButtonElement>('.academy-day-end-return')?.click();
        expect(onReturn).toHaveBeenCalledOnce();
    });

    it('keeps Japanese mode concise and disposes its action listener', () => {
        const onReturn = vi.fn();
        const screen = renderDayEndScene({ language: 'ja', onReturn });
        document.body.append(screen);
        const action = screen.querySelector<HTMLButtonElement>('.academy-day-end-return')!;

        expect(screen.querySelector('.academy-vn-translation')).toBeNull();
        expect(action.textContent).toBe('キャンパスに戻る');
        screen.dispatchEvent(new CustomEvent('academy:dispose'));
        expect(screen.isConnected).toBe(false);
        action.click();
        expect(onReturn).not.toHaveBeenCalled();
    });
});
