import { resolveUiLanguage } from '../app/i18n';
import type { InterfaceLanguage, ReaderSettings } from '../app/types';

const BUNPRO_FRONTEND_API_TOKEN_COOKIE = 'frontend_api_token';
const IMPORTER_ID = 'jpdb-reader-bunpro-token-importer';
const BUNPRO_SETTINGS_PATH = '/settings/api';

type BunproCookieStore = {
    get: (name: string) => Promise<BunproCookieStoreItem | null | undefined>;
};

interface BunproCookieStoreItem {
    value?: string;
    expires?: number | string | Date | null;
}

export interface BunproFrontendToken {
    token: string;
    expiresAt: string;
}

export interface BunproFrontendTokenImporterOptions {
    getSettings: () => ReaderSettings;
    setSettings: (settings: ReaderSettings) => void;
    saveSettings: (settings: ReaderSettings) => Promise<void>;
    toast?: (message: string) => void;
    language?: () => InterfaceLanguage;
    href?: string;
    cookieHeader?: () => string;
    cookieStore?: BunproCookieStore;
}

export function isBunproApiSettingsPage(href = safeHref()): boolean {
    try {
        const url = new URL(href, safeHref());
        const host = url.hostname.toLowerCase();
        return (host === 'bunpro.jp' || host.endsWith('.bunpro.jp'))
            && normalizePathname(url.pathname) === BUNPRO_SETTINGS_PATH;
    } catch {
        return false;
    }
}

export async function readBunproFrontendToken(options: Pick<BunproFrontendTokenImporterOptions, 'cookieHeader' | 'cookieStore'> = {}): Promise<BunproFrontendToken | null> {
    const fromCookieStore = await readBunproFrontendTokenFromCookieStore(options.cookieStore ?? globalCookieStore());
    if (fromCookieStore) return fromCookieStore;
    return readBunproFrontendTokenFromCookieHeader(options.cookieHeader?.() ?? safeDocumentCookie());
}

export function readBunproFrontendTokenFromCookieHeader(cookieHeader: string): BunproFrontendToken | null {
    const token = cookieValue(cookieHeader, BUNPRO_FRONTEND_API_TOKEN_COOKIE);
    return token ? { token, expiresAt: '' } : null;
}

export async function installBunproFrontendTokenImporter(options: BunproFrontendTokenImporterOptions): Promise<void> {
    if (typeof document === 'undefined') return;
    if (!isBunproApiSettingsPage(options.href)) return;
    await waitForBody();
    if (!document.body || document.getElementById(IMPORTER_ID)) return;

    const language = resolveUiLanguage(options.language?.() ?? options.getSettings().interfaceLanguage);
    const token = await readBunproFrontendToken(options);
    const root = document.createElement('section');
    root.id = IMPORTER_ID;
    root.className = 'jpdb-reader-bunpro-token-importer';
    root.dataset.jpdbReaderRoot = 'true';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', copy(language).title);
    root.append(renderBunproImporterContent(token, language));
    document.body.append(root);

    const button = root.querySelector<HTMLButtonElement>('[data-action="import-bunpro-token"]');
    button?.addEventListener('click', () => {
        void importBunproToken(token, options, root, language);
    });
}

async function importBunproToken(
    token: BunproFrontendToken | null,
    options: BunproFrontendTokenImporterOptions,
    root: HTMLElement,
    language: 'en' | 'ja',
): Promise<void> {
    const latestToken = token ?? await readBunproFrontendToken(options);
    const ui = copy(language);
    const status = root.querySelector<HTMLElement>('[data-bunpro-import-status]');
    if (!latestToken) {
        if (status) status.textContent = ui.missing;
        return;
    }
    const nextSettings: ReaderSettings = {
        ...options.getSettings(),
        bunproFrontendApiToken: latestToken.token,
        bunproFrontendApiTokenExpiresAt: latestToken.expiresAt,
        bunproMiningEnabled: true,
    };
    if (status) status.textContent = ui.saving;
    try {
        options.setSettings(nextSettings);
        await options.saveSettings(nextSettings);
        if (status) status.textContent = ui.saved;
        options.toast?.(ui.saved);
    } catch {
        if (status) status.textContent = ui.failed;
        options.toast?.(ui.failed);
    }
}

