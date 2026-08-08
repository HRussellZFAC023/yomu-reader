export interface CdpClient {
    send(method: string, params?: Record<string, unknown>): Promise<any>;
}

export function configureFunctionProfiler(client: CdpClient, mode: string): Promise<void>;
export function startFunctionProfiler(client: CdpClient, mode: string): Promise<void>;
export function stopFunctionProfiler(
    client: CdpClient,
    mode: string,
): Promise<
    { mode: string; profile: Record<string, unknown> } | { mode: string; scripts: Array<Record<string, unknown>> } | { mode: string }
>;
