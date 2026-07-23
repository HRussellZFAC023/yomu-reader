import type { AcademyLanguage } from '../../reader/app/academy-copy';
import type { StoryCursor, StoryMoment } from '../content/story-runner';
import type { LearnerProfileSnapshot } from '../domain/learner-record';
import type { AcademySemanticSfxCue } from '../audio/sfx-catalog';
import type { AcademyVnSlotContent } from './vn-stage';

interface BlankAtlasScenePropOptions {
    readonly language: AcademyLanguage;
    readonly moment: StoryMoment;
    readonly cursor: StoryCursor;
    readonly learner?: Pick<LearnerProfileSnapshot, 'displayName'>;
    readonly onSfx?: (cue: AcademySemanticSfxCue) => void;
}

const VOWELS = ['あ', 'い', 'う', 'え', 'お'] as const;

/** Living-paper props for the eleven Chapter 1 scenes. */
export function blankAtlasSceneProp(options: BlankAtlasScenePropOptions): AcademyVnSlotContent | null {
    if (!options.moment.scene.id.startsWith('scene:blank-atlas:')) return null;
    const nodeId = options.moment.kind === 'complete' ? 'complete' : options.moment.node.id;
    const sceneId = options.moment.scene.id;
    const root = section('academy-blank-atlas-prop');
    root.dataset.sceneSignature = sceneSignature(sceneId);
    root.dataset.sceneId = sceneId;

    switch (sceneId) {
        case 'scene:blank-atlas:arrival-greetings':
            root.append(atlasProp(nodeId === 'node:blank-atlas:first-uncover'));
            break;
        case 'scene:blank-atlas:sound-script-map':
            root.append(vowelRouteProp(nodeId));
            break;
        case 'scene:blank-atlas:classroom-survival':
            root.append(classroomHandoutProp(nodeId === 'node:blank-atlas:handout-flower'));
            break;
        case 'scene:blank-atlas:sentence-frames':
            root.append(sentenceDoorProp(nodeId === 'node:blank-atlas:label-fixed'));
            break;
        case 'scene:blank-atlas:useful-vocabulary':
            root.append(nameCardProp(options.learner?.displayName ?? (options.language === 'ja' ? 'あなた' : 'Your name')));
            break;
        case 'scene:blank-atlas:mission-sound':
            root.append(soundMissionProp(nodeId));
            break;
        case 'scene:blank-atlas:mission-text':
            root.append(textMissionProp(options.language, options.onSfx));
            break;
        case 'scene:blank-atlas:mission-speaking':
            root.append(speakingDoorProp(options.language, options.onSfx));
            break;
        case 'scene:blank-atlas:reading-writing':
            root.append(publicCardProp(options.language, nodeId, options.learner?.displayName, options.onSfx));
            break;
        case 'scene:blank-atlas:transfer':
            root.append(lanternRouteProp(nodeId === 'node:blank-atlas:first-lantern'));
            break;
        case 'scene:blank-atlas:close':
            root.append(routeArrowProp(options.language));
            break;
        default:
            return null;
    }
    return { element: root };
}

function atlasProp(uncovered: boolean): HTMLElement {
    const prop = section('academy-atlas-prop');
    prop.dataset.uncovered = String(uncovered);
    prop.setAttribute('aria-label', uncovered ? 'The blank Lantern Atlas is uncovered.' : 'A covered atlas waits on the table.');
    const frame = section('academy-atlas-frame');
    frame.append(text('span', 'academy-atlas-title', 'LANTERN ATLAS'), text('span', 'academy-atlas-empty-route', ''));
    const cloth = text('span', 'academy-atlas-cloth', '');
    cloth.setAttribute('aria-hidden', 'true');
    prop.append(frame, cloth);
    return prop;
}

function vowelRouteProp(nodeId: string): HTMLElement {
    const written = nodeId === 'node:blank-atlas:first-line';
    const prop = section('academy-vowel-route-prop');
    prop.dataset.routeComplete = String(written);
    prop.setAttribute('aria-label', written ? 'Five vowel marks now form the first route.' : 'Five empty sound places wait in a row.');
    const route = section('academy-vowel-route-line');
    VOWELS.forEach((vowel, index) => {
        const mark = text('span', 'academy-vowel-route-mark', written ? vowel : String(index + 1));
        mark.lang = written ? 'ja' : 'en';
        route.append(mark);
    });
    prop.append(text('p', 'academy-prop-label', written ? 'あ い う え お' : 'Five sounds. One route.'), route);
    return prop;
}

