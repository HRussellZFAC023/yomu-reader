import { ANKI_CONNECT_ADDON_URL } from '../app/constants';
import { escapeHtml } from '../dom/index';
import type { ReaderSettings } from '../app/types';
import { externalLinkIcon } from '../ui/icons';
import { WANIKANI_TOKEN_SETTINGS_URL } from '../wanikani/wanikani';
import { renderDeckControls } from './anki-mining-panel';
import {
    effectiveJitenApiKey,
    effectiveJpdbApiKey,
    hasBunproFrontendCredential,
    hasJitenApiCredential,
    hasJpdbApiCredential,
    hasWanikaniApiCredential,
    isBunproFrontendCredentialExpired,
    redactedApiCredentialsFromForm,
    type ApiCredentialSettings,
} from './api-credential';
import { checkbox, protectedCredentialInput, select } from './form-controls';
import type { SettingsText } from './settings-text';
import { renderBunproStatusLine, renderJpdbStatusLine, renderWanikaniStatusLine } from './status-lines';

/**
 * Settings → Reviews: one row per review service, so connecting one is
 * obvious. A row shows a status dot, the key field with a Connect link to the
 * service's key page, icons for what the service adds, and the service's own
 * "Grade from よむ" switch. The preferred grading service appears only when two
 * grading services can both take grades, the only time it decides anything.
 *
 * Anki has no key: its Connect link opens the AnkiConnect add-on, and in Study
 * one AnkiConnect ping (never on an ordinary page) marks it ready to connect, at
 * which point Connect turns on Anki in Mining.
 */
export type ReviewServiceId = 'yomu' | 'jpdb' | 'jiten' | 'anki' | 'wanikani' | 'bunpro';
export type ReviewServiceState = 'on' | 'off' | 'available' | 'error';
type ReviewServiceFeature = 'grades' | 'colors' | 'decks' | 'pitch';
type GradeSwitch = 'jpdbMiningEnabled' | 'jitenMiningEnabled' | 'wanikaniReviewEnabled' | 'bunproMiningEnabled';
type TextKey = Parameters<SettingsText>[0];

interface ReviewService {
    readonly id: ReviewServiceId;
    /** A brand name; the よむ deck takes its localized name instead. */
    readonly brand?: string;
    readonly adds: readonly ReviewServiceFeature[];
    readonly credential?: { readonly name: string; readonly label: 'reviewServiceKey' | 'reviewServiceToken' };
    readonly gradeSwitch?: GradeSwitch | 'yomuLocalSrsEnabled';
}

const REVIEW_SERVICES: readonly ReviewService[] = [
    { id: 'yomu', adds: ['grades', 'colors', 'decks'], gradeSwitch: 'yomuLocalSrsEnabled' },
    { id: 'jpdb', brand: 'JPDB', adds: ['grades', 'colors', 'decks', 'pitch'], credential: { name: 'apiCredentialJpdb', label: 'reviewServiceKey' }, gradeSwitch: 'jpdbMiningEnabled' },
    { id: 'jiten', brand: 'Jiten', adds: ['grades', 'colors', 'decks', 'pitch'], credential: { name: 'apiCredentialJiten', label: 'reviewServiceKey' }, gradeSwitch: 'jitenMiningEnabled' },
    { id: 'anki', brand: 'Anki', adds: ['grades', 'colors', 'decks'] },
    { id: 'wanikani', brand: 'WaniKani', adds: ['grades'], credential: { name: 'apiCredentialWanikani', label: 'reviewServiceToken' }, gradeSwitch: 'wanikaniReviewEnabled' },
    { id: 'bunpro', brand: 'Bunpro', adds: ['grades', 'colors', 'decks'], credential: { name: 'apiCredentialBunpro', label: 'reviewServiceToken' }, gradeSwitch: 'bunproMiningEnabled' },
];

const FEATURE_TEXT: Readonly<Record<ReviewServiceFeature, TextKey>> = {
    grades: 'reviewServiceAddsGrades',
    colors: 'reviewServiceAddsColors',
    decks: 'reviewServiceAddsDecks',
    pitch: 'reviewServiceAddsPitch',
};

