import type { Page } from 'playwright';

export function assertPopupNestedParseOverlap(page: Pick<Page, 'on' | 'off' | 'evaluate'>): Promise<void>;
