import { APP_NAME } from '../app/constants';
import { resolveUiLanguage, uiText } from '../app/i18n';
import type { ReaderSettings } from '../app/types';
import { el, fragment } from '../dom/builder';
import { usesJapaneseCharacterStudy } from '../languages/character-lookup';
import { newTabAction } from './actions';
import { NEW_TAB_HEADER_LABEL } from './controller-config';
import { newTabText } from './i18n';
import { resolveNewTabBrandAssets } from './index';

interface NewTabShellOptions {
    readonly language: ReaderSettings['interfaceLanguage'];
    readonly overflowMenu: HTMLElement | null;
    readonly appNavigation: HTMLElement | null;
    readonly showSessionClockControl: boolean;
}

/** Renders the stable New Tab shell; controllers only supply optional chrome. */
export function renderNewTabShell(options: NewTabShellOptions): DocumentFragment {
    const { language, overflowMenu } = options;
    const brand = resolveNewTabBrandAssets(location.href);
    const contentLanguage = resolveUiLanguage(language) === 'ja' ? 'ja' : 'en';
    return fragment(
        el('div', { class: 'jpdb-reader-newtab-shell' },
            el('header', { class: 'jpdb-reader-newtab-topbar' },
                overflowMenu ? el('div', { class: 'VPNavBarTitle jpdb-reader-newtab-brand', 'data-v-6aa21345': '', 'data-v-1168a8e4': '' },
                    el('a', {
                        class: 'title',
                        href: brand.homeHref,
                        'aria-label': APP_NAME,
                        'data-v-1168a8e4': '',
                    },
                    el('img', { class: 'VPImage logo', src: brand.iconSrc, alt: '', width: 24, height: 24, 'data-v-8426fc1a': '' }),
                    el('span', { 'data-v-1168a8e4': '' }, NEW_TAB_HEADER_LABEL),
                    ),
                ) : null,
                el('div', { class: 'jpdb-reader-newtab-mode', role: 'group', 'aria-label': newTabText(language, 'newTabMode') },
                    el('button', { class: 'jpdb-reader-parseable', type: 'button', dataset: { newtabAction: newTabAction('mode'), mode: 'word' }, lang: contentLanguage }, newTabText(language, 'study')),
                    el('button', { class: 'jpdb-reader-parseable', type: 'button', dataset: { newtabAction: newTabAction('mode'), mode: 'search' }, lang: contentLanguage }, newTabText(language, 'library')),
                    el('button', { class: 'jpdb-reader-parseable', type: 'button', dataset: { newtabAction: newTabAction('mode'), mode: 'stats' }, lang: contentLanguage }, newTabText(language, 'stats')),
                ),
                overflowMenu ? el('div', { class: 'jpdb-reader-newtab-theme-controls' },
                    el('span', {
                        class: 'jpdb-reader-newtab-connectivity',
                        dataset: { newtabConnectivity: true },
                        role: 'status',
                        'aria-live': 'polite',
                        hidden: true,
                    }, newTabText(language, 'offlineReady')),
                    options.showSessionClockControl ? el('div', {
                        class: 'jpdb-reader-newtab-session-clock-host',
                        dataset: { newtabSessionClockHost: true },
                    }) : null,
                    el('details', { class: 'jpdb-reader-newtab-more' },
                        el('summary', {
                            class: 'jpdb-reader-newtab-overflow',
                            'aria-label': uiText(language, 'more'),
                        }, '...'),
                        overflowMenu,
                    ),
                ) : null,
            ),
            el('section', { class: 'jpdb-reader-newtab-study', dataset: { newtabStudy: true }, 'aria-live': 'polite' },
                el('div', { class: 'jpdb-reader-newtab-count', dataset: { newtabCount: true }, hidden: true }),
                el('div', { class: 'jpdb-reader-newtab-study-steps', dataset: { newtabStudySteps: true }, role: 'list' }),
                el('div', { class: 'jpdb-reader-newtab-study-tour', dataset: { newtabStudyTour: true }, hidden: true }),
                el('h1', { class: 'jpdb-reader-newtab-prompt jpdb-reader-parseable', dataset: { newtabPrompt: true }, lang: 'ja' }, APP_NAME),
                el('div', { class: 'jpdb-reader-newtab-answer', dataset: { newtabAnswer: true } },
                    el('div', { class: 'jpdb-reader-newtab-reading', dataset: { newtabReading: true }, lang: 'ja' }),
                    el('div', { class: 'jpdb-reader-newtab-meaning', dataset: { newtabMeaning: true } }),
                ),
                el('button', { class: 'jpdb-reader-newtab-status', type: 'button', dataset: { newtabStatus: true }, disabled: true }, uiText(language, 'loading')),
                el('select', {
                    class: 'jpdb-reader-newtab-source-select',
                    dataset: { newtabSourceSelect: true },
                    hidden: true,
                    'aria-label': newTabText(language, 'switchReviewSource'),
                }),
                el('select', {
                    class: 'jpdb-reader-newtab-deck',
                    dataset: { newtabDeckSelect: true },
                    hidden: true,
                    'aria-label': newTabText(language, 'studyDeckSelector'),
                }),
                el('select', {
                    class: 'jpdb-reader-newtab-deck jpdb-reader-newtab-state-filter',
                    dataset: { newtabFilterSelect: true },
                    hidden: true,
                    'aria-label': newTabText(language, 'showOnlyFilter'),
                }),
                el('form', { class: 'jpdb-reader-newtab-search', dataset: { newtabSearch: true }, role: 'search', hidden: true },
                    el('div', { class: 'jpdb-reader-newtab-searchbox' },
                        el('input', {
                            type: 'search',
                            dataset: { newtabSearchInput: true },
                            placeholder: newTabText(language, 'searchWordsOrKanji'),
                            autocomplete: 'on',
                            autocapitalize: 'none',
                            autocorrect: 'off',
                            inputmode: 'text',
                            spellcheck: false,
                            enterkeyhint: 'search',
                            lang: 'ja',
                            'aria-label': newTabText(language, 'searchWordsOrKanji'),
                            'aria-autocomplete': 'list',
                            'aria-controls': 'jpdb-reader-newtab-autocomplete',
                            'aria-expanded': 'false',
                        }),
                        el('button', { class: 'jpdb-reader-parseable', type: 'submit', dataset: { newtabAction: newTabAction('search-submit') }, lang: contentLanguage }, uiText(language, 'search')),
                        el('button', {
                            class: 'jpdb-reader-parseable',
                            type: 'button',
                            dataset: { newtabAction: newTabAction('search-handwriting-toggle') },
                            lang: contentLanguage,
                            'aria-controls': 'jpdb-reader-newtab-handwriting',
                            'aria-expanded': 'false',
                            hidden: !usesJapaneseCharacterStudy(),
                            disabled: !usesJapaneseCharacterStudy(),
                        }, newTabText(language, 'draw')),
                        el('button', { class: 'jpdb-reader-parseable', type: 'button', dataset: { newtabAction: newTabAction('search-clear') }, lang: contentLanguage, 'aria-label': newTabText(language, 'clearSearch') }, uiText(language, 'clear')),
                    ),
                    el('div', {
                        id: 'jpdb-reader-newtab-autocomplete',
                        class: 'jpdb-reader-newtab-search-suggestions',
                        dataset: { newtabSearchAutocomplete: true },
                        role: 'listbox',
                        'aria-label': newTabText(language, 'searchSuggestions'),
                    }),
                    el('div', { class: 'jpdb-reader-newtab-search-results', dataset: { newtabSearchResults: true }, 'aria-live': 'polite' }),
                ),
            ),
            el('nav', { class: 'jpdb-reader-newtab-controls', dataset: { newtabControls: true }, 'aria-label': newTabText(language, 'studyNavigation') },
                el('button', { type: 'button', dataset: { newtabAction: newTabAction('previous') }, 'aria-label': newTabText(language, 'previousWord') }, newTabText(language, 'previousWord')),
                el('button', { type: 'button', dataset: { newtabAction: newTabAction('reveal') } }, uiText(language, 'reveal')),
                el('button', { type: 'button', dataset: { newtabAction: newTabAction('next') }, 'aria-label': newTabText(language, 'nextWord') }, newTabText(language, 'nextWord')),
            ),
            options.appNavigation,
            el('aside', { class: 'jpdb-reader-newtab-support-banner', dataset: { newtabSupportBanner: true }, hidden: true, 'aria-label': newTabText(language, 'supportBannerLabel') }),
        ),
    );
}
