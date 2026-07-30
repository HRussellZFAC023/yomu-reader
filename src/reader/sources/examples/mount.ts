import { escapeHtml } from '../../dom/index';
import { uiText } from '../../app/i18n';
import { outputLanguageOf, targetLanguageOf } from '../../languages/selection';
import { installProviderTranslationReveal } from '../provider-examples';
import { exampleSourceStateKey, renderExampleSourceRow } from './availability-render';
import { declaredExampleCapabilities, exampleSourcesForTarget } from './registry';
import type { ReaderSettings } from '../../app/types';
import type { ExampleCollection, ExampleRecord, ExampleSourceAdapter } from './types';

type SourceAttributes = (sourceStateKey: string, initiallyExpanded?: boolean) => string;

const DEFAULT_EXAMPLE_LIMIT = 8;

/**
 * The example-source mounts for a TARGET that ImmersionKit does not cover.
 *
 * Two things render, and the first one is the point. A source that refuses this
 * target renders its refusal, so a Spanish learner is told "Immersion Kit has no
 * Spanish sentences" instead of watching a Japanese-only card sit empty forever.
 * The sources that do cover the target render a card the loader fills.
 */
export function renderTargetExampleSourceMounts(settings: ReaderSettings, sourceAttributes: SourceAttributes): string {
    const targetLanguage = targetLanguageOf(settings);
    const outputLanguage = outputLanguageOf(settings);
    return declaredExampleCapabilities(targetLanguage).map(row => {
        if (!row.capabilities.supported) {
            return renderExampleSourceRow({
                sourceId: row.sourceId,
                sourceName: row.sourceName,
                interfaceLanguage: settings.interfaceLanguage,
                targetLanguage,
                outputLanguage,
                capabilities: row.capabilities,
                collection: { availability: 'unsupported', items: [] },
                sourceAttributes,
            });
        }
        return `
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-example-source-card"
                data-example-source="${escapeHtml(row.sourceId)}"
                data-availability="pending"
                data-example-target="${escapeHtml(targetLanguage)}"
                ${sourceAttributes(exampleSourceStateKey(row.sourceId), false)}>
                <summary class="jpdb-reader-local-title jpdb-reader-example-summary" data-jpdb-reader-surface-ignore>
                    <span class="jpdb-reader-example-source">${escapeHtml(row.sourceName)}</span>
                </summary>
                <div class="jpdb-reader-local-glossary">
                    <p class="jpdb-reader-help">${escapeHtml(uiText(settings.interfaceLanguage, 'loadingExamples'))}</p>
                </div>
            </details>
        `;
    }).join('');
}

export interface TargetExampleLoadOptions {
    readonly settings: ReaderSettings;
    readonly term: string;
    readonly sourceAttributes: SourceAttributes;
    readonly isCurrentRoot?: (root: HTMLElement) => boolean;
    readonly adapters?: readonly ExampleSourceAdapter[];
    readonly playAudio?: (url: string) => void;
}

/**
 * One controller per (root, source), not one per root. Retrying a failed source
 * used to abort every other source still in flight on the same popover, which
 * left a sibling card stuck on its loading copy — the exact silent state U46
 * exists to remove.
 */
const ROOT_ABORT_CONTROLLERS = new WeakMap<HTMLElement, Map<string, AbortController>>();

/**
 * Fills each pending card, and rebinds the retry and audio controls.
 *
 * Loading is eager rather than intersection-gated: the mount only exists for a
 * target whose card the learner just opened, the request is one small JSON call,
 * and a lazy path here is what made the Japanese immersion section look broken
 * below the popover fold.
 */
export function installTargetExampleSources(root: HTMLElement, options: TargetExampleLoadOptions): void {
    const targetLanguage = targetLanguageOf(options.settings);
    const adapters = options.adapters ?? exampleSourcesForTarget(targetLanguage);
    if (!adapters.length) return;
    installExampleSourceControls(root, options);
    adapters.forEach(adapter => {
        const controller = replaceSourceController(root, adapter.id);
        void loadOneSource(root, adapter, options, controller);
    });
}

