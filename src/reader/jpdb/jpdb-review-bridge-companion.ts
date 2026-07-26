import { yomuJpdbCompanion } from '../companions/registry';
import type { initJpdbReviewPageBridge as initJpdbReviewPageBridgeImpl } from './jpdb-review-bridge';

// Core-side facade for the Yomu JPDB companion (ADR-0003 split); see
// jpdb-companion.ts. The jpdb.io review/learn page bridge (BroadcastChannel
// publisher, document parsing, heartbeat) only ever runs on jpdb.io itself, so
// it ships with the companion. Without it no bridge is installed and the
// caller receives the same `undefined` disposer it already gets off jpdb.io.
export const initJpdbReviewPageBridge: typeof initJpdbReviewPageBridgeImpl = () =>
    yomuJpdbCompanion()?.initJpdbReviewPageBridge?.();
