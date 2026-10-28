import { describe, expect, it } from 'vitest';

import {
    createTextLookupDisplayContext,
    type TextLookupDisplayState,
} from '../../src/reader/main/text-lookup';

const HOVER_DISPLAY_STATE: TextLookupDisplayState = {
    defaultTrigger: 'hover',
    hasActivePopover: true,
    previousNavigationEntry: () => undefined,
};

describe('text lookup display context', () => {
    it('inherits the default trigger when none is given', () => {
        expect(createTextLookupDisplayContext('今日', {}, HOVER_DISPLAY_STATE))
            .toEqual(expect.objectContaining({ trigger: 'hover' }));
    });

    it('honours an explicit modal trigger', () => {
        expect(createTextLookupDisplayContext('今日', { trigger: 'modal' }, HOVER_DISPLAY_STATE))
            .toEqual(expect.objectContaining({ trigger: 'modal' }));
    });
});
