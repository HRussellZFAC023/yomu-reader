import { yomuVideoCompanionSlot } from '../companions/registry';

// The Japanese-site-language machinery (locale spoofing, cookie preferences,
// alternate-link redirects, per-site rules) ships in the Yomu Video companion
// (ADR-0003 size budget); without the companion the preference simply does
// nothing — no redirect, no spoofing — which is the correct degraded state.
export function installPreferredJapaneseSiteLanguageFromStoredSettings(): void {
    yomuVideoCompanionSlot()?.installPreferredJapaneseSiteLanguageFromStoredSettings?.();
}

export function applyPreferredJapaneseSiteLanguage(
    enabled: boolean,
    revertOnDisable = false,
    deferCookieResponseReloadUntilPersisted = false,
): void {
    const apply = yomuVideoCompanionSlot()?.applyPreferredJapaneseSiteLanguage;
    if (deferCookieResponseReloadUntilPersisted) {
        apply?.(enabled, revertOnDisable, true);
        return;
    }
    apply?.(enabled, revertOnDisable);
}

export function preferredJapaneseSiteUrl(sourceHref: string, root?: Parameters<typeof import('./preferred-site-language-impl').preferredJapaneseSiteUrl>[1]): string | null {
    return yomuVideoCompanionSlot()?.preferredJapaneseSiteUrl?.(sourceHref, root) ?? null;
}
