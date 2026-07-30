import { version } from '../../package.json';

/**
 * Which build of a Worker is answering.
 *
 * Deployment is a deliberate operator action: no workflow runs wrangler, so
 * production can be any commit the owner last deployed, per Worker, and nothing
 * recorded which. The only build identifier any health payload carried was the
 * Academy's `workerVersionId` — an opaque Cloudflare UUID that cannot be
 * compared to anything in the repository — so "is production running main?" had
 * no answer.
 *
 * Two independent facts answer it together:
 *
 *  - `version` is the repository version the bundle was built from, read from
 *    package.json at build time. Comparing it to main's version tells you
 *    whether a deploy is behind, and it needs no Cloudflare API call.
 *  - `deploymentId` / `deployedAt` come from Cloudflare's own version metadata
 *    binding, so two deploys of the same source are still distinguishable and
 *    `deployedAt` says when the running code was pushed.
 *
 * `null` rather than an omitted field: a Worker whose config is missing the
 * binding has to be visibly missing it, not silently indistinguishable from one
 * that has never been redeployed.
 */
export interface ServiceRevision {
    readonly version: string;
    readonly deploymentId: string | null;
    readonly deployedAt: string | null;
}

/** Cloudflare's `version_metadata` binding. */
export interface WorkerVersionMetadata {
    readonly id?: string;
    readonly tag?: string;
    readonly timestamp?: string;
}

export interface ServiceRevisionEnv {
    readonly CF_VERSION_METADATA?: WorkerVersionMetadata;
}

/** The revision block every Worker health payload carries. */
export function serviceRevision(env: ServiceRevisionEnv): ServiceRevision {
    const metadata = env.CF_VERSION_METADATA;
    return {
        version: SERVICE_VERSION,
        deploymentId: nonEmpty(metadata?.id),
        deployedAt: nonEmpty(metadata?.timestamp),
    };
}

/** The repository version this bundle was built from. */
export const SERVICE_VERSION: string = version;

function nonEmpty(value: string | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}
