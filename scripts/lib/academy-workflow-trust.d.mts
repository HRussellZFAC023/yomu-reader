export const GOVERNANCE_TRUST_SCHEMA: string;
export function governanceTrustStorePath(repoRoot: string, environment?: Record<string, string | undefined>, home?: string): string;
export function validateGovernanceTrustStore(store: Record<string, any>): string[];
export function loadGovernanceTrustStore(repoRoot: string, options?: Record<string, any>): Record<string, any>;
export function trustBindings(config: Record<string, any>, store: Record<string, any>): Record<string, any>;
export function findExecutable(command: string, pathValue?: string): string;
export function resolveTrustedTool(toolId: string, store: Record<string, any>, options?: Record<string, any>): Record<string, any>;
