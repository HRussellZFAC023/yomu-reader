import { escapeHtml, setInnerHtml } from './dom';
import { Logger } from './logger';
import { detectGrammarHints, renderGrammarHints, setGrammarRuleKnown, setKnownGrammarVisible, translateJapaneseSentence } from './study-tools';

const log = Logger.scope('StudyRender');

export async function renderStudyToolResult(button: HTMLButtonElement, action: string, sentence?: string): Promise<void> {
    const panel = button.closest('.jpdb-reader-study-tools')?.querySelector<HTMLElement>('[data-study-panel]');
    if (!panel || !sentence) return;
    panel.hidden = false;
    panel.textContent = action === 'study-translate' ? 'Translating...' : 'Finding grammar...';
    const done = log.time('studyTool', { action, sentenceLength: sentence.length });
    if (action === 'study-translate') {
        try {
            const translated = await translateJapaneseSentence(sentence);
            setInnerHtml(panel, `<div class="jpdb-reader-study-block jpdb-reader-study-meaning-block"><div class="jpdb-reader-study-label">Meaning</div><div class="jpdb-reader-study-translation">${escapeHtml(translated)}</div></div>`);
            return;
        } finally {
            done();
        }
    }
    const hints = detectGrammarHints(sentence);
    if (!hints.length) {
        panel.hidden = true;
        panel.textContent = '';
        done();
        return;
    }
    setInnerHtml(panel, renderGrammarHints(hints, sentence));
    done();
}

export function handleStudyGrammarAction(button: HTMLButtonElement, sentence?: string): boolean {
    if (!sentence) return false;
    if (button.dataset.action === 'study-grammar-toggle-known') {
        const ruleId = button.dataset.grammarRuleId;
        if (!ruleId) return false;
        setGrammarRuleKnown(ruleId, button.dataset.grammarKnown !== 'true');
        rerenderGrammarPanel(button, sentence);
        return true;
    }
    if (button.dataset.action === 'study-grammar-toggle-known-visibility') {
        setKnownGrammarVisible(button.getAttribute('aria-pressed') !== 'true');
        rerenderGrammarPanel(button, sentence);
        return true;
    }
    return false;
}

function rerenderGrammarPanel(button: HTMLButtonElement, sentence: string): void {
    const panel = button.closest<HTMLElement>('.jpdb-reader-study-panel');
    if (!panel) return;
    const hints = detectGrammarHints(sentence);
    setInnerHtml(panel, renderGrammarHints(hints, sentence));
}
