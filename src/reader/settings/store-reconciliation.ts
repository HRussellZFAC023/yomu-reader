import type { ReaderSettings } from '../app/types';

/** Every current setting changed by its editing surface. */
export function changedSettingsKeys(previous: ReaderSettings, next: ReaderSettings): Array<keyof ReaderSettings> {
    return (Object.keys(previous) as Array<keyof ReaderSettings>)
        .filter(key => previous[key] !== next[key] && JSON.stringify(previous[key]) !== JSON.stringify(next[key]));
}
