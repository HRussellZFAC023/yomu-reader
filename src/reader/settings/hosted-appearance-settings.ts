import { persistHostedSharedSettingsPatch } from './hosted-settings-provenance';

type AppearanceChoice =
    | { key: 'theme'; value: 'auto' | 'dark' | 'light' }
    | { key: 'interfaceLanguage'; value: 'auto' | 'en' | 'ja' };

let pending: Promise<void> = Promise.resolve();

/** Narrow shell capability: no arbitrary settings keys, reads or storage access. */
export async function saveHostedAppearance(choice: AppearanceChoice): Promise<void> {
    if (!choice || typeof choice !== 'object'
        || Object.keys(choice).some(key => key !== 'key' && key !== 'value')) {
        throw new TypeError('Invalid appearance choice.');
    }
    const allowed = choice.key === 'theme' ? ['auto', 'dark', 'light']
        : choice.key === 'interfaceLanguage' ? ['auto', 'en', 'ja'] : [];
    if (!allowed.includes(choice.value)) throw new TypeError('Invalid appearance choice.');
    const patch = { [choice.key]: choice.value };
    const operation = pending.then(() => persistHostedSharedSettingsPatch(patch, true));
    pending = operation.catch(() => undefined);
    await operation;
}
