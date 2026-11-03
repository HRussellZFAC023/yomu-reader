import { resolveUiLanguage, uiText, type UiCopyKey } from '../../reader/app/i18n';
import type { InterfaceLanguage } from '../../reader/app/types';
import { escapeHtml } from '../../reader/dom/index';
import { formatShortcutEvent } from '../../reader/settings';
import { captureShortcutLabel } from '../capture-shortcut';
import type { YomuGamingBridge, YomuGamingEnvironment, YomuGamingTextLookupShortcut } from '../ipc';
import { DEFAULT_TEXT_LOOKUP_SETTINGS } from '../selected-text-shortcut';

export function installSelectedTextShortcutControls(form: HTMLFormElement, bridge: Pick<YomuGamingBridge, 'updateTextLookupShortcut'>, onSave: (environment: YomuGamingEnvironment) => void) {
    const panel = form.querySelector('#jpdb-reader-settings-panel-shortcuts');
    if (!panel) return undefined;
    const section = document.createElement('div');
    section.className = 'jpdb-reader-settings-subsection yomu-gaming-native-shortcut';
    section.dataset.nativeTextLookupShortcut = 'true';
    panel.prepend(section);
    let language: InterfaceLanguage = 'en';
    let environment: YomuGamingEnvironment | null = null;
    let busy = false;
    let saveFailed = false;
    const state = (): YomuGamingTextLookupShortcut => environment?.textLookupShortcut ?? { ...DEFAULT_TEXT_LOOKUP_SETTINGS, registered: false };

    const render = () => {
        const current = state();
        const t = (key: UiCopyKey) => escapeHtml(uiText(language, key));
        section.innerHTML = `<div class="jpdb-reader-local-title">${t('desktopSelectedText')}</div>
            <p class="jpdb-reader-help">${t('desktopSelectedTextHelp')}</p>
            <label><input type="checkbox" data-text-shortcut-enabled ${current.enabled ? 'checked' : ''}>${t('desktopSelectedTextEnabled')}</label>
            <label><span>${t('desktopSelectedTextShortcut')}</span>
                <input data-text-shortcut-input aria-label="${t('desktopSelectedTextShortcut')}" autocomplete="off" inputmode="none" spellcheck="false"
                    value="${escapeHtml(captureShortcutLabel(current.shortcut, environment?.platform ?? ''))}"></label>
            <p class="jpdb-reader-help">${t('desktopSelectedTextShortcutHelp')}</p>
            <p class="jpdb-reader-help" role="status" data-text-shortcut-status>${escapeHtml(saveFailed ? uiText(language, 'settingsSaveFailed') : selectionShortcutCopy(language, current))}</p>`;
        const input = section.querySelector<HTMLInputElement>('[data-text-shortcut-input]');
        const enabled = section.querySelector<HTMLInputElement>('[data-text-shortcut-enabled]');
        if (!input || !enabled) return;
        input.disabled = busy || !current.enabled;
        enabled.disabled = busy;
        enabled.addEventListener('change', () => void save(current.shortcut, enabled.checked));
        input.addEventListener('keydown', event => {
            if (event.key === 'Tab') return;
            event.preventDefault();
            event.stopPropagation();
            const shortcut = formatShortcutEvent(event);
            if (!shortcut || shortcut.split('+').every(part => ['Alt', 'Ctrl', 'Meta', 'Shift'].includes(part))) return;
            void save(shortcut, enabled.checked);
        });
        input.addEventListener('change', () => void save(input.value, enabled.checked));
        input.addEventListener('paste', event => {
            event.preventDefault();
            void save(event.clipboardData?.getData('text/plain') ?? '', enabled.checked);
        });
    };

    const save = async (shortcut: string, enabled: boolean) => {
        if (busy) return;
        busy = true;
        saveFailed = false;
        render();
        try {
            environment = await bridge.updateTextLookupShortcut({ shortcut, enabled, language: resolveUiLanguage(language) });
            onSave(environment);
        } catch {
            saveFailed = true;
        } finally { busy = false; render(); }
    };

    return {
        update(nextLanguage: InterfaceLanguage, nextEnvironment: YomuGamingEnvironment | null) {
            language = nextLanguage;
            environment = nextEnvironment;
            render();
            // Only synchronize the tray's language after main has returned a real
            // settings snapshot. Missing fields in an older profile keep defaults.
            const current = environment?.textLookupShortcut;
            if (current && current.language !== resolveUiLanguage(language)) void save(current.shortcut, current.enabled);
        },
    };
}

function selectionShortcutCopy(language: InterfaceLanguage, status: YomuGamingTextLookupShortcut): string {
    if (status.error === 'taken') return uiText(language, 'desktopSelectedTextTaken');
    if (status.error === 'invalid') return uiText(language, 'desktopSelectedTextInvalid');
    return uiText(language, !status.enabled ? 'desktopSelectedTextDisabled' : status.registered ? 'desktopSelectedTextReady' : 'desktopSelectedTextTaken');
}
