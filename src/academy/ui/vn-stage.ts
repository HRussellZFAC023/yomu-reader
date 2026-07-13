import { createAcademySprite, setAcademySpriteExpression, type AcademySpriteExpression, type AcademySpriteOptions } from './sprite';

export type AcademyVnPosition = 'left' | 'center' | 'right';
export type AcademyVnTransition = 'cut' | 'dissolve' | 'travel-left' | 'travel-right';

export interface AcademyVnPlate {
    readonly id: string;
    readonly wide: string;
    readonly mobile?: string;
    readonly label?: string;
}
export interface AcademyVnDirection {
    readonly plate: AcademyVnPlate;
    readonly transition?: AcademyVnTransition;
    readonly focus?: { readonly x: number; readonly y: number };
}
export interface AcademyVnCastMember {
    readonly characterId: string;
    readonly displayName: string;
    readonly alt: string;
    readonly position: AcademyVnPosition;
    readonly expression: AcademySpriteExpression;
    readonly expressions: AcademySpriteOptions['expressions'];
}
export interface AcademyVnReadingControl {
    readonly visible?: boolean;
    readonly showLabel: string;
    readonly hideLabel: string;
    readonly onChange?: (visible: boolean) => void;
}
export interface AcademyVnLine {
    readonly id: string;
    readonly speakerId?: string;
    readonly speakerName?: string;
    readonly japanese: string;
    readonly reading: AcademyVnReadingControl;
    readonly translation?: string;
    readonly translationEarned?: boolean;
}
export interface AcademyVnSlotContent {
    readonly element: HTMLElement;
    readonly dispose?: () => void;
}
export interface AcademyVnStageOptions {
    readonly label?: string;
}
export interface AcademyVnStage {
    readonly element: HTMLElement;
    setDirection(direction: AcademyVnDirection): void;
    setCast(cast: readonly AcademyVnCastMember[]): void;
    setLine(line: AcademyVnLine | null): void;
    setObject(content: AcademyVnSlotContent | null): void;
    setAction(content: AcademyVnSlotContent | null): void;
    dispose(): void;
}
interface MountedSlot { readonly content: AcademyVnSlotContent }