function classroomHandoutProp(flowerEarned: boolean): HTMLElement {
    const prop = section('academy-classroom-handout-prop');
    prop.dataset.flowerEarned = String(flowerEarned);
    prop.setAttribute('aria-label', flowerEarned ? 'The classroom handout has earned a flower mark.' : 'A classroom action handout is open.');
    prop.append(
        text('p', 'academy-prop-label', 'IN CLASS'),
        actionSlip('みて', 'look'),
        actionSlip('きいて', 'listen'),
        actionSlip('かいて', 'write'),
    );
    if (flowerEarned) prop.append(text('span', 'academy-paper-flower', '')); 
    return prop;
}

function sentenceDoorProp(resolved: boolean): HTMLElement {
    const prop = section('academy-sentence-door-prop');
    prop.dataset.resolved = String(resolved);
    prop.setAttribute('aria-label', resolved ? 'The supported classroom label has a clear door frame.' : 'Two possible room labels wait for evidence.');
    prop.append(
        sentenceLabel('ここは 教室です。', 'This is the classroom.', resolved),
        sentenceLabel('ここは 図書室です。', 'This is the library.', false),
    );
    return prop;
}

function nameCardProp(displayName: string): HTMLElement {
    const prop = section('academy-name-card-prop');
    prop.setAttribute('aria-label', `Class name card for ${displayName}.`);
    prop.append(
        text('span', 'academy-name-card-pin', ''),
        text('p', 'academy-prop-label', 'CLASS NAME'),
        text('strong', 'academy-name-card-name', displayName),
        text('span', 'academy-name-card-desu', 'です。'),
    );
    return prop;
}

function soundMissionProp(nodeId: string): HTMLElement {
    const resolved = nodeId === 'line:blank-atlas:mika-sound-result'
        || nodeId === 'node:blank-atlas:sound-memento'
        || nodeId === 'complete';
    const prop = section('academy-sound-mission-prop');
    prop.dataset.resolved = String(resolved);
    prop.setAttribute('aria-label', resolved ? 'The two voices are matched to Xingyu and Mika.' : 'Two voices wait for their name labels.');
    prop.append(
        soundNameplate('Xingyu', resolved),
        text('span', 'academy-sound-wave', ''),
        soundNameplate('Mika', resolved),
    );
    return prop;
}

function textMissionProp(language: AcademyLanguage, onSfx?: (cue: AcademySemanticSfxCue) => void): HTMLElement {
    const prop = section('academy-text-mission-prop');
    prop.dataset.inspected = 'false';
    const note = section('academy-folded-note');
    note.append(
        text('p', 'academy-prop-label', 'Sophie / Ruparna'),
        text('p', 'academy-note-line', 'ソフィー ___ 学生です。'),
        text('p', 'academy-note-line', 'これは ___ 本です。'),
        text('p', 'academy-note-margin', ''),
    );
    const inspect = button(language === 'ja' ? '端を見る' : 'Inspect the margin', 'academy-note-inspect');
    inspect.setAttribute('aria-pressed', 'false');
    inspect.addEventListener('click', () => {
        onSfx?.('vn.choice.confirm');
        prop.dataset.inspected = 'true';
        inspect.setAttribute('aria-pressed', 'true');
        inspect.textContent = language === 'ja' ? '名前と本' : 'Names and a book';
    });
    prop.append(note, inspect);
    return prop;
}

