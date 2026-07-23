import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { academyText } from '../../reader/app/academy-copy';
import { ACADEMY_ASSETS } from '../assets';
import type { StoryVoicePlayback } from '../audio/voice-lines';
import { RIE_INTRODUCTION_LINE } from '../content/opening-rie-introduction';
import { copyButton, element, screenFrame } from './dom';
import { createAcademyVnStage, type AcademyVnCastMember } from './vn-stage';

export { renderAakashMeetScreen } from './aakash-directions-scene';

export interface RieIntroductionScreenOptions {
    readonly language: AcademyLanguage;
    readonly voice?: StoryVoicePlayback;
    readonly replay?: boolean;
    readonly onComplete: () => void | Promise<void>;
}

export function renderRieUnlockScreen(options: RieIntroductionScreenOptions): HTMLElement {
    const { language, voice, replay = false } = options;
    const stage = createAcademyVnStage({
        label: academyText(language, replay ? 'rieIntroductionMemoryLabel' : 'rieIntroductionStageLabel'),
        uiLanguage: language,
        ...(voice ? { voice } : {}),
    });
    stage.element.classList.add('academy-rie-introduction-screen');
    stage.element.dataset.academyScreen = replay ? 'rie-introduction-memory' : 'rie-introduction';
    stage.element.dataset.academyRoute = replay ? 'journal' : 'rie-unlock';
    stage.element.dataset.introductionReplay = String(replay);
    stage.setDirection({
        plate: {
            id: 'classroom-rie-introduction',
            wide: ACADEMY_ASSETS.locations.classroom.wide,
            mobile: ACADEMY_ASSETS.locations.classroom.mobile,
            label: academyText(language, replay ? 'rieIntroductionMemoryLabel' : 'rieIntroductionStageLabel'),
        },
        transition: 'dissolve',
        focus: { x: 54, y: 46 },
    });
    stage.setCast([rieIntroductionCast(language)]);
    stage.setLine({
        id: RIE_INTRODUCTION_LINE.id,
        speakerId: RIE_INTRODUCTION_LINE.speakerId,
        speakerName: language === 'ja' ? 'りえ先生' : 'Rie-sensei',
        japanese: RIE_INTRODUCTION_LINE.japanese,
        reading: {
            visible: false,
            showLabel: academyText(language, 'readingShow'),
            hideLabel: academyText(language, 'readingHide'),
        },
        translation: RIE_INTRODUCTION_LINE.english,
        translationEarned: true,
        translationVisible: language === 'en',
        voice: { band: RIE_INTRODUCTION_LINE.band },
        sfx: ['vn.advance'],
    });
    stage.setAction(rieIntroductionAction(stage.element, options));
    return stage.element;
}

function rieIntroductionCast(language: AcademyLanguage): AcademyVnCastMember {
    return {
        characterId: 'rie',
        displayName: language === 'ja' ? 'りえ先生' : 'Rie-sensei',
        alt: language === 'ja' ? '教室で迎えるりえ先生' : 'Rie-sensei welcoming you into the classroom',
        position: 'center',
        expression: 'encouraging',
        expressions: {
            neutral: { still: ACADEMY_ASSETS.characters.approvedPerformances.rie.neutral },
            encouraging: { still: ACADEMY_ASSETS.characters.approvedPerformances.rie.encouraging },
        },
    };
}

function rieIntroductionAction(
    screen: HTMLElement,
    options: RieIntroductionScreenOptions,
): { element: HTMLElement; dispose: () => void } {
    const { language, voice, replay = false } = options;
    const action = element('div', 'academy-rie-introduction-action');
    const status = element('p', 'academy-rie-introduction-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'academy-vn-primary-action academy-rie-introduction-primary';
    let heard = !voice;
    let completing = false;
    const continueKey = replay ? 'rieIntroductionReturn' : 'rieIntroductionContinue';
    const sync = (): void => {
        button.textContent = academyText(language, heard ? continueKey : 'rieIntroductionListen');
        button.setAttribute('aria-label', button.textContent);
        screen.dataset.voiceHeard = String(heard);
    };
    const release = voice?.onStatus(snapshot => {
        if (snapshot.status === 'playing') {
            status.textContent = academyText(language, 'rieIntroductionListening');
            button.disabled = true;
        } else if (snapshot.status === 'ended') {
            heard = true;
            status.textContent = academyText(language, 'rieIntroductionHeard');
            button.disabled = false;
            sync();
            button.focus();
        } else if (snapshot.status === 'muted' || snapshot.status === 'unavailable' || snapshot.status === 'error') {
            heard = true;
            status.textContent = academyText(language, 'rieIntroductionAudioUnavailable');
            button.disabled = false;
            sync();
        }
    });
    button.addEventListener('click', async () => {
        if (completing) return;
        if (!heard && voice) {
            button.disabled = true;
            status.textContent = academyText(language, 'rieIntroductionListening');
            const started = await voice.play();
            if (!started && voice.snapshot.status !== 'playing') {
                heard = true;
                status.textContent = academyText(language, 'rieIntroductionAudioUnavailable');
                button.disabled = false;
                sync();
            }
            return;
        }
        completing = true;
        button.disabled = true;
        try {
            await options.onComplete();
        } catch {
            completing = false;
            button.disabled = false;
            status.textContent = academyText(language, 'rieIntroductionSaveFailed');
            button.focus();
        }
    });
    sync();
    action.append(status, button);
    return { element: action, dispose: () => release?.() };
}

export function renderAakashMemory(language: AcademyLanguage, onReturn: () => void): HTMLElement {
    const { screen, content } = screenFrame({
        language,
        className: 'academy-aakash-memory-screen',
        plate: 'rainyDirections',
        eyebrow: 'aakashMeetEyebrow',
        title: 'aakashMemoryTitle',
        body: 'aakashMemoryBody',
    });
    const cast = screen.querySelector<HTMLImageElement>('.academy-background img');
    if (cast) {
        cast.dataset.character = 'aakash';
        cast.dataset.cast = 'rie aakash';
    }
    const line = element('blockquote', 'academy-memory-line academy-memory-line-japanese');
    line.lang = 'ja';
    line.dataset.yomuRuntimeSurface = 'aakash-memory-line';
    line.textContent = 'この道をまっすぐ行って、右です。';
    const close = copyButton(language, 'aakashMemoryReturn', 'academy-button academy-button-primary');
    close.addEventListener('click', onReturn);
    content.append(line, close);
    return screen;
}
