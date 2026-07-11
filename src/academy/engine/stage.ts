/**
 * Yomu Academy VN engine — DOM stage.
 *
 * Scene mode presentation per the Visual Bible: one full-bleed plate, one
 * sprite per character identity, one paper dialogue surface. Furigana and
 * translation visibility are single CSS classes on the stage root, so the
 * toggles cannot desync from per-line state. Japanese lines are inserted
 * whole (no typewriter) because the Yomu runtime annotates them
 * asynchronously; animating character-by-character races the annotator.
 */

import type { SceneChoice, SceneLine, SceneStageDirection, StageSide } from './script';
import type { StageAdapter } from './runtime';
import { resolvePlate, resolveSprite } from './assets';
import { characterName } from '../cast/registry';

export interface StageSettings {
    showFurigana: boolean;
    showTranslations: boolean;
    reducedMotion: boolean;
}

export interface StageHooks {
    /** Play/stop ambient audio for a cue id ('silence' stops). */
    ambience?: (cue: string) => void;
    /** Called when settings change from stage controls, for persistence. */
    onSettingsChanged?: (settings: StageSettings) => void;
}

interface BacklogEntry {
    speaker?: string;
    ja?: string;
    en?: string;
}

const SPRITE_ORDER: StageSide[] = ['left', 'center', 'right'];

export class DomStage implements StageAdapter {
    private readonly root: HTMLElement;
    private readonly plateA: HTMLElement;
    private readonly plateB: HTMLElement;
    private plateFront: HTMLElement;
    private readonly spriteLayer: HTMLElement;
    private readonly dialogue: HTMLElement;
    private readonly backlog: BacklogEntry[] = [];
    private readonly sprites = new Map<string, HTMLImageElement>();
    private settings: StageSettings;
    private readonly hooks: StageHooks;

    constructor(host: HTMLElement, settings: StageSettings, hooks: StageHooks = {}) {
        this.settings = { ...settings };
        this.hooks = hooks;
        host.innerHTML = '';
        this.root = element('div', 'academy-stage');
        this.plateA = element('div', 'academy-stage-plate');
        this.plateB = element('div', 'academy-stage-plate');
        this.plateFront = this.plateA;
        this.spriteLayer = element('div', 'academy-stage-sprites');
        this.dialogue = element('div', 'academy-dialogue');
        this.dialogue.setAttribute('role', 'group');
        this.dialogue.setAttribute('aria-label', 'Dialogue');
        this.root.append(this.plateA, this.plateB, this.spriteLayer, this.dialogue);
        host.append(this.root);
        this.applySettings();
    }

    updateSettings(update: Partial<StageSettings>): void {
        this.settings = { ...this.settings, ...update };
        this.applySettings();
        this.hooks.onSettingsChanged?.(this.settings);
    }

    private applySettings(): void {
        this.root.classList.toggle('academy-hide-furigana', !this.settings.showFurigana);
        this.root.classList.toggle('academy-show-translations', this.settings.showTranslations);
        this.root.classList.toggle('academy-reduced-motion', this.settings.reducedMotion);
    }

    async direct(direction: SceneStageDirection): Promise<void> {
        if (direction.plate) this.swapPlate(direction.plate);
        if (direction.sprites) this.composeSprites(direction.sprites);
        if (direction.ambience) this.hooks.ambience?.(direction.ambience);
    }

    private swapPlate(plateId: string): void {
        const plate = resolvePlate(plateId);
        if (!plate) return;
        const portrait = window.matchMedia('(max-width: 760px) and (orientation: portrait)').matches;
        const url = portrait && plate.mobile ? plate.mobile : plate.wide;
        const back = this.plateFront === this.plateA ? this.plateB : this.plateA;
        back.style.backgroundImage = `url("${url}")`;
        back.classList.add('is-front');
        this.plateFront.classList.remove('is-front');
        this.plateFront = back;
    }

    private composeSprites(cast: NonNullable<SceneStageDirection['sprites']>): void {
        const staying = new Set(cast.map(entry => entry.character));
        for (const [character, image] of this.sprites) {
            if (!staying.has(character)) {
                image.classList.remove('is-on');
                image.addEventListener('transitionend', () => image.remove(), { once: true });
                if (this.settings.reducedMotion) image.remove();
                this.sprites.delete(character);
            }
        }
        cast.forEach((entry, index) => {
            const side = entry.side ?? SPRITE_ORDER[Math.min(index, SPRITE_ORDER.length - 1)];
            const resolved = resolveSprite(entry.character, entry.expression ?? 'neutral');
            if (!resolved) return;
            let image = this.sprites.get(entry.character);
            if (!image) {
                image = document.createElement('img');
                image.className = 'academy-sprite';
                image.alt = '';
                image.decoding = 'async';
                this.spriteLayer.append(image);
                this.sprites.set(entry.character, image);
                requestAnimationFrame(() => requestAnimationFrame(() => image?.classList.add('is-on')));
                if (this.settings.reducedMotion) image.classList.add('is-on');
            }
            image.dataset.side = side;
            image.dataset.quality = resolved.quality;
            if (image.getAttribute('src') !== resolved.url) image.src = resolved.url;
        });
        this.root.dataset.spriteCount = String(this.sprites.size);
    }

    line(line: SceneLine): Promise<void> {
        this.backlog.push({ speaker: line.speaker ? characterName(line.speaker) : undefined, ja: line.ja, en: line.en });
        if (line.speaker && line.expression && this.sprites.has(line.speaker)) {
            const resolved = resolveSprite(line.speaker, line.expression);
            const image = this.sprites.get(line.speaker);
            if (resolved && image && image.getAttribute('src') !== resolved.url) image.src = resolved.url;
        }
        for (const [character, image] of this.sprites) {
            image.classList.toggle('is-speaking', character === line.speaker);
        }
        return new Promise(resolve => {
            this.renderDialogue(line, resolve);
        });
    }

