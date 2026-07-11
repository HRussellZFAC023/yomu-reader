/**
 * Yomu Academy — the visual-novel scene player.
 *
 * Plays an authored scene as a sequence of beats: a portrait slides in, the
 * speaker's Japanese line appears (typewriter, click-to-complete), an English
 * caption and an eye-icon reading toggle sit beneath it, and choices branch
 * the flow. Everything is skippable and works audio-off / reduced-motion:
 * captions carry all meaning, the typewriter collapses to instant text, and a
 * "Skip scene" control jumps to the linked activity. Presentation only — the
 * caller owns any learning/bond state changes via onComplete.
 */

import { avatarSvg } from './art';
import { castMemberById } from './cast';
import { typeLine, announce, MotionGuard } from './motion';
import { revealSentenceMarkup, bindReveal, type RevealToken } from './learn';
import type { AcademyAudio } from './audio';

export interface VnLine {
    /** Cast id (drives portrait + name), or a free label. */
    speaker: string;
    /** Portrait expression override. */
    expression?: 'neutral' | 'happy' | 'thinking' | 'surprised' | 'warm' | 'sleepy';
    /** Which side the portrait sits on. */
    side?: 'left' | 'right';
    /** The Japanese line, tokenised for the reading reveal. */
    ja: readonly RevealToken[];
    /** Natural English caption (always visible — carries meaning audio-off). */
    en: string;
}

export interface VnChoice {
    id: string;
    ja?: string;
    label: string;
}

export interface VnScene {
    id: string;
    title: string;
    /** Optional background image URL (falls back to the campus gradient). */
    background?: string;
    lines: readonly VnLine[];
    /** Optional end-of-scene choices; resolves with the chosen id. */
    choices?: readonly VnChoice[];
}

export interface VnResult {
    completed: boolean;
    choiceId?: string;
}

