import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { academyText } from '../../reader/app/academy-copy';
import { createDonationClaimService, type DonationClaimService } from '../access/donation-claim';
import { createDonationCheckoutService, type DonationCheckoutService } from '../access/donation-checkout';
import { copyButton, copyElement, element, fieldError, screenFrame, setBusy, setCopy } from './dom';
import { createDonationDialog } from './donation-dialog';

export interface AccessScreenOptions {
    readonly language: AcademyLanguage;
    readonly onSubmit: (code: string) => Promise<void>;
    readonly checkout?: DonationCheckoutService;
    readonly claim?: DonationClaimService;
    readonly copyText?: (text: string) => Promise<void>;
}

export function renderAccessScreen(options: AccessScreenOptions): HTMLElement {
    const lifecycle = new AbortController();
    const { screen, content } = screenFrame({
        language: options.language,
        className: 'academy-access-screen',
        plate: 'home',
        title: 'academyName',
        body: 'accessBody',
    });
    const form = element('form', 'academy-form academy-access-form');
    const label = copyElement('label', 'academy-label', options.language, 'accessCodeLabel');
    const input = element('input', 'academy-input');
    input.name = 'code';
    input.autocomplete = 'one-time-code';
    input.inputMode = 'text';
    input.maxLength = 64;
    input.required = true;
    input.setAttribute('aria-label', academyText(options.language, 'accessCodeLabel'));
    input.placeholder = academyText(options.language, 'accessCodePlaceholder');
    label.append(input);
    const submit = copyButton(options.language, 'accessSubmit', 'academy-button academy-button-primary');
    submit.type = 'submit';
    const getCode = copyButton(options.language, 'accessGetCode', 'academy-button academy-button-secondary academy-get-code');
    const feedback = element('div', 'academy-form-feedback');
    const claimNote = element('section', 'academy-donation-claim');
    claimNote.hidden = true;
    claimNote.setAttribute('aria-live', 'polite');
    claimNote.setAttribute('aria-atomic', 'true');
    const claimStatus = element('p', 'academy-donation-claim-status');
    claimStatus.setAttribute('role', 'status');
    const claimActions = element('div', 'academy-donation-claim-actions');
    const copyCode = copyButton(options.language, 'donationClaimCopy', 'academy-button academy-button-secondary academy-donation-claim-copy');
    const retryClaim = copyButton(options.language, 'donationClaimRetry', 'academy-button academy-button-secondary academy-donation-claim-retry');
    copyCode.hidden = true;
    retryClaim.hidden = true;
    claimActions.append(copyCode, retryClaim);
    claimNote.append(claimStatus, claimActions);
    const actions = element('div', 'academy-access-actions');
    actions.append(submit, getCode);
    form.append(label, actions, feedback);
    form.addEventListener('submit', event => {
        event.preventDefault();
        feedback.replaceChildren();
        setBusy(submit, true, academyText(options.language, 'accessChecking'));
        void options.onSubmit(input.value).catch(error => {
            const unavailable = error instanceof Error && 'code' in error && error.code === 'unavailable';
            feedback.replaceChildren(fieldError(academyText(options.language, unavailable ? 'accessUnavailable' : 'accessInvalid')));
            submit.disabled = false;
            submit.removeAttribute('aria-busy');
            setCopy(submit, options.language, 'accessSubmit');
            input.focus();
        });
    });
    const donation = createDonationDialog(options.language, options.checkout ?? createDonationCheckoutService());
    getCode.addEventListener('click', () => donation.open(getCode));
    content.append(claimNote, form);
    screen.append(donation.element);
    screen.addEventListener('academy:dispose', () => {
        lifecycle.abort();
        donation.dispose();
    }, { once: true });

    const claim = options.claim ?? createDonationClaimService();
    const returned = claim.consumeReturn();
    let paidCode = '';
    let claimRunning = false;
    const showClaimStatus = (key: 'donationClaimChecking' | 'donationClaimPending' | 'donationClaimUnavailable') => {
        claimNote.hidden = false;
        claimNote.dataset.status = key;
        claimStatus.textContent = academyText(options.language, key);
        claimStatus.lang = options.language;
    };
    const runClaim = async () => {
        if (!returned || claimRunning || lifecycle.signal.aborted) return;
        claimRunning = true;
        copyCode.hidden = true;
        retryClaim.hidden = true;
        showClaimStatus('donationClaimChecking');
        try {
            const result = await claim.claim(returned.sessionId, lifecycle.signal);
            if (lifecycle.signal.aborted) return;
            if (result.status === 'paid') {
                paidCode = result.code;
                input.value = result.code;
                claimNote.dataset.status = 'paid';
                claimStatus.textContent = academyText(options.language, 'donationClaimReady');
                copyCode.hidden = false;
                submit.focus({ preventScroll: true });
                return;
            }
            showClaimStatus(result.status === 'pending' ? 'donationClaimPending' : 'donationClaimUnavailable');
            retryClaim.hidden = false;
        } catch {
            if (lifecycle.signal.aborted) return;
            showClaimStatus('donationClaimUnavailable');
            retryClaim.hidden = false;
        } finally {
            claimRunning = false;
        }
    };
    retryClaim.addEventListener('click', () => void runClaim(), { signal: lifecycle.signal });
    copyCode.addEventListener('click', () => {
        if (!paidCode) return;
        const copy = options.copyText ?? (async (text: string) => {
            if (!navigator.clipboard) throw new Error('Clipboard is unavailable.');
            await navigator.clipboard.writeText(text);
        });
        void Promise.resolve().then(() => copy(paidCode)).then(() => {
            if (!lifecycle.signal.aborted) setCopy(copyCode, options.language, 'donationClaimCopied');
        }).catch(() => {
            input.focus();
            input.select();
        });
    }, { signal: lifecycle.signal });
    if (returned) void runClaim();
    return screen;
}
