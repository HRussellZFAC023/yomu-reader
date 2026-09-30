import { el, replaceChildrenWith } from '../dom/builder';
import { newTabAction } from './actions';

export interface HeldReviewNoticeCopy {
    message: string;
    check: string;
    discard: string;
}

/**
 * Held reviews were dispatched but their outcome was lost. They block only
 * their own card, so the way to resolve them sits beside the session count,
 * visible whatever card is on screen.
 */
export function syncHeldReviewNotice(root: HTMLElement, count: number, copy: HeldReviewNoticeCopy): void {
    const existing = root.querySelector<HTMLElement>('[data-newtab-held-reviews]');
    if (count <= 0) {
        existing?.remove();
        return;
    }
    const notice = existing ?? el('div', { class: 'jpdb-reader-newtab-held-reviews', dataset: { newtabHeldReviews: true }, role: 'group' });
    if (!existing) {
        const anchor = root.querySelector<HTMLElement>('[data-newtab-count]');
        if (!anchor) return;
        anchor.after(notice);
    }
    replaceChildrenWith(notice,
        el('span', {}, copy.message),
        el('button', { type: 'button', dataset: { newtabAction: newTabAction('check-held-reviews') } }, copy.check),
        el('button', { type: 'button', dataset: { newtabAction: newTabAction('discard-held-reviews') } }, copy.discard),
    );
}
