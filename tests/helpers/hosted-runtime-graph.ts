import { createHash } from 'node:crypto';

export interface HostedRuntimeGraphFixture {
    readonly core: { readonly integrity: string; readonly path: 'yomu.user.js' };
    readonly dependencies: readonly { readonly integrity: string; readonly path: string }[];
    readonly revision: string;
    readonly schemaVersion: 1;
}

export function hostedRuntimeGraphFixture(
    dependencyContents = 'runtime dependency',
    coreContents = 'reader core',
): HostedRuntimeGraphFixture {
    const dependency = runtimeIdentity(dependencyContents);
    const core = runtimeIdentity(coreContents);
    return {
        schemaVersion: 1,
        revision: core.hash,
        dependencies: [{
            path: `greasyfork/yomu-test.${dependency.hash}.user.js`,
            integrity: dependency.integrity,
        }],
        core: { path: 'yomu.user.js', integrity: core.integrity },
    };
}

function runtimeIdentity(contents: string): { readonly hash: string; readonly integrity: string } {
    const digest = createHash('sha256').update(contents);
    return {
        hash: digest.copy().digest('hex').slice(0, 12),
        integrity: `sha256-${digest.digest('base64')}`,
    };
}
