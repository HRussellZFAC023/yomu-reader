import { stableHashBase36 } from '../core/stable-hash';
import { isApiMiningEnabled } from '../cards/srs-providers';
import { effectiveJitenApiKey, effectiveJpdbApiKey } from '../settings/api-credential';
import type { ReaderSettings } from '../app/types';

const SUBTITLE_BACKGROUND_PARSE_TIMEOUT_MS = 1_200;
export const SUBTITLE_EMPTY_PARSE_RETRY_MS = 2500;

export interface SubtitleParseOptions {
    jpdbTimeoutMs?: number;
    allowJpdbTimeoutFallback?: boolean;
    includeLocalPitch?: boolean;
    skipJpdb?: boolean;
    requireJpdb?: boolean;
    allowSegmentedFallback?: boolean;
}

export function canParseSubtitleTranscriptRows(settings: ReaderSettings): boolean {
    return hasSubtitleParserSource(settings);
}

export function shouldApplyParsedTranscriptHtml(target: HTMLElement, key: string, provisional = false): boolean {
    if (target.dataset.parseKey !== key) return false;
    if (target.dataset.parsedKey !== key) return true;
    return !provisional && target.dataset.parsedProvisional === 'true';
}

export function hasAttemptedTranscriptParse(target: HTMLElement, key: string): boolean {
    return target.dataset.parsedKey === key
        || hasRecentTranscriptParseAttempt(target.dataset.parseEmptyKey, target.dataset.parseEmptyAt, key)
        || hasRecentTranscriptParseAttempt(target.dataset.parseFailedKey, target.dataset.parseFailedAt, key);
}

export function parsedSubtitleHtmlHasReaderWords(html: string): boolean {
    return html.includes('jpdb-reader-word');
}

export function subtitleParseSourceSignature(settings: ReaderSettings): string {
    const jpdbApiKey = effectiveJpdbApiKey(settings);
    const jitenApiKey = effectiveJitenApiKey(settings);
    return [
        jpdbApiKey ? `jpdb-api:${stableSubtitleHash(jpdbApiKey)}` : 'jpdb-api:off',
        jitenApiKey ? `jiten-api:${stableSubtitleHash(jitenApiKey)}` : 'jiten-api:off',
        settings.localDictionariesEnabled ? 'local:on' : 'local:off',
        settings.localDictionariesEnabled ? dictionaryPreferencesSignature(settings) : '',
        settings.ankiEnabled ? `anki:${stableSubtitleHash(settings.ankiConnectUrl.trim())}` : 'anki:off',
        isApiMiningEnabled(settings) ? 'api-mining:on' : 'api-mining:off',
    ].join('|');
}

export function waitForBackgroundTranscriptParseTurn(delayMs: number): Promise<void> {
    if (delayMs <= 0) return Promise.resolve();
    return new Promise(resolve => window.setTimeout(resolve, delayMs));
}

export function subtitleParseOptions(settings: ReaderSettings): SubtitleParseOptions {
    return {
        jpdbTimeoutMs: SUBTITLE_BACKGROUND_PARSE_TIMEOUT_MS,
        allowJpdbTimeoutFallback: true,
        allowSegmentedFallback: shouldAllowSegmentedSubtitleFallback(settings),
        includeLocalPitch: false,
    };
}

export function provisionalSubtitleParseOptions(): SubtitleParseOptions {
    return {
        skipJpdb: true,
        allowSegmentedFallback: true,
        includeLocalPitch: false,
    };
}

export function authoritativeSubtitleParseOptions(): SubtitleParseOptions {
    return {
        requireJpdb: true,
        includeLocalPitch: false,
    };
}

function hasSubtitleParserSource(_settings: ReaderSettings): boolean {
    return true;
}

function hasRecentTranscriptParseAttempt(markerKey: string | undefined, markerAt: string | undefined, key: string): boolean {
    if (markerKey !== key) return false;
    const markedAt = Number(markerAt || 0);
    return Number.isFinite(markedAt) && Date.now() - markedAt < SUBTITLE_EMPTY_PARSE_RETRY_MS;
}

function stableSubtitleHash(value: string): string {
    return stableHashBase36(value);
}

function dictionaryPreferencesSignature(settings: ReaderSettings): string {
    return settings.dictionaryPreferences
        .map(preference => [
            preference.name,
            preference.alias,
            preference.enabled ? '1' : '0',
            preference.priority,
            preference.allowSecondarySearches ? '1' : '0',
            preference.type ?? '',
        ].join(','))
        .join(';');
}

function shouldAllowSegmentedSubtitleFallback(_settings: ReaderSettings): boolean {
    return true;
}
