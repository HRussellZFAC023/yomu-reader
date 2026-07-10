import type { UiCopyKey } from './i18n';
import { DOCS_BASE_URL, USERSCRIPT_INSTALL_URL } from './constants';

// The getting-started page carries per-browser install/update instructions,
// including the fix for the Chromium "Apps, extensions, and user scripts
// cannot be added from this website" banner.
export const INSTALL_GUIDE_URL = `${DOCS_BASE_URL}getting-started`;

export type YomuUpdateFlowKind = 'manager' | 'external-manager' | 'no-manager';

export interface YomuUpdateFlow {
    kind: YomuUpdateFlowKind;
    handler: string;
    url: string;
}

// Handlers whose install path is NOT an intercepted .user.js navigation: the
// page just shows raw source and the companion app (Userscripts on iOS, Stay)
// picks it up from the open tab — so the raw URL is still correct, but the
// guidance must say "leave the tab open / use Safari" instead of promising an
// install screen.
const EXTERNAL_APP_HANDLERS = new Set(['userscripts', 'stay']);

// Managers known to intercept a plain .user.js navigation with an install
// screen. An unknown handler only earns the .user.js path when a callable
// GM_openInTab proves a real manager context — otherwise a stray object on
// GM_info would send the click straight into the Chromium blocked-install
// banner this flow exists to avoid.
const INTERCEPTING_HANDLERS = new Set(['tampermonkey', 'violentmonkey', 'greasemonkey', 'scriptcat', 'orangemonkey', 'firemonkey', 'adguard']);

function scriptHandlerName(info: unknown): string {
    if (!info || typeof info !== 'object') return '';
    const handler = (info as { scriptHandler?: unknown }).scriptHandler;
    return typeof handler === 'string' ? handler.trim() : '';
}

function readGmInfo(): unknown {
    const g = globalThis as { GM_info?: unknown; GM?: { info?: unknown } };
    return g.GM_info ?? g.GM?.info;
}

function hasCallableOpenInTab(): boolean {
    const g = globalThis as { GM_openInTab?: unknown; GM?: { openInTab?: unknown } };
    return typeof g.GM_openInTab === 'function' || typeof g.GM?.openInTab === 'function';
}

// Decides where the settings "Update" affordance should send the user so a
// click never dead-ends in the Chromium sideload-block banner:
// - a userscript manager runtime (Tampermonkey/Violentmonkey/...) intercepts
//   .user.js navigations, so the raw script URL is the right target;
// - Userscripts (iOS) / Stay read the raw source from an open Safari tab;
// - no manager at all (hosted reader, extension build, dead bridge) means a
//   .user.js navigation would trigger the browser's blocked-install banner,
//   so the button opens the install guide instead.
export function detectYomuUpdateFlow(info: unknown = readGmInfo(), openInTabAvailable: boolean = hasCallableOpenInTab()): YomuUpdateFlow {
    if (!info || typeof info !== 'object') return { kind: 'no-manager', handler: '', url: INSTALL_GUIDE_URL };
    const handler = scriptHandlerName(info);
    if (EXTERNAL_APP_HANDLERS.has(handler.toLowerCase())) return { kind: 'external-manager', handler, url: USERSCRIPT_INSTALL_URL };
    if (INTERCEPTING_HANDLERS.has(handler.toLowerCase()) || openInTabAvailable) return { kind: 'manager', handler, url: USERSCRIPT_INSTALL_URL };
    // GM_info-shaped object with an unknown handler and no callable
    // GM_openInTab: the click would fall back to window.open(.user.js) and
    // reproduce the Chromium blocked-install banner — degrade to the guide.
    return { kind: 'no-manager', handler, url: INSTALL_GUIDE_URL };
}

export function updateFlowNoteKey(kind: YomuUpdateFlowKind): UiCopyKey {
    switch (kind) {
        case 'external-manager':
            return 'updateHelpNotesExternalManager';
        case 'no-manager':
            return 'updateHelpNotesNoManager';
        case 'manager':
        default:
            return 'updateHelpNotesManager';
    }
}
