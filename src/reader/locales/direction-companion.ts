import { aggregateRuntimeModules } from '../companions/aggregate-runtime-modules';

// Interface direction metadata is immutable and already belongs to the
// aggregate runtime. Reuse it in the split core rather than emitting the
// 33-locale manifest a second time.
export const {
    applyInterfaceLocaleToRoot,
    formatIsolated,
    isRtlInterface,
} = aggregateRuntimeModules().interfaceDirection;