/** Presentation host. Narrative data never manipulates stage DOM. */
export function createAcademyVnStage(options: AcademyVnStageOptions = {}): AcademyVnStage {
    const lifecycle = new AbortController();
    const root = node('section', 'academy-vn-stage');
    root.dataset.vnStage = '';
    if (options.label) root.setAttribute('aria-label', options.label);

    const plate = document.createElement('picture');
    plate.className = 'academy-vn-plate';
    plate.dataset.parallaxLayer = 'plate';
    plate.setAttribute('aria-hidden', 'true');
    const mobilePlate = document.createElement('source');
    mobilePlate.media = '(max-width: 700px)';
    const plateImage = document.createElement('img');
    plateImage.alt = '';
    plateImage.decoding = 'async';
    plate.append(mobilePlate, plateImage);

    const atmosphere = node('div', 'academy-vn-atmosphere');
    atmosphere.dataset.parallaxLayer = 'atmosphere';
    atmosphere.setAttribute('aria-hidden', 'true');
    const castLayer = node('div', 'academy-vn-cast');
    const objectSlot = node('div', 'academy-vn-object-slot');
    objectSlot.dataset.empty = 'true';
    const dialogue = node('section', 'academy-vn-dialogue');
    dialogue.hidden = true;
    dialogue.dataset.tail = 'center';
    const speakerTab = node('p', 'academy-vn-speaker');
    const lineBody = node('div', 'academy-vn-line-body');
    const japanese = node('p', 'academy-vn-japanese academy-japanese');
    japanese.lang = 'ja';
    japanese.dataset.vnAnnotationRoot = '';
    const lineTools = node('div', 'academy-vn-line-tools');
    const readingToggle = document.createElement('button');
    readingToggle.type = 'button';
    readingToggle.className = 'academy-vn-reading-toggle';
    const translation = node('p', 'academy-vn-translation');
    const actionSlot = node('div', 'academy-vn-action-slot');
    actionSlot.dataset.empty = 'true';
    lineTools.append(readingToggle);
    lineBody.append(japanese, lineTools);
    dialogue.append(speakerTab, lineBody, actionSlot);
    root.append(plate, atmosphere, castLayer, objectSlot, dialogue);

    const sprites = new Map<string, HTMLDivElement>();
    let currentLine: AcademyVnLine | null = null;
    let objectMount: MountedSlot | null = null;
    let actionMount: MountedSlot | null = null;
    let disposed = false;

    const applyReadingState = (visible: boolean, notify: boolean): void => {
        if (!currentLine) return;
        readingToggle.dataset.visible = String(visible);
        readingToggle.setAttribute('aria-pressed', String(visible));
        readingToggle.textContent = visible
            ? currentLine.reading.hideLabel
            : currentLine.reading.showLabel;
        // Restoring text removes Reader ruby/pitch DOM; switching on wakes it.
        japanese.textContent = currentLine.japanese;
        if (visible) {
            delete japanese.dataset.jpdbReaderSurfaceIgnore;
            japanese.dataset.yomuRuntimeSurface = 'academy-dialogue';
            japanese.dataset.yomuFuriganaMode = 'all';
        } else {
            japanese.dataset.jpdbReaderSurfaceIgnore = '';
            delete japanese.dataset.yomuRuntimeSurface;
            delete japanese.dataset.yomuFuriganaMode;
        }
        root.dataset.readingSupport = visible ? 'shown' : 'hidden';
        if (notify) currentLine.reading.onChange?.(visible);
        japanese.dispatchEvent(new CustomEvent('academy:annotation-change', {
            bubbles: true,
            detail: { visible },
        }));
    };

    readingToggle.addEventListener('click', () => {
        applyReadingState(readingToggle.dataset.visible !== 'true', true);
    }, { signal: lifecycle.signal });

    root.addEventListener('pointermove', event => {
        const bounds = root.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        const x = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2));
        const y = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2));
        root.style.setProperty('--academy-vn-parallax-x', x.toFixed(3));
        root.style.setProperty('--academy-vn-parallax-y', y.toFixed(3));
    }, { signal: lifecycle.signal });
    root.addEventListener('pointerleave', () => {
        root.style.setProperty('--academy-vn-parallax-x', '0');
        root.style.setProperty('--academy-vn-parallax-y', '0');
    }, { signal: lifecycle.signal });
    root.addEventListener('academy:dispose', () => dispose(), { once: true, signal: lifecycle.signal });

    const setDirection = (direction: AcademyVnDirection): void => {
        assertActive(disposed);
        root.dataset.plate = direction.plate.id;
        delete root.dataset.transition;
        // Restart consecutive directions that use the same movement grammar.
        void root.offsetWidth;
        root.dataset.transition = direction.transition ?? 'dissolve';
        const label = direction.plate.label ?? options.label;
        if (label) root.setAttribute('aria-label', label);
        else root.removeAttribute('aria-label');
        plateImage.src = direction.plate.wide;
        if (direction.plate.mobile) mobilePlate.srcset = direction.plate.mobile;
        else mobilePlate.removeAttribute('srcset');
        root.style.setProperty('--academy-vn-focus-x', `${clampPercent(direction.focus?.x ?? 50)}%`);
        root.style.setProperty('--academy-vn-focus-y', `${clampPercent(direction.focus?.y ?? 50)}%`);
    };

    const setCast = (cast: readonly AcademyVnCastMember[]): void => {
        assertActive(disposed);
        const visibleIds = new Set(cast.map(member => member.characterId));
        for (const [characterId, slot] of sprites) {
            if (visibleIds.has(characterId)) continue;
            slot.remove();
            sprites.delete(characterId);
        }
        for (const member of cast) {
            let slot = sprites.get(member.characterId);
            if (!slot) {
                slot = node('div', 'academy-vn-sprite-slot');
                slot.dataset.character = member.characterId;
                slot.dataset.presence = 'entering';
                const picture = createAcademySprite({
                    characterId: member.characterId,
                    alt: member.alt,
                    className: 'academy-vn-sprite',
                    expressions: member.expressions,
                    initialExpression: member.expression,
                });
                slot.append(picture);
                castLayer.append(slot);
                sprites.set(member.characterId, slot);
            }
            slot.dataset.position = member.position;
            slot.dataset.displayName = member.displayName;
            const picture = slot.querySelector<HTMLPictureElement>('.academy-sprite');
            if (picture) {
                const image = picture.querySelector<HTMLImageElement>('img');
                if (image) image.alt = member.alt;
                setAcademySpriteExpression(picture, member.expression);
            }
        }
        syncSpeaker();
    };

    const setLine = (line: AcademyVnLine | null): void => {
        assertActive(disposed);
        currentLine = line;
        dialogue.hidden = !line;
        if (!line) {
            delete dialogue.dataset.line;
            speakerTab.replaceChildren();
            japanese.replaceChildren();
            translation.remove();
            syncSpeaker();
            return;
        }
        dialogue.dataset.line = line.id;
        speakerTab.textContent = line.speakerName ?? '';
        speakerTab.hidden = !line.speakerName;
        japanese.textContent = line.japanese;
        applyReadingState(line.reading.visible ?? false, false);
        if (line.translation && line.translationEarned) {
            translation.textContent = line.translation;
            translation.lang = 'en';
            lineBody.append(translation);
        } else {
            translation.remove();
            translation.replaceChildren();
        }
        syncSpeaker();
    };

    const syncSpeaker = (): void => {
        let position: AcademyVnPosition = 'center';
        for (const [characterId, slot] of sprites) {
            const speaking = characterId === currentLine?.speakerId;
            slot.dataset.speaking = String(speaking);
            if (speaking) position = slot.dataset.position as AcademyVnPosition;
        }
        dialogue.dataset.tail = position;
        if (currentLine?.speakerId) dialogue.dataset.speaker = currentLine.speakerId;
        else delete dialogue.dataset.speaker;
    };

    const setObject = (content: AcademyVnSlotContent | null): void => {
        assertActive(disposed);
        objectMount = replaceSlot(objectSlot, objectMount, content);
    };
    const setAction = (content: AcademyVnSlotContent | null): void => {
        assertActive(disposed);
        actionMount = replaceSlot(actionSlot, actionMount, content);
    };

    const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        lifecycle.abort();
        const disposers = [objectMount?.content.dispose, actionMount?.content.dispose];
        objectMount = null;
        actionMount = null;
        sprites.clear();
        root.remove();
        let failure: unknown;
        for (const release of disposers) {
            try {
                release?.();
            } catch (error) {
                failure ??= error;
            }
        }
        if (failure) throw failure;
    };

    return { element: root, setDirection, setCast, setLine, setObject, setAction, dispose };
}

function replaceSlot(
    host: HTMLElement,
    mounted: MountedSlot | null,
    next: AcademyVnSlotContent | null,
): MountedSlot | null {
    mounted?.content.dispose?.();
    host.replaceChildren();
    host.dataset.empty = String(!next);
    if (!next) return null;
    host.append(next.element);
    return { content: next };
}
function assertActive(disposed: boolean): void {
    if (disposed) throw new Error('Academy VN stage has been disposed.');
}
function clampPercent(value: number): number {
    return Math.max(0, Math.min(100, value));
}
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    element.className = className;
    return element;
}