/** Play `scene` in `host`. Resolves when the learner finishes or skips. */
export function playScene(host: HTMLElement, scene: VnScene, audio?: AcademyAudio): Promise<VnResult> {
    return new Promise<VnResult>(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'academy-vn';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-label', scene.title);
        overlay.innerHTML = `
            <div class="academy-vn-stage">
                <div class="academy-vn-bg"${scene.background ? ` style="background-image:url('${scene.background}')"` : ''}></div>
                <div class="academy-vn-toprow">
                    <span class="academy-brand academy-brand-on-art"><span class="academy-brand-name">${escapeHtml(scene.title)}</span></span>
                    <button class="academy-icon-button academy-icon-on-art" type="button" data-vn-skip aria-label="Skip scene">Skip ✕</button>
                </div>
                <figure class="academy-vn-portrait is-enter" data-vn-portrait aria-hidden="true"></figure>
            </div>
            <div class="academy-vn-panel">
                <p class="academy-vn-speaker" data-vn-speaker></p>
                <p class="academy-vn-line academy-japanese" lang="ja" data-vn-line></p>
                <div class="academy-vn-reveal" data-vn-reveal hidden></div>
                <p class="academy-vn-caption" data-vn-caption></p>
                <div class="academy-vn-controls" data-vn-controls>
                    <span class="academy-vn-progress" data-vn-progress></span>
                    <button class="academy-button academy-button-primary academy-vn-advance" type="button" data-vn-advance>Continue ▸</button>
                </div>
                <div class="academy-vn-choices" data-vn-choices hidden></div>
            </div>`;
        host.appendChild(overlay);

        const portrait = overlay.querySelector<HTMLElement>('[data-vn-portrait]')!;
        const speakerEl = overlay.querySelector<HTMLElement>('[data-vn-speaker]')!;
        const lineEl = overlay.querySelector<HTMLElement>('[data-vn-line]')!;
        const revealEl = overlay.querySelector<HTMLElement>('[data-vn-reveal]')!;
        const captionEl = overlay.querySelector<HTMLElement>('[data-vn-caption]')!;
        const controls = overlay.querySelector<HTMLElement>('[data-vn-controls]')!;
        const progressEl = overlay.querySelector<HTMLElement>('[data-vn-progress]')!;
        const advanceBtn = overlay.querySelector<HTMLButtonElement>('[data-vn-advance]')!;
        const choicesEl = overlay.querySelector<HTMLElement>('[data-vn-choices]')!;
        const skipBtn = overlay.querySelector<HTMLButtonElement>('[data-vn-skip]')!;

        let index = -1;
        let currentSide: 'left' | 'right' = 'right';

        const finish = (result: VnResult) => {
            overlay.remove();
            resolve(result);
        };

        const showChoices = () => {
            controls.hidden = true;
            if (!scene.choices || scene.choices.length === 0) { finish({ completed: true }); return; }
            choicesEl.hidden = false;
            choicesEl.innerHTML = scene.choices.map(choice =>
                `<button class="academy-vn-choice" type="button" data-vn-choice="${escapeAttr(choice.id)}">
                    ${choice.ja ? `<span class="academy-japanese" lang="ja">${escapeHtml(choice.ja)}</span>` : ''}
                    <small>${escapeHtml(choice.label)}</small>
                </button>`).join('');
            choicesEl.querySelectorAll<HTMLButtonElement>('[data-vn-choice]').forEach(button => {
                button.addEventListener('click', () => { audio?.play('confirm'); finish({ completed: true, choiceId: button.dataset.vnChoice }); });
            });
            choicesEl.querySelector<HTMLButtonElement>('button')?.focus();
        };

        const renderLine = async (line: VnLine) => {
            const member = castMemberById(line.speaker);
            const side = line.side ?? (member?.kind === 'sensei' ? 'left' : 'right');
            // Portrait swap — prefer the hand-painted portrait art, fall back to the SVG avatar.
            if (member) {
                portrait.dataset.side = side;
                const svgFallback = `<span class="academy-avatar">${avatarSvg({ ...member.avatar, expression: line.expression ?? member.avatar.expression }, { showProp: false })}</span>`;
                portrait.innerHTML = `<img class="academy-vn-portrait-img" src="${escapeAttr(portraitFor(member.id))}" alt="" draggable="false">`;
                portrait.querySelector('img')?.addEventListener('error', () => { portrait.innerHTML = svgFallback; renderIcons(portrait); });
                portrait.classList.remove('is-enter');
                if (side !== currentSide) currentSide = side;
            }
            speakerEl.textContent = member?.name ?? line.speaker;
            captionEl.textContent = line.en;
            // The reading reveal (static, eye-toggle) is prepared but hidden until the line finishes typing.
            revealEl.hidden = true;
            revealEl.innerHTML = revealSentenceMarkup(line.ja, { gloss: line.en });
            const plain = line.ja.map(token => token.base).join('');
            audio?.play('page');
            await typeLine(lineEl, plain);
            // After the line lands, offer the reading toggle.
            lineEl.textContent = '';
            revealEl.hidden = false;
            bindReveal(revealEl);
            renderIcons(revealEl);
        };

        const next = () => {
            index += 1;
            if (index >= scene.lines.length) { showChoices(); return; }
            progressEl.textContent = `${index + 1} / ${scene.lines.length}`;
            advanceBtn.textContent = index === scene.lines.length - 1 && (!scene.choices || !scene.choices.length) ? 'Finish ▸' : 'Continue ▸';
            void renderLine(scene.lines[index]);
        };

        advanceBtn.addEventListener('click', next);
        skipBtn.addEventListener('click', () => { announce(`Skipped scene: ${scene.title}`); finish({ completed: false }); });
        overlay.addEventListener('keydown', event => { if (event.key === 'Escape') skipBtn.click(); });

        next();
        void MotionGuard; // reduced-motion handled inside typeLine + CSS
    });
}

/** lucide icons are created by the host; re-run createIcons on injected reveal markup. */
let iconRenderer: ((root: HTMLElement) => void) | null = null;
export function setVnIconRenderer(fn: (root: HTMLElement) => void): void { iconRenderer = fn; }
function renderIcons(root: HTMLElement): void { iconRenderer?.(root); }

/** The hand-painted portrait for a cast id (Rie uses her campus half-body sprite). */
const PORTRAIT_OVERRIDES: Record<string, string> = {
    rie: './art/characters/production/rie/rie__sprite__neutral-welcome__halfbody__v001.png',
};
function portraitFor(id: string): string {
    return PORTRAIT_OVERRIDES[id] ?? `./art/characters/portraits/${id}.png`;
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));
}
function escapeAttr(value: string): string { return escapeHtml(value).replaceAll('`', '&#96;'); }
