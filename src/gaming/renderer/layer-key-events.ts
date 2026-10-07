import { dispatchAuthorizedReaderControlEvent } from '../../reader/ui/trusted-interaction';

/** The native shortcut is a user gesture; preserve that authority across preload IPC. */
export function dismissDesktopLookup(documentTarget: Document, hideLayer: () => Promise<void>): void {
    if (documentTarget.querySelector('.jpdb-reader-popover')) {
        dispatchAuthorizedReaderControlEvent(documentTarget, new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    } else {
        void hideLayer();
    }
}
