import { createPublicCache } from '../core/public-cache';

// v2 cards preserve aligned compound components for inline pitch. Reusing v1
// would keep pre-release cards without that field alive for 24 hours, making
// the fix appear broken immediately after an upgrade.
const cache = createPublicCache('yomu:jiten-public-cache:v2');

export const readPublicJitenCache = cache.read;
export const writePublicJitenCache = cache.write;