// 16-unit stroke shapes in the menu icon style: a tick, an underlined letter,
// a stack of cards and a pitch contour.
const FEATURE_ICON_SHAPES: Readonly<Record<ReviewServiceFeature, string>> = {
    grades: '<path d="m3 8.5 3 3 7-7"/>',
    colors: '<path d="M5 10.5 8 3l3 7.5"/><path d="M6.2 7.5h3.6"/><path d="M3 13.5h10"/>',
    decks: '<rect x="2.5" y="5.5" width="9" height="8" rx="1.5"/><path d="M5 3h7.5a1 1 0 0 1 1 1v7"/>',
    pitch: '<path d="M2 5h4l4 6h4"/><circle cx="2" cy="5" r=".75"/><circle cx="14" cy="11" r=".75"/>',
};

const BUNPRO_TOKEN_URL = 'https://bunpro.jp/settings/api';

export interface ReviewServiceFacts {
    readonly credentials: ApiCredentialSettings;
    readonly enabled: Readonly<Partial<Record<GradeSwitch | 'yomuLocalSrsEnabled' | 'ankiEnabled', boolean>>>;
    /** Study's one AnkiConnect ping answered. */
    readonly ankiAvailable: boolean;
}

export function reviewServiceState(id: ReviewServiceId, facts: ReviewServiceFacts): ReviewServiceState {
    const { credentials, enabled } = facts;
    if (id === 'yomu') return enabled.yomuLocalSrsEnabled ? 'on' : 'off';
    if (id === 'anki') return enabled.ankiEnabled ? 'on' : facts.ankiAvailable ? 'available' : 'off';
    if (id === 'jpdb') return hasJpdbApiCredential(credentials) ? 'on' : 'off';
    if (id === 'jiten') return hasJitenApiCredential(credentials) ? 'on' : 'off';
    if (id === 'wanikani') return hasWanikaniApiCredential(credentials) ? 'on' : 'off';
    if (!hasBunproFrontendCredential(credentials)) return 'off';
    return isBunproFrontendCredentialExpired(credentials) ? 'error' : 'on';
}

/** Two grading services connected, both grading from よむ: only then does a preference decide anything. */
export function showsPreferredGradingService(facts: ReviewServiceFacts): boolean {
    return reviewServiceState('jpdb', facts) === 'on' && reviewServiceState('jiten', facts) === 'on'
        && facts.enabled.jpdbMiningEnabled !== false && facts.enabled.jitenMiningEnabled !== false;
}

function settingsFacts(settings: ReaderSettings): ReviewServiceFacts {
    return { credentials: settings, enabled: settings, ankiAvailable: false };
}

export function renderReviewServicesPanel(
    settings: ReaderSettings,
    urls: { jpdb: string; jiten: string },
    text: SettingsText,
    trailing: string,
): string {
    const facts = settingsFacts(settings);
    const rows = REVIEW_SERVICES.map(service => renderServiceRow(service, settings, facts, urls, text)).join('');
    return `
            <fieldset id="jpdb-reader-settings-panel-api" role="tabpanel" data-settings-panel="api" data-legend-key="reviews" hidden>
                <legend>${escapeHtml(text('reviews'))}</legend>
                <div class="jpdb-reader-review-services" data-review-services>${rows}</div>
                <div class="jpdb-reader-settings-subsection">
                    <div class="grid">
                        ${checkbox('enableReviews', escapeHtml(text('enableReviews')), settings.enableReviews)}
                        <div data-review-config ${settings.enableReviews ? '' : 'hidden'}>
                            ${select('twoButtonReviews', escapeHtml(text('reviewRatingScale')), settings.twoButtonReviews ? 'true' : 'false', [['false', text('fivePoint')], ['true', text('twoPoint')]])}
                        </div>
                        <div data-preferred-grading-service ${showsPreferredGradingService(facts) ? '' : 'hidden'}>
                            ${select('apiGradingProvider', escapeHtml(text('apiGradingProvider')), settings.apiGradingProvider === 'jpdb' ? 'jpdb' : 'jiten', [['jiten', 'Jiten'], ['jpdb', 'JPDB']])}
                            <div class="jpdb-reader-help" data-grading-provider-help>${escapeHtml(text('apiGradingProviderHelp'))}</div>
                        </div>
                    </div>
                </div>
                ${trailing}
            </fieldset>`;
}

