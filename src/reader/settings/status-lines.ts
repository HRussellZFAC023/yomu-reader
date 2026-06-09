import { ANKI_CONNECT_ADDON_URL, DOCS_BASE_URL } from '../app/constants';
import { escapeHtml, setInnerHtml } from '../dom/index';
import { formatUiText, resolveUiLanguage, uiText } from '../app/i18n';
import { hasUserscriptAnkiBridge } from '../anki/index';
import { hasJitenApiCredential, hasJpdbApiCredential, readApiCredentialsFromFormData } from './api-credential';
import type { InterfaceLanguage, ReaderSettings } from '../app/types';

export const MOBILE_ANKI_SETUP_DOCS_URL = `${DOCS_BASE_URL}getting-started#use-desktop-anki-from-a-phone-ipad-or-android`;

export type SettingsStatusTone = 'pending' | 'success' | 'error';
export type SettingsStatusAction = 'anki-unreachable';

export interface SettingsStatusLine {
    message: string;
    tone: SettingsStatusTone;
    action?: SettingsStatusAction;
}

function escapedUiText(language: InterfaceLanguage, key: Parameters<typeof uiText>[1]): string {
    return escapeHtml(uiText(language, key));
}

export function renderJpdbStatusLine(settings: ReaderSettings): string {
    const { message, tone } = jpdbStatusLineForSettings(settings, settings.interfaceLanguage);
    return `<div class="jpdb-reader-help jpdb-reader-status-line" data-jpdb-status data-status-tone="${tone}" role="status" aria-live="polite">${formatSettingsStatusLine({ message, tone }, settings.interfaceLanguage)}</div>`;
}

function formatStatusTemplate(template: string, values: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
}

export function jpdbStatusLineForSettings(settings: Pick<ReaderSettings, 'apiKey' | 'jitenApiKey'>, language: InterfaceLanguage): SettingsStatusLine {
    return jpdbStatusLineFromValues(hasJpdbApiCredential(settings), hasJitenApiCredential(settings), language);
}

function jpdbStatusLineFromValues(hasJpdbApiKey: boolean, hasJitenApiKey: boolean, language: InterfaceLanguage): SettingsStatusLine {
    if (!hasJpdbApiKey && !hasJitenApiKey) {
        return {
            message: jitenAwareMissingApiKeyMessage(language),
            tone: 'pending',
        };
    }
    if (!hasJpdbApiKey) {
        return {
            message: jitenApiKeyConfiguredMessage(language),
            tone: 'success',
        };
    }
    return {
        message: uiText(language, 'jpdbApiKeyConfigured'),
        tone: 'success',
    };
}

function jitenAwareMissingApiKeyMessage(language: InterfaceLanguage): string {
    return resolveUiLanguage(language) === 'ja'
        ? 'JPDBまたはJitenキーなし。'
        : 'No JPDB or Jiten key.';
}

function jitenApiKeyConfiguredMessage(language: InterfaceLanguage): string {
    return resolveUiLanguage(language) === 'ja'
        ? 'Jitenキーあり。'
        : 'Jiten key set.';
}

export function ankiStatusLineForSettings(settings: Pick<ReaderSettings, 'ankiEnabled' | 'ankiConnectUrl'>, language: InterfaceLanguage): SettingsStatusLine {
    return ankiStatusLineFromValues(settings.ankiEnabled, settings.ankiConnectUrl, language);
}

export function formatSettingsStatusLine(line: SettingsStatusLine, language: InterfaceLanguage): string {
    return `${escapedUiText(language, settingsStatusToneLabelKey(line.tone))}: ${escapeHtml(line.message)}`;
}

export function renderAnkiStatusHtml(line: SettingsStatusLine, language: InterfaceLanguage): string {
    const summary = `<div class="jpdb-reader-status-main">${formatSettingsStatusLine(line, language)}</div>`;
    const actions = ankiStatusActions(line.action, language);
    if (!actions.length) return summary;
    return `${summary}<ul class="jpdb-reader-status-checklist">${actions.map(renderStatusAction).join('')}</ul>`;
}

