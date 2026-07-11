import './academy.css';
import './foundation-player.css';
import { mountAcademy } from './app';
import { registerAcademyPwa } from './pwa';
import { initYomuReaderRuntime } from './yomu-inject';

async function startAcademy(): Promise<void> {
    await mountAcademy(document.querySelector<HTMLElement>('#academy-app'));
    void initYomuReaderRuntime();
    await registerAcademyPwa().catch(() => null);
}

void startAcademy();
