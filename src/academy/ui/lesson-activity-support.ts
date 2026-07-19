import type {
    ActivityHost,
    ActivityModel,
    ActivityTeachingSupport,
    FeedbackBlock,
} from '../domain/activity-runtime';
import { MAX_PROGRESSIVE_REPAIR_HINTS } from '../domain/lesson-pedagogy';
import type { LocalizedText } from '../domain/source-library';
import { setAcademyReadingSurface, setAcademyReadingSurfaces } from '../integration/reader-markup';
import { element } from './dom';
import { setAcademyTooltip } from './tooltip';

export interface LessonLanguageSupportController {
    readonly element: HTMLElement;
    registerReadingSurface(surface: HTMLElement): () => void;
    refresh(): void;
    dispose(): void;
}

const languageSupportByRoot = new WeakMap<HTMLElement, LessonLanguageSupportController>();

export function createLessonLanguageSupport(
    root: HTMLElement,
    language: 'en' | 'ja',
): LessonLanguageSupportController {
    const existing = languageSupportByRoot.get(root);
    if (existing) return existing;

    const lifecycle = new AbortController();
    const toolbar = element('div', 'academy-lesson-language-tools');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', language === 'ja' ? 'ことばのサポート' : 'Language support');
    toolbar.dataset.jpdbReaderSurfaceIgnore = '';
    const readings = toolButton('読');
    const translations = toolButton('訳');
    toolbar.append(readings, translations);
    const registered = new Map<HTMLElement, string>();
    let readingsVisible = false;
    let translationsVisible = language === 'en';
    root.dataset.readingSupport = 'hidden';

    const setLabels = (): void => {
        setToolLabel(readings, language === 'ja'
            ? (readingsVisible ? '読み方を隠す' : '読み方を見る')
            : (readingsVisible ? 'Hide readings' : 'Show readings'));
        setToolLabel(translations, language === 'ja'
            ? (translationsVisible ? '訳を隠す' : '訳を見る')
            : (translationsVisible ? 'Hide translation' : 'Show translation'));
        readings.setAttribute('aria-pressed', String(readingsVisible));
        translations.setAttribute('aria-pressed', String(translationsVisible));
    };

    const refresh = (): void => {
        root.dataset.readingSupport = readingsVisible ? 'shown' : 'hidden';
        setAcademyReadingSurfaces(root, readingsVisible);
        registered.forEach((source, surface) => {
            if (surface.isConnected) setAcademyReadingSurface(surface, readingsVisible, source);
        });
        root.querySelectorAll<HTMLElement>('.academy-support').forEach(surface => {
            surface.hidden = !translationsVisible;
        });
        root.dataset.translationSupport = translationsVisible ? 'shown' : 'hidden';
    };

    readings.addEventListener('click', () => {
        readingsVisible = !readingsVisible;
        setLabels();
        refresh();
        root.dispatchEvent(new CustomEvent('academy:annotation-change', {
            bubbles: true,
            detail: { visible: readingsVisible },
        }));
    }, { signal: lifecycle.signal });
    translations.addEventListener('click', () => {
        translationsVisible = !translationsVisible;
        setLabels();
        refresh();
    }, { signal: lifecycle.signal });

    const observer = new MutationObserver(refresh);
    observer.observe(root, { childList: true, subtree: true });
    setLabels();
    refresh();

    const controller: LessonLanguageSupportController = {
        element: toolbar,
        registerReadingSurface(surface) {
            const source = surface.textContent ?? '';
            registered.set(surface, source);
            setAcademyReadingSurface(surface, readingsVisible, source);
            return () => { registered.delete(surface); };
        },
        refresh,
        dispose() {
            lifecycle.abort();
            observer.disconnect();
            registered.clear();
            toolbar.remove();
            if (languageSupportByRoot.get(root) === controller) languageSupportByRoot.delete(root);
        },
    };
    languageSupportByRoot.set(root, controller);
    return controller;
}

export function teachingSupportView(
    support: ActivityTeachingSupport,
    language: 'en' | 'ja',
): HTMLElement {
    const root = element('section', 'academy-lesson-teaching-support');
    root.dataset.supportKind = support.kind;
    const eyebrow = element('p', 'academy-eyebrow');
    eyebrow.textContent = language === 'ja' ? '問題の前に' : 'Before the question';
    const guidance = element('p', 'academy-lesson-teaching-guidance');
    guidance.textContent = language === 'ja'
        ? 'まず、ここを見てください。答えるときに使えます。'
        : 'Take a moment to look at this. You can use it when you answer.';
    const title = element('h2', 'academy-lesson-teaching-title');
    title.tabIndex = -1;
    title.append(...localizedNodes(support.title));
    const entries = element('div', 'academy-lesson-teaching-entries');
    entries.tabIndex = 0;
    entries.setAttribute('aria-label', language === 'ja' ? '学習例' : 'Teaching examples');
    for (const entry of support.entries) {
        const row = element('article', 'academy-lesson-teaching-entry');
        const japanese = element('p', 'academy-japanese academy-lesson-teaching-japanese');
        japanese.lang = 'ja';
        japanese.textContent = entry.japanese;
        if (entry.reading && entry.reading !== entry.japanese) japanese.dataset.reading = entry.reading;
        row.append(japanese);
        if (entry.translation) {
            const translation = element('p', 'academy-support academy-lesson-teaching-translation');
            translation.lang = 'en';
            translation.dataset.jpdbReaderSurfaceIgnore = '';
            translation.textContent = entry.translation;
            row.append(translation);
        }
        entries.append(row);
    }
    root.append(eyebrow, title, guidance, entries);
    return root;
}

