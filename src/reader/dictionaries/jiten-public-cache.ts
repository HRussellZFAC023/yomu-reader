import { createPublicCache } from '../core/public-cache';

const cache = createPublicCache('yomu:jiten-public-cache:v1');

export const readPublicJitenCache = cache.read;
export const writePublicJitenCache = cache.write;
