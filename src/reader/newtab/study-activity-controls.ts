import { el } from '../dom/builder';
import type { InterfaceLanguage } from '../app/types';
import { newTabAction } from './actions';
import { newTabText, type NewTabCopyKey } from './i18n';
import type { NewTabStudySession, NewTabStudyStep } from './study-session';

const PRACTICE_LABELS: Partial<Record<NewTabStudyStep['kind'], NewTabCopyKey>> = {
    'kanji-doodle': 'practiceWriteKanji',
    'type-word': 'practiceTypeWord',
    'recall-cloze': 'practiceSentence',
    'listen-pitch': 'practicePitch',
    speaking: 'practiceSpeaking',
};

export function renderStudyActivityControls(session: NewTabStudySession, language: InterfaceLanguage): HTMLElement {
    const kanjiSteps = session.practiceSteps.filter(step => step.kanji);
    return el('details', { class: 'jpdb-reader-newtab-practice', open: session.activity === 'practice' },
        el('summary', {}, newTabText(language, 'practiceThisWord')),
        el('div', { class: 'jpdb-reader-newtab-practice-options', role: 'group', 'aria-label': newTabText(language, 'practiceThisWord') },
            session.practiceSteps.map(step => {
                const label = newTabText(language, PRACTICE_LABELS[step.kind]!);
                const title = step.kanji && kanjiSteps.length > 1 ? `${label} ${kanjiSteps.indexOf(step) + 1}` : label;
                return el('button', {
                    type: 'button', class: 'jpdb-reader-newtab-study-step',
                    dataset: { newtabAction: newTabAction('study-step'), studyStepId: step.id, studyStepKind: step.kind },
                    'aria-pressed': String(session.activity === 'practice' && session.activeStep.id === step.id),
                }, title);
            }),
        ),
    );
}
