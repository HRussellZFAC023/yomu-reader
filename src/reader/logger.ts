import type { ReaderSettings } from './types';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'trace';
type ConsoleWriter = (...args: unknown[]) => void;
type SettingsProvider = () => Pick<ReaderSettings, 'enableLogging'>;

interface LogEntry {
    timestamp: number;
    level: LogLevel;
    scope: string;
    message: string;
    args: unknown[];
    stack?: string;
}

interface CallStats {
    count: number;
    firstCall: number;
    lastCall: number;
    recentCalls: number[];
}

interface LoggerOptions {
    settingsProvider?: SettingsProvider;
    forceEnabled?: boolean;
    maxBufferSize?: number;
}

const LOG_PREFIX = '[Yomu]';
const LOG_STYLE = 'background: #247a58; color: white; border-radius: 3px; padding: 2px 5px; font-weight: 700;';
const SCOPE_STYLE = 'color: #247a58; font-weight: 700;';
const DEBUG_STYLE = 'color: #6b7280;';
const WARN_STYLE = 'color: #a15c00; font-weight: 700;';
const ERROR_STYLE = 'color: #b91c1c; font-weight: 700;';
const TRACE_STYLE = 'color: #6b7280; font-style: italic;';
const RUNTIME_LOG_KEY = 'yomu:enable-logs';
const REDACTED = '[redacted]';
const SECRET_KEY_PATTERN = /(api[-_]?key|authorization|bearer|token|password|secret|credential|oauth|cookie)/i;
const LOOP_DETECTION_THRESHOLD = 60;
const LOOP_DETECTION_WINDOW_MS = 1000;

const env = (import.meta as ImportMeta & { env?: { DEV?: boolean; MODE?: string; PROD?: boolean } }).env;
const BUILD_IS_DEV_MODE = Boolean(env?.MODE === 'development' || (env?.DEV && !env.PROD && env.MODE !== 'test'));

class ScopedLogger {
    constructor(private parent: LoggerImpl, private scopeName: string) {}

    debug(message: string, ...args: unknown[]): void {
        this.parent.debug(this.scopeName, message, ...args);
    }

    info(message: string, ...args: unknown[]): void {
        this.parent.info(this.scopeName, message, ...args);
    }

    warn(message: string, ...args: unknown[]): void {
        this.parent.warn(this.scopeName, message, ...args);
    }

    error(message: string, ...args: unknown[]): void {
        this.parent.error(this.scopeName, message, ...args);
    }

    trace(message: string, ...args: unknown[]): void {
        this.parent.trace(this.scopeName, message, ...args);
    }

    debugThrottled(key: string, intervalMs: number, message: string, ...args: unknown[]): void {
        this.parent.debugThrottled(`${this.scopeName}:${key}`, intervalMs, this.scopeName, message, ...args);
    }

    warnOnce(key: string, message: string, ...args: unknown[]): void {
        this.parent.warnOnce(`${this.scopeName}:${key}`, this.scopeName, message, ...args);
    }

    time(label: string, ...args: unknown[]): () => void {
        return this.parent.time(this.scopeName, label, ...args);
    }

    async measure<T>(label: string, fn: () => Promise<T>, ...args: unknown[]): Promise<T> {
        const done = this.time(label, ...args);
        try {
            return await fn();
        } finally {
            done();
        }
    }
}

class LoggerImpl {
    private settingsProvider?: SettingsProvider;
    private forceEnabled = false;
    private maxBufferSize = 1000;
    private logBuffer: LogEntry[] = [];
    private callStats = new Map<string, CallStats>();
    private throttles = new Map<string, number>();
    private onceKeys = new Set<string>();

    configure(options: LoggerOptions): void {
        this.settingsProvider = options.settingsProvider ?? this.settingsProvider;
        this.forceEnabled = options.forceEnabled ?? this.forceEnabled;
        this.maxBufferSize = options.maxBufferSize ?? this.maxBufferSize;
    }

    scope(scopeName: string): ScopedLogger {
        return new ScopedLogger(this, scopeName);
    }

    isEnabled(): boolean {
        if (isDevMode()) return true;
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
        this.info('Logger', 'Runtime logging enabled.', { persisted: persist });
    }

    disable(persist = false): void {
        this.info('Logger', 'Runtime logging disabled.', { persisted: persist });
        this.forceEnabled = false;
        if (persist) setRuntimeLoggingOverride(false);
    }

    debug(scope: string, message: string, ...args: unknown[]): void {
        this.write('debug', scope, message, args, writeDebugToConsole, DEBUG_STYLE);
    }

    info(scope: string, message: string, ...args: unknown[]): void {
        this.write('info', scope, message, args, console.info, '');
    }