function renderBunproImporterContent(token: BunproFrontendToken | null, language: 'en' | 'ja'): HTMLElement {
    const ui = copy(language);
    const content = document.createElement('div');
    content.className = 'jpdb-reader-bunpro-token-importer-card';

    const title = document.createElement('div');
    title.className = 'jpdb-reader-bunpro-token-importer-title';
    title.textContent = ui.title;

    const body = document.createElement('p');
    body.textContent = token ? ui.ready : ui.missing;

    const meta = document.createElement('div');
    meta.className = 'jpdb-reader-bunpro-token-importer-meta';
    meta.textContent = token?.expiresAt ? ui.expires(token.expiresAt) : ui.expiryUnknown;

    const actions = document.createElement('div');
    actions.className = 'jpdb-reader-bunpro-token-importer-actions';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'jpdb-reader-bunpro-token-importer-button';
    button.dataset.action = 'import-bunpro-token';
    button.disabled = !token;
    button.textContent = ui.action;
    const status = document.createElement('span');
    status.dataset.bunproImportStatus = 'true';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    actions.append(button, status);

    content.append(title, body, meta, actions);
    return content;
}

async function readBunproFrontendTokenFromCookieStore(cookieStore: BunproCookieStore | undefined): Promise<BunproFrontendToken | null> {
    if (!cookieStore?.get) return null;
    try {
        const cookie = await cookieStore.get(BUNPRO_FRONTEND_API_TOKEN_COOKIE);
        const token = normalizeCookieValue(cookie?.value ?? '');
        if (!token) return null;
        return { token, expiresAt: normalizeCookieExpires(cookie?.expires) };
    } catch {
        return null;
    }
}

function cookieValue(cookieHeader: string, name: string): string {
    const parts = cookieHeader.split(';');
    for (const part of parts) {
        const [rawName, ...rawValue] = part.split('=');
        if (rawName?.trim() !== name) continue;
        return normalizeCookieValue(rawValue.join('='));
    }
    return '';
}

function normalizeCookieValue(value: string): string {
    const trimmed = value.trim().replace(/^"|"$/g, '');
    if (!trimmed) return '';
    try {
        return decodeURIComponent(trimmed).trim();
    } catch {
        return trimmed;
    }
}

function normalizeCookieExpires(value: BunproCookieStoreItem['expires']): string {
    if (value instanceof Date) return finiteDateIso(value);
    if (typeof value === 'number') {
        if (!Number.isFinite(value) || value <= 0) return '';
        return finiteDateIso(new Date(value));
    }
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? finiteDateIso(new Date(parsed)) : '';
    }
    return '';
}

function finiteDateIso(date: Date): string {
    return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function normalizePathname(pathname: string): string {
    return pathname.replace(/\/+$/u, '') || '/';
}

function globalCookieStore(): BunproCookieStore | undefined {
    return (globalThis as { cookieStore?: BunproCookieStore }).cookieStore;
}

function safeDocumentCookie(): string {
    try {
        return document.cookie ?? '';
    } catch {
        return '';
    }
}

function safeHref(): string {
    try {
        return location.href;
    } catch {
        return 'https://bunpro.jp/settings/api';
    }
}

function waitForBody(): Promise<void> {
    if (document.body || document.readyState !== 'loading') return Promise.resolve();
    return new Promise(resolve => {
        document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
    });
}

function copy(language: 'en' | 'ja'): {
    title: string;
    ready: string;
    missing: string;
    expiryUnknown: string;
    expires: (iso: string) => string;
    action: string;
    saving: string;
    saved: string;
    failed: string;
} {
    if (language === 'ja') {
        return {
            title: 'Yomu Bunpro連携',
            ready: 'Bunproのログイン用トークンを見つけました。Yomuに保存してBunpro復習を有効にできます。',
            missing: 'Bunproにログインしてから、このページを再読み込みしてください。',
            expiryUnknown: '有効期限はブラウザから読めませんでした。',
            expires: iso => `期限: ${new Date(iso).toLocaleDateString('ja-JP')}`,
            action: 'Yomuで使う',
            saving: '保存中...',
            saved: 'BunproトークンをYomuに保存しました。',
            failed: '保存できませんでした。Yomuの権限を確認してください。',
        };
    }
    return {
        title: 'Yomu Bunpro setup',
        ready: 'Yomu found your Bunpro session token. Save it to enable Bunpro reviews and mining.',
        missing: 'Log in to Bunpro, then refresh this page.',
        expiryUnknown: 'Expiry is not visible in this browser.',
        expires: iso => `Expires ${new Date(iso).toLocaleDateString('en-GB')}`,
        action: 'Use in Yomu',
        saving: 'Saving...',
        saved: 'Bunpro token saved to Yomu.',
        failed: 'Could not save. Check your Yomu userscript permissions.',
    };
}
