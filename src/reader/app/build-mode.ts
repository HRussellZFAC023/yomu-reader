/**
 * Vite replaces MODE at build time, so production bundles see `false` and
 * Rollup drops development-only branches. Development builds
 * (`npm run dev:userscript`) and tests see `true`; a bundle built without Vite
 * sees an empty import.meta and stays in production mode.
 */
export const DEVELOPMENT_BUILD = import.meta.env?.MODE === 'development' || import.meta.env?.MODE === 'test';
