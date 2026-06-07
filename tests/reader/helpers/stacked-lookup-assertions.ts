import { expect } from 'vitest';

export function expectStackedLookupOverSettings({
    lookup,
    settingsForm,
    settingsBackdrop,
    activeLookup,
    activeBackdrop,
}: {
    lookup: HTMLElement;
    settingsForm: HTMLElement;
    settingsBackdrop: HTMLElement;
    activeLookup?: HTMLElement;
    activeBackdrop?: HTMLElement;
}): void {
    expect(settingsForm.isConnected).toBe(true);
    expect(settingsBackdrop.isConnected).toBe(true);
    expect(lookup.isConnected).toBe(true);
    expect(lookup.getAttribute('aria-modal')).toBe('false');
    expect(lookup.classList.contains('jpdb-reader-sheet')).toBe(false);
    expect(lookup.querySelector('.jpdb-reader-sheet-handle')).toBeNull();
    expect(document.querySelectorAll('.jpdb-reader-backdrop')).toHaveLength(1);
    expect(activeLookup).toBe(lookup);
    expect(activeBackdrop).toBeUndefined();
}

export function expectSettingsDialogStillMounted({
    settingsForm,
    settingsBackdrop,
    activeDialog,
    activeBackdrop,
}: {
    settingsForm: HTMLElement;
    settingsBackdrop: HTMLElement;
    activeDialog?: HTMLElement;
    activeBackdrop?: HTMLElement;
}): void {
    expect(settingsForm.isConnected).toBe(true);
    expect(settingsBackdrop.isConnected).toBe(true);
    expect(activeDialog).toBe(settingsForm);
    expect(activeBackdrop).toBe(settingsBackdrop);
}
