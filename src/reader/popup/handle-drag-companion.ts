import { aggregateRuntimeModules } from '../companions/aggregate-runtime-modules';

const handleDrag = aggregateRuntimeModules().handleDrag;

export const {
    addViewportChangeListeners,
    createHandleDragController,
    firstChangedTouch,
    getContainedClosest,
} = handleDrag;
