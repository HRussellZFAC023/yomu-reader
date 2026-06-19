import { uiText } from '../app/i18n';
import type { InterfaceLanguage } from '../app/types';

export function updateSourceRowEditor(action: string, control?: HTMLElement | null): void {
    const row = control?.closest<HTMLElement>('[data-source-row]');
    const container = row?.closest<HTMLElement>('[data-source-editor]');
    if (!container || !row) return;
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-source-row]'));
    const index = rows.indexOf(row);
    const targetIndex = action === 'dictionary-source-up' ? index - 1 : index + 1;
    moveSourceRow(container, index, targetIndex);
}

export function installSourceRowDrag(root: HTMLElement): void {
    let drag: SourceRowDragState | null = null;
    const dragDocument = root.ownerDocument;

    root.addEventListener('pointerdown', event => {
        if (drag) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-source-drag-handle]');
        if (!handle || !root.contains(handle)) return;
        const row = handle.closest<HTMLElement>('[data-source-row]');
        const container = row?.closest<HTMLElement>('[data-source-editor]');
        if (!row || !container) return;
        event.preventDefault();
        setSourceRowPointerCapture(handle, event.pointerId);
        drag = { active: false, container, handle, pointerId: event.pointerId, row, startY: event.clientY };
        row.classList.add('jpdb-reader-order-row-drag-pending');
        dragDocument.addEventListener('pointermove', moveDrag);
        dragDocument.addEventListener('pointerup', finishDrag);
        dragDocument.addEventListener('pointercancel', finishDrag);
    });

    const moveDrag = (event: PointerEvent): void => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        if (!drag.active && Math.abs(event.clientY - drag.startY) < 4) return;
        event.preventDefault();
        drag.active = true;
        drag.row.classList.add('jpdb-reader-order-row-dragging');
        moveSourceRowToPointer(drag.container, drag.row, event.clientY);
    };

    const finishDrag = (event: PointerEvent): void => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        releaseSourceRowPointerCapture(drag.handle, event.pointerId);
        drag.row.classList.remove('jpdb-reader-order-row-drag-pending', 'jpdb-reader-order-row-dragging');
        syncSourceRowOrder(drag.container);
        drag = null;
        dragDocument.removeEventListener('pointermove', moveDrag);
        dragDocument.removeEventListener('pointerup', finishDrag);
        dragDocument.removeEventListener('pointercancel', finishDrag);
    };
    root.addEventListener('pointermove', moveDrag);
    root.addEventListener('pointerup', finishDrag);
    root.addEventListener('pointercancel', finishDrag);
}

export function moveSourceRow(container: HTMLElement, index: number, targetIndex: number): void {
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-source-row]'));
    if (!canMoveSourceRow(index, targetIndex, rows.length)) return;
    const row = rows[index];
    const target = rows[targetIndex];
    if (targetIndex < index) container.insertBefore(row, target);
    else container.insertBefore(row, target.nextSibling);
    syncSourceRowOrder(container);
}

interface SourceRowDragState {
    active: boolean;
    container: HTMLElement;
    handle: HTMLElement;
    pointerId: number;
    row: HTMLElement;
    startY: number;
}

function setSourceRowPointerCapture(handle: HTMLElement, pointerId: number): void {
    try {
        handle.setPointerCapture?.(pointerId);
    } catch {
        // Some iPad/Safari contexts expose pointer events without reliable capture.
    }
}

function releaseSourceRowPointerCapture(handle: HTMLElement, pointerId: number): void {
    try {
        handle.releasePointerCapture?.(pointerId);
    } catch {
        // Matching the guarded capture path above keeps drag cleanup best-effort.
    }
}

function moveSourceRowToPointer(container: HTMLElement, row: HTMLElement, clientY: number): void {
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-source-row]'))
        .filter(candidate => candidate !== row);
    const target = rows.find(candidate => {
        const rect = candidate.getBoundingClientRect();
        return clientY < rect.top + rect.height / 2;
    });
    if (target) container.insertBefore(row, target);
    else container.appendChild(row);
    syncSourceRowOrder(container);
}

function canMoveSourceRow(index: number, targetIndex: number, rowCount: number): boolean {
    return index >= 0
        && targetIndex >= 0
        && index < rowCount
        && targetIndex < rowCount
        && index !== targetIndex;
}

export function syncSourceRowOrder(container: HTMLElement): void {
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-source-row]'));
    rows.forEach((row, index) => {
        const priority = row.querySelector<HTMLInputElement>('input[name$=".priority"]');
        if (priority) priority.value = String(index);
        const indexLabel = row.querySelector('.jpdb-reader-order-toggle span');
        if (indexLabel) indexLabel.textContent = String(index + 1);
    });
    if (container.matches('[data-audio-source-editor]')) syncAudioSourceIndexes(container, rows);
    if (container.classList.contains('jpdb-reader-lookup-links')) syncDictionaryLookupLinkIndexes(container, rows);
}

function syncAudioSourceIndexes(container: HTMLElement, rows = Array.from(container.querySelectorAll<HTMLElement>('[data-audio-source-row]'))): void {
    const language = settingsLanguageForElement(container);
    rows.forEach((row, index) => {
        row.dataset.sourceId = `audio-${index}`;
        row.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[name^="audioSources."]').forEach(control => {
            control.name = control.name.replace(/^audioSources\.\d+\./, `audioSources.${index}.`);
            if (control instanceof HTMLSelectElement && control.name.endsWith('.type')) {
                control.setAttribute('aria-label', uiText(language, 'audioSourceNumber').replace('{number}', String(index + 1)));
            }
            if (control instanceof HTMLInputElement && control.name.endsWith('.enabled')) {
                control.setAttribute('aria-label', uiText(language, 'enableAudioSourceNumber').replace('{number}', String(index + 1)));
            }
            if (control instanceof HTMLSelectElement && control.name.endsWith('.voice')) {
                control.setAttribute('aria-label', uiText(language, 'textToSpeechVoiceNumber').replace('{number}', String(index + 1)));
            }
        });
    });
}

function syncDictionaryLookupLinkIndexes(container: HTMLElement, rows = Array.from(container.querySelectorAll<HTMLElement>('[data-lookup-link-row]'))): void {
    const language = settingsLanguageForElement(container);
    rows.forEach((row, index) => {
        row.dataset.index = String(index);
        row.dataset.sourceId = `lookup-link-${index}`;
        row.querySelectorAll<HTMLInputElement>('[name^="dictionaryLookupLinks."]').forEach(control => {
            control.name = control.name.replace(/^dictionaryLookupLinks\.\d+\./, `dictionaryLookupLinks.${index}.`);
            if (control.name.endsWith('.label')) control.setAttribute('aria-label', uiText(language, 'lookupPillLabelNumber').replace('{number}', String(index + 1)));
            if (control.name.endsWith('.urlTemplate')) control.setAttribute('aria-label', uiText(language, 'lookupUrlTemplateNumber').replace('{number}', String(index + 1)));
        });
    });
}

function settingsLanguageForElement(element: HTMLElement): InterfaceLanguage {
    const control = element.closest<HTMLFormElement>('form')?.elements.namedItem('interfaceLanguage');
    const value = control instanceof HTMLSelectElement ? control.value : 'en';
    return value === 'auto' || value === 'en' || value === 'ja' ? value : 'en';
}