function renderServiceRow(
    service: ReviewService,
    settings: ReaderSettings,
    facts: ReviewServiceFacts,
    urls: { jpdb: string; jiten: string },
    text: SettingsText,
): string {
    const state = reviewServiceState(service.id, facts);
    const nameId = `jpdb-reader-review-service-${service.id}`;
    const adds = service.adds.map(feature => {
        const label = escapeHtml(text(FEATURE_TEXT[feature]));
        return `<span class="jpdb-reader-review-service-adds-icon" role="img" data-review-service-feature="${feature}" aria-label="${label}" title="${label}">${featureIcon(feature)}</span>`;
    }).join('');
    const dotLabel = escapeHtml(text(stateTextKey(service.id, state)));
    const connectUrl = serviceConnectUrl(service.id, urls);
    const connect = connectUrl
        ? `<a class="jpdb-reader-btn jpdb-reader-review-service-connect" href="${escapeHtml(connectUrl)}" target="_blank" rel="noopener" data-review-service-connect${state === 'off' || state === 'error' ? '' : ' hidden'}><span data-review-service-text="reviewServiceConnect">${escapeHtml(text('reviewServiceConnect'))}</span>${externalLinkIcon()}</a>`
        : '';
    const enableAnki = service.id === 'anki'
        ? `<button class="jpdb-reader-btn jpdb-reader-review-service-connect" type="button" data-review-service-enable="anki"${state === 'available' ? '' : ' hidden'}><span data-review-service-text="reviewServiceConnect">${escapeHtml(text('reviewServiceConnect'))}</span></button>`
        : '';
    return `
                    <div class="jpdb-reader-review-service" role="group" aria-labelledby="${nameId}" data-review-service="${service.id}" data-service-state="${state}">
                        <div class="jpdb-reader-review-service-head">
                            <span class="jpdb-reader-review-service-dot" role="img" data-review-service-dot aria-label="${dotLabel}" title="${dotLabel}"></span>
                            <span class="jpdb-reader-review-service-name" id="${nameId}"${service.brand ? '' : ' data-review-service-text="yomuDeck"'}>${escapeHtml(service.brand ?? text('yomuDeck'))}</span>
                            <span class="jpdb-reader-review-service-adds">${adds}</span>
                            ${connect}${enableAnki}${service.credential ? '' : renderGradeSwitch(service, settings, text)}
                        </div>
                        ${renderServiceBody(service, settings, text)}
                    </div>`;
}

function renderServiceBody(service: ReviewService, settings: ReaderSettings, text: SettingsText): string {
    const language = settings.interfaceLanguage;
    const credential = service.credential
        ? protectedCredentialInput(service.credential.name, escapeHtml(credentialLabel(service, text)), storedCredential(service.id, settings), language)
        : '';
    // A row with no key keeps its switch on the head line, so the first key
    // field sits near the top of a phone's sheet.
    const gradeSwitch = service.credential ? renderGradeSwitch(service, settings, text) : '';
    const body = `${credential}${gradeSwitch}${serviceExtras(service.id, settings, text)}`;
    return body ? `<div class="jpdb-reader-review-service-body">${body}</div>` : '';
}

function renderGradeSwitch(service: ReviewService, settings: ReaderSettings, text: SettingsText): string {
    return service.gradeSwitch
        ? checkbox(service.gradeSwitch, escapeHtml(switchLabel(service, text)), Boolean(settings[service.gradeSwitch]))
        : '';
}