function renderStatusAction(action: { label: string; href?: string; suffix?: string }): string {
    const label = action.href
        ? `<a href="${escapeHtml(action.href)}" target="_blank" rel="noopener">${escapeHtml(action.label)}</a>`
        : escapeHtml(action.label);
    return `<li>${label}${action.suffix ? ` <span>${escapeHtml(action.suffix)}</span>` : ''}</li>`;
}

function ankiStatusActions(action: SettingsStatusAction | undefined, language: InterfaceLanguage): { label: string; href?: string; suffix?: string }[] {
    if (action === 'anki-unreachable') {
        const actions = [
            { label: uiText(language, 'ankiStatusOpenDesktop') },
            { label: uiText(language, 'ankiStatusInstallAddon'), href: ANKI_CONNECT_ADDON_URL },
            { label: uiText(language, 'ankiStatusMobileDocs'), href: MOBILE_ANKI_SETUP_DOCS_URL, suffix: uiText(language, 'ankiStatusUseDesktopUrl') },
        ];
        if (typeof location !== 'undefined' && location.hostname && !['127.0.0.1', 'localhost', '::1'].includes(location.hostname)) {
            if (!hasUserscriptAnkiBridge()) {
                actions.unshift(
                    { label: uiText(language, 'ankiStatusEnableUserscript') },
                    { label: uiText(language, 'ankiStatusRefreshAndCheck') }
                );
            }
            actions.push({
                label: formatUiText(language, 'ankiHostedCorsHint', { origin: location.origin }),
            });
        }
        return actions;
    }
    return [];
}

function settingsStatusToneLabelKey(tone: SettingsStatusTone): Parameters<typeof uiText>[1] {
    if (tone === 'success') return 'statusReady';
    if (tone === 'error') return 'statusError';
    return 'statusAttention';
}

function ankiStatusLineFromValues(ankiEnabled: boolean, ankiConnectUrl: string, language: InterfaceLanguage): SettingsStatusLine {
    if (!ankiEnabled) {
        return {
            message: uiText(language, 'ankiMiningDisabledStatus'),
            tone: 'pending',
        };
    }
    return {
        message: formatStatusTemplate(uiText(language, 'ankiCheckingConnection'), {
            url: ankiConnectUrl.trim(),
        }),
        tone: 'pending',
    };
}

export function localizeJpdbStatus(form: HTMLFormElement, language: InterfaceLanguage): void {
    const status = form.querySelector<HTMLElement>('[data-jpdb-status]');
    if (!status) return;
    const credentials = readApiCredentialsFromFormData(new FormData(form));
    const line = jpdbStatusLineFromValues(hasJpdbApiCredential(credentials), hasJitenApiCredential(credentials), language);
    status.dataset.statusTone = line.tone;
    status.replaceChildren(line.message);
}

export function localizeInitialAnkiStatus(form: HTMLFormElement, language: InterfaceLanguage): void {
    const status = form.querySelector<HTMLElement>('[data-anki-status]');
    if (!status || !isInitialAnkiSettingsStatus(status.textContent ?? '')) return;
    const ankiEnabled = form.querySelector<HTMLInputElement>('input[name="ankiEnabled"]')?.checked ?? false;
    const ankiConnectUrl = form.querySelector<HTMLInputElement>('input[name="ankiConnectUrl"]')?.value ?? '';
    const line = ankiStatusLineFromValues(ankiEnabled, ankiConnectUrl, language);
    status.dataset.statusTone = line.tone;
    setInnerHtml(status, renderAnkiStatusHtml(line, language));
}

function isInitialAnkiSettingsStatus(value: string): boolean {
    return /Checking AnkiConnect|Anki mining disabled|AnkiConnect.*確認中|Ankiマイニングは無効/.test(value);
}