export function teachingSupportForActivity(model: ActivityModel): ActivityTeachingSupport {
    if (model.teachingSupport?.entries.length) return model.teachingSupport;
    const payload = model.payload && typeof model.payload === 'object'
        ? model.payload as Readonly<Record<string, unknown>>
        : {};
    const targets = Array.isArray(payload.reviewTargets) ? payload.reviewTargets : [];
    const target = targets.find(candidate => candidate && typeof candidate === 'object') as
        | Readonly<Record<string, unknown>>
        | undefined;
    const reviewContent = payload.reviewContent && typeof payload.reviewContent === 'object'
        ? payload.reviewContent as Readonly<Record<string, unknown>>
        : undefined;
    const sourceSupport = payload.support && typeof payload.support === 'object'
        ? payload.support as Readonly<Record<string, unknown>>
        : undefined;
    const candidate = target ?? reviewContent ?? sourceSupport;
    const expression = candidate && typeof (candidate.expression ?? candidate.words) === 'string'
        ? String(candidate.expression ?? candidate.words).trim()
        : '';
    const meanings = candidate && Array.isArray(candidate.meanings)
        ? candidate.meanings.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
        : candidate && typeof candidate.meaning === 'string' ? [candidate.meaning.trim()] : [];
    const reading = candidate && typeof candidate.reading === 'string' ? candidate.reading.trim() : '';
    if (expression) {
        return {
            kind: sourceSupport ? 'vocabulary' : 'example',
            title: { ja: '使うことば', en: 'Language you will use' },
            entries: [{
                japanese: expression,
                ...(reading ? { reading } : {}),
                ...(meanings.length ? { translation: meanings.join('; ') } : {}),
            }],
        };
    }
    return {
        kind: 'context',
        title: { ja: '問題の場面', en: 'Question context' },
        entries: [{ japanese: model.prompt.ja, translation: model.prompt.en }],
    };
}

export function appendProgressiveFeedback(
    root: HTMLElement,
    feedback: FeedbackBlock,
    options: Readonly<{
        language: 'en' | 'ja';
        activityId: string;
        host?: Pick<ActivityHost, 'recordSupportUse'>;
        repairClass?: string;
        exampleClass?: string;
    }>,
): void {
    const hints = [
        feedback.repairPrompt
            ? { value: feedback.repairPrompt, className: options.repairClass ?? 'academy-feedback-repair' }
            : null,
        feedback.nearbyExample
            ? { value: feedback.nearbyExample, className: options.exampleClass ?? 'academy-feedback-example' }
            : null,
    ].filter((hint): hint is { value: LocalizedText; className: string } => Boolean(hint))
        .slice(0, MAX_PROGRESSIVE_REPAIR_HINTS);
    if (!hints.length) return;

    const support = element('section', 'academy-progressive-hints academy-lesson-repair-hints');
    const revealed = element('div', 'academy-progressive-hints-revealed');
    revealed.setAttribute('aria-live', 'polite');
    const reveal = element('button', 'academy-button academy-progressive-hint-button');
    reveal.type = 'button';
    let index = 0;
    const updateLabel = (): void => {
        reveal.textContent = options.language === 'ja'
            ? (index === 0 ? 'ヒントを見る' : '次のヒント')
            : (index === 0 ? 'Need a hint?' : 'Another hint');
    };
    updateLabel();
    reveal.addEventListener('click', () => {
        const hint = hints[index];
        if (!hint) return;
        const line = bilingualParagraph(hint.value, hint.className);
        revealed.append(line);
        void options.host?.recordSupportUse?.({
            activityId: options.activityId,
            supportKind: 'hint',
            choiceId: `progressive-repair:${index + 1}`,
        });
        index += 1;
        if (index >= hints.length) reveal.remove();
        else updateLabel();
    });
    support.append(revealed, reveal);
    root.append(support);
}

function toolButton(glyph: string): HTMLButtonElement {
    const button = element('button', 'academy-lesson-language-tool');
    button.type = 'button';
    button.textContent = glyph;
    return button;
}

function setToolLabel(button: HTMLButtonElement, label: string): void {
    // Icon-only glyphs (読/訳): first touch tap previews the label, second acts.
    button.dataset.tooltipTouchPreview = '';
    setAcademyTooltip(button, label);
}

function bilingualParagraph(value: LocalizedText, className: string): HTMLParagraphElement {
    const paragraph = element('p', className);
    paragraph.append(...localizedNodes(value));
    return paragraph;
}

function localizedNodes(value: LocalizedText): readonly HTMLSpanElement[] {
    const japanese = element('span', 'academy-japanese');
    japanese.lang = 'ja';
    japanese.textContent = value.ja;
    const translation = element('span', 'academy-support');
    translation.lang = 'en';
    translation.dataset.jpdbReaderSurfaceIgnore = '';
    translation.textContent = value.en;
    return [japanese, translation];
}