    warn(scope: string, message: string, ...args: unknown[]): void {
        this.write('warn', scope, message, args, console.warn, WARN_STYLE);
    }

    error(scope: string, message: string, ...args: unknown[]): void {
        this.write('error', scope, message, args, console.error, ERROR_STYLE, true);
    }

    trace(scope: string, message: string, ...args: unknown[]): void {
        this.write('trace', scope, message, args, writeDebugToConsole, TRACE_STYLE, true);
    }

    debugThrottled(key: string, intervalMs: number, scope: string, message: string, ...args: unknown[]): void {
        if (!this.isEnabled()) return;
        const now = Date.now();
        const last = this.throttles.get(key) ?? 0;
        if (now - last < intervalMs) return;
        this.throttles.set(key, now);
        this.debug(scope, message, ...args);
    }

    warnOnce(key: string, scope: string, message: string, ...args: unknown[]): void {
        if (this.onceKeys.has(key)) return;
        this.onceKeys.add(key);
        this.warn(scope, message, ...args);
    }

    time(scope: string, label: string, ...args: unknown[]): () => void {
        if (!this.isEnabled()) return () => undefined;
        const start = nowMs();
        this.debug(scope, `${label} started`, ...args);
        return () => {
            this.debug(scope, `${label} finished`, { durationMs: Math.round((nowMs() - start) * 10) / 10 });
        };
    }

    getLogs(count = 100): LogEntry[] {
        return this.logBuffer.slice(-count);
    }

    getStats(): Record<string, CallStats> {
        const result: Record<string, CallStats> = {};
        this.callStats.forEach((value, key) => {
            result[key] = { ...value, recentCalls: [...value.recentCalls] };
        });
        return result;
    }

    reset(): void {
        this.logBuffer = [];
        this.callStats.clear();
        this.throttles.clear();
        this.onceKeys.clear();
    }

    dumpDiagnostics(): void {
        const logs = this.getLogs(30);
        const sortedStats = Object.entries(this.getStats())
            .sort(([, a], [, b]) => b.count - a.count)
            .slice(0, 30)
            .map(([key, value]) => ({
                key,
                totalCalls: value.count,
                recentCalls: value.recentCalls.length,
                elapsedSeconds: Math.round((value.lastCall - value.firstCall) / 100) / 10,
            }));

        console.group(`%c${LOG_PREFIX}%c Diagnostics`, LOG_STYLE, SCOPE_STYLE);
        console.info('Enabled:', this.isEnabled(), 'Dev mode:', isDevMode());
        console.info('Recent logs:');
        console.table(logs.map(entry => ({
            time: new Date(entry.timestamp).toISOString().slice(11, 23),
            level: entry.level,
            scope: entry.scope,
            message: entry.message.slice(0, 80),
        })));
        console.info('Highest frequency calls:');
        console.table(sortedStats);
        console.groupEnd();
    }

    private write(
        level: LogLevel,
        scope: string,
        message: string,
        args: unknown[],
        writer: ConsoleWriter,
        levelStyle: string,
        includeStack = false,
    ): void {
        if (!this.isEnabled()) return;

        this.trackCall(level, scope, message);
        const safeArgs = args.map(arg => sanitizeForConsole(arg));
        writer(`%c${LOG_PREFIX}%c [${scope}]%c ${message}`, LOG_STYLE, SCOPE_STYLE, levelStyle, ...safeArgs);
        this.bufferLog(level, scope, message, safeArgs, includeStack);

        if (includeStack && level === 'trace') {
            const stack = new Error().stack?.split('\n').slice(2).join('\n');
            if (stack) writeDebugToConsole(`%c${stack}`, DEBUG_STYLE);
        }
    }

    private trackCall(level: LogLevel, scope: string, message: string): void {
        const key = `${level}:${scope}:${message}`;
        const now = Date.now();
        const stats = this.callStats.get(key) ?? {
            count: 0,
            firstCall: now,
            lastCall: now,
            recentCalls: [],
        };

        stats.count++;
        stats.lastCall = now;
        stats.recentCalls = [...stats.recentCalls.filter(time => time >= now - LOOP_DETECTION_WINDOW_MS), now];
        this.callStats.set(key, stats);

        if (stats.recentCalls.length < LOOP_DETECTION_THRESHOLD) return;
        stats.recentCalls = [];
        console.warn(
            `%c${LOG_PREFIX}%c [Logger] Potential log loop: "${scope}:${message}" emitted ${LOOP_DETECTION_THRESHOLD}+ times in ${LOOP_DETECTION_WINDOW_MS}ms.`,
            LOG_STYLE,
            WARN_STYLE,
        );
    }

