import { immersionKitCapabilitiesFor, IMMERSION_KIT_EXAMPLE_SOURCE_ID } from './immersion-kit';
import { createTatoebaExampleSource, tatoebaCapabilitiesFor, TATOEBA_EXAMPLE_SOURCE_ID } from './tatoeba';
import type { ExampleSourceAdapter, ExampleSourceCapabilities } from './types';

/**
 * Example sources are registered by TARGET, never by interface or output
 * language. Adding a source is this call and nothing else, which is the same
 * rule the learning-target registry follows.
 */
const ADAPTERS = new Map<string, ExampleSourceAdapter>();

export interface ExampleSourceCapabilityRow {
    readonly sourceId: string;
    readonly sourceName: string;
    readonly capabilities: ExampleSourceCapabilities;
}

export function registerExampleSource(adapter: ExampleSourceAdapter): ExampleSourceAdapter {
    ADAPTERS.set(adapter.id, adapter);
    return adapter;
}

export function unregisterExampleSource(sourceId: string): boolean {
    return ADAPTERS.delete(sourceId);
}

export function registeredExampleSources(): readonly ExampleSourceAdapter[] {
    return [...ADAPTERS.values()];
}

/**
 * Every registered source that serves this target, in registration order.
 *
 * Empty is a real and expected answer: a target registered by a future Slice 9
 * wave has no example source until one is mapped for it, and the UI has to say
 * so rather than render nothing.
 */
export function exampleSourcesForTarget(targetLanguage: string): readonly ExampleSourceAdapter[] {
    return registeredExampleSources().filter(adapter => adapter.supports(targetLanguage).supported);
}

/**
 * The capability answer for *all* registered sources, including the ones that
 * refuse this target. The refusals are the point: "Immersion Kit has no Spanish
 * sentences" is information, and hiding it is what made an unsupported target
 * look identical to a broken one.
 */
export function exampleSourceCapabilityRows(targetLanguage: string): readonly ExampleSourceCapabilityRow[] {
    return registeredExampleSources().map(adapter => ({
        sourceId: adapter.id,
        sourceName: adapter.name,
        capabilities: adapter.supports(targetLanguage),
    }));
}

/**
 * Capabilities without constructing an adapter, for callers that only need to
 * know what a target has: the settings matrix, the availability rows, and the
 * audit that asserts the published claim matches the code.
 */
export function declaredExampleCapabilities(targetLanguage: string): readonly ExampleSourceCapabilityRow[] {
    return [
        { sourceId: IMMERSION_KIT_EXAMPLE_SOURCE_ID, sourceName: 'Immersion Kit', capabilities: immersionKitCapabilitiesFor(targetLanguage) },
        { sourceId: TATOEBA_EXAMPLE_SOURCE_ID, sourceName: 'Tatoeba', capabilities: tatoebaCapabilitiesFor(targetLanguage) },
    ];
}

// Tatoeba is registered at module init because it needs nothing from the host
// page. ImmersionKit is registered by the reader once the study companion has
// loaded, since its client lives in that bundle.
registerExampleSource(createTatoebaExampleSource());
