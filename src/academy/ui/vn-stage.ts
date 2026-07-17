import { resolveDirectorSfxCue, type AcademySemanticSfxCue } from '../audio/sfx-catalog';
import type { AudioDirectorControl, SfxCue } from '../audio/types';
import { createVnPerformanceEngine } from '../vn/performance-engine';
import { setAcademyReadingSurface } from '../integration/reader-markup';
import type { VnPerformanceFrame } from '../vn/performance-contract';
import { createAcademySprite, setAcademySpriteExpression, setAcademySpriteSources, type AcademySpriteExpression, type AcademySpriteOptions } from './sprite';
import { setAcademyTooltip } from './tooltip';

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
    readonly available?: boolean;
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
    readonly language?: 'en' | 'ja';
    readonly reading: AcademyVnReadingControl;
    readonly translation?: string;
    readonly translationEarned?: boolean;
    readonly emphasis?: 'jump';
    readonly sfx?: readonly AcademySemanticSfxCue[];
}
export interface AcademyVnSlotContent {
    readonly element: HTMLElement;
    readonly dispose?: () => void;
}
export interface AcademyVnStageOptions {
    readonly label?: string;
    readonly uiLanguage?: 'en' | 'ja';
    readonly backLabel?: string;
    readonly onBack?: () => void;
    /** SFX remains silent until this stage has observed a learner gesture. */
    readonly audio?: Pick<AudioDirectorControl, 'playSfx'>;
    readonly reducedMotion?: boolean;
}
export interface AcademyVnBackControl {
    readonly label?: string;
    readonly onBack: () => void;
}
export interface AcademyVnStage {
    readonly element: HTMLElement;
    setDirection(direction: AcademyVnDirection): void;
    setCast(cast: readonly AcademyVnCastMember[]): void;
    setLine(line: AcademyVnLine | null): void;
    setObject(content: AcademyVnSlotContent | null): void;
    setAction(content: AcademyVnSlotContent | null): void;
    setBack(control: AcademyVnBackControl | null): void;
    registerReadingSurface(surface: HTMLElement): () => void;
    completeTextReveal(): void;
    skipTextReveal(): void;
    dispose(): void;
}
interface MountedSlot { readonly content: AcademyVnSlotContent }
interface InertSnapshot {
    readonly inert: boolean;
    readonly ariaHidden: string | null;
}

