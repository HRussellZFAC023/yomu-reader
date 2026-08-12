import { refreshReaderWordContrast } from '../dom/word-contrast';
import { documentBackgroundLooksDark } from '../dom/page-background';
import {
    applyHostTheme,
    detectHostTheme,
    isHostThemeAuthoritative,
    isThemeSyncHost,
    jitenThemeCookieMatches,
    observeHostTheme,
    type HostTheme,
} from '../theme/host-theme';
import { applyReaderTheme } from '../theme/reader-theme';
import { HOST_THEME_ENFORCE_STEPS, HOST_THEME_ENFORCE_STEP_MS } from './main-runtime-support';
import { isYomuHostedPassivePage } from './pages';
import type { ReaderSettings } from './types';

interface HostThemeControllerOptions {
    getSettings: () => ReaderSettings;
    adoptTheme: (theme: HostTheme) => ReaderSettings;
    publishThemeChange: () => void;
    isDestroyed: () => boolean;
}

/** Synchronizes Reader chrome with the host while keeping host-specific retries private. */
export class HostThemeController {
    private disposeObserver?: () => void;
    private enforceTimer?: number;

    constructor(private readonly options: HostThemeControllerOptions) {}

    sync(settings: ReaderSettings): void {
        if (!isThemeSyncHost()) {
            this.applyAmbient(settings);
            return;
        }
        this.observe();
        window.clearTimeout(this.enforceTimer);
        this.syncHost(settings);
    }

    refreshAmbient(settings: ReaderSettings): void {
        if (!isThemeSyncHost()) this.applyAmbient(settings);
    }

    destroy(): void {
        this.disposeObserver?.();
        window.clearTimeout(this.enforceTimer);
    }

    private observe(): void {
        if (this.disposeObserver) return;
        this.disposeObserver = observeHostTheme(theme => this.handleChange(theme));
    }

    private syncHost(settings: ReaderSettings): void {
        if (isYomuHostedPassivePage(location.href)) {
            this.applyPassive(settings.theme);
            return;
        }
        if (isHostThemeAuthoritative()) {
            this.syncAuthoritative(settings);
            return;
        }
        this.syncOrdinary(settings.theme);
    }

    private syncOrdinary(setting: ReaderSettings['theme']): void {
        if (setting === 'auto') this.applyClasses(detectHostTheme());
        else this.enforce(setting, HOST_THEME_ENFORCE_STEPS);
    }

    private applyPassive(setting: ReaderSettings['theme'], detected = detectHostTheme()): void {
        const theme = setting === 'auto' ? detected : setting;
        applyHostTheme(theme);
        this.applyClasses(theme);
    }

    private syncAuthoritative(settings: ReaderSettings): void {
        const hostTheme = detectHostTheme();
        this.applyClasses(hostTheme);
        if (settings !== this.options.getSettings() || settings.theme === 'auto' || settings.theme === hostTheme) return;
        this.options.adoptTheme(hostTheme);
        this.options.publishThemeChange();
    }

    private enforce(theme: HostTheme, remaining: number): void {
        applyHostTheme(theme);
        if (remaining <= 0 || this.options.isDestroyed()) return;
        this.enforceTimer = window.setTimeout(() => this.enforce(theme, remaining - 1), HOST_THEME_ENFORCE_STEP_MS);
    }

    private applyAmbient(settings: ReaderSettings): void {
        if (settings.theme === 'dark' || settings.theme === 'light') return;
        this.applyClasses(documentBackgroundLooksDark() ? 'dark' : 'light');
    }

    applyClasses(theme: HostTheme): void {
        const root = document.documentElement;
        if (!root) return;
        root.classList.toggle('jpdb-reader-theme-dark', theme === 'dark');
        root.classList.toggle('jpdb-reader-theme-light', theme === 'light');
    }

    private handleChange(hostTheme: HostTheme): void {
        if (this.options.isDestroyed()) return;
        const setting = this.options.getSettings().theme;
        if (isYomuHostedPassivePage(location.href)) {
            this.applyPassive(setting, hostTheme);
            refreshReaderWordContrast(document);
            return;
        }
        this.applyActiveChange(setting, hostTheme);
    }

    private applyActiveChange(setting: ReaderSettings['theme'], hostTheme: HostTheme): void {
        if (setting === hostTheme || this.restoreExplicitJitenTheme(setting)) return;
        if (setting === 'auto') {
            this.applyContrast(hostTheme);
            return;
        }
        const settings = this.options.adoptTheme(hostTheme);
        applyReaderTheme(settings);
        refreshReaderWordContrast(document);
        this.options.publishThemeChange();
    }

    private restoreExplicitJitenTheme(setting: ReaderSettings['theme']): boolean {
        if (setting !== 'light' && setting !== 'dark') return false;
        if (!jitenThemeCookieMatches(setting)) return false;
        applyHostTheme(setting);
        return true;
    }

    private applyContrast(hostTheme: HostTheme): void {
        this.applyClasses(hostTheme);
        refreshReaderWordContrast(document);
    }
}
