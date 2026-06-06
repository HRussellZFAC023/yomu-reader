import { ANKI_CONNECT_ADDON_URL, DOCS_BASE_URL } from '../constants';
import { escapeHtml, setInnerHtml } from '../dom';
import { resolveUiLanguage, uiText } from '../i18n';
import type { InterfaceLanguage, ReaderSettings } from '../types';

export const MOBILE_ANKI_SETUP_DOCS_URL = `${DOCS_BASE_URL}getting-started#use-desktop-anki-from-a-phone-ipad-or-android`;

export type SettingsStatusTone = 'pending' | 'success' | 'error';
export type SettingsStatusAction = 'anki-unreachable' | 'anki-hosted-bridge';

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

export function renderJitenStatusLine(settings: ReaderSettings): string {
    const { message, tone } = jitenStatusLineForSettings(settings, settings.interfaceLanguage);
    return `<div class="jpdb-reader-help jpdb-reader-status-line" data-jiten-status data-status-tone="${tone}" role="status" aria-live="polite">${formatSettingsStatusLine({ message, tone }, settings.interfaceLanguage)}</div>`;
}

function formatStatusTemplate(template: string, values: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
}

export function jpdbStatusLineForSettings(settings: Pick<ReaderSettings, 'apiKey' | 'jitenApiKey' | 'enableReviews' | 'jpdbMiningEnabled'>, language: InterfaceLanguage): SettingsStatusLine {
    return jpdbStatusLineFromValues(Boolean(settings.apiKey.trim()), Boolean(settings.jitenApiKey.trim()), settings.enableReviews, settings.jpdbMiningEnabled, language);
}

export function jitenStatusLineForSettings(settings: Pick<ReaderSettings, 'jitenApiKey'>, language: InterfaceLanguage): SettingsStatusLine {
    return Boolean(settings.jitenApiKey.trim())
        ? { message: uiText(language, 'jitenApiKeyConfigured'), tone: 'pending' }
        : { message: uiText(language, 'jitenApiKeyMissing'), tone: 'pending' };
}

function jpdbStatusLineFromValues(hasJpdbApiKey: boolean, hasJitenApiKey: boolean, reviewsEnabled: boolean, deckSyncEnabled: boolean, language: InterfaceLanguage): SettingsStatusLine {
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
        message: formatStatusTemplate(uiText(language, 'jpdbApiKeyConfigured'), {
            reviews: uiText(language, reviewsEnabled ? 'statusEnabled' : 'statusDisabled'),
            deckSync: uiText(language, deckSyncEnabled ? 'statusEnabled' : 'statusDisabled'),
        }),
        tone: reviewsEnabled || deckSyncEnabled ? 'success' : 'pending',
    };
}

function jitenAwareMissingApiKeyMessage(language: InterfaceLanguage): string {
    return resolveUiLanguage(language) === 'ja'
        ? 'JPDBまたはJitenキーなし。公開検索のみ使えます。APIの復習・デッキ変更は使えません。'
        : 'No JPDB or Jiten key. Public lookup works; API reviews and deck changes do not.';
}

function jitenApiKeyConfiguredMessage(language: InterfaceLanguage): string {
    return resolveUiLanguage(language) === 'ja'
        ? 'Jitenキーあり。Jiten由来カードの復習・デッキ変更は使えます。JPDB由来カードにはJPDBキーが必要です。'
        : 'Jiten key set. Jiten-backed reviews and deck changes are ready; JPDB-backed cards need a JPDB key.';
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
        return [
            { label: uiText(language, 'ankiStatusOpenDesktop') },
            { label: uiText(language, 'ankiStatusInstallAddon'), href: ANKI_CONNECT_ADDON_URL },
            { label: uiText(language, 'ankiStatusMobileDocs'), href: MOBILE_ANKI_SETUP_DOCS_URL, suffix: uiText(language, 'ankiStatusUseDesktopUrl') },
        ];
    }
    if (action === 'anki-hosted-bridge') {
        return [
            { label: uiText(language, 'ankiStatusEnableUserscript') },
            { label: uiText(language, 'ankiStatusRefreshAndCheck') },
        ];
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
    const hasJpdbApiKey = Boolean(form.querySelector<HTMLInputElement>('input[name="apiKey"]')?.value.trim());
    const hasJitenApiKey = Boolean(form.querySelector<HTMLInputElement>('input[name="jitenApiKey"]')?.value.trim());
    const reviewsEnabled = form.querySelector<HTMLInputElement>('input[name="enableReviews"]')?.checked ?? true;
    const deckSyncEnabled = form.querySelector<HTMLInputElement>('input[name="jpdbMiningEnabled"]')?.checked ?? true;
    const line = jpdbStatusLineFromValues(hasJpdbApiKey, hasJitenApiKey, reviewsEnabled, deckSyncEnabled, language);
    status.dataset.statusTone = line.tone;
    status.replaceChildren(line.message);
}

export function localizeJitenStatus(form: HTMLFormElement, language: InterfaceLanguage): void {
    const status = form.querySelector<HTMLElement>('[data-jiten-status]');
    if (!status || !isInitialJitenSettingsStatus(status.textContent ?? '')) return;
    const hasJitenApiKey = Boolean(form.querySelector<HTMLInputElement>('input[name="jitenApiKey"]')?.value.trim());
    const line = hasJitenApiKey
        ? { message: uiText(language, 'jitenApiKeyConfigured'), tone: 'pending' as const }
        : { message: uiText(language, 'jitenApiKeyMissing'), tone: 'pending' as const };
    status.dataset.statusTone = line.tone;
    status.replaceChildren(formatSettingsStatusLine(line, language));
}

function isInitialJitenSettingsStatus(value: string): boolean {
    return /Add a Jiten API key|Jiten key configured|Jiten APIキー|Jitenキー/.test(value);
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
