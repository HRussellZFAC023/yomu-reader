/// <reference types="vite/client" />

import '../reader/styles.css';
import './styles/tokens.css';
import './styles/shell.css';
import './styles/tooltip.css';
import './styles/screens.css';
import './styles/activity.css';
import './styles/world.css';
import './styles/home-world.css';
import './styles/park-world.css';
import './styles/konbini-world.css';
import './styles/station-world.css';
import './styles/tube-platform-world.css';
import './styles/bookshop-world.css';
import './styles/japan-centre-world.css';
import './styles/profile-sync.css';
import './styles/class-board.css';
import './styles/vn-performance.css';
import './styles/vn-stage.css';
import './styles/story-vn.css';
import './styles/replay-stream.css';
import './styles/lesson-zero-proof.css';
import './styles/aakash-directions.css';
import './styles/class-path.css';
import './styles/lesson-overview.css';
import './styles/classroom-expression-session.css';
import './styles/classroom-instruction.css';
import './styles/lesson-zero-repeat-request.css';
import './styles/lesson-zero-desk-language.css';
import './styles/lesson-zero-greeting.css';
import './styles/lesson-zero-hiragana.css';
import './styles/lesson-zero-vowel.css';
import './styles/lesson-zero-vowel-writing.css';
import './styles/lesson-zero-sentence-frames.css';
import './styles/lesson-zero-name-card.css';
import './styles/lesson-zero-sound.css';
import './styles/lesson-zero-mission.css';
import './styles/primary-purpose.css';
import './styles/speaker-staging.css';
import { createLocalQaAccessGateway, localQaAuthBypassEnabled } from './access/local-qa';
import { AcademyApp } from './app';
import { initYomuReaderRuntime } from './integration/yomu-runtime';
import { shouldInstallHostedReaderRuntime } from '../reader/app/runtime-presence';

declare global {
    interface Window {
        __yomuAcademy?: AcademyApp;
    }
}

const host = document.getElementById('yomu-academy');
if (host) {
    if (shouldInstallHostedReaderRuntime()) document.documentElement.dataset.yomuHosted = '';
    const devAuthBypass = localQaAuthBypassEnabled(location, import.meta.env.DEV);
    const app = new AcademyApp(host, {
        databaseName: localQaDatabaseName(),
        access: devAuthBypass ? createLocalQaAccessGateway() : undefined,
        devAuthBypass,
    });
    window.__yomuAcademy = app;
    const disposeOnRealUnload = (event: PageTransitionEvent): void => {
        if (event.persisted) return;
        window.removeEventListener('pagehide', disposeOnRealUnload);
        app.dispose();
    };
    window.addEventListener('pagehide', disposeOnRealUnload);
    void app.start().catch(error => {
        host.dataset.bootError = 'true';
        const message = document.createElement('p');
        message.setAttribute('role', 'alert');
        message.textContent = error instanceof Error ? error.message : String(error);
        host.replaceChildren(message);
    });
    void initYomuReaderRuntime();
}

function localQaDatabaseName(): string | undefined {
    if (location.hostname !== '127.0.0.1' && location.hostname !== 'localhost' && location.hostname !== '::1') return undefined;
    const run = new URL(location.href).searchParams.get('qa-run')?.trim();
    return run && /^[a-z0-9-]{1,40}$/i.test(run) ? `yomu-academy-qa-${run}` : undefined;
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        void navigator.serviceWorker.register('/academy/sw.js', { scope: '/academy/' });
    }, { once: true });
}
