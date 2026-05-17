import { gmStorageDeleteSync, gmStorageGetSync, gmStorageSetSync } from './storage';
import type { ReaderSettings } from './types';

type ConsoleWriter = (...args: unknown[]) => void;
type SettingsProvider = () => Pick<ReaderSettings, 'enableLogging'>;

interface LoggerOptions {
    settingsProvider?: SettingsProvider;
    forceEnabled?: boolean;
}

const LOG_PREFIX = '[Yomu]';
const LOG_STYLE = 'background: #247a58; color: white; border-radius: 3px; padding: 2px 5px; font-weight: 700;';
const SCOPE_STYLE = 'color: #247a58; font-weight: 700;';
const DEBUG_STYLE = 'color: #6b7280;';
const WARN_STYLE = 'color: #a15c00; font-weight: 700;';
const ERROR_STYLE = 'color: #b91c1c; font-weight: 700;';
const RUNTIME_LOG_KEY = 'yomu:enable-logs';
const REDACTED = '[redacted]';
const SECRET_KEY_PATTERN = /(api[-_]?key|authorization|bearer|token|password|secret|credential|oauth|cookie)/i;

const env = (import.meta as ImportMeta & { env?: { DEV?: boolean; MODE?: string; PROD?: boolean } }).env;
const BUILD_IS_DEV_MODE = Boolean(env?.MODE === 'development' || (env?.DEV && !env.PROD && env.MODE !== 'test'));
const BUILD_LOGGING_ENABLED = BUILD_IS_DEV_MODE;

class ScopedLogger {
    constructor(private readonly parent: LoggerImpl, private readonly scopeName: string) {}

    debug(message: string, ...args: unknown[]): void {
        this.parent.write(this.scopeName, message, args, writeDebugToConsole, DEBUG_STYLE);
    }

    info(message: string, ...args: unknown[]): void {
        this.parent.write(this.scopeName, message, args, console.info, '');
    }

    warn(message: string, ...args: unknown[]): void {
        this.parent.write(this.scopeName, message, args, console.warn, WARN_STYLE);
    }

    error(message: string, ...args: unknown[]): void {
        this.parent.write(this.scopeName, message, args, console.error, ERROR_STYLE);
    }

    warnOnce(key: string, message: string, ...args: unknown[]): void {
        this.parent.warnOnce(`${this.scopeName}:${key}`, this.scopeName, message, args);
    }

    time(label: string, ...args: unknown[]): () => void {
        if (!this.parent.isEnabled()) return () => undefined;
        const start = nowMs();
        this.debug(`${label} started`, ...args);
        return () => this.debug(`${label} finished`, { durationMs: Math.round((nowMs() - start) * 10) / 10 });
    }
}

class LoggerImpl {
    private settingsProvider?: SettingsProvider;
    private forceEnabled = false;
    private onceKeys = new Set<string>();

    configure(options: LoggerOptions): void {
        this.settingsProvider = options.settingsProvider ?? this.settingsProvider;
        this.forceEnabled = options.forceEnabled ?? this.forceEnabled;
    }

    scope(scopeName: string): ScopedLogger {
        return new ScopedLogger(this, scopeName);
    }

    isEnabled(): boolean {
        if (BUILD_LOGGING_ENABLED) return true;
        if (this.forceEnabled || getRuntimeLoggingOverride()) return true;
        try {
            return this.settingsProvider?.().enableLogging === true;
        } catch {
            return false;
        }
    }

    isDevMode(): boolean {
        return isDevMode();
    }

    enable(persist = false): void {
        this.forceEnabled = true;
        if (persist) setRuntimeLoggingOverride(true);
        this.scope('Logger').info('Runtime logging enabled.', { persisted: persist });
    }

    disable(persist = false): void {
        this.scope('Logger').info('Runtime logging disabled.', { persisted: persist });
        this.forceEnabled = false;
        if (persist) setRuntimeLoggingOverride(false);
    }

