/// <reference types="vite/client" />

import './styles/tokens.css';
import './styles/shell.css';
import './styles/screens.css';
import './styles/activity.css';
import './styles/world.css';
import './styles/vn-stage.css';
import './styles/lesson-zero-proof.css';
import './styles/aakash-directions.css';
import { AcademyApp } from './app';
import { initYomuReaderRuntime } from './integration/yomu-runtime';

declare global {
    interface Window {
        __yomuAcademy?: AcademyApp;
    }
}

const host = document.getElementById('yomu-academy');
if (host) {
    const app = new AcademyApp(host, { databaseName: localQaDatabaseName() });
    window.__yomuAcademy = app;
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