function serviceExtras(id: ReviewServiceId, settings: ReaderSettings, text: SettingsText): string {
    if (id === 'jpdb') {
        const hasKey = hasJpdbApiCredential(settings);
        return `${checkbox('addToForq', escapeHtml(text('addToForq')), settings.jpdbMiningEnabled && settings.addToForq, { disabled: !settings.jpdbMiningEnabled })}
                            ${renderJpdbStatusLine(settings)}
                            <div data-jpdb-decks${hasKey ? '' : ' hidden'}>${renderDeckControls(settings, [], hasKey, settings.interfaceLanguage)}</div>`;
    }
    if (id === 'wanikani') {
        return `<div class="jpdb-reader-help" data-wanikani-api-key-help>${escapeHtml(text('wanikaniTokenHelp'))}</div>
                            <div class="jpdb-reader-help" data-wanikani-grade-mapping-help>${escapeHtml(text('wanikaniGradeMappingHelp'))}</div>
                            ${renderWanikaniStatusLine(settings)}`;
    }
    if (id === 'bunpro') {
        return `<input type="hidden" name="bunproFrontendApiTokenExpiresAt" value="${escapeHtml(settings.bunproFrontendApiTokenExpiresAt)}">
                            <div class="jpdb-reader-help" data-review-service-text="bunproTokenHelp">${escapeHtml(text('bunproTokenHelp'))}</div>
                            ${renderBunproStatusLine(settings)}`;
    }
    return '';
}

function storedCredential(id: ReviewServiceId, settings: ReaderSettings): string {
    if (id === 'jpdb') return effectiveJpdbApiKey(settings);
    if (id === 'jiten') return effectiveJitenApiKey(settings);
    if (id === 'wanikani') return settings.wanikaniApiToken;
    return settings.bunproFrontendApiToken;
}

function serviceConnectUrl(id: ReviewServiceId, urls: { jpdb: string; jiten: string }): string {
    if (id === 'jpdb') return urls.jpdb;
    if (id === 'jiten') return urls.jiten;
    if (id === 'wanikani') return WANIKANI_TOKEN_SETTINGS_URL;
    if (id === 'bunpro') return BUNPRO_TOKEN_URL;
    return id === 'anki' ? ANKI_CONNECT_ADDON_URL : '';
}

function stateTextKey(id: ReviewServiceId, state: ReviewServiceState): TextKey {
    if (id === 'yomu') return state === 'on' ? 'reviewServiceBuiltIn' : 'reviewServiceDisabled';
    return ({ on: 'reviewServiceOn', off: 'reviewServiceOff', available: 'reviewServiceAvailable', error: 'reviewServiceError' } as const)[state];
}

function credentialLabel(service: ReviewService, text: SettingsText): string {
    return service.credential ? text(service.credential.label).replace('{service}', service.brand ?? '') : '';
}

function switchLabel(service: ReviewService, text: SettingsText): string {
    return service.gradeSwitch === 'yomuLocalSrsEnabled' ? text('yomuLocalSrsEnabled') : text('gradeFromYomu');
}

