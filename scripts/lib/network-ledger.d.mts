export interface LedgerRequest {
    channel?: 'gm' | 'page';
    method?: string;
    url: string;
    bodyBytes?: number;
    at?: number;
    served?: string;
    trustedInteractionBefore?: boolean;
    resourceType?: string;
    ledgerId?: string;
}
export interface LedgerInteraction {
    type: string;
    at: number;
    target: string;
}
export interface LedgerEntry {
    channel: 'gm' | 'page';
    method: string;
    url: string;
    host: string;
    bodyBytes: number;
    at: number;
    sinceStartMs: number;
    served: string;
    trustedInteractionBefore: boolean;
    /** The latest trusted activation before the request; null when none came first. */
    lastInteraction: LedgerInteraction | null;
    resourceType?: string;
    ledgerId?: string;
    /** A page fetch or XHR the page stamped as it left: the product's own. */
    sentByScript?: boolean;
}
export interface LedgerFilter {
    host?: string | RegExp;
    method?: string;
    channel?: 'gm' | 'page';
    path?: string | RegExp;
    beforeInteraction?: boolean;
    /** Requests with no trusted activation in this many ms before them. */
    noInteractionWithinMs?: number;
    includeRecording?: boolean;
}
export interface LedgerSummary {
    requests: number;
    hosts: Record<string, { requests: number; bodyBytes: number; beforeInteraction: number; methods: Record<string, number> }>;
}
export interface NetworkLedger {
    startedAt: number;
    recordRequest(request: LedgerRequest): LedgerEntry;
    markServed(request: { channel?: 'gm' | 'page'; method?: string; url: string; ledgerId?: string }, served: string): void;
    recordPageStamp(stamp: { url: string; at: number; trustedInteractionBefore: boolean }): void;
    recordInteraction(interaction: { type: string; at?: number; target?: string }): void;
    firstInteractionAt(): number | null;
    interactions(): LedgerInteraction[];
    entries(): LedgerEntry[];
    requests(filter?: LedgerFilter): LedgerEntry[];
    summary(filter?: LedgerFilter): LedgerSummary;
}

export const LEDGER_ID_HEADER: string;
export function createNetworkLedger(options?: { startedAt?: number }): NetworkLedger;
export function hostOf(url: string): string;
export function hostMatches(host: string, pattern: string | RegExp): boolean;
export function assertLedgerCount(ledger: NetworkLedger, filter: LedgerFilter, options?: { min?: number; max?: number; label?: string }): LedgerEntry[];
export function assertNoRequestsBeforeInteraction(ledger: NetworkLedger, host: string | RegExp, label?: string): LedgerEntry[];
export function networkLedgerPageProgram(options: { requestBinding: string; interactionBinding: string; pageStampBinding: string }): string;