let vnStageSequence = 0;

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
    const dialogueHeader = node('div', 'academy-vn-dialogue-header');
    const speakerTab = node('p', 'academy-vn-speaker');
    const dialogueContent = node('div', 'academy-vn-dialogue-content');
    const lineBody = node('div', 'academy-vn-line-body');
    const japanese = node('p', 'academy-vn-japanese academy-japanese');
    japanese.lang = 'ja';
    japanese.dataset.vnAnnotationRoot = '';
    const lineTools = node('div', 'academy-vn-line-tools');
    lineTools.dataset.jpdbReaderSurfaceIgnore = '';
    lineTools.setAttribute('role', 'toolbar');
    lineTools.setAttribute('aria-label', options.uiLanguage === 'ja' ? '会話サポート' : 'Dialogue support');
    const readingToggle = document.createElement('button');
    readingToggle.type = 'button';
    readingToggle.className = 'academy-vn-reading-toggle';
    readingToggle.disabled = true;
    const logButton = document.createElement('button');
    logButton.type = 'button';
    logButton.className = 'academy-vn-log-button';
    logButton.textContent = '記';
    setToolLabel(logButton, options.uiLanguage === 'ja' ? '会話ログ' : 'Dialogue log');
    logButton.setAttribute('aria-expanded', 'false');
    logButton.disabled = true;
    const translationToggle = document.createElement('button');
    translationToggle.type = 'button';
    translationToggle.className = 'academy-vn-translation-toggle';
    translationToggle.textContent = '訳';
    translationToggle.setAttribute('aria-pressed', 'false');
    translationToggle.disabled = true;
    const logPanel = node('section', 'academy-vn-log-panel');
    logPanel.id = `academy-vn-log-${++vnStageSequence}`;
    logPanel.hidden = true;
    logPanel.tabIndex = -1;
    logPanel.setAttribute('role', 'dialog');
    logPanel.setAttribute('aria-modal', 'true');
    const logTitle = node('h2', 'academy-vn-log-title');
    logTitle.id = `${logPanel.id}-title`;
    logPanel.setAttribute('aria-labelledby', logTitle.id);
    logButton.setAttribute('aria-controls', logPanel.id);
    logTitle.textContent = options.uiLanguage === 'ja' ? '会話ログ' : 'Dialogue log';
    const logEntries = node('ol', 'academy-vn-log-entries');
    const logHeader = node('header', 'academy-vn-log-header');
    logHeader.append(logTitle);
    const logPaper = node('div', 'academy-vn-log-paper');
    logPaper.append(logHeader, logEntries);
    logPanel.append(logPaper);
    const translation = node('p', 'academy-vn-translation');
    const navigation = node('div', 'academy-vn-navigation');
    let backControl: AcademyVnBackControl | null = options.onBack
        ? { label: options.backLabel, onBack: options.onBack }
        : null;
    navigation.dataset.backAvailable = String(Boolean(backControl));
    navigation.dataset.actionEmpty = 'true';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'academy-vn-back';
    const defaultBackLabel = options.uiLanguage === 'ja' ? '戻る' : 'Back';
    back.textContent = `\u2190 ${backControl?.label ?? defaultBackLabel}`;
    back.setAttribute('aria-label', backControl?.label ?? defaultBackLabel);
    back.dataset.jpdbReaderSurfaceIgnore = '';
    back.hidden = !backControl;
    const actionSlot = node('div', 'academy-vn-action-slot');
    actionSlot.dataset.empty = 'true';
    lineTools.append(logButton, readingToggle, translationToggle);
    dialogueHeader.append(speakerTab, lineTools);
    lineBody.append(japanese);
    navigation.append(back, actionSlot);
    dialogueContent.append(lineBody, navigation);
    dialogue.append(dialogueHeader, dialogueContent);
    root.append(plate, atmosphere, castLayer, objectSlot, dialogue, logPanel);

    const sprites = new Map<string, HTMLDivElement>();
    let currentCast: readonly AcademyVnCastMember[] = [];
    let currentLine: AcademyVnLine | null = null;
    let objectMount: MountedSlot | null = null;
    let actionMount: MountedSlot | null = null;
    let disposed = false;
    let beatSequence = 0;
    let hasUserInteraction = false;
    let readingVisible = false;
    let readingStateInitialized = false;
    let translationVisible = false;
    let textRevealTimer: number | undefined;
    let activeTextRevealLineId: string | undefined;
    let activeTextRevealToken = 0;
    const readingSurfaces = new Map<HTMLElement, string>();
    const history: AcademyVnLine[] = [];
    const inertSnapshots = new Map<HTMLElement, InertSnapshot>();
    let logReturnFocus: HTMLElement | null = null;
    const reducedMotion = options.reducedMotion ?? prefersReducedMotion();
    if (reducedMotion) root.dataset.reducedMotion = '';
    const performance = createVnPerformanceEngine<AcademySpriteExpression, AcademyVnPosition>({
        reducedMotion,
        onSfx: cue => options.audio?.playSfx(cue),
        onTextReveal: event => {
            if (event.type === 'start' && event.animated) {
                startTextReveal(event.lineId);
                translation.dataset.waitingForLine = '';
                return;
            }
            if (event.type === 'end') {
                finishTextReveal(event.lineId);
                delete translation.dataset.waitingForLine;
            }
        },
    });
    const renderHistory = (): void => {
        logEntries.replaceChildren(...history.map(line => historyEntry(line, readingVisible, translationVisible)));
    };
    const syncToolAvailability = (): void => {
        logButton.disabled = history.length === 0;
        const transcriptMode = !logPanel.hidden;
        readingToggle.disabled = transcriptMode
            ? !history.some(line => line.reading.available !== false)
            : !currentLine || currentLine.reading.available === false;
        translationToggle.disabled = transcriptMode
            ? !history.some(line => Boolean(line.translation && line.translationEarned))
            : !currentLine?.translation || !currentLine.translationEarned;
    };

    const markUserInteraction = (): void => { hasUserInteraction = true; };
    root.addEventListener('pointerdown', markUserInteraction, { capture: true, signal: lifecycle.signal });
    root.addEventListener('keydown', markUserInteraction, { capture: true, signal: lifecycle.signal });
    back.addEventListener('click', () => backControl?.onBack(), { signal: lifecycle.signal });
    japanese.addEventListener('click', () => skipTextReveal(), { signal: lifecycle.signal });

    const closeLog = (): void => {
        if (logPanel.hidden) return;
        dialogueHeader.append(lineTools);
        delete root.dataset.logOpen;
        setSceneInert(root, logPanel, false, inertSnapshots);
        logPanel.hidden = true;
        syncToolAvailability();
        logButton.textContent = '記';
        logButton.setAttribute('aria-expanded', 'false');
        setToolLabel(logButton, options.uiLanguage === 'ja' ? '会話ログ' : 'Dialogue log');
        (logReturnFocus?.isConnected ? logReturnFocus : logButton).focus();
        logReturnFocus = null;
    };
    const openLog = (): void => {
        renderHistory();
        // This is the only modal trigger, so closing always returns learners to it.
        logReturnFocus = logButton;
        logPanel.hidden = false;
        logHeader.append(lineTools);
        syncToolAvailability();
        root.dataset.logOpen = 'true';
        setSceneInert(root, logPanel, true, inertSnapshots);
        logButton.textContent = '\u00d7';
        logButton.setAttribute('aria-expanded', 'true');
        setToolLabel(logButton, options.uiLanguage === 'ja' ? '会話ログを閉じる' : 'Close dialogue log');
        logButton.focus();
    };
    logButton.addEventListener('click', () => {
        if (logPanel.hidden) openLog();
        else closeLog();
    }, { signal: lifecycle.signal });
    logPanel.addEventListener('click', event => {
        if (event.target === logPanel) closeLog();
    }, { signal: lifecycle.signal });
    logPanel.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeLog();
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = [...logPanel.querySelectorAll<HTMLElement>(
            'button:not([disabled]):not([hidden]), [href]:not([hidden]), [tabindex]:not([tabindex="-1"]):not([hidden])',
        )];
        if (!focusable.length) return;
        const first = focusable[0]!;
        const last = focusable.at(-1)!;
        if (document.activeElement === logPanel) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }, { signal: lifecycle.signal });

    const applyReadingState = (visible: boolean, notify: boolean): void => {
        if (!currentLine) return;
        readingVisible = visible;
        readingToggle.dataset.visible = String(visible);
        readingToggle.setAttribute('aria-pressed', String(visible));
        readingToggle.textContent = '読';
        setToolLabel(readingToggle, visible ? currentLine.reading.hideLabel : currentLine.reading.showLabel);
        // Restoring text removes Reader ruby/pitch DOM; switching on wakes it.
        const lineReadingVisible = visible && currentLine.reading.available !== false;
        setAcademyReadingSurface(japanese, lineReadingVisible, currentLine.japanese, 'academy-dialogue');
        root.dataset.readingSupport = visible ? 'shown' : 'hidden';
        for (const [surface, source] of readingSurfaces) {
            applyReadingSurface(surface, source, visible);
        }
        renderHistory();
        if (notify) currentLine.reading.onChange?.(visible);
    };

    function clearTextRevealTimer(): void {
        if (textRevealTimer !== undefined) window.clearTimeout(textRevealTimer);
        textRevealTimer = undefined;
        activeTextRevealToken += 1;
    }

    function startTextReveal(lineId: string): void {
        clearTextRevealTimer();
        if (!currentLine || currentLine.id !== lineId) return;
        const characters = [...currentLine.japanese];
        if (characters.length <= 1) {
            performance.completeTextReveal(lineId);
            return;
        }
        activeTextRevealLineId = lineId;
        const token = activeTextRevealToken;
        let visibleCharacters = 1;
        japanese.dataset.performanceText = 'revealing';
        japanese.textContent = characters[0] ?? '';
        const baseDelayMs = Math.max(38, Math.round(textRevealDuration(currentLine.japanese) / characters.length));
        const revealNext = (): void => {
            if (typeof window === 'undefined') {
                textRevealTimer = undefined;
                return;
            }
            if (
                disposed
                || token !== activeTextRevealToken
                || activeTextRevealLineId !== lineId
                || currentLine?.id !== lineId
            ) return;
            visibleCharacters += 1;
            japanese.textContent = characters.slice(0, visibleCharacters).join('');
            if (visibleCharacters >= characters.length) {
                textRevealTimer = undefined;
                performance.completeTextReveal(lineId);
                return;
            }
            textRevealTimer = window.setTimeout(
                revealNext,
                textRevealCharacterDelay(characters[visibleCharacters - 1] ?? '', baseDelayMs),
            );
        };
        textRevealTimer = window.setTimeout(
            revealNext,
            120 + textRevealCharacterDelay(characters[0] ?? '', baseDelayMs),
        );
    }

    function finishTextReveal(lineId: string): void {
        if (activeTextRevealLineId === lineId) {
            clearTextRevealTimer();
            activeTextRevealLineId = undefined;
        }
        if (!currentLine || currentLine.id !== lineId) return;
        delete japanese.dataset.performanceText;
        applyReadingState(readingVisible, false);
    }

    readingToggle.addEventListener('click', () => {
        completeTextReveal();
        applyReadingState(readingToggle.dataset.visible !== 'true', true);
    }, { signal: lifecycle.signal });

    const applyTranslationState = (visible: boolean): void => {
        translationVisible = visible;
        translationToggle.setAttribute('aria-pressed', String(translationVisible));
        const label = options.uiLanguage === 'ja'
            ? (translationVisible ? '訳を隠す' : '訳を見る')
            : (translationVisible ? 'Hide translation' : 'Show translation');
        setToolLabel(translationToggle, label);
        translation.hidden = !translationVisible || !currentLine?.translation || !currentLine.translationEarned;
        root.dataset.translationSupport = translationVisible ? 'shown' : 'hidden';
        root.querySelectorAll<HTMLElement>(
            '.academy-support, [data-support-kind="translation"], [data-translation]',
        ).forEach(surface => {
            if (surface !== translation) surface.hidden = !translationVisible;
        });
        renderHistory();
    };
    translationToggle.addEventListener('click', () => {
        applyTranslationState(!translationVisible);
    }, { signal: lifecycle.signal });

    const registerReadingSurface = (surface: HTMLElement): (() => void) => {
        assertActive(disposed);
        const source = surface.textContent ?? '';
        readingSurfaces.set(surface, source);
        applyReadingSurface(surface, source, readingVisible);
        return () => { readingSurfaces.delete(surface); };
    };

    if (!reducedMotion) {
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
    }
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
        currentCast = [...cast];
        root.dataset.castSize = String(cast.length);
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
                slot.dataset.vnPerformer = '';
                slot.dataset.position = member.position;
                slot.addEventListener('animationend', event => {
                    if (event.target !== slot) return;
                    delete slot.dataset.performanceMotion;
                    delete slot.dataset.performanceMotionToken;
                }, { signal: lifecycle.signal });
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
            slot.dataset.displayName = member.displayName;
            const picture = slot.querySelector<HTMLPictureElement>('.academy-sprite');
            if (picture) {
                setAcademySpriteSources(picture, member.expressions);
                const image = picture.querySelector<HTMLImageElement>('img');
                if (image) image.alt = member.alt;
            }
        }
        performBeat();
    };

    const setLine = (line: AcademyVnLine | null): void => {
        assertActive(disposed);
        const changesLine = currentLine?.id !== line?.id;
        const advancesLine = Boolean(currentLine && line && changesLine);
        currentLine = line;
        dialogue.hidden = !line;
        if (!line) {
            delete dialogue.dataset.line;
            speakerTab.replaceChildren();
            japanese.replaceChildren();
            translation.remove();
            performBeat();
            return;
        }
        dialogue.dataset.line = line.id;
        if (changesLine) history.push(line);
        else if (history.length) history[history.length - 1] = line;
        if (!logPanel.hidden) renderHistory();
        syncToolAvailability();
        speakerTab.textContent = line.speakerName ?? '';
        speakerTab.hidden = !line.speakerName;
        japanese.lang = line.language ?? 'ja';
        japanese.textContent = line.japanese;
        const nextReadingState = readingStateInitialized ? readingVisible : (line.reading.visible ?? false);
        readingStateInitialized = true;
        applyReadingState(nextReadingState, false);
        if (line.translation && line.translationEarned) {
            translation.textContent = line.translation;
            translation.lang = 'en';
            lineBody.append(translation);
        } else {
            translation.remove();
            translation.replaceChildren();
        }
        applyTranslationState(translationVisible);
        performBeat(changesLine
            ? [...(advancesLine ? ['vn.advance' as const] : []), ...(line.sfx ?? [])]
            : []);
    };

    const performBeat = (automaticSfx: readonly AcademySemanticSfxCue[] = []): void => {
        const visibleSpeaker = currentLine?.speakerId && sprites.has(currentLine.speakerId)
            ? currentLine.speakerId
            : undefined;
        const semanticSfx = hasUserInteraction ? automaticSfx : [];
        const sfx = semanticSfx
            .map(resolveDirectorSfxCue)
            .filter((cue): cue is SfxCue => cue !== null);
        const frame = performance.perform({
            id: `academy-stage:${++beatSequence}`,
            performers: currentCast.map(member => ({
                id: member.characterId,
                pose: { expression: member.expression, angle: member.position },
            })),
            ...(visibleSpeaker ? { speakerId: visibleSpeaker } : {}),
            ...(visibleSpeaker && currentLine?.emphasis === 'jump'
                ? { emphasis: { kind: 'jump' as const, performerId: visibleSpeaker } }
                : {}),
            ...(currentLine ? { text: { lineId: currentLine.id } } : {}),
            ...(sfx.length ? { sfx } : {}),
        });
        applyPerformanceFrame(frame);
        syncSpeaker();
    };

    const applyPerformanceFrame = (frame: VnPerformanceFrame<AcademySpriteExpression, AcademyVnPosition>): void => {
        for (const performer of frame.performers) {
            const slot = sprites.get(performer.id);
            if (!slot) continue;
            slot.dataset.performancePresence = performer.presence;
            slot.dataset.performanceColor = performer.color;
            slot.style.setProperty('--academy-vn-performance-lift', `${performer.liftPx}px`);
            const picture = slot.querySelector<HTMLPictureElement>('.academy-sprite');
            if (performer.poseTransition) {
                clearPortraitSwap(slot);
                delete slot.dataset.poseTransition;
                delete slot.dataset.poseTransitionStyle;
                delete slot.dataset.poseTransitionToken;
                slot.style.removeProperty('--academy-vn-pose-duration');
                void slot.offsetWidth;
                slot.dataset.poseTransition = performer.poseTransition.kind;
                slot.dataset.poseTransitionStyle = performer.poseTransition.style;
                slot.dataset.poseTransitionToken = String(performer.poseTransition.token);
                slot.style.setProperty('--academy-vn-pose-duration', `${performer.poseTransition.durationMs}ms`);
                schedulePoseTransitionCleanup(
                    slot,
                    performer.poseTransition.token,
                    performer.poseTransition.durationMs,
                    lifecycle.signal,
                );
                if (picture && performer.poseTransition.kind !== 'angle') {
                    mountOutgoingPortrait(slot, picture, performer.poseTransition.token, lifecycle.signal);
                }
                if (performer.poseTransition.kind !== 'expression') {
                    watchAngleTransition(slot, performer.poseTransition.token, lifecycle.signal);
                }
            }
            slot.dataset.position = performer.pose.angle;
            if (picture) setAcademySpriteExpression(picture, performer.pose.expression);
            if (performer.motion) {
                delete slot.dataset.performanceMotion;
                void slot.offsetWidth;
                slot.dataset.performanceMotion = performer.motion.kind;
                slot.dataset.performanceMotionToken = String(performer.motion.token);
                slot.style.setProperty('--academy-vn-performance-delay', `${performer.motion.delayMs}ms`);
                slot.style.setProperty('--academy-vn-performance-duration', `${performer.motion.durationMs}ms`);
            }
        }
        if (frame.textReveal) japanese.dataset.performanceTextToken = String(frame.textReveal.token);
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
        applyTranslationState(translationVisible);
    };
    const setAction = (content: AcademyVnSlotContent | null): void => {
        assertActive(disposed);
        actionMount = replaceSlot(actionSlot, actionMount, content);
        navigation.dataset.actionEmpty = String(!content);
    };
    const setBack = (control: AcademyVnBackControl | null): void => {
        assertActive(disposed);
        backControl = control;
        const label = control?.label ?? defaultBackLabel;
        navigation.dataset.backAvailable = String(Boolean(control));
        back.hidden = !control;
        back.textContent = `\u2190 ${label}`;
        back.setAttribute('aria-label', label);
    };
    const completeTextReveal = (): void => {
        if (!currentLine) return;
        performance.completeTextReveal(currentLine.id);
    };
    const skipTextReveal = (): void => {
        if (!currentLine) return;
        performance.skipTextReveal(currentLine.id);
    };

    const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        clearTextRevealTimer();
        activeTextRevealLineId = undefined;
        lifecycle.abort();
        const disposers = [objectMount?.content.dispose, actionMount?.content.dispose];
        objectMount = null;
        actionMount = null;
        sprites.clear();
        readingSurfaces.clear();
        performance.dispose();
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

    return {
        element: root,
        setDirection,
        setCast,
        setLine,
        setObject,
        setAction,
        setBack,
        registerReadingSurface,
        completeTextReveal,
        skipTextReveal,
        dispose,
    };
}

