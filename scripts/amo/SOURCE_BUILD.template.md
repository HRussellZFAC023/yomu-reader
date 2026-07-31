# Building the Firefox extension from source

This source bundle is for the Firefox Add-ons review of Yomu __YOMU_TAG__ (version __YOMU_VERSION__). It contains the Yomu source at commit `__YOMU_COMMIT__` and the exact UserScript Compiler source used for the submitted add-on at commit `__COMPILER_COMMIT__`.

## Build environment

- Ubuntu 24.04.4 LTS (ARM64 or x64)
- Node.js 24.16.0
- npm 11.9.0
- No API keys, network services, or private packages are needed

## Build commands

Unzip the source package, open a terminal in the resulting directory, and run:

```bash
cd Yomu/UserScript-Compiler
npm ci
cd ..
npm ci
export SOURCE_DATE_EPOCH=__SOURCE_DATE_EPOCH__
export USERSCRIPT_COMPILER_CLI="$PWD/UserScript-Compiler/src/cli.mjs"
npm run build:extension
```

The Firefox package is written to:

```text
dist/extension/release/firefox/yomureader.com-firefox.xpi
```

The generated extension sources are also available without an archive wrapper at:

```text
dist/extension/packages/extension/firefox/
```

`npm ci` uses the two included lockfiles. The build runs Vite in self-contained mode, then the pinned UserScript Compiler converts that readable userscript bundle into the Manifest V3 extension project. Yomu's final packaging step adds the local stylesheet and store-specific manifest safeguards before it verifies every release archive.

Archive timestamps are packaging metadata. If an outer ZIP differs byte-for-byte, compare the unpacked files in `dist/extension/packages/extension/firefox/`; those are the reviewable extension sources produced by the commands above.
