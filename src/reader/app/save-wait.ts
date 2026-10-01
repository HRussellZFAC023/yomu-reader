/**
 * Learner saves (the local deck, Settings) report here while another Yomu tab's
 * storage lease keeps them waiting, so the surface showing a save can say why
 * it has not finished. This tab's saves of one kind queue behind each other, so
 * while any of them waits, a save the learner just started waits too.
 */
const listeners = new Set<(waiting: boolean) => void>();
let waits = 0;

/** The `onWait` of a learner-save storage lease. */
export function reportSaveWaitingForAnotherTab(waiting: boolean): void {
    waits = Math.max(0, waits + (waiting ? 1 : -1));
    for (const listener of listeners) {
        try {
            listener(waits > 0);
        } catch {
            // A status surface never fails the save it describes.
        }
    }
}

export function watchSavesWaitingForAnotherTab(listener: (waiting: boolean) => void): () => void {
    listeners.add(listener);
    if (waits > 0) listener(true);
    return () => { listeners.delete(listener); };
}
