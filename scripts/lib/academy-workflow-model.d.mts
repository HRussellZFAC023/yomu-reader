export interface WorkflowTask {
    id: string;
    complete: boolean;
    description: string;
    deps: string[];
    dynamicDependency: string | null;
    gates: string[];
    requirements: string[];
    unknownProofTokens: string[];
    section: string;
    priority: string;
    line: number;
    [key: string]: unknown;
}

export interface WorkflowPlan {
    selected: Array<WorkflowTask & { lane: { id: string }; score: number; unlocks: number }>;
    activeClaims: unknown[];
    readyCount: number;
    blockedCount: number;
}

export function parseBacklog(markdown: string, config?: Record<string, unknown>): WorkflowTask[];
export function validateWorkflow(tasks: WorkflowTask[], config: Record<string, unknown>): { errors: string[]; warnings: string[] };
export function buildPlan(tasks: WorkflowTask[], config: Record<string, unknown>, state?: Record<string, unknown>, now?: Date): WorkflowPlan;
export function progressSummary(tasks: WorkflowTask[]): Record<string, unknown>;
export function proofTemplate(task: WorkflowTask, config: Record<string, unknown>, baseCommit?: string | null): Record<string, any>;
export function bindProofToClaim(
    task: WorkflowTask,
    config: Record<string, any>,
    backlogSha: string,
    claim: Record<string, any>,
): Record<string, any>;
export function validateProof(task: WorkflowTask, proof: Record<string, any>, backlogSha: string, context?: Record<string, any>): string[];
export function createWorkOrder(task: WorkflowTask, config: Record<string, any>, backlogSha: string): string;
export function updateBacklogCheckbox(markdown: string, taskId: string, complete?: boolean): string;
export function taskDefinitionSha256(task: WorkflowTask): string;
export function reuseReportPinErrors(
    claim: Record<string, any> | null | undefined,
    reference: Record<string, any> | null | undefined,
): string[];
export function sha256(value: string | Uint8Array): string;
export function resolveDynamicDependencies(
    task: WorkflowTask,
    tasks: WorkflowTask[],
    config: Record<string, any>,
    state?: Record<string, any>,
): string[] | null;
export function changedFilesWithinOwnership(changedFiles: string[], ownership: string[]): string[];
