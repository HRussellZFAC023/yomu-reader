// The extension's toolbar popup offers the puck's actions for the active tab
// (owner decision 4, 2026-10-07). The popup asks the tab's top frame over
// runtime messaging (scripts/lib/extension-popup-actions.mjs) and this page
// answers with each action's current label and state, so no action lives in
// the background, whose MV3 worker forgets in-memory state when it idles: that
// is how the compiler's GM menu commands vanished from the popup. Only the
// extension build installs this; userscript managers keep the GM menu.
//
// A tab Yomu does not run on (Study itself, a new tab, a browser page) cannot
// answer, so the background answers the popup's own two rows instead, in the
// saved interface language it already reads from extension storage.
import { resolveUiLanguage, uiText } from './i18n';
import { extensionRuntimeMayBeYomu } from './runtime-env';
import type { InterfaceLanguage } from './types';
import type { RadialAction } from '../ui/radial-menu';

export const EXTENSION_POPUP_ACTIONS_CHANNEL = 'yomu-popup-actions';

// The popup opens Study and Settings itself, as packaged pages: a page cannot
// open a window for a click it never saw, and Settings opens on Study anyway.
const POPUP_OWNED_ACTIONS = new Set(['study', 'settings']);
// These labels name the setting, not the state, so the popup marks the state.
const STATE_TOGGLES = new Set(['japanese-site', 'subtitles', 'youtube']);

export interface ExtensionPopupAction {
    id: string;
    label: string;
    /** The shared menu icon for the current state, drawn the same as on the puck. */
    icon: RadialAction['icon'];
    tone?: RadialAction['tone'];
    pressed?: boolean;
}

/** The popup's own Study and Settings rows, named in the interface language. */
export interface ExtensionToolbarLabels {
    language: 'en' | 'ja';
    studyLabel: string;
    settingsLabel: string;
}

export interface ExtensionPopupActionList extends ExtensionToolbarLabels {
    actions: ExtensionPopupAction[];
}

export interface ExtensionPopupActionSource {
    language(): InterfaceLanguage;
    actions(): RadialAction[];
}

type PopupMessageSender = { id?: string; tab?: unknown };
type PopupMessageListener = (message: unknown, sender: PopupMessageSender, sendResponse: (response: unknown) => void) => boolean | undefined;
interface ExtensionMessagingRuntime {
    id?: string;
    onMessage?: {
        addListener(listener: PopupMessageListener): void;
        removeListener(listener: PopupMessageListener): void;
    };
}

/** Answers the toolbar popup until `signal` aborts. */
export function installExtensionPopupActions(source: ExtensionPopupActionSource, signal: AbortSignal): void {
    if (!extensionRuntimeMayBeYomu()) return;
    const runtime = extensionMessagingRuntime();
    const onMessage = runtime?.onMessage;
    if (!runtime?.id || !onMessage || signal.aborted) return;
    const listener: PopupMessageListener = (message, sender, sendResponse) => {
        const request = popupActionsRequest(message);
        // Only this extension's own pages: a content script of another tab carries `tab`.
        if (!request || sender.id !== runtime.id || sender.tab) return undefined;
        void answerPopup(source, request).then(sendResponse, () => sendResponse(undefined));
        return true;
    };
    onMessage.addListener(listener);
    signal.addEventListener('abort', () => onMessage.removeListener(listener), { once: true });
}

/** Answers the popup's `labels` request from the extension background. */
export function installExtensionToolbarLabels(savedLanguage: () => Promise<InterfaceLanguage>): void {
    const runtime = extensionMessagingRuntime();
    if (!runtime?.id || !runtime.onMessage) return;
    runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (popupMessage(message)?.type !== 'labels' || sender.id !== runtime.id || sender.tab) return undefined;
        void savedLanguage().then(language => sendResponse(extensionToolbarLabels(language)), () => sendResponse(undefined));
        return true;
    });
}

function extensionToolbarLabels(language: InterfaceLanguage): ExtensionToolbarLabels {
    return {
        language: resolveUiLanguage(language),
        studyLabel: uiText(language, 'newTab'),
        settingsLabel: uiText(language, 'settings'),
    };
}

async function answerPopup(source: ExtensionPopupActionSource, request: { type: 'list' | 'run'; id: string }): Promise<ExtensionPopupActionList> {
    if (request.type === 'run') {
        const action = popupActions(source).find(candidate => candidate.id === request.id);
        await action?.run();
    }
    const language = source.language();
    return {
        ...extensionToolbarLabels(language),
        actions: popupActions(source).map(({ id, label, icon, tone }) => ({
            id,
            label,
            icon,
            tone,
            pressed: STATE_TOGGLES.has(id) ? tone === 'on' : undefined,
        })),
    };
}

function popupActions(source: ExtensionPopupActionSource): RadialAction[] {
    return source.actions().filter(action => !action.disabled && !POPUP_OWNED_ACTIONS.has(action.id));
}

function popupActionsRequest(message: unknown): { type: 'list' | 'run'; id: string } | undefined {
    const request = popupMessage(message);
    const type = request?.type;
    if (type !== 'list' && type !== 'run') return undefined;
    return { type, id: typeof request?.id === 'string' ? request.id : '' };
}

function popupMessage(message: unknown): { type?: unknown; id?: unknown } | undefined {
    if (!message || typeof message !== 'object') return undefined;
    const request = message as { channel?: unknown; type?: unknown; id?: unknown };
    return request.channel === EXTENSION_POPUP_ACTIONS_CHANNEL ? request : undefined;
}

function extensionMessagingRuntime(): ExtensionMessagingRuntime | undefined {
    const global = globalThis as { browser?: { runtime?: ExtensionMessagingRuntime }; chrome?: { runtime?: ExtensionMessagingRuntime } };
    try {
        return global.browser?.runtime ?? global.chrome?.runtime;
    } catch {
        return undefined;
    }
}
