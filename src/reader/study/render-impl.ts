import { setInnerHtml } from '../dom';
import { capturePopoverScrollFrame, restorePopoverScrollFrameSoon } from '../popup/shell';
import { detectGrammarHints, renderGrammarHints, setGrammarRuleKnown, setKnownGrammarVisible } from './tools-impl';
import type { InterfaceLanguage } from '../app/types';
import type { CardCommandCapability } from '../dom/private-command-capabilities';

export function handleStudyGrammarAction(button: HTMLButtonElement, sentence?: string, language: InterfaceLanguage = 'en', options: { audioEnabled?: boolean; command?: CardCommandCapability } = {}): boolean {
    if (!sentence) return false;
    return performStudyGrammarCommand(button, sentence, language, options);
}

type StudyGrammarCommandHandler = (button: HTMLButtonElement, sentence: string, language: InterfaceLanguage, options: { audioEnabled?: boolean; command?: CardCommandCapability }) => boolean;

const STUDY_GRAMMAR_COMMAND_HANDLERS: Partial<Record<CardCommandCapability['action'], StudyGrammarCommandHandler>> = {
    'study-grammar-toggle-known': (button, sentence, language, options) => toggleKnownGrammarRule(button, sentence, language, options),
    'study-grammar-toggle-known-visibility': (button, sentence, language, options) => toggleKnownGrammarVisibility(button, sentence, language, options),
};

function performStudyGrammarCommand(button: HTMLButtonElement, sentence: string, language: InterfaceLanguage, options: { audioEnabled?: boolean; command?: CardCommandCapability }): boolean {
    if (!options.command) return false;
    const handler = STUDY_GRAMMAR_COMMAND_HANDLERS[options.command.action];
    return handler ? handler(button, sentence, language, options) : false;
}

function toggleKnownGrammarRule(button: HTMLButtonElement, sentence: string, language: InterfaceLanguage, options: { audioEnabled?: boolean; command?: CardCommandCapability }): boolean {
    const ruleId = options.command?.grammarRuleId;
    if (!ruleId) return false;
    setGrammarRuleKnown(ruleId, options.command?.grammarKnown !== true);
    void rerenderGrammarPanel(button, sentence, language, options);
    return true;
}

function toggleKnownGrammarVisibility(button: HTMLButtonElement, sentence: string, language: InterfaceLanguage, options: { audioEnabled?: boolean }): boolean {
    setKnownGrammarVisible(button.getAttribute('aria-pressed') !== 'true');
    void rerenderGrammarPanel(button, sentence, language, options);
    return true;
}

async function rerenderGrammarPanel(button: HTMLButtonElement, sentence: string, language: InterfaceLanguage, options: { audioEnabled?: boolean }): Promise<void> {
    const panel = button.closest<HTMLElement>('.jpdb-reader-study-panel');
    if (!panel) return;
    const hints = detectGrammarHints(sentence);
    replaceStudyPanelHtml(panel, await renderGrammarHints(hints, sentence, undefined, language, { audioEnabled: options.audioEnabled }));
}

function replaceStudyPanelHtml(panel: HTMLElement, html: string): void {
    const scrollFrame = capturePopoverScrollFrame(panel);
    setInnerHtml(panel, html);
    restorePopoverScrollFrameSoon(scrollFrame);
}