function mountOutgoingPortrait(
    slot: HTMLElement,
    picture: HTMLPictureElement,
    token: number,
    signal: AbortSignal,
): void {
    const outgoing = picture.cloneNode(true) as HTMLPictureElement;
    outgoing.className = 'academy-vn-portrait-outgoing';
    outgoing.removeAttribute('data-expression-transition');
    outgoing.setAttribute('aria-hidden', 'true');
    const image = outgoing.querySelector('img');
    if (image) image.alt = '';
    outgoing.addEventListener('animationend', () => clearPoseTransition(slot, token), { once: true, signal });
    slot.append(outgoing);
}

function watchAngleTransition(slot: HTMLElement, token: number, signal: AbortSignal): void {
    const onTransitionEnd = (event: TransitionEvent): void => {
        if (event.target !== slot || event.propertyName !== 'translate') return;
        slot.removeEventListener('transitionend', onTransitionEnd);
        clearPoseTransition(slot, token);
    };
    slot.addEventListener('transitionend', onTransitionEnd, { signal });
}

function clearPortraitSwap(slot: HTMLElement): void {
    slot.querySelector('.academy-vn-portrait-outgoing')?.remove();
}

function schedulePoseTransitionCleanup(
    slot: HTMLElement,
    token: number,
    durationMs: number,
    signal: AbortSignal,
): void {
    const onAbort = (): void => window.clearTimeout(timeout);
    const timeout = window.setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        clearPoseTransition(slot, token);
    }, durationMs + 50);
    signal.addEventListener('abort', onAbort, { once: true });
}

