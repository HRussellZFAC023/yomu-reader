import type { AcademyCopyKey, AcademyLanguage } from '../../reader/app/academy-copy';
import { academyText } from '../../reader/app/academy-copy';
import type { AcademyPlateId } from '../assets';
import { ACADEMY_ASSETS } from '../assets';
import type { LocalizedText } from '../domain/source-library';

export interface ScreenFrameOptions {
    readonly language: AcademyLanguage;
    readonly className: string;
    readonly plate?: AcademyPlateId;
    readonly eyebrow?: AcademyCopyKey;
    readonly title: AcademyCopyKey;
    readonly body?: AcademyCopyKey;
}

export function screenFrame(options: ScreenFrameOptions): { screen: HTMLElement; panel: HTMLElement; content: HTMLElement } {
    const screen = element('section', `academy-screen ${options.className}`);
    screen.dataset.screen = options.className;
    if (options.plate) {
        screen.dataset.plate = options.plate;
        screen.prepend(academyBackgroundPicture(options.plate));
    }
    const veil = element('div', 'academy-screen-veil');
    const panel = element('div', 'academy-panel');
    const content = element('div', 'academy-panel-content');
    if (options.eyebrow) content.append(copyElement('p', 'academy-eyebrow', options.language, options.eyebrow));
    content.append(copyElement('h1', 'academy-title', options.language, options.title));
    if (options.body) content.append(copyElement('p', 'academy-lede', options.language, options.body));
    panel.append(content);
    veil.append(panel);
    screen.append(veil);
    return { screen, panel, content };
}

export function copyElement<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    language: AcademyLanguage,
    key: AcademyCopyKey,
): HTMLElementTagNameMap[K] {
    const node = element(tag, className);
    setCopy(node, language, key);
    return node;
}

export function localizedElement<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    language: AcademyLanguage,
    value: LocalizedText,
): HTMLElementTagNameMap[K] {
    const node = element(tag, className);
    node.textContent = value[language];
    node.lang = language;
    markAnnotationSurface(node, language);
    return node;
}

export function copyButton(language: AcademyLanguage, key: AcademyCopyKey, className = 'academy-button'): HTMLButtonElement {
    const button = element('button', className);
    button.type = 'button';
    setCopy(button, language, key);
    button.setAttribute('aria-label', academyText(language, key));
    return button;
}

export function setCopy(node: HTMLElement, language: AcademyLanguage, key: AcademyCopyKey): void {
    node.textContent = academyText(language, key);
    node.lang = language;
    delete node.dataset.jpdbReaderSurfaceIgnore;
    delete node.dataset.yomuRuntimeSurface;
    delete node.dataset.yomuFuriganaMode;
    markAnnotationSurface(node, language);
    if (node instanceof HTMLButtonElement) node.setAttribute('aria-label', academyText(language, key));
}

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
}

export function setBusy(button: HTMLButtonElement, busy: boolean, label: string): void {
    button.disabled = busy;
    button.setAttribute('aria-busy', String(busy));
    if (busy) {
        button.textContent = label;
        button.setAttribute('aria-label', label);
    }
}

export function fieldError(message: string): HTMLParagraphElement {
    const error = element('p', 'academy-field-error');
    error.setAttribute('role', 'alert');
    error.textContent = message;
    return error;
}

/** Shared non-VN place plate. VN scenes use the stage's parallax plate stack. */
export function academyBackgroundPicture(plateId: AcademyPlateId): HTMLPictureElement {
    const plate = ACADEMY_ASSETS.locations[plateId];
    const picture = element('picture', 'academy-background');
    picture.setAttribute('aria-hidden', 'true');
    const source = document.createElement('source');
    source.media = '(max-width: 700px)';
    source.srcset = plate.mobile;
    const image = document.createElement('img');
    image.src = plate.wide;
    image.alt = '';
    image.decoding = 'async';
    picture.append(source, image);
    return picture;
}

function markAnnotationSurface(node: HTMLElement, language: AcademyLanguage): void {
    if (language === 'ja') {
        node.dataset.yomuRuntimeSurface = 'academy-copy';
        node.dataset.yomuFuriganaMode = 'all';
        return;
    }
    node.dataset.jpdbReaderSurfaceIgnore = '';
}
