import '../companions/register-build-companions';
import { bootNewTabRuntime } from './runtime';
import { detectInstalledReaderRuntime } from '../app/runtime-presence';

if (!detectInstalledReaderRuntime()) document.documentElement.dataset.yomuHosted = '';
bootNewTabRuntime();
