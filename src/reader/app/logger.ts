import { BRAND_COLOR_TOKENS, CORE_COLOR_TOKENS, LOGGER_COLOR_TOKENS } from '../theme/color-tokens';
import { gmStorageDeleteSync, gmStorageGetSync, gmStorageSetSync } from './storage';
import { setAttemptRecorder } from '../core/attempt';
import { hasJitenApiCredential, hasJpdbApiCredential } from '../settings/api-credential';
import type { ReaderSettings } from './types';

type ConsoleWriter = (...args: unknown[]) => void;
type SettingsProvider = () => Pick<ReaderSettings, 'enableLogging'>;

interface LoggerOptions {
    settingsProvider?: SettingsProvider;
    forceEnabled?: boolean;
}

const LOG_PREFIX = '[Yomu]';
const LOG_STYLE = `background: ${BRAND_COLOR_TOKENS.consoleAccent}; color: ${CORE_COLOR_TOKENS.white}; border-radius: 3px; padding: 2px 5px; font-weight: 700;`;
const SCOPE_STYLE = `color: ${BRAND_COLOR_TOKENS.consoleAccent}; font-weight: 700;`;
const DEBUG_STYLE = `color: ${LOGGER_COLOR_TOKENS.debug};`;
const WARN_STYLE = `color: ${LOGGER_COLOR_TOKENS.warn}; font-weight: 700;`;
const ERROR_STYLE = `color: ${LOGGER_COLOR_TOKENS.error}; font-weight: 700;`;
const RUNTIME_LOG_KEY = 'yomu:enable-logs';
const REDACTED = '[redacted]';
const OPTIONAL_CORS_BRIDGE_MESSAGE = 'No configured proxy.';
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
        const optional = args.some(isOptionalCorsBridgeError);
        this.parent.write(this.scopeName, message, args, optional ? writeDebugToConsole : console.warn, optional ? DEBUG_STYLE : WARN_STYLE);
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

// core/attempt cannot import this module (app/logger -> app/storage ->
// userscript/storage-bridge -> platform/window-events, which calls attempt
// during its own module evaluation), so the logger registers itself instead.
setAttemptRecorder((label, error) => Logger.scope('Attempt').debug(`${label} failed`, error));

export function configureLogger(options: LoggerOptions): void {
    // Re-take the persisted override: a read from before the managed-state epoch
    // was resolvable answered `false` by fallback, not by fact.
    runtimeLoggingOverride = undefined;
    Logger.configure(options);
}

export function loggingSettingsSummary(settings: ReaderSettings): Record<string, unknown> {
    return {
        enableLogging: settings.enableLogging,
        hasApiKey: hasJpdbApiCredential(settings),
        hasJitenApiKey: hasJitenApiCredential(settings),
        localDictionariesEnabled: settings.localDictionariesEnabled,
        localDictionarySources: settings.dictionaryPreferences.length,
        ankiEnabled: settings.ankiEnabled,
        newTabEnabled: settings.newTabEnabled,
        newTabSource: settings.newTabSource,
        ocrEnabled: settings.ocrEnabled,
        subtitlePlayerEnabled: settings.subtitlePlayerEnabled,
        youtubeImmersionEnabled: settings.youtubeImmersionEnabled,
    };
}

function isDevMode(): boolean {
    return BUILD_IS_DEV_MODE;
}

function writeDebugToConsole(...args: unknown[]): void {
    if (isDevMode()) console.log(...args);
    else console.debug(...args);
}

function isOptionalCorsBridgeError(value: unknown): boolean {
    return value instanceof Error && value.message === OPTIONAL_CORS_BRIDGE_MESSAGE;
}

let runtimeLoggingOverride: boolean | undefined;

/**
 * The persisted debug escape hatch, read once per page load.
 *
 * isEnabled() runs on every log call, including the discard path when logging is
 * OFF, and each read costs a synchronous epoch read plus the value read. The
 * asserting lookup-perf gate measured one hover lookup asking for
 * `yomu:enable-logs` 26 times, with a matching share of its 85 `yomu:state-epoch`
 * reads — roughly 50 IPC hops to answer one unchanging boolean.
 *
 * Caching it does not change what the flag means. A realm that turns logging on
 * during this page load does it through Logger.enable(), which sets the memo
 * directly; the PERSISTED form has always been documented as taking effect on the
 * next load. configureLogger() clears the memo, so a value read before the
 * managed-state epoch was resolvable (very early boot, where the read falls back
 * to false) is re-taken once the app configures the logger for real.
 */
function getRuntimeLoggingOverride(): boolean {
    if (runtimeLoggingOverride !== undefined) return runtimeLoggingOverride;
    try {
        runtimeLoggingOverride = gmStorageGetSync<boolean>(RUNTIME_LOG_KEY, false) === true;
    } catch {
        runtimeLoggingOverride = false;
    }
    return runtimeLoggingOverride;
}

function setRuntimeLoggingOverride(enabled: boolean): void {
    runtimeLoggingOverride = enabled;
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
    const sanitized = sanitizeSpecialConsoleValue(value);
    if (sanitized.handled) return sanitized.value;
    if (Array.isArray(value)) return value.map(sanitizeForConsole);
    return sanitizeRecordForConsole(value as Record<string, unknown>);
}

interface SanitizedConsoleValue {
    handled: boolean;
    value?: unknown;
}

function sanitizeSpecialConsoleValue(value: object): SanitizedConsoleValue {
    for (const sanitizer of CONSOLE_VALUE_SANITIZERS) {
        const sanitized = sanitizer(value);
        if (sanitized.handled) return sanitized;
    }
    return { handled: false };
}

const CONSOLE_VALUE_SANITIZERS: Array<(value: object) => SanitizedConsoleValue> = [
    value => value instanceof Error ? { handled: true, value: { name: value.name, message: value.message, stack: value.stack } } : { handled: false },
    value => typeof URL !== 'undefined' && value instanceof URL ? { handled: true, value: value.href } : { handled: false },
    value => typeof Blob !== 'undefined' && value instanceof Blob ? { handled: true, value: { type: value.type, size: value.size } } : { handled: false },
    value => typeof Event !== 'undefined' && value instanceof Event ? { handled: true, value: { type: value.type } } : { handled: false },
];

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
