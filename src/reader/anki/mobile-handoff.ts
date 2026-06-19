import type { AnkiMediaFile, AnkiNote } from './types';
import type { ReaderSettings } from '../app/types';
import { isAppleTouchBrowser } from '../platform/browser';
import { stripHtml } from './field-mapping';

const ANKI_MOBILE_FALLBACK_DECK = 'Default';
const YOMU_DEFAULT_DECK_NAMES = new Set(['よむ', 'yomu']);

function userAgent(): string {
    return typeof navigator === 'undefined' ? '' : navigator.userAgent;
}

function isAndroidUserAgent(): boolean {
    return /Android/i.test(userAgent());
}

function isMobileAnkiHandoffEnvironment(): boolean {
    return isAppleTouchBrowser()
        || (isAndroidUserAgent() && /Chrome|Firefox|EdgA/i.test(userAgent()));
}

export function canUseMobileAnkiHandoff(settings: ReaderSettings): boolean {
    return settings.ankiEnabled && settings.ankiMobileHandoff && isMobileAnkiHandoffEnvironment();
}

export function mobileAnkiHandoffAppName(): string {
    return isAndroidUserAgent() ? 'AnkiDroid' : 'AnkiMobile';
}

export function mobileAnkiHandoffTarget(note: AnkiNote): { appName: string; url: string } {
    if (isAndroidUserAgent()) return { appName: 'AnkiDroid', url: androidAnkiDroidIntentUrl(note) };
    return { appName: 'AnkiMobile', url: iosAnkiMobileUrl(note) };
}

export function openMobileAnkiHandoff(note: AnkiNote): boolean {
    const handoff = mobileAnkiHandoffTarget(note);
    if (!window.confirm(mobileAnkiHandoffPrompt(note, handoff.appName))) return false;
    location.href = handoff.url;
    return true;
}

function mobileAnkiHandoffPrompt(note: AnkiNote, appName: string): string {
    const title = stripForMobileHandoff(note.fields.Expression || note.fields.Sentence || 'this note');
    return `Open ${appName} to add "${title}"? This creates a new note only.`;
}

function iosAnkiMobileUrl(note: AnkiNote): string {
    // AnkiMobile's x-callback parser does not decode '+' as a space, so spaces
    // must encode as %20 (encodeURIComponent), not '+' (URLSearchParams).
    const params: string[] = [];
    const add = (key: string, value: string) => params.push(`${key}=${encodeURIComponent(value)}`);
    add('type', note.modelName);
    add('deck', iosAnkiMobileDeckName(note.deckName));
    if (note.tags?.length) add('tags', note.tags.join(' '));
    Object.entries(iosAnkiMobileFields(note)).forEach(([field, value]) => {
        const handoffValue = iosAnkiMobileFieldValue(field, value);
        if (handoffValue !== null) add(`fld${field}`, handoffValue);
    });
    return `anki://x-callback-url/addnote?${params.join('&')}`;
}

function iosAnkiMobileDeckName(deckName: string): string {
    const trimmed = deckName.trim();
    return YOMU_DEFAULT_DECK_NAMES.has(trimmed.toLowerCase()) ? ANKI_MOBILE_FALLBACK_DECK : trimmed || ANKI_MOBILE_FALLBACK_DECK;
}

function iosAnkiMobileFields(note: AnkiNote): Record<string, string> {
    const fields = { ...note.fields };
    const audioUrl = firstRemoteMediaUrl(note.audio);
    const audioField = firstMediaFieldName(note.audio) || 'Audio';
    if (audioUrl && !(fields[audioField] ?? '').trim()) fields[audioField] = audioUrl;
    return fields;
}

function firstRemoteMediaUrl(files: AnkiMediaFile[] | undefined): string {
    return files?.map(file => file.url ?? '').find(isRemoteMediaUrl) ?? '';
}

function firstMediaFieldName(files: AnkiMediaFile[] | undefined): string {
    return files?.flatMap(file => file.fields ?? []).map(field => field.trim()).find(Boolean) ?? '';
}

function isRemoteMediaUrl(value: string): boolean {
    return /^https?:\/\//i.test(value)
        && /\.(?:aac|flac|gif|jpe?g|m4a|mp3|mp4|oga|ogg|opus|png|svg|webm|webp|wav)(?:[?#].*)?$/i.test(value);
}

function iosAnkiMobileFieldValue(field: string, value: string): string | null {
    if (field !== 'Image') return value;
    const trimmed = value.trim();
    if (!trimmed || /^data:/i.test(trimmed)) return null;
    return trimmed;
}

function androidAnkiDroidIntentUrl(note: AnkiNote): string {
    const front = stripForMobileHandoff(note.fields.Expression || note.fields.Sentence || '');
    const back = stripForMobileHandoff([
        note.fields.Reading,
        note.fields.Meaning,
        note.fields.DictionaryDefinitions,
        note.fields.Source,
    ].filter(Boolean).join('\n\n'));
    return [
        'intent:#Intent',
        'action=android.intent.action.SEND',
        'type=text/plain',
        'package=com.ichi2.anki',
        `S.android.intent.extra.SUBJECT=${encodeURIComponent(front)}`,
        `S.android.intent.extra.TEXT=${encodeURIComponent(back)}`,
        `S.browser_fallback_url=${encodeURIComponent('https://play.google.com/store/apps/details?id=com.ichi2.anki')}`,
        'end',
    ].join(';');
}

function stripForMobileHandoff(value: string): string {
    return stripHtml(value).replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
