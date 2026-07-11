/**
 * Yomu Academy — the sentence-reveal learning tool.
 *
 * A Japanese sentence whose furigana and English gloss start hidden and are
 * revealed on demand — the eye-icon "cloze" pattern from Yomu's YouTube
 * sidebar. Tap the eye to show all readings, the translate icon to show the
 * gloss, or tap a single word to reveal just that word's reading. This is how
 * a learner meets a sentence at exactly their own support level.
 */

export interface RevealToken {
    /** The surface text (kanji/kana/punctuation). */
    base: string;
    /** Reading in kana, if this token takes furigana. */
    reading?: string;
    /** Optional per-word gloss (shown on hover/focus title). */
    gloss?: string;
}

export interface RevealOptions {
    /** English translation shown under the sentence when gloss is revealed. */
    gloss?: string;
    /** Start with furigana already shown. */
    showFurigana?: boolean;
    /** Start with the gloss already shown. */
    showGloss?: boolean;
}

let revealCounter = 0;

function esc(value: string): string {
    return value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));
}

/** Build a self-contained sentence-reveal widget. Call bindReveal() after inserting. */
export function revealSentenceMarkup(tokens: readonly RevealToken[], options: RevealOptions = {}): string {
    const id = `reveal-${revealCounter++}`;
    const furi = options.showFurigana ? 'shown' : 'hidden';
    const gloss = options.showGloss ? 'shown' : 'hidden';
    const body = tokens.map(token => {
        if (token.reading) {
            return `<ruby class="academy-reveal-word" tabindex="0"${token.gloss ? ` title="${esc(token.gloss)}"` : ''}>${esc(token.base)}<rt>${esc(token.reading)}</rt></ruby>`;
        }
        return `<span>${esc(token.base)}</span>`;
    }).join('');
    const glossLine = options.gloss ? `<span class="academy-reveal-gloss">${esc(options.gloss)}</span>` : '';
    return `<span class="academy-reveal" id="${id}" data-furigana="${furi}" data-gloss="${gloss}">
        <span class="academy-japanese" lang="ja">${body}</span>
        <span class="academy-reveal-tools" role="group" aria-label="Reading support">
            <button type="button" class="academy-reveal-tool" data-reveal-furigana aria-pressed="${options.showFurigana ? 'true' : 'false'}" title="Show readings"><i data-lucide="eye"></i><span>Reading</span></button>
            ${options.gloss ? `<button type="button" class="academy-reveal-tool" data-reveal-gloss aria-pressed="${options.showGloss ? 'true' : 'false'}" title="Show meaning"><i data-lucide="languages"></i><span>Meaning</span></button>` : ''}
        </span>
        ${glossLine}
    </span>`;
}

/** Wire the toggles + per-word reveal inside `root` (idempotent). */
export function bindReveal(root: ParentNode): void {
    root.querySelectorAll<HTMLElement>('.academy-reveal').forEach(widget => {
        if (widget.dataset.revealBound === 'true') return;
        widget.dataset.revealBound = 'true';
        const furiBtn = widget.querySelector<HTMLButtonElement>('[data-reveal-furigana]');
        const glossBtn = widget.querySelector<HTMLButtonElement>('[data-reveal-gloss]');
        furiBtn?.addEventListener('click', () => {
            const next = widget.dataset.furigana === 'hidden' ? 'shown' : 'hidden';
            widget.dataset.furigana = next;
            furiBtn.setAttribute('aria-pressed', String(next === 'shown'));
        });
        glossBtn?.addEventListener('click', () => {
            const next = widget.dataset.gloss === 'hidden' ? 'shown' : 'hidden';
            widget.dataset.gloss = next;
            glossBtn.setAttribute('aria-pressed', String(next === 'shown'));
        });
        widget.querySelectorAll<HTMLElement>('.academy-reveal-word').forEach(word => {
            const reveal = () => {
                if (widget.dataset.furigana === 'hidden') {
                    const rt = word.querySelector('rt');
                    if (rt) rt.style.opacity = rt.style.opacity === '1' ? '' : '1';
                }
            };
            word.addEventListener('click', reveal);
            word.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); reveal(); }
            });
        });
    });
}
