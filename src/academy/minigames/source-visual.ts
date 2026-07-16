import './source-visual.css';

import type { LocalizedText } from '../domain/source-library';

export interface InspectableSourceVisual {
    readonly title: string;
    readonly url: string;
    readonly sha256: string;
    readonly alt: LocalizedText;
    readonly page?: number;
}

/** A source page stays readable at layout size and can be inspected without leaving the activity. */
export function renderInspectableSourceVisual(
    visual: InspectableSourceVisual,
    language: 'ja' | 'en' | undefined,
    className: string,
    thumbnailLoading: 'eager' | 'lazy' = 'eager',
): HTMLElement {
    const selectedLanguage = language === 'ja' ? 'ja' : 'en';
    const label = visual.page ? `${visual.title} · p.${visual.page}` : visual.title;
    const inspectLabel = selectedLanguage === 'ja' ? `${label}を拡大表示` : `Inspect ${label}`;
    const figure = document.createElement('figure');
    figure.className = `${className} academy-source-visual`;
    figure.dataset.sourceVisual = visual.url;
    figure.dataset.sourceSha256 = visual.sha256;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'academy-source-visual-trigger';
    trigger.setAttribute('aria-label', inspectLabel);
    trigger.title = inspectLabel;
    const thumbnail = sourceImage(visual, selectedLanguage);
    thumbnail.loading = thumbnailLoading;
    trigger.append(thumbnail);

    const caption = document.createElement('figcaption');
    caption.textContent = label;

    const dialog = document.createElement('dialog');
    dialog.className = 'academy-source-visual-dialog';
    dialog.dataset.sourceInspector = visual.url;
    dialog.setAttribute('aria-label', label);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'academy-button academy-button-secondary academy-source-visual-close';
    close.textContent = selectedLanguage === 'ja' ? '元資料を閉じる' : 'Close source page';
    dialog.append(close);

    trigger.addEventListener('click', () => {
        if (!dialog.querySelector('img')) {
            const fullSize = sourceImage(visual, selectedLanguage);
            fullSize.loading = 'lazy';
            dialog.append(fullSize);
        }
        openDialog(dialog);
    });
    close.addEventListener('click', () => closeDialog(dialog));
    dialog.addEventListener('click', event => {
        if (event.target === dialog) closeDialog(dialog);
    });
    dialog.addEventListener('cancel', event => {
        event.preventDefault();
        closeDialog(dialog);
    });

    figure.append(trigger, caption, dialog);
    return figure;
}

function sourceImage(visual: InspectableSourceVisual, language: 'ja' | 'en'): HTMLImageElement {
    const image = document.createElement('img');
    image.src = visual.url;
    image.alt = visual.alt[language];
    image.dataset.sourceSha256 = visual.sha256;
    image.decoding = 'async';
    return image;
}

function openDialog(dialog: HTMLDialogElement): void {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
}

function closeDialog(dialog: HTMLDialogElement): void {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
}
