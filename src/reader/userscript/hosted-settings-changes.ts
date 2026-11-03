import { assertManagedStateReadAllowed } from '../app/storage';
import { Logger } from '../app/logger';
import { subscribeToSettingsStorageChanges } from '../settings/index';

const log = Logger.scope('HostedSettingsChanges');

/** The installed realm owns native GM notifications; the hosted page cannot. */
export function subscribeToHostedSettingsChanges(notify: () => void): () => void {
    let active = true;
    let unsubscribe = (): void => undefined;
    // Capture the shared epoch before subscribing, so settings written to a
    // post-reset physical slot are watched as well as their logical key.
    void assertManagedStateReadAllowed().then(() => {
        if (!active) return;
        unsubscribe = subscribeToSettingsStorageChanges(notify);
        // Cover a save between bridge installation and native subscription.
        notify();
    }).catch(error => log.warn('Hosted settings subscription failed', { error }));
    return () => {
        active = false;
        unsubscribe();
    };
}
