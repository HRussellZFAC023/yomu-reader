import { createPublicCache } from '../core/public-cache';

const cache = createPublicCache('yomu:jpdb-cache:v1');

export const readPublicJpdbCache = cache.read;
export const writePublicJpdbCache = cache.write;
