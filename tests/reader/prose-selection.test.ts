import { describe, expect, it } from 'vitest';

import { isProseDominantSelection } from '../../src/reader/lookup/text-helpers';

describe('isProseDominantSelection', () => {
    it('treats a paragraph that merely embeds a Japanese word as prose', () => {
        // The reported regression: dragging across this paragraph collapsed the
        // selection back onto よむ when the auto popup opened.
        expect(isProseDominantSelection(
            'Follow along with your favourite shows using よむ, looking up any words you dont understand while the video is paused.',
        )).toBe(true);
    });

    it('keeps Japanese-only selections lookupable', () => {
        expect(isProseDominantSelection('静かな喫茶店で新しい本を読みました。')).toBe(false);
        expect(isProseDominantSelection('よむ')).toBe(false);
    });

    it('keeps short mixed lookups lookupable', () => {
        expect(isProseDominantSelection('iPhoneを買う')).toBe(false);
        expect(isProseDominantSelection('これはペンです This is a pen')).toBe(false);
    });

    it('only trips once Latin prose dwarfs the Japanese', () => {
        // Latin clearly dominant -> prose.
        expect(isProseDominantSelection('The quick brown fox jumped over 犬 lazily today.')).toBe(true);
        // A Japanese sentence with a few embedded loan words stays under the
        // Latin floor -> lookupable.
        expect(isProseDominantSelection('彼はNew Yorkに行ってMcDonaldで食べた')).toBe(false);
    });
});
