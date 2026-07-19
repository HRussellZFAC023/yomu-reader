export const USER_SCRIPT_COMPILER_COMMIT: string;

export interface ReleaseVersionValidationOptions {
    releaseTag: string;
    packageJson: string;
    chromePackage: string;
    firefoxPackage: string;
}

export interface ReleaseVersionValidation {
    version: string;
    manifests: {
        chrome: Record<string, unknown>;
        firefox: Record<string, unknown>;
    };
}

export function validateReleaseVersions(
    options: ReleaseVersionValidationOptions,
): Promise<ReleaseVersionValidation>;

export function createDeterministicZip(files: Map<string, Uint8Array>): Uint8Array;
