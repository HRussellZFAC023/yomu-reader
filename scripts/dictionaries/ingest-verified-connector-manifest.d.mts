export function ingestVerifiedConnectorManifest(
  catalog: Record<string, unknown> & { revision: string; entries: Array<Record<string, unknown>> },
  connector: unknown,
  ledger?: unknown,
): Record<string, unknown> & { entries: Array<Record<string, unknown>> };
