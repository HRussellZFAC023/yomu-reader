export interface LedgerRequest {
    channel?: 'gm' | 'page';
    method?: string;
    url: string;
    bodyBytes?: number;
    at?: number;
    served?: string;
    trustedInteractionBefore?: boolean;
    resourceType?: string;
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
    resourceType?: string;
}
export interface LedgerFilter {
    host?: string | RegExp;
    method?: string;
    channel?: 'gm' | 'page';
    path?: string | RegExp;
    beforeInteraction?: boolean;
    includeRecording?: boolean;
}
export interface LedgerSummary {
    requests: number;
    hosts: Record<string, { requests: number; bodyBytes: number; beforeInteraction: number; methods: Record<string, number> }>;
}
export interface NetworkLedger {
    startedAt: number;
    recordRequest(request: LedgerRequest): LedgerEntry;
    markServed(request: { channel?: 'gm' | 'page'; method?: string; url: string }, served: string): void;
    recordInteraction(interaction: { type: string; at?: number }): void;
    firstInteractionAt(): number | null;
    interactions(): Array<{ type: string; at: number }>;
    entries(): LedgerEntry[];
    requests(filter?: LedgerFilter): LedgerEntry[];
    summary(filter?: LedgerFilter): LedgerSummary;
}

export function createNetworkLedger(options?: { startedAt?: number }): NetworkLedger;
export function hostOf(url: string): string;
export function hostMatches(host: string, pattern: string | RegExp): boolean;
export function assertLedgerCount(ledger: NetworkLedger, filter: LedgerFilter, options?: { min?: number; max?: number; label?: string }): LedgerEntry[];
export function assertNoRequestsBeforeInteraction(ledger: NetworkLedger, host: string | RegExp, label?: string): LedgerEntry[];
export function networkLedgerPageProgram(options: { requestBinding: string; interactionBinding: string }): string;
