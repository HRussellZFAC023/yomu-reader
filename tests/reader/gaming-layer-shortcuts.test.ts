import { describe, expect, it, vi } from 'vitest';
import { LayerShortcuts } from '../../src/gaming/layer-shortcuts';

describe('native keys belong only to a visible desktop lookup', () => {
    it('releases Escape and grade keys when hidden and never unregisters a key another app owns', () => {
        const callbacks = new Map<string, () => void>();
        const host = { register: vi.fn((key: string, callback: () => void) => {
            if (key === '2') return false;
            callbacks.set(key, callback); return true;
        }), unregister: vi.fn() };
        const pressed = vi.fn(), shortcuts = new LayerShortcuts(host, pressed);
        expect(shortcuts.update(true, ['1', '2'])).toEqual(['Escape', '1']);
        callbacks.get('Escape')!();
        expect(pressed).toHaveBeenCalledWith('Escape');
        shortcuts.update(true, []);
        expect(host.unregister).toHaveBeenCalledWith('1');
        expect(host.unregister).not.toHaveBeenCalledWith('2');
        shortcuts.clear();
        expect(host.unregister).toHaveBeenCalledWith('Escape');
    });
    it('does not capture keys while hidden even when stale renderer state arrives', () => {
        const host = { register: vi.fn(() => true), unregister: vi.fn() };
        const shortcuts = new LayerShortcuts(host, () => {});
        expect(shortcuts.update(false, ['1', '2'])).toEqual([]);
        expect(host.register).not.toHaveBeenCalled();
    });
});
