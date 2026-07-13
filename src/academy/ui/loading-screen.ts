import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { screenFrame } from './dom';

export function renderLoadingScreen(language: AcademyLanguage, _online: boolean): HTMLElement {
    const { screen } = screenFrame({
        language,
        className: 'academy-loading-screen',
        plate: 'entrance',
        title: 'loading',
    });
    return screen;
}
