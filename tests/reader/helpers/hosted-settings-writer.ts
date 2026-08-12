const SETTINGS_KEY = 'jpdb-popup-reader-settings';

interface HostedSettingsWriterOptions {
    readonly initial: Record<string, unknown> | null;
    readonly source: string;
    readonly invocation: string;
}

interface HostedSettingsWriterResult {
    readonly settings: Record<string, unknown>;
    readonly events: Array<{ type: string; init: unknown }>;
}

export function executeHostedSettingsWriter({
    initial,
    source,
    invocation,
}: HostedSettingsWriterOptions): HostedSettingsWriterResult {
    let stored = initial === null ? null : JSON.stringify(initial);
    const storage = {
        getItem: (key: string) => key === SETTINGS_KEY ? stored : null,
        setItem: (key: string, value: string) => {
            if (key === SETTINGS_KEY) stored = value;
        },
    };
    const events: Array<{ type: string; init: unknown }> = [];
    class CustomEventStub {
        constructor(readonly type: string, readonly init: unknown) {}
    }

    Function(
        'localStorage',
        'window',
        'CustomEvent',
        `'use strict'; const settingsKey=${JSON.stringify(SETTINGS_KEY)}; ${source}; ${invocation};`,
    )(storage, {
        dispatchEvent: (event: CustomEventStub) => { events.push({ type: event.type, init: event.init }); },
    }, CustomEventStub);

    if (stored === null) throw new Error('hosted settings writer did not persist settings');
    return { settings: JSON.parse(stored) as Record<string, unknown>, events };
}
