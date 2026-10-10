import { composedClosestElement } from '../dom/composed-tree';

/** Reddit's labels are reading surfaces without replacing its controls. */
export function isRedditReadableLabel(element: Element): boolean {
    return /(^|\.)reddit\.com$/i.test(location.hostname)
        && Boolean(composedClosestElement(element, 'button,[role="button"],summary,time,faceplate-timeago'));
}
