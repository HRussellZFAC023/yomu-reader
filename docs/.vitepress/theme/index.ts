import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import './custom.css';

function syncLandmarks() {
    const content = document.querySelector<HTMLElement>('#VPContent');
    if (!content) return;
    if (content.querySelector('main')) {
        content.removeAttribute('role');
        return;
    }
    content.setAttribute('role', 'main');
}

export default {
    ...DefaultTheme,
    enhanceApp(ctx) {
        DefaultTheme.enhanceApp?.(ctx);
        if (typeof window === 'undefined') return;
        window.requestAnimationFrame(syncLandmarks);
        window.addEventListener('hashchange', () => window.requestAnimationFrame(syncLandmarks));
    },
} satisfies Theme;
