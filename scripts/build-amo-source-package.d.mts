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

export interface ReleaseVersionValues {
    tag: string;
    package: string;
    chrome: string;
    firefox: string;
}

export function validateReleaseVersionValues(
    versions: ReleaseVersionValues,
    manifests?: ReleaseVersionValidation['manifests'],
): { version: string; manifests: ReleaseVersionValidation['manifests'] | undefined };

export function createDeterministicZip(files: Map<string, Uint8Array>): Uint8Array;
