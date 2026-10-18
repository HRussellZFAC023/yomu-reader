export interface GmBridgeResponse { status: number; contentType: string; responseText?: string; bytes?: number[] }
export function answerGmRequest(raw: { method?: string; url: string; headers?: Record<string, string>; data?: unknown }, scope: Record<string, unknown>): Promise<GmBridgeResponse>;
export function routePageRequest(route: unknown, scope: Record<string, unknown>): Promise<void>;
