import {
    announcedInstalledReaderRuntime,
    detectInstalledReaderRuntime,
    type InstalledReaderRuntimeKind,
} from '../app/runtime-presence';

// One installed Reader answers a hosted page's storage and HTTP bridges. The
// extension outranks a userscript manager, and it announces itself before any
// page script runs (see markInstalledReaderRuntime), so a page never pins a
// lower-priority responder or its own website store while the extension is
// still starting. Each bridge publishes its responder's owner id and kind on
// the shared DOM root; requests carry that id and every other responder
// ignores them, so no request is served twice.

export interface BridgeDatasetKeys {
    readonly ready: string;
    readonly owner: string;
    readonly kind: string;
}

export interface BridgeOwner {
    /** Absent only for a v1.9.3 responder, which published no owner. */
    readonly ownerId: string | undefined;
    readonly kind: InstalledReaderRuntimeKind;
}

export function createBridgeOwnerId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Whether this realm's responder may claim the bridge from the current one. */
export function mayClaimBridge(
    dataset: DOMStringMap,
    keys: BridgeDatasetKeys,
    kind: InstalledReaderRuntimeKind,
    ownOwnerId: string | undefined,
): boolean {
    if (kind === 'userscript' && announcedInstalledReaderRuntime() === 'extension') return false;
    const existing = dataset[keys.owner];
    if (!existing || existing === ownOwnerId) return true;
    return kind === 'extension' && dataset[keys.kind] !== 'extension';
}

/** The installed Reader a page-world client must reach, or null when the page is on its own. */
export function expectedBridgeKind(trustedPage: () => boolean): InstalledReaderRuntimeKind | null {
    if (detectInstalledReaderRuntime()) return null;
    const announced = announcedInstalledReaderRuntime();
    return announced && trustedPage() ? announced : null;
}

/** The ready responder a client may use: the expected kind, the outranking extension, or a v1.9.3 responder. */
export function readyBridgeOwner(
    dataset: DOMStringMap | undefined,
    keys: BridgeDatasetKeys,
    expected: InstalledReaderRuntimeKind | null,
): BridgeOwner | null {
    if (dataset?.[keys.ready] !== 'true') return null;
    const kind = dataset[keys.kind];
    if (kind === 'extension' || kind === 'userscript') {
        if (expected && kind !== expected && kind !== 'extension') return null;
        return { ownerId: dataset[keys.owner], kind };
    }
    return { ownerId: dataset[keys.owner], kind: expected ?? 'userscript' };
}

/** A responder serves requests addressed to it, and an unaddressed v1.9.3 page request only while it owns the bridge. */
export function bridgeRequestAddressedTo(
    dataset: DOMStringMap | undefined,
    keys: BridgeDatasetKeys,
    ownerId: string,
    requestOwnerId: unknown,
): boolean {
    if (dataset?.[keys.owner] !== ownerId) return false;
    return requestOwnerId === undefined || requestOwnerId === ownerId;
}
