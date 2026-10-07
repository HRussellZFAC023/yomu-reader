// What electron-builder is told to make of a built Yomu Gaming, kept apart from
// scripts/package-gaming-electron.mjs (which builds on import) so the packaging decisions
// can be tested without running a package build.

export const GAMING_LINUX_EXECUTABLE_NAME = 'yomu-gaming';
const GAMING_ARTIFACT_NAME = 'yomu-gaming-${version}-${os}-${arch}.${ext}';

/** The package.json the packaged app carries. */
export function gamingPackageManifest(rootPackageJson) {
    return {
        name: 'yomu-gaming',
        productName: 'Yomu Gaming',
        version: rootPackageJson.version,
        description: 'Yomu Gaming desktop reader.',
        author: rootPackageJson.author || 'Yomu Reader contributors',
        private: true,
        main: 'electron/main.cjs',
        // Electron takes its Linux app id (Wayland app_id, X11 WM_CLASS) from this, and the
        // desktop entry has to carry the same name for the window to wear Yomu's icon and
        // group under its launcher entry (linux.syncDesktopName below).
        desktopName: `${GAMING_LINUX_EXECUTABLE_NAME}.desktop`,
    };
}

/** electron-builder's configuration for every Yomu Gaming target. */
export function gamingBuilderConfig({ electronVersion, iconPng, iconIcns, appDir, outputDir }) {
    return {
        appId: 'com.yomureader.gaming',
        productName: 'Yomu Gaming',
        copyright: 'Copyright Yomu Reader contributors',
        electronVersion,
        icon: iconPng,
        asar: true,
        npmRebuild: false,
        directories: {
            app: appDir,
            output: outputDir,
        },
        files: ['**/*'],
        toolsets: {
            // The static AppImage runtime. electron-builder's default is still the legacy
            // runtime, which loads libfuse.so.2 at start — a library Ubuntu 22.04 and later
            // no longer install by default — so on those desktops the AppImage did not open
            // at all ("dlopen(): error loading libfuse.so.2"). The static runtime carries its
            // own FUSE client and needs only the fusermount helper. electron-builder's AppRun
            // adds --no-sandbox when unprivileged user namespaces are blocked (Ubuntu 24.04's
            // AppArmor default), so Chromium never falls back to its SUID sandbox, which cannot
            // work from inside the AppImage's FUSE mount.
            appimage: '1.0.3',
        },
        linux: {
            category: 'Education',
            executableName: GAMING_LINUX_EXECUTABLE_NAME,
            syncDesktopName: true,
            artifactName: GAMING_ARTIFACT_NAME,
        },
        mac: {
            category: 'public.app-category.education',
            artifactName: GAMING_ARTIFACT_NAME,
            // Prebuilt icns (scripts/generate-gaming-icon.mjs): app-builder's own
            // PNG→icns downscaler corrupts the 16/32px representations.
            icon: iconIcns,
        },
        win: {
            artifactName: GAMING_ARTIFACT_NAME,
        },
    };
}
