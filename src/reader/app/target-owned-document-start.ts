type TargetOwnedDocumentStartActivator = () => void;

const TARGET_OWNED_DOCUMENT_START_SLOT = Symbol.for('yomu.target-owned-document-start.v1');
type TargetOwnedRealm = typeof globalThis & { [key: symbol]: unknown };

/** Register an aggregate-runtime activator without exposing it to the host page. */
export function registerTargetOwnedDocumentStartActivator(
    activate: TargetOwnedDocumentStartActivator,
): void {
    Object.defineProperty(globalThis as TargetOwnedRealm, TARGET_OWNED_DOCUMENT_START_SLOT, {
        configurable: true,
        enumerable: false,
        value: activate,
        writable: false,
    });
}

/** Activate target-owned aggregate-runtime work inside the userscript sandbox. */
export function activateTargetOwnedDocumentStartCompanions(): void {
    const activate = (globalThis as TargetOwnedRealm)[TARGET_OWNED_DOCUMENT_START_SLOT];
    if (typeof activate === 'function') (activate as TargetOwnedDocumentStartActivator)();
}
