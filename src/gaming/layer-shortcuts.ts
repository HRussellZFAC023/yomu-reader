/** Own only successfully registered shortcuts, and only for the visible lookup layer. */
export interface LayerShortcutHost {
    register(key: string, callback: () => void): boolean;
    unregister(key: string): void;
}
export class LayerShortcuts {
    private owned = new Set<string>();
    constructor(private host: LayerShortcutHost, private pressed: (key: string) => void) {}
    update(visible: boolean, keys: readonly string[]): string[] {
        const wanted = new Set(visible ? ['Escape', ...keys.filter(key => typeof key === 'string' && key.length < 80)].slice(0, 20) : []);
        for (const key of this.owned) {
            if (!wanted.has(key)) { this.host.unregister(key); this.owned.delete(key); }
        }
        for (const key of wanted) {
            if (this.owned.has(key)) continue;
            try {
                if (this.host.register(key, () => this.pressed(key))) this.owned.add(key);
            } catch { /* Unsupported accelerators remain pointer-only. */ }
        }
        return [...this.owned];
    }
    clear(): void { this.update(false, []); }
}
