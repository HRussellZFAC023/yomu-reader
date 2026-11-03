import type { ReaderSettings } from '../../reader/app/types';
import { uiText, type UiCopyKey } from '../../reader/app/i18n';
import { escapeHtml } from '../../reader/dom/index';
import { isLookupableJapaneseText } from '../../reader/lookup/text-helpers';
import type { YomuGamingBridge, YomuGamingSelectedText } from '../ipc';

const FAILURE_COPY: Record<Exclude<YomuGamingSelectedText['kind'], 'text'>, UiCopyKey> = {
    empty: 'desktopSelectedTextEmpty', permission: 'desktopSelectedTextPermission', unsupported: 'desktopSelectedTextUnsupported',
    unavailable: 'desktopSelectedTextUnavailable', 'too-long': 'desktopSelectedTextTooLong', expired: 'desktopSelectedTextExpired',
};

interface TextLookupReader {
    boot(settings: ReaderSettings): Promise<boolean>;
    lookup(text: string, anchor: HTMLElement): Promise<void>;
    openSettings(): Promise<void>;
}

export async function mountSelectedTextLookup(root: HTMLElement, bridge: Pick<YomuGamingBridge, 'getSelectedText' | 'closeTextLookup' | 'retryTextLookup'>, settings: ReaderSettings, reader: TextLookupReader): Promise<void> {
    const language = settings.interfaceLanguage;
    const t = (key: UiCopyKey) => escapeHtml(uiText(language, key));
    let disposed = false;
    let lookupGeneration = 0;
    window.addEventListener('pagehide', () => { disposed = true; lookupGeneration++; root.replaceChildren(); }, { once: true });
    root.innerHTML = `<main class="selected-text-lookup" data-selected-text-lookup data-jpdb-reader-root lang="${language === 'ja' ? 'ja' : 'en'}">
        <header><h1>${t('desktopSelectedText')}</h1><button type="button" data-selected-close>${t('desktopSelectedTextClose')}</button></header>
        <p class="selected-text-status" role="status" aria-live="polite" data-selected-status></p>
        <div class="selected-text-source" data-selected-text-source tabindex="0" lang="ja"></div>
        <button type="button" data-selected-lookup>${t('desktopSelectedTextLookUp')}</button>
        <details data-selected-paste><summary>${t('desktopSelectedTextPaste')}</summary>
            <form data-selected-form><label>${t('desktopSelectedTextPaste')}<textarea data-selected-input maxlength="20000" rows="3"></textarea></label>
            <button type="submit">${t('desktopSelectedTextLookUp')}</button></form>
        </details>
        <footer><button type="button" data-selected-retry aria-describedby="selected-retry-help">${t('desktopSelectedTextRetry')}</button>
            <button type="button" data-selected-settings>${t('settings')}</button></footer>
        <p class="jpdb-reader-help" id="selected-retry-help">${t('desktopSelectedTextRetryHelp')}</p>
    </main>`;
    const source = root.querySelector<HTMLElement>('[data-selected-text-source]');
    const status = root.querySelector<HTMLElement>('[data-selected-status]');
    const input = root.querySelector<HTMLTextAreaElement>('[data-selected-input]');
    if (!source || !status || !input) return;
    root.querySelector('[data-selected-close]')?.addEventListener('click', () => void bridge.closeTextLookup());
    root.querySelector('[data-selected-retry]')?.addEventListener('click', () => void bridge.retryTextLookup());
    root.querySelector('[data-selected-settings]')?.addEventListener('click', () => void reader.openSettings());
    window.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !document.querySelector('.jpdb-reader-popover')) void bridge.closeTextLookup();
    }, { capture: true });

    const lookup = async (text: string): Promise<void> => {
        const generation = ++lookupGeneration;
        // The source is textContent, never HTML or an OCR response. Keep whitespace.
        source.textContent = text;
        source.hidden = false;
        if (!isLookupableJapaneseText(text)) { status.textContent = uiText(language, 'desktopSelectedTextNoJapanese'); return; }
        status.textContent = uiText(language, 'desktopSelectedTextLookingUp');
        try {
            if (!await reader.boot(settings)) throw new Error('Reader unavailable');
            if (disposed || generation !== lookupGeneration) return;
            await reader.lookup(text, source);
            if (!disposed && generation === lookupGeneration) status.textContent = '';
        } catch {
            if (!disposed && generation === lookupGeneration) status.textContent = uiText(language, 'desktopSelectedTextReaderFailed');
        }
    };
    let capturedText = '';
    const lookupSource = () => {
        const selection = window.getSelection();
        const text = selection && source.contains(selection.anchorNode) && source.contains(selection.focusNode)
            ? selection.toString() : '';
        void lookup(text || capturedText);
    };
    root.querySelector('[data-selected-lookup]')?.addEventListener('click', lookupSource);
    source.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); lookupSource(); }
    });
    root.querySelector('[data-selected-form]')?.addEventListener('submit', event => { event.preventDefault(); capturedText = input.value; void lookup(input.value); });
    let result: YomuGamingSelectedText;
    try { result = await bridge.getSelectedText(Number(new URL(location.href).searchParams.get('textSession'))); }
    catch { result = { kind: 'unavailable' }; }
    if (disposed) return;
    if (result.kind === 'text') { capturedText = result.text; await lookup(result.text); }
    else {
        status.textContent = uiText(language, FAILURE_COPY[result.kind]);
        source.hidden = true;
        root.querySelector<HTMLDetailsElement>('[data-selected-paste]')?.setAttribute('open', '');
        input.focus();
    }
}
