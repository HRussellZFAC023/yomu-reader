/**
 * A hover lookup over a word inside a link takes the hover from the link.
 * Sites with their own link previews, such as Wikipedia's page previews, open
 * them on mouseover and close them on mouseout, so without this both surfaces
 * opened over the article at once (YQ-09). The link hears the pointer leave it
 * for its own surroundings, so a hover menu or card that holds the link does
 * not hear a leave and close under the pointer. Yomu's own listeners ignore
 * these untrusted events. It runs when the hover lookup starts, before a site
 * preview has finished its own dwell, and again when the popup mounts.
 */
export function handOverLinkHover(anchor: HTMLElement | undefined): void {
    const link = anchor?.closest<HTMLElement>('a[href]');
    if (!link) return;
    const leave = { relatedTarget: link.parentElement };
    link.dispatchEvent(new MouseEvent('mouseout', { ...leave, bubbles: true, cancelable: true, composed: true }));
    link.dispatchEvent(new MouseEvent('mouseleave', leave));
    if (typeof PointerEvent !== 'function') return;
    link.dispatchEvent(new PointerEvent('pointerout', { ...leave, bubbles: true, cancelable: true, composed: true }));
    link.dispatchEvent(new PointerEvent('pointerleave', leave));
}