    reset(): void {
        this.onceKeys.clear();
    }

    warnOnce(key: string, scope: string, message: string, args: unknown[]): void {
        if (this.onceKeys.has(key)) return;
        this.onceKeys.add(key);
        this.write(scope, message, args, console.warn, WARN_STYLE);
    }

    write(scope: string, message: string, args: unknown[], writer: ConsoleWriter, levelStyle: string): void {
        if (!this.isEnabled()) return;
        writer(`%c${LOG_PREFIX}%c [${scope}]%c ${message}`, LOG_STYLE, SCOPE_STYLE, levelStyle, ...args.map(sanitizeForConsole));
    }
}

export const Logger = new LoggerImpl();

export function configureLogger(options: LoggerOptions): void {
    Logger.configure(options);
}

export function loggingSettingsSummary(settings: ReaderSettings): Record<string, unknown> {
    return {
        enableLogging: settings.enableLogging,
        hasApiKey: Boolean(settings.apiKey.trim()),
        localDictionariesEnabled: settings.localDictionariesEnabled,
        localDictionarySources: settings.dictionaryPreferences.length,
        ankiEnabled: settings.ankiEnabled,
        newTabEnabled: settings.newTabEnabled,
        newTabSource: settings.newTabSource,
        ocrEnabled: settings.ocrEnabled,
        subtitlePlayerEnabled: settings.subtitlePlayerEnabled,
    };
}

function isDevMode(): boolean {
    return BUILD_IS_DEV_MODE;
}

function writeDebugToConsole(...args: unknown[]): void {
    if (isDevMode()) console.log(...args);
    else console.debug(...args);
}

function getRuntimeLoggingOverride(): boolean {
    try {
        return gmStorageGetSync<boolean>(RUNTIME_LOG_KEY, false) === true;
    } catch {
        return false;
    }
}

function setRuntimeLoggingOverride(enabled: boolean): void {
    try {
        if (enabled) gmStorageSetSync(RUNTIME_LOG_KEY, true);
        else gmStorageDeleteSync(RUNTIME_LOG_KEY);
    } catch {
        // Runtime logging still works for the current page when storage is blocked.
    }
}

function nowMs(): number {
    return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

function sanitizeForConsole(value: unknown): unknown {
    if (typeof value === 'string') return redactString(value);
    if (value === null || value === undefined || typeof value !== 'object') return value;
    if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
    if (typeof URL !== 'undefined' && value instanceof URL) return value.href;
    if (typeof Blob !== 'undefined' && value instanceof Blob) return { type: value.type, size: value.size };
    if (typeof Event !== 'undefined' && value instanceof Event) return { type: value.type };
    if (Array.isArray(value)) return value.map(sanitizeForConsole);
    return sanitizeRecordForConsole(value as Record<string, unknown>);
}

function sanitizeRecordForConsole(record: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(record).map(([key, value]) => [
        key,
        shouldRedactEntry(key, value) ? REDACTED : sanitizeFlatValue(value),
    ]));
}

function sanitizeFlatValue(value: unknown): unknown {
    if (typeof value === 'string') return redactString(value);
    if (value instanceof Error) return { name: value.name, message: value.message };
    return value;
}

function shouldRedactEntry(key: string, value: unknown): boolean {
    if (!SECRET_KEY_PATTERN.test(key)) return false;
    if (typeof value === 'number' && /tokens?/i.test(key)) return false;
    return true;
}

function redactString(value: string): string {
    return value
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
        .replace(/(["']?(?:api[-_]?key|token|password|secret|authorization)["']?\s*[:=]\s*["'])[^"']+(["'])/gi, `$1${REDACTED}$2`);
}

declare global {
    interface Window {
        __YOMU_LOGGER__?: LoggerImpl;
        YomuLogger?: LoggerImpl;
    }
}

if (typeof window !== 'undefined') {
    window.__YOMU_LOGGER__ = Logger;
    window.YomuLogger = Logger;
}
