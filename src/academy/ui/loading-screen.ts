import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { copyElement, screenFrame } from './dom';

export function renderLoadingScreen(language: AcademyLanguage, online: boolean): HTMLElement {
    const { screen, content } = screenFrame({
        language,
        className: 'academy-loading-screen',
        plate: 'entrance',
        title: 'loading',
    });
    content.append(copyElement('p', 'academy-lede', language, online ? 'onlineNow' : 'offlineNow'));
    return screen;
}