function speakingDoorProp(language: AcademyLanguage, onSfx?: (cue: AcademySemanticSfxCue) => void): HTMLElement {
    const prop = section('academy-speaking-door-prop');
    prop.dataset.open = 'false';
    const door = section('academy-classroom-door');
    door.append(text('span', 'academy-door-window', ''));
    const names = section('academy-door-nameplates');
    names.hidden = true;
    names.append(text('span', '', 'Aakash'), text('span', '', 'Sam'));
    const open = button(language === 'ja' ? 'ドアを開ける' : 'Open the door', 'academy-door-open');
    open.setAttribute('aria-expanded', 'false');
    open.addEventListener('click', () => {
        onSfx?.('vn.choice.confirm');
        prop.dataset.open = 'true';
        names.hidden = false;
        open.setAttribute('aria-expanded', 'true');
        open.textContent = language === 'ja' ? 'どうぞ' : 'Come in';
    });
    prop.append(door, names, open);
    return prop;
}

function publicCardProp(
    language: AcademyLanguage,
    nodeId: string,
    displayName?: string,
    onSfx?: (cue: AcademySemanticSfxCue) => void,
): HTMLElement {
    const prop = section('academy-public-card-prop');
    const readyToTurn = nodeId === 'node:blank-atlas:card-turns-over';
    prop.dataset.face = 'down';
    const face = section('academy-public-card-face');
    const renderFace = (): void => {
        const publicSide = prop.dataset.face === 'public';
        face.replaceChildren(
            text('p', 'academy-prop-label', publicSide ? 'CLASS LINE' : 'YOUR CARD'),
            text('strong', 'academy-public-card-line', publicSide ? `${displayName ?? 'Your name'} です。` : ''),
        );
    };
    renderFace();
    if (!readyToTurn) {
        prop.append(face);
        return prop;
    }
    const flip = button(language === 'ja' ? 'カードを返す' : 'Turn the card', 'academy-card-flip');
    flip.addEventListener('click', () => {
        onSfx?.('vn.choice.confirm');
        prop.dataset.face = 'public';
        renderFace();
        flip.remove();
    });
    prop.append(face, flip);
    return prop;
}

function lanternRouteProp(lit: boolean): HTMLElement {
    const prop = section('academy-lantern-route-prop');
    prop.dataset.firstLantern = String(lit);
    prop.setAttribute('aria-label', lit ? 'One earned lantern is lit; the other routes remain blank.' : 'A blank route waits for the transfer.');
    const route = section('academy-lantern-route');
    for (let index = 0; index < 5; index += 1) {
        const lantern = text('span', 'academy-route-lantern', '');
        lantern.dataset.lit = String(lit && index === 0);
        route.append(lantern);
    }
    prop.append(route);
    return prop;
}

function routeArrowProp(language: AcademyLanguage): HTMLElement {
    const prop = section('academy-route-arrow-prop');
    prop.setAttribute('aria-label', 'The entrance arrow now points back to your saved route.');
    prop.append(
        text('span', 'academy-route-arrow-mark', '->'),
        text('strong', 'academy-route-arrow-label', language === 'ja' ? 'つづきから' : 'Your route'),
    );
    return prop;
}

function actionSlip(japanese: string, english: string): HTMLElement {
    const slip = section('academy-action-slip');
    slip.append(text('strong', '', japanese), text('span', '', english));
    return slip;
}

function sentenceLabel(japanese: string, english: string, supported: boolean): HTMLElement {
    const label = section('academy-sentence-label');
    label.dataset.supported = String(supported);
    label.append(text('strong', '', japanese), text('span', '', english));
    return label;
}

function soundNameplate(name: string, resolved: boolean): HTMLElement {
    const plate = section('academy-sound-nameplate');
    plate.dataset.resolved = String(resolved);
    plate.append(text('span', '', resolved ? name : '?'));
    return plate;
}

function sceneSignature(sceneId: string): string {
    const order = [
        'arrival-greetings', 'sound-script-map', 'classroom-survival', 'sentence-frames',
        'useful-vocabulary', 'mission-sound', 'mission-text', 'mission-speaking',
        'reading-writing', 'transfer', 'close',
    ];
    const suffix = sceneId.replace('scene:blank-atlas:', '');
    const index = order.indexOf(suffix);
    return index < 0 ? 'U000' : `U${String(index + 1).padStart(3, '0')}`;
}

function section(className: string): HTMLElement {
    const value = document.createElement('section');
    value.className = className;
    return value;
}

function text<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, value: string): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value;
    return element;
}

function button(label: string, className: string): HTMLButtonElement {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = className;
    control.textContent = label;
    return control;
}