function clearPoseTransition(slot: HTMLElement, token: number): void {
    if (slot.dataset.poseTransitionToken !== String(token)) return;
    clearPortraitSwap(slot);
    delete slot.dataset.poseTransition;
    delete slot.dataset.poseTransitionStyle;
    delete slot.dataset.poseTransitionToken;
    slot.style.removeProperty('--academy-vn-pose-duration');
}

function applyReadingSurface(surface: HTMLElement, source: string, visible: boolean): void {
    setAcademyReadingSurface(surface, visible, source);
}

function setSceneInert(
    root: HTMLElement,
    modal: HTMLElement,
    inert: boolean,
    snapshots: Map<HTMLElement, InertSnapshot>,
): void {
    for (const child of root.children) {
        if (!(child instanceof HTMLElement) || child === modal) continue;
        if (inert) {
            snapshots.set(child, {
                inert: child.inert,
                ariaHidden: child.getAttribute('aria-hidden'),
            });
            child.inert = true;
            child.setAttribute('aria-hidden', 'true');
            continue;
        }
        const snapshot = snapshots.get(child);
        child.inert = snapshot?.inert ?? false;
        if (snapshot?.ariaHidden === null || snapshot === undefined) child.removeAttribute('aria-hidden');
        else child.setAttribute('aria-hidden', snapshot.ariaHidden);
    }
    if (!inert) snapshots.clear();
}