    private renderDialogue(line: SceneLine, advance: () => void): void {
        const surface = element('div', 'academy-dialogue-surface');
        if (line.speaker) {
            const speaker = element('p', 'academy-dialogue-speaker');
            speaker.textContent = characterName(line.speaker);
            surface.append(speaker);
        }
        if (line.ja) {
            const ja = element('p', 'academy-dialogue-ja');
            ja.lang = 'ja';
            ja.textContent = line.ja;
            surface.append(ja);
        }
        if (line.en) {
            const en = element('p', 'academy-dialogue-en');
            en.textContent = line.en;
            if (line.ja) {
                const reveal = element('button', 'academy-line-reveal');
                reveal.type = 'button';
                reveal.textContent = '訳';
                reveal.setAttribute('aria-label', 'Show translation for this line');
                reveal.addEventListener('click', event => {
                    event.stopPropagation();
                    en.classList.add('is-revealed');
                    reveal.remove();
                });
                surface.append(reveal);
            } else {
                en.classList.add('is-revealed');
            }
            surface.append(en);
        }
        if (line.note) {
            const note = element('p', 'academy-dialogue-note');
            note.textContent = line.note;
            surface.append(note);
        }
        const controls = element('div', 'academy-dialogue-controls');
        controls.append(
            this.toggleButton('ふ', 'Toggle furigana', () => this.updateSettings({ showFurigana: !this.settings.showFurigana })),
            this.toggleButton('訳', 'Toggle all translations', () => this.updateSettings({ showTranslations: !this.settings.showTranslations })),
            this.toggleButton('記', 'Show backlog', () => this.showBacklog()),
        );
        const next = element('button', 'academy-dialogue-advance');
        next.type = 'button';
        next.textContent = '▸';
        next.setAttribute('aria-label', 'Next');
        controls.append(next);
        surface.append(controls);

        this.dialogue.replaceChildren(surface);
        const proceed = () => {
            surface.removeEventListener('click', onSurfaceClick);
            advance();
        };
        const onSurfaceClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (target.closest('button') && !target.closest('.academy-dialogue-advance')) return;
            proceed();
        };
        surface.addEventListener('click', onSurfaceClick);
        next.focus({ preventScroll: true });
    }

    choice(choice: SceneChoice): Promise<string> {
        return new Promise(resolve => {
            const surface = element('div', 'academy-dialogue-surface academy-dialogue-choice');
            if (choice.prompt) {
                if (choice.prompt.speaker) {
                    const speaker = element('p', 'academy-dialogue-speaker');
                    speaker.textContent = characterName(choice.prompt.speaker);
                    surface.append(speaker);
                }
                if (choice.prompt.ja) {
                    const ja = element('p', 'academy-dialogue-ja');
                    ja.lang = 'ja';
                    ja.textContent = choice.prompt.ja;
                    surface.append(ja);
                }
                if (choice.prompt.en) {
                    const en = element('p', 'academy-dialogue-en is-revealed');
                    en.textContent = choice.prompt.en;
                    surface.append(en);
                }
            }
            const list = element('div', 'academy-choice-list');
            for (const option of choice.options) {
                const button = element('button', 'academy-choice-option');
                button.type = 'button';
                if (option.ja) {
                    const ja = element('span', 'academy-choice-ja');
                    ja.lang = 'ja';
                    ja.textContent = option.ja;
                    button.append(ja);
                }
                const en = element('span', 'academy-choice-en');
                en.textContent = option.en;
                button.append(en);
                button.addEventListener('click', () => resolve(option.id), { once: true });
                list.append(button);
            }
            surface.append(list);
            this.dialogue.replaceChildren(surface);
            list.querySelector('button')?.focus({ preventScroll: true });
        });
    }

    private showBacklog(): void {
        const panel = element('div', 'academy-backlog');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Dialogue history');
        const scroller = element('div', 'academy-backlog-scroll');
        for (const entry of this.backlog) {
            const row = element('div', 'academy-backlog-row');
            if (entry.speaker) {
                const speaker = element('p', 'academy-dialogue-speaker');
                speaker.textContent = entry.speaker;
                row.append(speaker);
            }
            if (entry.ja) {
                const ja = element('p', 'academy-dialogue-ja');
                ja.lang = 'ja';
                ja.textContent = entry.ja;
                row.append(ja);
            }
            if (entry.en) {
                const en = element('p', 'academy-dialogue-en is-revealed');
                en.textContent = entry.en;
                row.append(en);
            }
            scroller.append(row);
        }
        const close = element('button', 'academy-backlog-close');
        close.type = 'button';
        close.textContent = 'Close';
        close.addEventListener('click', () => panel.remove(), { once: true });
        panel.append(scroller, close);
        this.root.append(panel);
        scroller.scrollTop = scroller.scrollHeight;
        close.focus({ preventScroll: true });
    }

    private toggleButton(label: string, description: string, onClick: () => void): HTMLButtonElement {
        const button = element('button', 'academy-dialogue-tool');
        button.type = 'button';
        button.textContent = label;
        button.setAttribute('aria-label', description);
        button.addEventListener('click', event => {
            event.stopPropagation();
            onClick();
        });
        return button;
    }

    end(): void {
        this.dialogue.replaceChildren();
    }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.className = className;
    return node;
}