    private bufferLog(level: LogLevel, scope: string, message: string, args: unknown[], includeStack: boolean): void {
        this.logBuffer.push({
            timestamp: Date.now(),
            level,
            scope,
            message,
            args: args.map(arg => snapshotForBuffer(arg)),
            stack: includeStack ? new Error().stack : undefined,
        });

        if (this.logBuffer.length > this.maxBufferSize) {
            this.logBuffer = this.logBuffer.slice(-this.maxBufferSize);
        }
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
        youtubeImmersionEnabled: settings.youtubeImmersionEnabled,
    };
}

function isDevMode(): boolean {
    if (BUILD_IS_DEV_MODE) return true;
    return typeof window !== 'undefined' && typeof (window as Window & { __YOMU_DEV_VERSION__?: unknown }).__YOMU_DEV_VERSION__ === 'string';
}

function writeDebugToConsole(...args: unknown[]): void {
    if (isDevMode()) console.log(...args);
    else console.debug(...args);
}

function getRuntimeLoggingOverride(): boolean {
    if (typeof window !== 'undefined' && Boolean((window as Window & { __YOMU_ENABLE_LOGS__?: boolean }).__YOMU_ENABLE_LOGS__)) return true;
    try {
        return typeof localStorage !== 'undefined' && localStorage.getItem(RUNTIME_LOG_KEY) === 'true';
    } catch {
        return false;
    }
}

function setRuntimeLoggingOverride(enabled: boolean): void {
    try {
        if (typeof localStorage === 'undefined') return;
        if (enabled) localStorage.setItem(RUNTIME_LOG_KEY, 'true');
        else localStorage.removeItem(RUNTIME_LOG_KEY);
    } catch {
        // Storage can be unavailable on some embedded pages; runtime forceEnabled still applies.
    }
}

function nowMs(): number {
    return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

function sanitizeForConsole(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return redactString(value);
    if (typeof value !== 'object') return value;
    const special = sanitizeSpecialConsoleValue(value, depth, seen);
    if (special.handled) return special.value;
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    if (depth >= 5) return `[${value.constructor?.name || 'Object'}]`;
    if (Array.isArray(value)) return value.map(item => sanitizeForConsole(item, depth + 1, seen));

    return sanitizeRecordForConsole(value, depth, seen);
}

function sanitizeSpecialConsoleValue(value: object, depth: number, seen: WeakSet<object>): { handled: boolean; value?: unknown } {
    if (value instanceof Error) return { handled: true, value: { name: value.name, message: value.message, stack: value.stack } };
    if (typeof URL !== 'undefined' && value instanceof URL) return { handled: true, value: value.href };
    if (typeof Blob !== 'undefined' && value instanceof Blob) return { handled: true, value: { type: value.type, size: value.size } };
    if (typeof Element !== 'undefined' && value instanceof Element) return { handled: true, value };
    if (typeof Event !== 'undefined' && value instanceof Event) {
        return {
            handled: true,
            value: {
                type: value.type,
                target: typeof Element !== 'undefined' && value.target instanceof Element ? describeElement(value.target) : String(value.target),
            },
        };
    }
    if (typeof FormData !== 'undefined' && value instanceof FormData) {
        return { handled: true, value: sanitizeFormDataForConsole(value, depth, seen) };
    }
    return { handled: false };
}

function sanitizeFormDataForConsole(value: FormData, depth: number, seen: WeakSet<object>): Record<string, unknown> {
    const record: Record<string, unknown> = {};
    for (const [key, item] of value.entries()) {
        record[key] = shouldRedactEntry(key, item)
            ? REDACTED
            : typeof File !== 'undefined' && item instanceof File
                ? { name: item.name, size: item.size, type: item.type }
                : sanitizeForConsole(item, depth + 1, seen);
    }
    return record;
}

function sanitizeRecordForConsole(value: object, depth: number, seen: WeakSet<object>): Record<string, unknown> {
    const record = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(record)) {
        result[key] = shouldRedactEntry(key, item) ? REDACTED : sanitizeForConsole(item, depth + 1, seen);
    }
    return result;
}

function snapshotForBuffer(value: unknown): unknown {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return String(value);
    }
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

function describeElement(element: Element): string {
    const id = element.id ? `#${element.id}` : '';
    const classes = element.classList.length ? `.${[...element.classList].slice(0, 4).join('.')}` : '';
    return `${element.tagName.toLowerCase()}${id}${classes}`;
}

declare global {
    interface Window {
        __YOMU_LOGGER__?: LoggerImpl;
        YomuLogger?: LoggerImpl;
        __YOMU_ENABLE_LOGS__?: boolean;
    }
}

if (typeof window !== 'undefined') {
    window.__YOMU_LOGGER__ = Logger;
    window.YomuLogger = Logger;
}