function textRevealDuration(text: string): number {
    return Math.max(280, Math.min(1600, [...text].length * 42));
}

function textRevealCharacterDelay(character: string, baseDelayMs: number): number {
    if (/[。！？!?]/u.test(character)) return baseDelayMs + 360;
    if (/[、，,：:；;]/u.test(character)) return baseDelayMs + 125;
    if (/[\n\r]/u.test(character)) return baseDelayMs + 190;
    if (/[…―—]/u.test(character)) return baseDelayMs + 150;
    if (/\s/u.test(character)) return Math.max(22, baseDelayMs - 8);
    return baseDelayMs;
}

function prefersReducedMotion(): boolean {
    return typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function historyEntry(
    line: AcademyVnLine,
    readingVisible: boolean,
    translationVisible: boolean,
): HTMLLIElement {
    const item = node('li', 'academy-vn-log-entry');
    if (line.speakerName) {
        const speaker = node('strong', 'academy-vn-log-speaker');
        speaker.textContent = line.speakerName;
        item.append(speaker);
    }
    const japanese = node('span', 'academy-vn-log-japanese');
    japanese.lang = line.language ?? 'ja';
    applyReadingSurface(japanese, line.japanese, readingVisible && line.reading.available !== false);
    item.append(japanese);
    if (line.translation && line.translationEarned) {
        const translation = node('span', 'academy-vn-log-translation');
        translation.lang = 'en';
        translation.textContent = line.translation;
        translation.hidden = !translationVisible;
        item.append(translation);
    }
    return item;
}

function setToolLabel(button: HTMLButtonElement, label: string): void {
    setAcademyTooltip(button, label);
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
