export const GAMING_LINUX_EXECUTABLE_NAME: string;

export interface GamingPackageManifest {
    name: string;
    productName: string;
    version: string;
    description: string;
    author: string;
    private: true;
    main: string;
    desktopName: string;
}

export function gamingPackageManifest(rootPackageJson: { version: string; author?: string }): GamingPackageManifest;

export function gamingBuilderConfig(options: {
    electronVersion: string;
    iconPng: string;
    iconIcns: string;
    appDir: string;
    outputDir: string;
}): {
    appId: string;
    productName: string;
    electronVersion: string;
    toolsets: { appimage: string };
    linux: { executableName: string; syncDesktopName: boolean; artifactName: string; category: string };
    mac: Record<string, unknown>;
    win: Record<string, unknown>;
    [key: string]: unknown;
};
