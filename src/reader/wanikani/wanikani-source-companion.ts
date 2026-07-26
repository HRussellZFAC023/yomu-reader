import { yomuWanikaniCompanion } from '../companions/registry';
import type { JPDBCard, ReaderSettings } from '../app/types';
import type { WanikaniLookupClient } from './wanikani-lookup';
import type {
    renderWanikaniDefinitionMount as renderWanikaniDefinitionMountImpl,
    WanikaniSourceController as WanikaniSourceControllerImpl,
} from './wanikani-source';

type SourceAttributes = (key: string, initiallyExpanded?: boolean) => string;

// Core-side facade for the Yomu WaniKani companion (ADR-0003 split); see
// wanikani-companion.ts. Without the companion no WaniKani mount is rendered
// and no mount is hydrated, which is the same result an empty API token gives.
class DisabledWanikaniSourceController {
    installDefinitionMounts(): void {}

    installKanjiMount(): void {}
}

const CompanionBackedWanikaniSourceController = class {
    constructor(
        lookup: WanikaniLookupClient,
        getSettings: () => ReaderSettings,
        sourceAttributes: SourceAttributes,
        onRendered?: (mount: HTMLElement) => void,
    ) {
        const Controller = yomuWanikaniCompanion()?.WanikaniSourceController;
        return Controller
            ? new Controller(lookup, getSettings, sourceAttributes, onRendered)
            : new DisabledWanikaniSourceController() as unknown as WanikaniSourceControllerImpl;
    }
};

export const renderWanikaniDefinitionMount: typeof renderWanikaniDefinitionMountImpl = (
    card: JPDBCard,
    settings: ReaderSettings,
    sourceAttributes: SourceAttributes,
) => yomuWanikaniCompanion()?.renderWanikaniDefinitionMount(card, settings, sourceAttributes) ?? '';

export { CompanionBackedWanikaniSourceController as WanikaniSourceController };
