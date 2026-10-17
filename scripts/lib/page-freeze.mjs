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
    // Open shadow roots and inert <template> contents: querySelectorAll enters neither.
    const innerRoot = element => element.shadowRoot ?? (element.localName === 'template' ? element.content : null);
    const nestedRoots = root => [...root.querySelectorAll('*')].map(innerRoot).filter(Boolean).flatMap(inner => [inner, ...nestedRoots(inner)]);
    const roots = [document, ...nestedRoots(document)];
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
    return { shadowRoots: roots.filter(root => root.host).length, title: document.title };
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

/** The <style> texts of the frozen page, shadow roots and templates included. */
export function styleTextsInPage() {
    const texts = [];
    const innerRootOf = element => element.shadowRoot ?? (element.localName === 'template' ? element.content : null);
    const walk = root => root.querySelectorAll('*').forEach(element => {
        if (element.localName === 'style') texts.push(element.textContent);
        if (innerRootOf(element)) walk(innerRootOf(element));
    });
    walk(document);
    return texts;
}

/**
 * Every place a page keeps words, returned in document order as
 * { text, kind }: text nodes, including in open shadow roots and <template>
 * contents ('text'), the visible attributes named ('visible') and every other
 * attribute that holds a letter ('hidden': a headline in data-realizer-title,
 * a campaign in data-gtm-label). Kept verbatim: structural attributes, an
 * ARIA state's keyword (aria-hidden="true": the product reads
 * [aria-disabled="true"]) and a hidden value a stylesheet selects on
 * (selectedValues, from attributeSelectorIndex: redacting [data-state="open"]
 * would restyle the page). The slots are kept on window for
 * redactTextSlotsInPage (text-redactor.mjs).
 */
export function collectTextSlotsInPage({ visibleAttributes, structuralAttributes, ariaStateAttributes, selectedValues }) {
    const SKIPPED = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);
    const visible = new Set(visibleAttributes);
    const structural = new Set(structuralAttributes);
    const ariaStates = new Set(ariaStateAttributes);
    // Document order, each open shadow root and <template> content right after
    // its host (a TreeWalker enters neither, and a template's text ships too).
    const innerRootOf = node => node.shadowRoot ?? (node.localName === 'template' ? node.content : null);
    const walk = (root, onNode) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            onNode(node);
            if (innerRootOf(node)) walk(innerRootOf(node), onNode);
        }
    };
    const OPERATORS = {
        '': (value, wanted) => value === wanted,
        '~': (value, wanted) => value.split(/\s+/u).includes(wanted),
        '|': (value, wanted) => value === wanted || value.startsWith(`${wanted}-`),
        '^': (value, wanted) => wanted !== '' && value.startsWith(wanted),
        $: (value, wanted) => wanted !== '' && value.endsWith(wanted),
        '*': (value, wanted) => wanted !== '' && value.includes(wanted),
    };
    const fold = (text, rule) => (rule.insensitive ? text.toLowerCase() : text);
    const isSelectedOn = (name, value) => (selectedValues[name] ?? []).some(rule => OPERATORS[rule.op](fold(value, rule), fold(rule.value, rule)));
    const isVisible = (element, name) => visible.has(name) || (element.localName === 'meta' && name === 'content');
    const KEPT = [
        name => structural.has(name),
        name => name.startsWith('on'),
        (name, value) => !/\p{L}/u.test(value),
        (name, value) => ariaStates.has(name) && /^[a-z]+(?: [a-z]+)*$/u.test(value.trim()),
        isSelectedOn,
    ];
    const attributeKind = (element, attribute) => {
        const name = attribute.name.toLowerCase();
        if (isVisible(element, name)) return 'visible';
        return KEPT.some(keep => keep(name, attribute.value)) ? null : 'hidden';
    };
    const slots = [];
    const visitElement = element => {
        for (const attribute of element.attributes) {
            const kind = attributeKind(element, attribute);
            if (kind) slots.push({ element, name: attribute.name, kind });
        }
    };
    const visitText = node => {
        if (!SKIPPED.has(node.parentNode?.nodeName)) slots.push({ node, kind: 'text' });
    };
    walk(document, node => (node.nodeType === Node.TEXT_NODE ? visitText : visitElement)(node));
    window.__yomuTextSlots = slots;
    return slots.map(slot => ({ text: slot.node ? slot.node.nodeValue : slot.element.getAttribute(slot.name), kind: slot.kind }));
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
