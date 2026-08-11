/** Captures focus for modal restoration without targeting the dialog itself. */
export function settingsDialogTrigger(activeElement: Element | null): HTMLElement | undefined {
    if (!(activeElement instanceof HTMLElement)) return undefined;
    if (activeElement.closest('.jpdb-reader-settings')) return undefined;
    return activeElement;
}

/** Firefox content realms defer credential-backed probes to the extension page. */
export function runCredentialDependentSettingsRefreshes(
    extensionPageRequired: boolean,
    refreshes: readonly (() => void)[],
): void {
    if (extensionPageRequired) return;
    for (const refresh of refreshes) refresh();
}
