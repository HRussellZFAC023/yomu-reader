// The distributed userscript loads one companion so Rollup can share every
// implementation used by more than one surface. Its settings adapter is a
// launcher: the writable dialog remains confined to Study/new-tab builds.
// Focused companion entries remain available to hosted pages and smoke tests.
import './register-aggregate-runtime-companions';
import './register-aggregate-runtime-modules';
