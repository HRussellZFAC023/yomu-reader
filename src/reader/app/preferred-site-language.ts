import { yomuVideoCompanionSlot } from '../companions/registry';
import { isHostedReaderRuntime } from './runtime-presence';

// The Japanese-site-language machinery (locale hints, cookie preferences,
// alternate-link redirects, per-site rules) ships in the Yomu Video companion
// (ADR-0003 size budget); without the companion the preference simply does
// nothing, which is the correct degraded state.
export async function installPreferredJapaneseSiteLanguageFromStoredSettings(): Promise<void> {
    if (isHostedReaderRuntime()) return;
    await yomuVideoCompanionSlot()?.installPreferredJapaneseSiteLanguageFromStoredSettings?.();
}

export function applyPreferredJapaneseSiteLanguage(
    enabled: boolean,
    revertOnDisable = false,
    deferCookieResponseReloadUntilPersisted = false,
    targetLanguage = 'ja',
): void {
    if (isHostedReaderRuntime()) return;
    yomuVideoCompanionSlot()?.applyPreferredJapaneseSiteLanguage?.(
        enabled,
        revertOnDisable,
        deferCookieResponseReloadUntilPersisted,
        targetLanguage,
    );
}

export function preferredJapaneseSiteUrl(sourceHref: string, root?: Parameters<typeof import('./preferred-site-language-impl').preferredJapaneseSiteUrl>[1]): string | null {
    return yomuVideoCompanionSlot()?.preferredJapaneseSiteUrl?.(sourceHref, root) ?? null;
}