function featureIcon(feature: ReviewServiceFeature): string {
    return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${FEATURE_ICON_SHAPES[feature]}</svg>`;
}

/** Labels for the named controls the rows own, for the form's language switch. */
export function reviewServiceControlLabels(text: SettingsText): [string, string][] {
    return REVIEW_SERVICES.flatMap(service => [
        ...(service.credential ? [[service.credential.name, credentialLabel(service, text)] as [string, string]] : []),
        ...(service.gradeSwitch ? [[service.gradeSwitch, switchLabel(service, text)] as [string, string]] : []),
    ]);
}

const WATCHED_CONTROLS = new Set([
    'apiCredentialJpdb', 'apiCredentialJiten', 'apiCredentialWanikani', 'apiCredentialBunpro', 'bunproFrontendApiTokenExpiresAt',
    'jpdbMiningEnabled', 'jitenMiningEnabled', 'wanikaniReviewEnabled', 'bunproMiningEnabled', 'yomuLocalSrsEnabled', 'ankiEnabled',
]);

function formFacts(form: HTMLFormElement): ReviewServiceFacts {
    const checked = (name: string): boolean | undefined => form.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.checked;
    return {
        credentials: redactedApiCredentialsFromForm(form),
        enabled: {
            yomuLocalSrsEnabled: checked('yomuLocalSrsEnabled'),
            ankiEnabled: checked('ankiEnabled'),
            jpdbMiningEnabled: checked('jpdbMiningEnabled'),
            jitenMiningEnabled: checked('jitenMiningEnabled'),
            wanikaniReviewEnabled: checked('wanikaniReviewEnabled'),
            bunproMiningEnabled: checked('bunproMiningEnabled'),
        },
        ankiAvailable: form.dataset.ankiAvailable === 'true',
    };
}

/** Repaints every row's dot and Connect action, and the preference, from what the form holds now. */
function syncReviewServices(form: HTMLFormElement, text: SettingsText): void {
    const facts = formFacts(form);
    form.querySelectorAll<HTMLElement>('[data-review-service]').forEach(row => {
        const id = row.dataset.reviewService as ReviewServiceId;
        const state = reviewServiceState(id, facts);
        row.dataset.serviceState = state;
        const dot = row.querySelector<HTMLElement>('[data-review-service-dot]');
        if (dot) setAccessibleName(dot, text(stateTextKey(id, state)));
        const connect = row.querySelector<HTMLElement>('[data-review-service-connect]');
        if (connect) connect.hidden = state === 'on' || state === 'available';
        const enable = row.querySelector<HTMLElement>('[data-review-service-enable]');
        if (enable) enable.hidden = state !== 'available';
    });
    const preferred = form.querySelector<HTMLElement>('[data-preferred-grading-service]');
    if (preferred) preferred.hidden = !showsPreferredGradingService(facts);
    const decks = form.querySelector<HTMLElement>('[data-jpdb-decks]');
    if (decks) decks.hidden = reviewServiceState('jpdb', facts) !== 'on';
}

export function localizeReviewServices(form: HTMLFormElement, text: SettingsText): void {
    form.querySelectorAll<HTMLElement>('[data-review-service-text]').forEach(node => {
        node.textContent = text(node.dataset.reviewServiceText as TextKey);
    });
    form.querySelectorAll<HTMLElement>('[data-review-service-feature]').forEach(icon => {
        setAccessibleName(icon, text(FEATURE_TEXT[icon.dataset.reviewServiceFeature as ReviewServiceFeature]));
    });
    syncReviewServices(form, text);
}

export function bindReviewServices(form: HTMLFormElement, text: () => SettingsText): void {
    const sync = (event: Event): void => {
        const name = (event.target as HTMLInputElement | null)?.name;
        if (name && WATCHED_CONTROLS.has(name.replace(/\.clearStoredCredential$/u, ''))) syncReviewServices(form, text());
    };
    form.addEventListener('input', sync);
    form.addEventListener('change', sync);
    form.querySelector<HTMLButtonElement>('[data-review-service-enable="anki"]')?.addEventListener('click', () => {
        const anki = form.querySelector<HTMLInputElement>('input[name="ankiEnabled"]');
        if (!anki || anki.checked) return;
        anki.checked = true;
        // Mining's own Anki probe and the Save state listen for this.
        anki.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

/** Study's one AnkiConnect ping: a reachable Anki that is not on yet becomes ready to connect. */
export async function markAnkiAvailability(form: HTMLFormElement, ping: () => Promise<boolean>, text: () => SettingsText): Promise<void> {
    if (form.querySelector<HTMLInputElement>('input[name="ankiEnabled"]')?.checked) return;
    const available = await ping().catch(() => false);
    if (!available || !form.isConnected) return;
    form.dataset.ankiAvailable = 'true';
    syncReviewServices(form, text());
}

function setAccessibleName(element: HTMLElement, name: string): void {
    element.setAttribute('aria-label', name);
    element.title = name;
}
