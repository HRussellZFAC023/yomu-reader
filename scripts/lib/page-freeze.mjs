// Freezing a live page into a Recorded Page document: the DOM as the reader
// saw it, with the site's scripts removed so replay is deterministic and no
// site code is committed. Runs in the page (page.evaluate(freezePageInPage)).
//
// What survives: every element, attribute and open shadow root (as declarative
// shadow DOM); stylesheets, including rules a CSS-in-JS library inserted
// through the CSSOM and adopted stylesheets; form state; the image candidate
// the browser actually chose. What goes: <script>, <noscript>, script
// preloads, inline event handlers, CSP/refresh metas and iframe contents.
//
// freezePageInPage mutates the live DOM; serializePageInPage writes it out.
// A redaction runs between the two.

export function freezePageInPage() {
    const REMOVED = 'script, noscript, link[rel="modulepreload"], link[rel="preload"][as="script"], link[rel="prefetch"], meta[http-equiv="Content-Security-Policy" i], meta[http-equiv="refresh" i]';
    const openRoots = root => [...root.querySelectorAll('*')].filter(element => element.shadowRoot).flatMap(element => [element.shadowRoot, ...openRoots(element.shadowRoot)]);
    const roots = [document, ...openRoots(document)];
    const ruleText = sheet => {
        try {
            return [...sheet.cssRules].map(rule => rule.cssText).join('\n');
        } catch {
            return '';
        }
    };
    // CSS-in-JS libraries insertRule into empty <style> elements; the text is the only thing a file keeps.
    const writeInsertedRules = style => {
        if (!style.textContent.trim() && style.sheet?.cssRules?.length) style.textContent = ruleText(style.sheet);
    };
    const writeAdoptedSheets = root => {
        const adopted = root.adoptedStyleSheets ?? [];
        if (!adopted.length) return;
        const style = document.createElement('style');
        style.dataset.yomuRecordedAdopted = '';
        style.textContent = adopted.map(ruleText).join('\n');
        (root === document ? document.head : root).append(style);
    };
    const neutraliseAttribute = (element, attribute) => {
        if (/^on/iu.test(attribute.name)) element.removeAttribute(attribute.name);
        else if (/^(href|src|action|formaction)$/iu.test(attribute.name) && /^\s*javascript:/iu.test(attribute.value)) element.setAttribute(attribute.name, '#');
    };
    const neutraliseAttributes = element => [...element.attributes].forEach(attribute => neutraliseAttribute(element, attribute));
    const blankFrame = frame => {
        frame.removeAttribute('srcdoc');
        frame.setAttribute('src', 'about:blank');
    };
    const INPUT_STATE = {
        checkbox: input => input.toggleAttribute('checked', input.checked),
        radio: input => input.toggleAttribute('checked', input.checked),
        file: input => input.removeAttribute('value'),
        password: input => input.removeAttribute('value'),
    };
    const keepInputState = input => (INPUT_STATE[input.type] ?? (field => field.setAttribute('value', field.value)))(input);
    // The candidate the browser chose; a picture the reader had loaded replays eagerly.
    const pinImage = image => {
        if (/^(?!blob:)./u.test(image.currentSrc)) image.setAttribute('src', image.currentSrc);
        image.removeAttribute('srcset');
        image.removeAttribute('sizes');
        if (image.naturalWidth > 0) image.removeAttribute('loading');
    };
    const stillMedia = media => {
        if (String(media.getAttribute('src')).startsWith('blob:')) media.removeAttribute('src');
        media.removeAttribute('autoplay');
    };
    const STEPS = [
        ['style', writeInsertedRules],
        [REMOVED, element => element.remove()],
        ['*', neutraliseAttributes],
        ['iframe, frame', blankFrame],
        ['input', keepInputState],
        ['textarea', area => { area.textContent = area.value; }],
        ['option', option => option.toggleAttribute('selected', option.selected)],
        ['img', pinImage],
        ['picture > source', source => source.remove()],
        ['video, audio', stillMedia],
    ];
    roots.forEach(writeAdoptedSheets);
    for (const [selector, step] of STEPS) roots.forEach(root => root.querySelectorAll(selector).forEach(step));
    roots.forEach(root => root.normalize());
    return { shadowRoots: roots.length - 1, title: document.title };
}

export function serializePageInPage() {
    const openRoots = root => [...root.querySelectorAll('*')].filter(element => element.shadowRoot).flatMap(element => [element.shadowRoot, ...openRoots(element.shadowRoot)]);
    // The charset travels in the file, first: WebKit ignores the one a replay's
    // header names, and a prescan only reads the first 1024 bytes.
    document.querySelectorAll('meta[charset], meta[http-equiv="Content-Type" i]').forEach(meta => meta.remove());
    const charset = document.createElement('meta');
    charset.setAttribute('charset', 'utf-8');
    document.head.prepend(charset);
    const html = document.documentElement;
    const escape = value => value.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;');
    const attributes = [...html.attributes].map(attribute => ` ${attribute.name}="${escape(attribute.value)}"`).join('');
    const inner = html.getHTML({ serializableShadowRoots: true, shadowRoots: openRoots(document) });
    return `<!DOCTYPE html>\n<html${attributes}>${inner}</html>\n`;
}

/**
 * Every place a reader sees text — text nodes, including in open shadow roots,
 * and the visible attributes named — returned in document order. The nodes
 * are kept on window for redactTextSlotsInPage (text-redactor.mjs).
 */
export function collectTextSlotsInPage({ visibleAttributes }) {
    const SKIPPED = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);
    const slots = [];
    const metaContent = element => (element.localName === 'meta' && element.hasAttribute('content') ? [{ element, name: 'content' }] : []);
    const attributeSlots = element => [
        ...visibleAttributes.filter(name => element.hasAttribute(name)).map(name => ({ element, name })),
        ...metaContent(element),
    ];
    const visitText = node => {
        if (!SKIPPED.has(node.parentNode?.nodeName)) slots.push({ node });
    };
    const visitElement = element => {
        slots.push(...attributeSlots(element));
        if (element.shadowRoot) visit(element.shadowRoot);
    };
    const visit = root => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) (node.nodeType === Node.TEXT_NODE ? visitText : visitElement)(node);
    };
    visit(document);
    window.__yomuTextSlots = slots;
    return slots.map(slot => (slot.node ? slot.node.nodeValue : slot.element.getAttribute(slot.name)));
}

/**
 * Redaction of pictures: every <img> points at a blank image of its natural
 * size, and inline SVG artwork (logos, icons) loses its drawing but keeps its
 * box. Returns the sizes the recorder has to serve.
 */
export function blankPicturesInPage({ blankPrefix }) {
    const sizes = new Set();
    const side = (natural, rendered) => natural || Math.round(rendered) || 1;
    const sizeOf = image => {
        const rect = image.getBoundingClientRect();
        return `${side(image.naturalWidth, rect.width)}x${side(image.naturalHeight, rect.height)}`;
    };
    const blankImage = image => {
        const size = sizeOf(image);
        sizes.add(size);
        image.setAttribute('src', `${blankPrefix}${size}.png`);
    };
    const emptyArtwork = svg => {
        if (!svg.parentElement?.closest('svg')) svg.replaceChildren();
    };
    const visit = root => {
        root.querySelectorAll('img').forEach(blankImage);
        root.querySelectorAll('svg').forEach(emptyArtwork);
        root.querySelectorAll('*').forEach(element => element.shadowRoot && visit(element.shadowRoot));
    };
    visit(document);
    return [...sizes];
}
