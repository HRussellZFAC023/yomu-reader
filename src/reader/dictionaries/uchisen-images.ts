import { cleanText } from '../jpdb/jpdb-text';
import type { UchisenImage } from './uchisen';

export interface UchisenImageCandidate extends UchisenImage {
    paywall: boolean;
}

const UCHISEN_PAYWALL_STORY_RE = /\bplease\s+subscribe\s+to\s+uchisen\s*pro\b/i;
const UCHISEN_PAYWALL_IMAGE_RE = /(?:^|\/)(?:kanji\/)?enrollment\.(?:png|jpe?g|webp)$/i;

export function orderedUchisenImages(images: UchisenImageCandidate[]): UchisenImage[] {
    const seen = new Set<string>();
    const deduped = images.filter(item => {
        const key = uchisenImageDedupeKey(item);
        if (!item.url || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    return [
        ...deduped.filter(item => !item.paywall),
        ...deduped.filter(item => item.paywall),
    ].map(({ url, story }) => ({ url, story }));
}

function uchisenImageDedupeKey(item: UchisenImageCandidate): string {
    return item.paywall && isUchisenPaywallImage(item.url) ? 'paywall:enrollment' : `url:${item.url}`;
}

export function isUchisenPaywallImage(url: string): boolean {
    try {
        return UCHISEN_PAYWALL_IMAGE_RE.test(new URL(url).pathname);
    } catch {
        return UCHISEN_PAYWALL_IMAGE_RE.test(url.split(/[?#]/)[0]);
    }
}

export function isUchisenPaywallStory(story: string): boolean {
    return UCHISEN_PAYWALL_STORY_RE.test(cleanText(story));
}