export function abortPendingTargetExampleSources(root: HTMLElement, sourceId?: string): void {
    const controllers = ROOT_ABORT_CONTROLLERS.get(root);
    if (!controllers) return;
    if (sourceId === undefined) {
        controllers.forEach(controller => controller.abort());
        ROOT_ABORT_CONTROLLERS.delete(root);
        return;
    }
    controllers.get(sourceId)?.abort();
    controllers.delete(sourceId);
}

function replaceSourceController(root: HTMLElement, sourceId: string): AbortController {
    abortPendingTargetExampleSources(root, sourceId);
    const controllers = ROOT_ABORT_CONTROLLERS.get(root) ?? new Map<string, AbortController>();
    const controller = new AbortController();
    controllers.set(sourceId, controller);
    ROOT_ABORT_CONTROLLERS.set(root, controllers);
    return controller;
}

async function loadOneSource(
    root: HTMLElement,
    adapter: ExampleSourceAdapter,
    options: TargetExampleLoadOptions,
    controller: AbortController,
): Promise<void> {
    const targetLanguage = targetLanguageOf(options.settings);
    const outputLanguage = outputLanguageOf(options.settings);
    let collection: ExampleCollection<ExampleRecord>;
    try {
        collection = await adapter.search({
            term: options.term,
            targetLanguage,
            outputLanguage,
            signal: controller.signal,
            limit: exampleLimit(options.settings),
        });
    } catch (error) {
        // An abort is the learner moving on, not a failure to report.
        if (controller.signal.aborted || isAbortError(error)) return;
        collection = { availability: 'unavailable', items: [], reason: 'network' };
    }
    if (controller.signal.aborted) return;
    if (options.isCurrentRoot && !options.isCurrentRoot(root)) return;
    const card = root.querySelector<HTMLElement>(`[data-example-source="${cssEscape(adapter.id)}"]`);
    if (!card?.isConnected) return;
    card.outerHTML = renderExampleSourceRow({
        sourceId: adapter.id,
        sourceName: adapter.name,
        interfaceLanguage: options.settings.interfaceLanguage,
        targetLanguage,
        outputLanguage,
        capabilities: adapter.supports(targetLanguage),
        collection,
        sourceAttributes: options.sourceAttributes,
        blurTranslations: options.settings.immersionKitRevealTranslationOnClick,
    });
}

function exampleLimit(settings: ReaderSettings): number {
    return settings.immersionKitLimitEnabled && settings.immersionKitLimit > 0
        ? settings.immersionKitLimit
        : DEFAULT_EXAMPLE_LIMIT;
}

function installExampleSourceControls(root: HTMLElement, options: TargetExampleLoadOptions): void {
    if (root.dataset.yomuExampleSourceControls === 'true') return;
    root.dataset.yomuExampleSourceControls = 'true';
    root.addEventListener('click', event => {
        const trigger = (event.target as Element | null)?.closest<HTMLElement>('[data-action]');
        if (!trigger || !root.contains(trigger)) return;
        if (trigger.dataset.action === 'retry-example-source') {
            event.preventDefault();
            const sourceId = trigger.dataset.exampleSourceId ?? '';
            const adapters = (options.adapters ?? exampleSourcesForTarget(targetLanguageOf(options.settings)))
                .filter(adapter => adapter.id === sourceId);
            if (adapters.length) installTargetExampleSources(root, { ...options, adapters });
            return;
        }
        if (trigger.dataset.action === 'play-example-audio') {
            event.preventDefault();
            const url = trigger.dataset.exampleAudioUrl ?? '';
            if (url) playExampleAudio(url, options);
        }
    });
    // Blur reveal is the shared provider behaviour, not a second copy of it.
    installProviderTranslationReveal(root);
}

function playExampleAudio(url: string, options: TargetExampleLoadOptions): void {
    if (options.playAudio) {
        options.playAudio(url);
        return;
    }
    if (typeof Audio !== 'function') return;
    const audio = new Audio(url);
    void audio.play().catch(() => undefined);
}

function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
}

/** `CSS.escape` is missing in the jsdom suite and in older userscript hosts. */
function cssEscape(value: string): string {
    return value.replace(/["\\]/gu, '\\$&');
}
