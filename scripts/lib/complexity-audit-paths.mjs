const VITE_TIMESTAMP_MODULE = /\.timestamp-\d+-[a-f0-9]+\.mjs$/iu;

/**
 * Vite writes timestamped config modules beside the real config, then removes
 * them as soon as the build has loaded them. They are generated transport
 * files, not source, and enumerating one while a parallel build deletes it
 * makes the complexity audit race on ENOENT.
 */
export function isComplexityAuditedTypeScriptFile(name) {
    return /\.(?:ts|mts|mjs)$/.test(name)
        && !/\.d\.(?:ts|mts)$/.test(name)
        && !VITE_TIMESTAMP_MODULE.test(name);
}
