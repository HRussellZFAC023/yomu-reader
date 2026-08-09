// The distributed userscript loads one companion so Rollup can share every
// implementation used by more than one surface. Focused companion entries
// remain available to hosted pages and smoke tests that do not boot the full
// reader runtime.
import './register-build-companions';
import './register-aggregate-runtime-modules';
