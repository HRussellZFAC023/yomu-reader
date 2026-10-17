// ADR-0003 core import-severing: the grammar known-rule commands ship in the
// Yomu Kanji/Study companion; this facade keeps core call sites stable.
import { yomuKanjiStudyCompanion } from '../companions/registry';
import type { InterfaceLanguage } from '../app/types';
import type { CardCommandCapability } from '../dom/private-command-capabilities';

export function handleStudyGrammarAction(button: HTMLButtonElement, sentence?: string, language: InterfaceLanguage = 'en', options: { audioEnabled?: boolean; command?: CardCommandCapability } = {}): boolean {
    return yomuKanjiStudyCompanion()?.handleStudyGrammarAction?.(button, sentence, language, options) ?? false;
}
